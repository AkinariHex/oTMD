use crate::{AppState, power, settings::TrayBehavior};
use std::{
    sync::{MutexGuard, PoisonError},
    time::Duration,
};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, window::Color};

const MAIN_WINDOW: &str = "main";
const LOGIN_ROUTE: &str = "/login";
const DEFAULT_ROUTE: &str = "/app/match";
const APP_ROUTE_PREFIX: &str = "/app/";
// Matches --primary-color, so nothing bright can show before the page paints.
const BACKGROUND: Color = Color(27, 29, 35, 255);
const REVEAL_FALLBACK: Duration = Duration::from_secs(3);
// Windows parks minimized windows at this coordinate.
const MINIMIZED_COORDINATE: i32 = -32000;

// Kept in memory only: it restores the window after the tray, not after a full restart.
#[derive(Default)]
pub struct WindowMemory {
    route: Option<String>,
    position: Option<PhysicalPosition<i32>>,
}

fn memory(app: &AppHandle) -> MutexGuard<'_, WindowMemory> {
    app.state::<AppState>()
        .inner()
        .window_memory
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
}

fn is_restorable_route(route: &str) -> bool {
    route.starts_with(APP_ROUTE_PREFIX)
}

fn resolve_start_route(logged_in: bool, remembered: Option<&str>) -> String {
    if !logged_in {
        return LOGIN_ROUTE.into();
    }
    remembered.unwrap_or(DEFAULT_ROUTE).into()
}

pub fn start_route(app: &AppHandle) -> String {
    let logged_in = app.state::<AppState>().auth.user().is_some();
    resolve_start_route(logged_in, memory(app).route.as_deref())
}

pub fn remember_route(app: &AppHandle, route: String) {
    if is_restorable_route(&route) {
        memory(app).route = Some(route);
    }
}

pub fn remember_position(app: &AppHandle, position: PhysicalPosition<i32>) {
    if position.x > MINIMIZED_COORDINATE && position.y > MINIMIZED_COORDINATE {
        memory(app).position = Some(position);
    }
}

fn is_on_screen(position: (i32, i32), monitors: &[(i32, i32, u32, u32)]) -> bool {
    monitors.iter().any(|&(x, y, width, height)| {
        position.0 >= x
            && position.1 >= y
            && i64::from(position.0) < i64::from(x) + i64::from(width)
            && i64::from(position.1) < i64::from(y) + i64::from(height)
    })
}

// A saved spot on a monitor that has since been unplugged would leave the window unreachable.
fn restore_position(window: &WebviewWindow, saved: Option<PhysicalPosition<i32>>) {
    let monitors: Vec<(i32, i32, u32, u32)> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let (position, size) = (monitor.position(), monitor.size());
            (position.x, position.y, size.width, size.height)
        })
        .collect();

    match saved.filter(|position| is_on_screen((position.x, position.y), &monitors)) {
        Some(position) => {
            let _ = window.set_position(position);
        }
        None => {
            if let Ok(position) = window.outer_position() {
                remember_position(window.app_handle(), position);
            }
        }
    }
}

pub fn reveal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW)
        && !window.is_visible().unwrap_or(true)
    {
        bring_to_front(&window);
    }
}

#[cfg(target_os = "macos")]
fn set_dock_visible(app: &AppHandle, visible: bool) {
    let policy = if visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    };
    let _ = app.set_activation_policy(policy);
}

#[cfg(not(target_os = "macos"))]
fn set_dock_visible(_app: &AppHandle, _visible: bool) {}

pub fn open_main(app: &AppHandle) {
    power::foreground();
    set_dock_visible(app, true);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        bring_to_front(&window);
        return;
    }

    let saved_position = memory(app).position;

    // Hidden until React reports the first screen is ready, so no blank page is ever visible.
    let mut builder = WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::default())
        .title("osu! Tourney Match Displayer")
        .inner_size(1000.0, 600.0)
        .resizable(false)
        .decorations(false)
        .visible(false)
        .background_color(BACKGROUND);

    if let Some(directory) = app.state::<AppState>().webview_data_dir.clone() {
        builder = builder.data_directory(directory);
    }

    match builder.build() {
        Ok(window) => {
            restore_position(&window, saved_position);

            // If the page never reports ready, a blank window still beats an invisible app.
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(REVEAL_FALLBACK).await;
                reveal(&app);
            });
        }
        Err(_) => eprintln!("Could not open the main window"),
    }
}

fn bring_to_front(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    // Windows can refuse focus to a background process; a brief topmost state still raises it.
    let _ = window.set_always_on_top(true);
    let _ = window.set_always_on_top(false);
    let _ = window.set_focus();
}

fn tray_behavior(app: &AppHandle) -> TrayBehavior {
    app.state::<AppState>()
        .settings
        .read(|settings| settings.appSettings.TrayBehavior)
}

// Used by the title bar X and by OS close requests such as Alt+F4.
pub fn close(app: &AppHandle) {
    match tray_behavior(app) {
        TrayBehavior::CloseToTray => send_to_tray(app),
        TrayBehavior::MinimizeToTray => quit(app),
    }
}

pub fn minimized(app: &AppHandle) {
    if tray_behavior(app) == TrayBehavior::MinimizeToTray {
        send_to_tray(app);
    }
}

// Building a window from a main-thread event handler can deadlock on Windows.
pub fn request_open(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { open_main(&app) });
}

// Deferred so the window is not destroyed from inside its own event handler.
pub fn send_to_tray(app: &AppHandle) {
    let handle = app.clone();
    let queued = app.run_on_main_thread(move || {
        if let Some(window) = handle.get_webview_window(MAIN_WINDOW)
            && window.destroy().is_ok()
        {
            power::background();
            set_dock_visible(&handle, false);
        }
    });
    if queued.is_err() {
        eprintln!("Could not send the app to the tray");
    }
}

pub fn quit(app: &AppHandle) {
    let cleared = app.state::<AppState>().settings.update(|current| {
        current.matchSettings.MatchID.clear();
        current.matchSettings.isFinished = false;
    });
    if cleared.is_err() {
        eprintln!("Could not save the settings");
    }
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_route_restores_the_last_screen_only_when_logged_in() {
        assert_eq!(resolve_start_route(true, Some("/app/dsettings")), "/app/dsettings");
        assert_eq!(resolve_start_route(true, None), DEFAULT_ROUTE);
        assert_eq!(resolve_start_route(false, Some("/app/dsettings")), LOGIN_ROUTE);
        assert_eq!(resolve_start_route(false, None), LOGIN_ROUTE);
    }

    #[test]
    fn only_app_screens_can_be_remembered() {
        assert!(is_restorable_route("/app/profile"));
        assert!(!is_restorable_route("/login"));
        assert!(!is_restorable_route("/update"));
        assert!(!is_restorable_route("https://evil.test/app/"));
    }

    #[test]
    fn position_must_be_on_a_connected_monitor() {
        let monitors = [(0, 0, 1920, 1080), (-1280, 0, 1280, 1024)];
        assert!(is_on_screen((100, 100), &monitors));
        assert!(is_on_screen((-500, 200), &monitors));
        assert!(!is_on_screen((1920, 0), &monitors));
        assert!(!is_on_screen((3000, 100), &monitors));
        assert!(!is_on_screen((-32000, -32000), &monitors));
        assert!(!is_on_screen((0, 0), &[]));
    }
}
