use crate::{
    AppState,
    auth::{CallbackOutcome, CallbackParams, now_seconds},
};
use axum::{
    Router,
    extract::{Query, State},
    http::{
        StatusCode,
        header::{CACHE_CONTROL, REFERRER_POLICY},
    },
    response::{Html, IntoResponse, Response},
    routing::get,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpListener;

pub const ADDRESS: &str = "127.0.0.1:21086";

fn page(status: StatusCode, message: &'static str) -> Response {
    let html = format!(
        "<!doctype html><meta charset=\"utf-8\"><title>oTMD</title>\
         <body style=\"font-family:system-ui,sans-serif;background:#181a20;color:#ddd;\
         display:grid;place-items:center;height:100vh;margin:0\"><p>{message}</p></body>"
    );
    (
        status,
        [(CACHE_CONTROL, "no-store"), (REFERRER_POLICY, "no-referrer")],
        Html(html),
    )
        .into_response()
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

async fn callback(State(app): State<AppHandle>, Query(params): Query<CallbackParams>) -> Response {
    let auth = app.state::<AppState>().auth.clone();

    match auth.complete_callback(params, now_seconds()).await {
        CallbackOutcome::BadState => page(
            StatusCode::BAD_REQUEST,
            "This login link is not valid. Start again from the oTMD app.",
        ),
        CallbackOutcome::Denied => {
            let _ = app.emit("login-failed", "denied");
            focus_main_window(&app);
            page(StatusCode::OK, "Login cancelled. You can close this tab.")
        }
        CallbackOutcome::Failed => {
            let _ = app.emit("login-failed", "failed");
            focus_main_window(&app);
            page(StatusCode::OK, "Login failed. Return to oTMD and try again.")
        }
        CallbackOutcome::LoggedIn(user) => {
            let _ = app.emit("session-changed", user);
            focus_main_window(&app);
            page(StatusCode::OK, "You are logged in. You can close this tab and return to oTMD.")
        }
    }
}

pub async fn serve(listener: TcpListener, app: AppHandle) {
    let router = Router::new().route("/oauth/callback", get(callback)).with_state(app);
    if axum::serve(listener, router).await.is_err() {
        eprintln!("The local callback server stopped");
    }
}
