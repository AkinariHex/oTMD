use crate::{
    auth::now_seconds,
    server::Overlay,
    settings::{DisplayerSettings, Layout, OverlayStyle, PreviewBackground, Settings, SettingsStore, TrayBehavior, write_atomic},
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};

const RECORD_FILE: &str = "settings-sync.json";
const DEBOUNCE_SECONDS: u64 = 3;
const RETRY_SECONDS: u64 = 60;

#[derive(Clone, Serialize, Deserialize)]
struct SyncedRanked {
    #[serde(rename = "Health")]
    health: OverlayStyle,
    #[serde(rename = "Maps")]
    maps: OverlayStyle,
    #[serde(rename = "Ratio")]
    ratio: OverlayStyle,
}

#[allow(non_snake_case)]
#[derive(Clone, Serialize, Deserialize)]
struct SyncedApp {
    Layout: Layout,
    PreviewBackground: PreviewBackground,
    TextSize: u32,
    Animations: bool,
    TrayBehavior: TrayBehavior,
}

// Listing the synced fields by hand is what keeps the API key, match IDs and PC-specific options local.
#[derive(Clone, Serialize, Deserialize)]
struct SyncedSettings {
    displayer: DisplayerSettings,
    ranked: SyncedRanked,
    app: SyncedApp,
}

impl SyncedSettings {
    fn from_local(settings: &Settings) -> Self {
        Self {
            displayer: settings.displayerSettings.clone(),
            ranked: SyncedRanked {
                health: settings.rankedSettings.Health.clone(),
                maps: settings.rankedSettings.Maps.clone(),
                ratio: settings.rankedSettings.Ratio.clone(),
            },
            app: SyncedApp {
                Layout: settings.appSettings.Layout,
                PreviewBackground: settings.appSettings.PreviewBackground,
                TextSize: settings.appSettings.TextSize,
                Animations: settings.appSettings.Animations,
                TrayBehavior: settings.appSettings.TrayBehavior,
            },
        }
    }

    fn apply_to(self, settings: &mut Settings) {
        settings.displayerSettings = self.displayer;
        settings.rankedSettings.Health = self.ranked.health;
        settings.rankedSettings.Maps = self.ranked.maps;
        settings.rankedSettings.Ratio = self.ranked.ratio;
        settings.appSettings.Layout = self.app.Layout;
        settings.appSettings.PreviewBackground = self.app.PreviewBackground;
        settings.appSettings.TextSize = self.app.TextSize;
        settings.appSettings.Animations = self.app.Animations;
        settings.appSettings.TrayBehavior = self.app.TrayBehavior;
    }

    fn snapshot(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }
}

#[derive(Serialize, Deserialize)]
struct SyncRecord {
    user: u64,
    snapshot: Value,
}

#[derive(Debug, PartialEq)]
enum LoginAction {
    Nothing,
    AdoptRemote,
    PushLocal,
}

fn decide_on_login(record: Option<&SyncRecord>, me: u64, local: &Value, remote: Option<&Value>) -> LoginAction {
    let Some(remote) = remote else {
        return LoginAction::PushLocal;
    };
    if remote == local {
        return LoginAction::Nothing;
    }
    match record.filter(|record| record.user == me) {
        // Edited since the last sync on this PC, for example offline: those newer changes win.
        Some(record) if record.snapshot != *local => LoginAction::PushLocal,
        _ => LoginAction::AdoptRemote,
    }
}

pub struct SettingsSync {
    http: Client,
    url: String,
    record_path: PathBuf,
    record: Option<SyncRecord>,
    checked_user: Option<u64>,
    candidate: Option<(Value, u64)>,
    retry_at: u64,
}

pub struct SyncContext<'a> {
    pub token: &'a str,
    pub me: u64,
    pub settings: &'a SettingsStore,
    pub overlay: &'a Overlay,
}

impl SettingsSync {
    pub fn new(http: Client, site: &str, data_dir: &Path) -> Self {
        let record_path = data_dir.join(RECORD_FILE);
        Self {
            http,
            url: format!("{site}/api/app/settings"),
            record: fs::read(&record_path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()),
            record_path,
            checked_user: None,
            candidate: None,
            retry_at: 0,
        }
    }

    fn remember(&mut self, user: u64, snapshot: Value) {
        let record = SyncRecord { user, snapshot };
        let saved = serde_json::to_vec(&record).map_err(std::io::Error::other).and_then(|bytes| write_atomic(&self.record_path, &bytes));
        if saved.is_err() {
            eprintln!("Could not save the settings sync record");
        }
        self.record = Some(record);
    }

    async fn pull(&self, token: &str) -> Result<Option<SyncedSettings>, ()> {
        let response = self.http.get(&self.url).bearer_auth(token).send().await.map_err(|_| ())?;
        let body: Value = response.error_for_status().map_err(|_| ())?.json().await.map_err(|_| ())?;
        // A shape from a newer version is treated as nothing saved, so this PC's settings are kept.
        Ok(serde_json::from_value(body["settings"].clone()).ok())
    }

    async fn push(&self, token: &str, settings: &Value) -> bool {
        let response = self.http.put(&self.url).bearer_auth(token).json(settings).send().await;
        response.is_ok_and(|response| response.status().is_success())
    }

    fn local(settings: &SettingsStore) -> SyncedSettings {
        settings.read(SyncedSettings::from_local)
    }

    async fn check_login(&mut self, context: &SyncContext<'_>, on_replaced: &impl Fn()) -> Result<(), ()> {
        let remote = self.pull(context.token).await?;
        let local = Self::local(context.settings).snapshot();
        let remote_snapshot = remote.as_ref().map(SyncedSettings::snapshot);

        match decide_on_login(self.record.as_ref(), context.me, &local, remote_snapshot.as_ref()) {
            LoginAction::Nothing => self.remember(context.me, local),
            LoginAction::PushLocal => {}
            LoginAction::AdoptRemote => {
                let (Some(remote), Some(snapshot)) = (remote, remote_snapshot) else {
                    return Ok(());
                };
                context.settings.update(|settings| remote.apply_to(settings)).map_err(|_| ())?;
                self.remember(context.me, snapshot);
                context.overlay.publish("displayerSettings", context.settings);
                context.overlay.publish("rankedState", context.settings);
                on_replaced();
            }
        }
        self.checked_user = Some(context.me);
        Ok(())
    }

    // Returns how long to wait; None when everything is in sync, so no timer stays armed.
    pub async fn step(&mut self, context: &SyncContext<'_>, on_replaced: &impl Fn()) -> Option<u64> {
        let now = now_seconds();
        if now < self.retry_at {
            return Some(self.retry_at - now);
        }

        if self.checked_user != Some(context.me) && self.check_login(context, on_replaced).await.is_err() {
            self.retry_at = now + RETRY_SECONDS;
            return Some(RETRY_SECONDS);
        }

        let local = Self::local(context.settings).snapshot();
        if self.record.as_ref().is_some_and(|record| record.user == context.me && record.snapshot == local) {
            self.candidate = None;
            return None;
        }

        match &self.candidate {
            Some((value, _)) if *value == local => {}
            _ => self.candidate = Some((local.clone(), now)),
        }
        let changed_at = self.candidate.as_ref().map_or(now, |(_, at)| *at);
        let waited = now.saturating_sub(changed_at);
        if waited < DEBOUNCE_SECONDS {
            return Some(DEBOUNCE_SECONDS - waited);
        }

        if self.push(context.token, &local).await {
            self.remember(context.me, local);
            self.candidate = None;
            None
        } else {
            self.retry_at = now + RETRY_SECONDS;
            Some(RETRY_SECONDS)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::tests::temp_dir;
    use axum::{Router, extract::State, http::StatusCode, routing::get};
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    const ME: u64 = 7;
    const TOKEN: &str = "TOKEN";

    #[derive(Default)]
    struct Remote {
        settings: Option<Value>,
        puts: Vec<Value>,
        fail: bool,
    }

    type Shared = Arc<Mutex<Remote>>;

    async fn read_route(State(remote): State<Shared>) -> (StatusCode, String) {
        let remote = remote.lock().unwrap();
        if remote.fail {
            return (StatusCode::SERVICE_UNAVAILABLE, String::new());
        }
        (StatusCode::OK, json!({ "settings": remote.settings }).to_string())
    }

    async fn write_route(State(remote): State<Shared>, body: String) -> StatusCode {
        let mut remote = remote.lock().unwrap();
        if remote.fail {
            return StatusCode::SERVICE_UNAVAILABLE;
        }
        let value: Value = serde_json::from_str(&body).unwrap();
        remote.settings = Some(value.clone());
        remote.puts.push(value);
        StatusCode::OK
    }

    struct Harness {
        remote: Shared,
        sync: SettingsSync,
        settings: SettingsStore,
        overlay: Overlay,
        replaced: Arc<Mutex<u32>>,
    }

    impl Harness {
        async fn new() -> Self {
            let remote = Shared::default();
            let router = Router::new().route("/api/app/settings", get(read_route).put(write_route)).with_state(remote.clone());
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let site = format!("http://{}", listener.local_addr().unwrap());
            tokio::spawn(async move { axum::serve(listener, router).await });
            Self {
                remote,
                sync: SettingsSync::new(Client::new(), &site, &temp_dir()),
                settings: SettingsStore::open(&temp_dir(), None),
                overlay: Overlay::new(),
                replaced: Arc::default(),
            }
        }

        async fn step(&mut self) -> Option<u64> {
            let context = SyncContext { token: TOKEN, me: ME, settings: &self.settings, overlay: &self.overlay };
            let replaced = self.replaced.clone();
            self.sync.step(&context, &move || *replaced.lock().unwrap() += 1).await
        }

        // Stands in for the debounce wait.
        fn age_candidate(&mut self) {
            if let Some((_, at)) = self.sync.candidate.as_mut() {
                *at = at.saturating_sub(DEBOUNCE_SECONDS);
            }
        }

        fn local_text_size(&self) -> u32 {
            self.settings.read(|settings| settings.appSettings.TextSize)
        }
    }

    fn value(text_size: u32) -> Value {
        let mut settings = Settings::default();
        settings.appSettings.TextSize = text_size;
        SyncedSettings::from_local(&settings).snapshot()
    }

    #[test]
    fn a_pc_that_never_synced_takes_the_account_settings() {
        assert_eq!(decide_on_login(None, ME, &value(0), Some(&value(120))), LoginAction::AdoptRemote);
        let other_user = SyncRecord { user: 9, snapshot: value(0) };
        assert_eq!(decide_on_login(Some(&other_user), ME, &value(0), Some(&value(120))), LoginAction::AdoptRemote);
    }

    #[test]
    fn an_empty_account_receives_this_pc() {
        assert_eq!(decide_on_login(None, ME, &value(0), None), LoginAction::PushLocal);
    }

    #[test]
    fn changes_from_another_pc_arrive_when_this_one_is_unchanged() {
        let record = SyncRecord { user: ME, snapshot: value(0) };
        assert_eq!(decide_on_login(Some(&record), ME, &value(0), Some(&value(120))), LoginAction::AdoptRemote);
    }

    #[test]
    fn offline_changes_on_this_pc_win() {
        let record = SyncRecord { user: ME, snapshot: value(0) };
        assert_eq!(decide_on_login(Some(&record), ME, &value(90), Some(&value(120))), LoginAction::PushLocal);
    }

    #[test]
    fn identical_settings_need_nothing() {
        assert_eq!(decide_on_login(None, ME, &value(0), Some(&value(0))), LoginAction::Nothing);
    }

    #[test]
    fn secrets_and_pc_specific_fields_are_never_synced() {
        let mut settings = Settings::default();
        settings.appSettings.ExportMatches.apikey = "SECRET-KEY".into();
        settings.matchSettings.MatchID = "123456".into();
        settings.rankedSettings.RoomID = "987654".into();
        settings.appSettings.HardwareAcceleration = false;

        let text = SyncedSettings::from_local(&settings).snapshot().to_string();
        for forbidden in ["SECRET-KEY", "apikey", "123456", "987654", "RoomID", "HardwareAcceleration", "Mode"] {
            assert!(!text.contains(forbidden), "{forbidden}");
        }
    }

    #[tokio::test]
    async fn account_settings_are_applied_and_the_ui_is_told() {
        let mut harness = Harness::new().await;
        harness.remote.lock().unwrap().settings = Some(value(120));
        assert_eq!(harness.step().await, None);
        assert_eq!(harness.local_text_size(), 120);
        assert_eq!(*harness.replaced.lock().unwrap(), 1);
        assert!(harness.remote.lock().unwrap().puts.is_empty());
    }

    #[tokio::test]
    async fn local_changes_upload_after_the_debounce_and_only_once() {
        let mut harness = Harness::new().await;
        assert_eq!(harness.step().await, Some(DEBOUNCE_SECONDS));
        assert!(harness.remote.lock().unwrap().puts.is_empty(), "nothing is sent while still editing");

        harness.age_candidate();
        assert_eq!(harness.step().await, None);
        assert_eq!(harness.remote.lock().unwrap().puts.len(), 1);

        assert_eq!(harness.step().await, None, "in sync means no timer");
        assert_eq!(harness.remote.lock().unwrap().puts.len(), 1);

        harness.settings.update(|settings| settings.appSettings.TextSize = 110).unwrap();
        assert_eq!(harness.step().await, Some(DEBOUNCE_SECONDS));
        harness.age_candidate();
        harness.step().await;
        assert_eq!(harness.remote.lock().unwrap().puts.len(), 2);
    }

    #[tokio::test]
    async fn another_edit_restarts_the_debounce() {
        let mut harness = Harness::new().await;
        harness.step().await;
        harness.age_candidate();
        harness.settings.update(|settings| settings.appSettings.TextSize = 110).unwrap();
        assert_eq!(harness.step().await, Some(DEBOUNCE_SECONDS));
        assert!(harness.remote.lock().unwrap().puts.is_empty());
    }

    #[tokio::test]
    async fn an_outage_keeps_local_settings_and_retries_later() {
        let mut harness = Harness::new().await;
        harness.settings.update(|settings| settings.appSettings.TextSize = 90).unwrap();
        harness.remote.lock().unwrap().fail = true;
        assert_eq!(harness.step().await, Some(RETRY_SECONDS));
        assert_eq!(harness.local_text_size(), 90);
        assert_eq!(*harness.replaced.lock().unwrap(), 0);
    }

}
