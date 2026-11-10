use crate::{
    AppState,
    auth::{User, now_seconds},
    broadcast,
    dashboard::{DashboardData, FeedCursor, FeedPage},
    server::OverlaySources,
    settings::{AppMode, AppSettings, BroadcastMatch, BroadcastStyle, DisplayerSettings, MatchSettings, RankedSettings},
    system_fonts, window,
};
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};

const SAVE_FAILED: &str = "Could not save the settings.";
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Clone, Serialize)]
struct DownloadProgress {
    speed: f64,
    percent: u64,
}

#[derive(Serialize)]
pub struct AppInfo {
    version: String,
}

#[tauri::command]
pub fn get_session(state: State<'_, AppState>) -> Option<User> {
    state.auth.user()
}

#[tauri::command]
pub fn login(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if !state.callback_ready {
        return Err("Port 21086 is in use. Close the program using it and restart oTMD.".into());
    }

    let url = state.auth.begin_login(now_seconds());
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| "Could not open the browser.".to_string())
}

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    state.auth.logout().await;
    Ok(())
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub fn get_match_settings(state: State<'_, AppState>) -> MatchSettings {
    state.settings.read(|settings| settings.matchSettings.clone())
}

#[tauri::command]
pub fn save_match_settings(settings: MatchSettings, state: State<'_, AppState>) -> Result<(), String> {
    state
        .settings
        .update(|current| {
            // Only one source is polled, and starting a match means leaving ranked.
            if !settings.MatchID.is_empty() {
                current.appSettings.Mode = AppMode::Tournament;
            }
            current.matchSettings = settings;
            current.matchSettings.isFinished = false;
        })
        .map_err(|_| SAVE_FAILED.to_string())?;

    state.overlay.publish("matchSettings", &state.settings);
    state.wake.notify_one();
    Ok(())
}

#[tauri::command]
pub fn get_displayer_settings(state: State<'_, AppState>) -> DisplayerSettings {
    state.settings.read(|settings| settings.displayerSettings.clone())
}

#[tauri::command]
pub fn save_displayer_settings(settings: DisplayerSettings, state: State<'_, AppState>) -> Result<(), String> {
    state
        .settings
        .update(|current| current.displayerSettings = settings)
        .map_err(|_| SAVE_FAILED.to_string())?;

    state.overlay.publish("displayerSettings", &state.settings);
    state.wake.notify_one();
    Ok(())
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.read(|settings| settings.appSettings.clone())
}

#[tauri::command]
pub fn save_app_settings(settings: AppSettings, state: State<'_, AppState>) -> Result<(), String> {
    state
        .settings
        .update(|current| current.appSettings = settings)
        .map_err(|_| SAVE_FAILED.to_string())?;

    state.wake.notify_one();
    Ok(())
}

#[tauri::command]
pub async fn validate_export_key(apikey: String, state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.auth.is_export_key_valid(&apikey).await)
}

#[tauri::command]
pub async fn get_system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(system_fonts::installed_families)
        .await
        .map_err(|_| "Could not read the installed fonts.".to_string())
}

#[tauri::command]
pub async fn get_popular_fonts(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.dashboard.popular_fonts().await)
}

#[tauri::command]
pub async fn get_dashboard(state: State<'_, AppState>) -> Result<DashboardData, String> {
    Ok(state.dashboard.get(&state.auth, &state.settings).await)
}

#[tauri::command]
pub async fn get_match_feed(state: State<'_, AppState>, cursor: FeedCursor) -> Result<FeedPage, String> {
    Ok(state.dashboard.feed(&state.auth, &state.settings, cursor).await)
}

#[tauri::command]
pub fn get_overlay_sources(state: State<'_, AppState>) -> OverlaySources {
    state.overlay.sources()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedStatus {
    enabled: bool,
    view: Option<Value>,
    rules_outdated: bool,
}

#[tauri::command]
pub fn get_ranked_status(state: State<'_, AppState>) -> RankedStatus {
    RankedStatus {
        enabled: state.settings.read(|settings| settings.appSettings.Mode == AppMode::Ranked),
        view: state.overlay.ranked_view(),
        rules_outdated: state.overlay.ranked_rules_outdated(),
    }
}

#[tauri::command]
pub fn set_ranked_enabled(enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    state
        .settings
        .update(|current| {
            current.appSettings.Mode = if enabled { AppMode::Ranked } else { AppMode::Tournament };
            if enabled {
                current.matchSettings.MatchID.clear();
                current.matchSettings.isFinished = false;
            }
        })
        .map_err(|_| SAVE_FAILED.to_string())?;

    state.overlay.publish("matchSettings", &state.settings);
    state.wake.notify_one();
    Ok(())
}

#[tauri::command]
pub fn get_ranked_settings(state: State<'_, AppState>) -> RankedSettings {
    state.settings.read(|settings| settings.rankedSettings.clone())
}

#[tauri::command]
pub fn save_ranked_settings(settings: RankedSettings, state: State<'_, AppState>) -> Result<(), String> {
    state
        .settings
        .update(|current| current.rankedSettings = settings)
        .map_err(|_| SAVE_FAILED.to_string())?;

    state.overlay.publish("rankedState", &state.settings);
    state.wake.notify_one();
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastStatus {
    enabled: bool,
    matches: Vec<BroadcastMatch>,
    style: BroadcastStyle,
    view: Option<Value>,
}

#[tauri::command]
pub fn get_broadcast_status(state: State<'_, AppState>) -> BroadcastStatus {
    let (enabled, matches, style) = state
        .settings
        .read(|settings| (settings.appSettings.Mode == AppMode::Broadcast, settings.broadcastMatches.clone(), settings.broadcastStyle.clone()));
    BroadcastStatus { enabled, matches, style, view: state.overlay.broadcast_view() }
}

#[tauri::command]
pub fn save_broadcast_matches(matches: Vec<BroadcastMatch>, state: State<'_, AppState>) -> Result<(), String> {
    if !broadcast::is_valid_list(&matches) {
        return Err("The match list is not valid.".into());
    }

    state
        .settings
        .update(|current| current.broadcastMatches = matches)
        .map_err(|_| SAVE_FAILED.to_string())?;

    state.wake.notify_one();
    Ok(())
}

#[tauri::command]
pub fn save_broadcast_style(mut style: BroadcastStyle, state: State<'_, AppState>) -> Result<(), String> {
    style.title = style.title.chars().take(broadcast::MAX_TITLE_CHARS).collect();
    state
        .settings
        .update(|current| current.broadcastStyle = style)
        .map_err(|_| SAVE_FAILED.to_string())?;

    state.overlay.publish("broadcastState", &state.settings);
    Ok(())
}

#[tauri::command]
pub fn set_broadcast_enabled(enabled: bool, state: State<'_, AppState>) -> Result<(), String> {
    state
        .settings
        .update(|current| {
            current.appSettings.Mode = if enabled { AppMode::Broadcast } else { AppMode::Tournament };
            if enabled {
                current.matchSettings.MatchID.clear();
                current.matchSettings.isFinished = false;
            }
        })
        .map_err(|_| SAVE_FAILED.to_string())?;

    state.overlay.publish("matchSettings", &state.settings);
    state.wake.notify_one();
    Ok(())
}

#[tauri::command]
pub fn get_start_route(app: AppHandle) -> String {
    window::start_route(&app)
}

#[tauri::command]
pub fn window_ready(app: AppHandle) {
    window::reveal(&app);
}

#[tauri::command]
pub fn close_app(app: AppHandle) {
    window::close(&app);
}

#[tauri::command]
pub async fn check_update(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    // Portable installs are replaced by hand, and a dev build has nothing to update.
    if cfg!(debug_assertions) || state.webview_data_dir.is_some() {
        return Ok(false);
    }

    let Ok(updater) = app.updater() else {
        return Ok(false);
    };
    let Ok(Some(update)) = updater.check().await else {
        return Ok(false);
    };

    tauri::async_runtime::spawn(install_update(app, update));
    Ok(true)
}

async fn install_update(app: AppHandle, update: Update) {
    let emitter = app.clone();
    let started = Instant::now();
    let mut last_emit: Option<Instant> = None;
    let mut downloaded = 0u64;

    let result = update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                if last_emit.is_none_or(|last| last.elapsed() >= PROGRESS_INTERVAL) {
                    last_emit = Some(Instant::now());
                    let _ = emitter.emit("download-progress", download_progress(downloaded, total, started));
                }
            },
            || {},
        )
        .await;

    match result {
        Ok(()) => app.restart(),
        Err(_) => {
            eprintln!("The update could not be installed");
            let _ = app.emit("update-failed", ());
        }
    }
}

fn download_progress(downloaded: u64, total: Option<u64>, started: Instant) -> DownloadProgress {
    let seconds = started.elapsed().as_secs_f64().max(0.001);
    DownloadProgress {
        speed: (downloaded as f64 / seconds / 1_000_000.0 * 100.0).round() / 100.0,
        percent: total.filter(|total| *total > 0).map_or(0, |total| downloaded * 100 / total),
    }
}
