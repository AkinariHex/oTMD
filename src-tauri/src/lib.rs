mod auth;
mod commands;
mod export;
mod osu;
mod poller;
pub mod scoring;
mod server;
mod settings;
mod tournament;

use auth::AuthManager;
use poller::{Endpoints, Poller};
use server::Overlay;
use settings::SettingsStore;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::{net::TcpListener, sync::Notify};

const SITE_URL: &str = "https://otmd.app";

pub struct AppState {
    settings: Arc<SettingsStore>,
    auth: Arc<AuthManager>,
    overlay: Arc<Overlay>,
    wake: Arc<Notify>,
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
            let teams_dir = data_dir.join("teams");
            let listener = tauri::async_runtime::block_on(TcpListener::bind(server::ADDRESS)).ok();

            let wake = Arc::new(Notify::new());
            let auth = Arc::new(AuthManager::open(&data_dir, wake.clone())?);
            let settings_store = Arc::new(SettingsStore::open(&data_dir, legacy.as_deref()));
            let overlay = Arc::new(Overlay::new());

            app.manage(AppState {
                settings: settings_store.clone(),
                auth: auth.clone(),
                overlay: overlay.clone(),
                wake: wake.clone(),
                callback_ready: listener.is_some(),
            });

            if let Some(listener) = listener {
                let overlay = overlay.clone();
                let settings_store = settings_store.clone();
                let teams_dir = teams_dir.clone();
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    server::serve(listener, handle, overlay, settings_store, &teams_dir).await;
                });
            } else {
                eprintln!("Port 21086 is already in use");
            }

            let endpoints = Endpoints {
                osu_api: osu::OSU_API_URL.into(),
                site: SITE_URL.into(),
            };
            let poller = Poller::new(auth, settings_store, overlay, teams_dir, wake, &endpoints)?;
            tauri::async_runtime::spawn(poller.run(move || {
                let _ = handle.emit("session-expired", ());
            }));

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
