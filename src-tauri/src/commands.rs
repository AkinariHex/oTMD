use crate::{
    AppState,
    auth::{User, now_seconds},
    settings::{AppSettings, DisplayerSettings, MatchSettings},
};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

const SAVE_FAILED: &str = "Could not save the settings.";

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
        .update(|current| current.matchSettings = settings)
        .map_err(|_| SAVE_FAILED.to_string())
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
        .map_err(|_| SAVE_FAILED.to_string())
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
        .map_err(|_| SAVE_FAILED.to_string())
}

#[tauri::command]
pub async fn validate_export_key(apikey: String, state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.auth.is_export_key_valid(&apikey).await)
}

#[tauri::command]
pub fn close_app(app: AppHandle, state: State<'_, AppState>) {
    let cleared = state.settings.update(|current| {
        current.matchSettings.MatchID.clear();
        current.matchSettings.isFinished = false;
    });
    if cleared.is_err() {
        eprintln!("{SAVE_FAILED}");
    }
    app.exit(0);
}
