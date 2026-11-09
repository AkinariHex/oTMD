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
    pub MapsStyle: OverlayStyle,
}

impl Default for DisplayerSettings {
    fn default() -> Self {
        Self {
            VisualizerStyle: "0px 0px 0px 0px".into(),
            SmallDisplayer: false,
            TransparentBackground: false,
            MapsStyle: OverlayStyle::maps(),
        }
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ExportMatches {
    pub status: bool,
    pub apikey: String,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrayBehavior {
    #[default]
    CloseToTray,
    MinimizeToTray,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Layout {
    #[default]
    Sidebar,
    Tabs,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AppMode {
    #[default]
    Tournament,
    Ranked,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OverlayStyle {
    pub background_color: String,
    pub background_opacity: f64,
    pub border_radius: u32,
    pub padding: u32,
    pub font_family: String,
}

impl OverlayStyle {
    fn new(background_color: &str, background_opacity: f64, border_radius: u32, padding: u32) -> Self {
        Self {
            background_color: background_color.into(),
            background_opacity,
            border_radius,
            padding,
            font_family: "Nunito, Inter, sans-serif".into(),
        }
    }

    fn maps() -> Self {
        Self::new("10, 10, 20", 0.9, 8, 8)
    }
}

impl Default for OverlayStyle {
    fn default() -> Self {
        Self::new("8, 8, 20", 0.8, 0, 0)
    }
}

#[allow(non_snake_case)]
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RankedSettings {
    pub RoomID: String,
    pub Health: OverlayStyle,
    pub Maps: OverlayStyle,
    pub Ratio: OverlayStyle,
}

impl Default for RankedSettings {
    fn default() -> Self {
        Self {
            RoomID: String::new(),
            Health: OverlayStyle::default(),
            Maps: OverlayStyle::maps(),
            Ratio: OverlayStyle::new("8, 8, 20", 0.85, 12, 16),
        }
    }
}

#[derive(Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PreviewBackground {
    #[default]
    Checker,
    Black,
}

#[allow(non_snake_case)]
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub Mode: AppMode,
    pub Layout: Layout,
    pub PreviewBackground: PreviewBackground,
    pub TrayBehavior: TrayBehavior,
    pub ExportMatches: ExportMatches,
    pub Animations: bool,
    pub HardwareAcceleration: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            Mode: AppMode::default(),
            Layout: Layout::default(),
            PreviewBackground: PreviewBackground::default(),
            TrayBehavior: TrayBehavior::default(),
            ExportMatches: ExportMatches::default(),
            Animations: true,
            HardwareAcceleration: true,
        }
    }
}

// No `accounts` field on purpose: legacy osu! v1 keys must never be read or copied.
#[allow(non_snake_case)]
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub matchSettings: MatchSettings,
    pub displayerSettings: DisplayerSettings,
    pub appSettings: AppSettings,
    pub rankedSettings: RankedSettings,
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

pub fn portable_data_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;
    let is_portable = exe_dir.join("portable.txt").exists() || exe_dir.join("data").is_dir();
    is_portable.then(|| exe_dir.join("data"))
}

pub fn resolve_data_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    let data_dir = match portable_data_dir() {
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
    fn display_preferences_default_on_for_existing_files_and_can_be_turned_off() {
        let existing: Settings = serde_json::from_str(r#"{"appSettings":{"CompactUI":true}}"#).unwrap();
        assert!(existing.appSettings.Animations);
        assert!(existing.appSettings.HardwareAcceleration);
        assert!(existing.appSettings.Layout == Layout::Sidebar);
        assert!(existing.appSettings.Mode == AppMode::Tournament);
        assert_eq!(existing.rankedSettings.Maps.border_radius, 8);
        assert_eq!(existing.rankedSettings.Ratio.padding, 16);
        assert_eq!(existing.displayerSettings.MapsStyle.padding, 8);
        assert!(existing.appSettings.PreviewBackground == PreviewBackground::Checker);

        let dir = temp_dir();
        SettingsStore::open(&dir, None)
            .update(|settings| {
                settings.appSettings.Animations = false;
                settings.appSettings.HardwareAcceleration = false;
            })
            .unwrap();
        SettingsStore::open(&dir, None).read(|settings| {
            assert!(!settings.appSettings.Animations);
            assert!(!settings.appSettings.HardwareAcceleration);
        });
    }

    #[test]
    fn tray_behavior_defaults_to_close_to_tray_and_round_trips() {
        let legacy: Settings = serde_json::from_str(r#"{"appSettings":{"SystemTray":true}}"#).unwrap();
        assert!(legacy.appSettings.TrayBehavior == TrayBehavior::CloseToTray);

        let parsed: Settings =
            serde_json::from_str(r#"{"appSettings":{"TrayBehavior":"minimizeToTray"}}"#).unwrap();
        assert!(parsed.appSettings.TrayBehavior == TrayBehavior::MinimizeToTray);
        assert!(serde_json::to_string(&parsed).unwrap().contains(r#""TrayBehavior":"minimizeToTray""#));
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
