mod auth;
mod broadcast;
mod dashboard;
mod maps;
mod commands;
mod export;
mod osu;
mod poller;
mod power;
mod ranked;
mod ranked_watch;
pub mod scoring;
mod server;
mod settings;
mod settings_sync;
mod system_fonts;
mod tournament;
mod window;

use auth::AuthManager;
use poller::{Endpoints, Poller};
use server::Overlay;
use settings::SettingsStore;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_notification::NotificationExt;
use tokio::{net::TcpListener, sync::Notify};

const SITE_URL: &str = "https://otmd.app";
const GITHUB_RAW_URL: &str = "https://raw.githubusercontent.com";
const TRAY_OPEN: &str = "open";
const TRAY_QUIT: &str = "quit";

pub struct AppState {
    settings: Arc<SettingsStore>,
    auth: Arc<AuthManager>,
    overlay: Arc<Overlay>,
    wake: Arc<Notify>,
    callback_ready: bool,
    webview_data_dir: Option<PathBuf>,
    // Read once: WebView2 rejects a new window whose flags differ from a browser process still alive.
    hardware_acceleration: bool,
    dashboard: dashboard::Dashboard,
    window_memory: Mutex<window::WindowMemory>,
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, TRAY_OPEN, "Open", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_QUIT, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::new()
        .tooltip("o!TMD")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_OPEN => window::request_open(app),
            TRAY_QUIT => window::quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::request_open(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn on_session_expired(app: &AppHandle) {
    let _ = app.emit("session-expired", ());
    let shown = app
        .notification()
        .builder()
        .title("o!TMD")
        .body("Your osu! session has expired. Open o!TMD to log in again.")
        .show();
    if shown.is_err() {
        eprintln!("Could not show the session notification");
    }
}

pub fn run() {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("error while starting the async runtime");
    tauri::async_runtime::set(runtime.handle().clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| window::request_open(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                window::close(window.app_handle());
            }
            WindowEvent::Moved(position) if !window.is_minimized().unwrap_or(false) => {
                window::remember_position(window.app_handle(), *position);
            }
            WindowEvent::Resized(_) if window.is_minimized().unwrap_or(false) => {
                window::minimized(window.app_handle());
            }
            _ => {}
        })
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
            let hardware_acceleration = settings_store.read(|settings| settings.appSettings.HardwareAcceleration);

            #[cfg(target_os = "linux")]
            if !hardware_acceleration {
                // SAFETY: the runtime workers are idle and nothing reads the environment concurrently yet.
                unsafe { std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1") };
            }

            app.manage(AppState {
                settings: settings_store.clone(),
                auth: auth.clone(),
                overlay: overlay.clone(),
                wake: wake.clone(),
                callback_ready: listener.is_some(),
                webview_data_dir: settings::portable_data_dir().map(|dir| dir.join("webview")),
                hardware_acceleration,
                dashboard: dashboard::Dashboard::new(osu::OSU_API_URL, SITE_URL, data_dir.clone())?,
                window_memory: Mutex::default(),
            });

            let emitter = handle.clone();
            overlay.set_on_change(move |sources| {
                let _ = emitter.emit("overlay-changed", sources);
            });

            build_tray(&handle)?;
            window::open_main(&handle);

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
                github_raw: GITHUB_RAW_URL.into(),
            };
            let poller = Poller::new(auth, settings_store, overlay, teams_dir, &data_dir, wake, &endpoints)?;
            let replaced_handle = handle.clone();
            tauri::async_runtime::spawn(poller.run(move || on_session_expired(&handle), move || {
                let _ = replaced_handle.emit("settings-replaced", ());
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
            commands::get_overlay_sources,
            commands::get_dashboard,
            commands::get_match_feed,
            commands::get_system_fonts,
            commands::get_popular_fonts,
            commands::get_ranked_status,
            commands::set_ranked_enabled,
            commands::get_ranked_settings,
            commands::save_ranked_settings,
            commands::get_broadcast_status,
            commands::save_broadcast_matches,
            commands::save_broadcast_style,
            commands::set_broadcast_enabled,
            commands::check_update,
            commands::portable_update,
            commands::close_app,
            commands::get_start_route,
            commands::window_ready,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Destroying the window for the tray must not end the process; Quit passes a code.
            if let RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        });
}
