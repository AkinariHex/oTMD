use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{PoisonError, RwLock},
};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settingsApp.json";

#[allow(non_snake_case)]
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct MatchSettings {
    pub MatchID: String,
    pub MatchType: String,
    pub Stage: String,
    pub BestOF: String,
    pub MapsNqualifiers: String,
    pub Warmups: String,
    pub ScoreReverse: bool,
    pub isFinished: bool,
}

impl Default for MatchSettings {
    fn default() -> Self {
        Self {
            MatchID: String::new(),
            MatchType: "1vs1".into(),
            Stage: "Friendly".into(),
            BestOF: "9".into(),
            MapsNqualifiers: "0".into(),
            Warmups: "0".into(),
            ScoreReverse: false,
            isFinished: false,
        }
    }
}

#[allow(non_snake_case)]
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DisplayerSettings {
    pub VisualizerStyle: String,
    pub SmallDisplayer: bool,
    pub TransparentBackground: bool,
}

impl Default for DisplayerSettings {
    fn default() -> Self {
        Self {
            VisualizerStyle: "0px 0px 0px 0px".into(),
            SmallDisplayer: false,
            TransparentBackground: false,
        }
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ExportMatches {
    pub status: bool,
    pub apikey: String,
}

#[allow(non_snake_case)]
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub CompactUI: bool,
    pub SystemTray: bool,
    pub ExportMatches: ExportMatches,
}

// No `accounts` field on purpose: legacy osu! v1 keys must never be read or copied.
#[allow(non_snake_case)]
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub matchSettings: MatchSettings,
    pub displayerSettings: DisplayerSettings,
    pub appSettings: AppSettings,
}

pub struct SettingsStore {
    path: PathBuf,
    settings: RwLock<Settings>,
}

impl SettingsStore {
    pub fn open(data_dir: &Path, legacy: Option<&Path>) -> Self {
        let path = data_dir.join(SETTINGS_FILE);
        let settings = RwLock::new(load(&path, legacy));
        Self { path, settings }
    }

    pub fn read<T>(&self, select: impl FnOnce(&Settings) -> T) -> T {
        select(&self.settings.read().unwrap_or_else(PoisonError::into_inner))
    }

    pub fn update(&self, change: impl FnOnce(&mut Settings)) -> io::Result<()> {
        let mut settings = self.settings.write().unwrap_or_else(PoisonError::into_inner);
        change(&mut settings);
        write_atomic(&self.path, &serde_json::to_vec_pretty(&*settings)?)
    }
}

fn read_settings(path: &Path) -> Option<Settings> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn load(path: &Path, legacy: Option<&Path>) -> Settings {
    if let Some(settings) = read_settings(path) {
        return settings;
    }

    let mut settings = legacy.and_then(read_settings).unwrap_or_default();
    settings.matchSettings.MatchID.clear();
    settings.matchSettings.isFinished = false;

    if let Ok(bytes) = serde_json::to_vec_pretty(&settings)
        && write_atomic(path, &bytes).is_err()
    {
        eprintln!("Could not write the settings file");
    }
    settings
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let temporary = path.with_extension("tmp");
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options.open(&temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temporary, path)
}

pub fn resolve_data_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    let portable_dir = std::env::current_exe()?.parent().and_then(|exe_dir| {
        let is_portable = exe_dir.join("portable.txt").exists() || exe_dir.join("data").is_dir();
        is_portable.then(|| exe_dir.join("data"))
    });

    let data_dir = match portable_dir {
        Some(dir) => dir,
        None => app.path().app_config_dir()?,
    };

    fs::create_dir_all(data_dir.join("teams"))?;
    fs::create_dir_all(data_dir.join("exports"))?;
    Ok(data_dir)
}

pub fn legacy_settings_path(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let base = app.path().config_dir().ok();
    #[cfg(target_os = "linux")]
    let base = app.path().document_dir().ok();
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    let base: Option<PathBuf> = {
        let _ = app;
        None
    };

    base.map(|dir| dir.join("otmd").join(SETTINGS_FILE))
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT_DIR: AtomicU32 = AtomicU32::new(0);

    pub fn temp_dir() -> PathBuf {
        let id = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("otmd-test-{}-{id}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_atomic_replaces_and_leaves_no_temporary_file() {
        let path = temp_dir().join("file.json");
        write_atomic(&path, b"one").unwrap();
        write_atomic(&path, b"two").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"two");
        assert!(!path.with_extension("tmp").exists());
    }

    #[test]
    fn missing_files_give_electron_defaults() {
        let store = SettingsStore::open(&temp_dir(), None);
        store.read(|settings| {
            assert_eq!(settings.matchSettings.MatchType, "1vs1");
            assert_eq!(settings.matchSettings.Stage, "Friendly");
            assert_eq!(settings.matchSettings.BestOF, "9");
            assert_eq!(settings.displayerSettings.VisualizerStyle, "0px 0px 0px 0px");
        });
    }

    #[test]
    fn legacy_import_keeps_settings_and_never_copies_v1_keys() {
        let dir = temp_dir();
        let legacy = dir.join("legacy.json");
        fs::write(
            &legacy,
            r#"{
              "accounts": [{"userID":"1","username":"a","apikey":"V1-SECRET"}],
              "matchSettings": {"ActiveAccount":"1","MatchID":"123","MatchType":"teamVS",
                "Stage":"Finals","BestOF":"13","MapsNqualifiers":"8","Warmups":"2",
                "ScoreReverse":true,"isFinished":true},
              "displayerSettings": {"VisualizerStyle":"1px","SmallDisplayer":true,"TransparentBackground":true},
              "appSettings": {"CompactUI":true,"SystemTray":true,
                "ExportMatches":{"status":true,"apikey":"site-key"}}
            }"#,
        )
        .unwrap();

        let data = temp_dir();
        let store = SettingsStore::open(&data, Some(&legacy));

        store.read(|settings| {
            assert_eq!(settings.matchSettings.MatchType, "teamVS");
            assert_eq!(settings.matchSettings.BestOF, "13");
            assert_eq!(settings.matchSettings.MatchID, "");
            assert!(!settings.matchSettings.isFinished);
            assert!(settings.displayerSettings.SmallDisplayer);
            assert_eq!(settings.appSettings.ExportMatches.apikey, "site-key");
        });

        let written = fs::read_to_string(data.join(SETTINGS_FILE)).unwrap();
        assert!(!written.contains("V1-SECRET"));
        assert!(!written.contains("accounts"));
        assert!(!written.contains("ActiveAccount"));
    }

    #[test]
    fn existing_settings_win_over_legacy_and_persist() {
        let data = temp_dir();
        let store = SettingsStore::open(&data, None);
        store
            .update(|settings| settings.matchSettings.Stage = "Semifinals".into())
            .unwrap();

        let legacy = temp_dir().join("legacy.json");
        fs::write(&legacy, r#"{"matchSettings":{"Stage":"Old"}}"#).unwrap();

        let reopened = SettingsStore::open(&data, Some(&legacy));
        reopened.read(|settings| assert_eq!(settings.matchSettings.Stage, "Semifinals"));
    }
}
