mod auth;
mod commands;
mod server;
mod settings;

use auth::AuthManager;
use settings::SettingsStore;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::net::TcpListener;

pub struct AppState {
    settings: SettingsStore,
    auth: Arc<AuthManager>,
    callback_ready: bool,
}

pub fn run() {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("error while starting the async runtime");
    tauri::async_runtime::set(runtime.handle().clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let data_dir = settings::resolve_data_dir(&handle)?;
            let legacy = settings::legacy_settings_path(&handle);
            let listener = tauri::async_runtime::block_on(TcpListener::bind(server::ADDRESS)).ok();
            let auth = Arc::new(AuthManager::open(&data_dir)?);

            app.manage(AppState {
                settings: SettingsStore::open(&data_dir, legacy.as_deref()),
                auth: auth.clone(),
                callback_ready: listener.is_some(),
            });

            if let Some(listener) = listener {
                tauri::async_runtime::spawn(server::serve(listener, handle.clone()));
            } else {
                eprintln!("Port 21086 is already in use");
            }

            tauri::async_runtime::spawn(async move {
                auth.run_session_loop(|| {
                    let _ = handle.emit("session-expired", ());
                })
                .await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_session,
            commands::login,
            commands::logout,
            commands::get_app_info,
            commands::get_match_settings,
            commands::save_match_settings,
            commands::get_displayer_settings,
            commands::save_displayer_settings,
            commands::get_app_settings,
            commands::save_app_settings,
            commands::validate_export_key,
            commands::close_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
