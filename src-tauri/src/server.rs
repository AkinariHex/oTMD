use crate::{
    AppState,
    auth::{CallbackOutcome, CallbackParams, now_seconds},
    settings::SettingsStore,
};
use axum::{
    Router,
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{
        HeaderMap, StatusCode, Uri,
        header::{CACHE_CONTROL, CONTENT_TYPE, ORIGIN, REFERRER_POLICY},
    },
    response::{Html, IntoResponse, Response},
    routing::get,
};
use rust_embed::RustEmbed;
use serde_json::{Value, json};
use std::{
    path::Path,
    sync::{Arc, Mutex, PoisonError},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    net::TcpListener,
    sync::broadcast::{self, Receiver, Sender, error::RecvError},
};
use tower_http::services::ServeDir;

pub const ADDRESS: &str = "127.0.0.1:21086";
const ALLOWED_ORIGINS: [&str; 2] = ["http://localhost:21086", "http://127.0.0.1:21086"];
const OVERLAY_BACKLOG: usize = 16;

#[derive(RustEmbed)]
#[folder = "../overlay/"]
struct OverlayFiles;

pub struct Overlay {
    sender: Sender<String>,
    match_data: Mutex<Option<Value>>,
}

impl Overlay {
    pub fn new() -> Self {
        Self {
            sender: broadcast::channel(OVERLAY_BACKLOG).0,
            match_data: Mutex::new(None),
        }
    }

    pub fn subscribe(&self) -> Receiver<String> {
        self.sender.subscribe()
    }

    pub fn set_match_data(&self, data: Option<Value>) {
        *self.match_data.lock().unwrap_or_else(PoisonError::into_inner) = data;
    }

    // Built field by field: app settings hold the website API key and must never be included.
    pub fn message(&self, kind: &str, settings: &SettingsStore) -> String {
        let (match_settings, displayer_settings) =
            settings.read(|settings| (settings.matchSettings.clone(), settings.displayerSettings.clone()));

        let mut message = json!({
            "type": kind,
            "settings": { "matchSettings": match_settings, "displayerSettings": displayer_settings },
        });

        if let Some(data) = self.match_data.lock().unwrap_or_else(PoisonError::into_inner).clone() {
            message["settings"]["matchData"] = data;
        }
        message.to_string()
    }

    pub fn publish(&self, kind: &str, settings: &SettingsStore) {
        // An error only means no overlay is connected right now.
        let _ = self.sender.send(self.message(kind, settings));
    }
}

#[derive(Clone)]
struct OverlayState {
    overlay: Arc<Overlay>,
    settings: Arc<SettingsStore>,
}

fn is_allowed_origin(headers: &HeaderMap) -> bool {
    headers
        .get(ORIGIN)
        .and_then(|origin| origin.to_str().ok())
        .is_some_and(|origin| ALLOWED_ORIGINS.contains(&origin))
}

async fn overlay_socket(ws: WebSocketUpgrade, headers: HeaderMap, State(state): State<OverlayState>) -> Response {
    if !is_allowed_origin(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }

    // Subscribing before reading the state means no update can fall between the two.
    let receiver = state.overlay.subscribe();
    let initial = state.overlay.message("initLoad", &state.settings);
    ws.on_upgrade(move |socket| run_overlay_session(socket, initial, receiver))
}

async fn run_overlay_session(mut socket: WebSocket, initial: String, mut receiver: Receiver<String>) {
    if socket.send(Message::text(initial)).await.is_err() {
        return;
    }

    loop {
        tokio::select! {
            update = receiver.recv() => match update {
                Ok(text) => {
                    if socket.send(Message::text(text)).await.is_err() {
                        return;
                    }
                }
                Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => return,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Close(_)) | Err(_)) | None => return,
                Some(Ok(_)) => {}
            },
        }
    }
}

fn embedded_file(path: &str) -> Response {
    match OverlayFiles::get(path) {
        Some(file) => {
            let content_type = file.metadata.mimetype().to_string();
            ([(CONTENT_TYPE, content_type)], file.data).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn visualizer() -> Response {
    embedded_file("visualizer.html")
}

async fn overlay_asset(uri: Uri) -> Response {
    embedded_file(uri.path().trim_start_matches('/'))
}

fn overlay_routes(overlay: Arc<Overlay>, settings: Arc<SettingsStore>, teams_dir: &Path) -> Router {
    Router::new()
        .route("/visualizer", get(visualizer))
        .route("/ws", get(overlay_socket))
        .nest_service("/teams", ServeDir::new(teams_dir))
        .fallback(overlay_asset)
        .with_state(OverlayState { overlay, settings })
}

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

pub async fn serve(
    listener: TcpListener,
    app: AppHandle,
    overlay: Arc<Overlay>,
    settings: Arc<SettingsStore>,
    teams_dir: &Path,
) {
    let router = Router::new()
        .route("/oauth/callback", get(callback))
        .with_state(app)
        .merge(overlay_routes(overlay, settings, teams_dir));

    if axum::serve(listener, router).await.is_err() {
        eprintln!("The local server stopped");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::tests::temp_dir;
    use std::fs;

    async fn start() -> (String, Arc<Overlay>, Arc<SettingsStore>) {
        let root = temp_dir();
        let teams = root.join("teams");
        fs::create_dir_all(&teams).unwrap();
        fs::write(teams.join("Team One.png"), b"image-bytes").unwrap();
        fs::write(root.join("auth.json"), b"AUTH-FILE-CONTENT").unwrap();

        let overlay = Arc::new(Overlay::new());
        let settings = Arc::new(SettingsStore::open(&temp_dir(), None));
        settings
            .update(|current| current.appSettings.ExportMatches.apikey = "SITE-SECRET-KEY".into())
            .unwrap();

        let router = overlay_routes(overlay.clone(), settings.clone(), &teams);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, router).await });
        (base, overlay, settings)
    }

    async fn upgrade(base: &str, origin: Option<&str>) -> u16 {
        let mut request = reqwest::Client::new()
            .get(format!("{base}/ws"))
            .header("connection", "upgrade")
            .header("upgrade", "websocket")
            .header("sec-websocket-version", "13")
            .header("sec-websocket-key", "dGhlIHNhbXBsZSBub25jZQ==");
        if let Some(origin) = origin {
            request = request.header("origin", origin);
        }
        request.send().await.unwrap().status().as_u16()
    }

    // Bug 1: any website could connect to the old socket and read the settings.
    #[tokio::test]
    async fn socket_accepts_only_the_local_overlay_origins() {
        let (base, _, _) = start().await;
        assert_eq!(upgrade(&base, Some("http://localhost:21086")).await, 101);
        assert_eq!(upgrade(&base, Some("http://127.0.0.1:21086")).await, 101);

        for origin in ["https://evil.test", "http://localhost:21086.evil.test", "http://localhost:3000", "null"] {
            assert_eq!(upgrade(&base, Some(origin)).await, 403, "{origin}");
        }
        assert_eq!(upgrade(&base, None).await, 403);
    }

    #[tokio::test]
    async fn overlay_page_and_assets_are_served() {
        let (base, _, _) = start().await;
        for (path, content_type) in [
            ("/visualizer", "text/html"),
            ("/data.js", "javascript"),
            ("/style.css", "text/css"),
            ("/img/modsIcons/HD.svg", "image/svg"),
        ] {
            let response = reqwest::get(format!("{base}{path}")).await.unwrap();
            assert_eq!(response.status(), 200, "{path}");
            let header = response.headers()[CONTENT_TYPE].to_str().unwrap().to_string();
            assert!(header.contains(content_type), "{path}: {header}");
        }
        assert_eq!(reqwest::get(format!("{base}/missing.js")).await.unwrap().status(), 404);
    }

    #[tokio::test]
    async fn team_images_are_served_but_cannot_escape_the_folder() {
        let (base, _, _) = start().await;
        let image = reqwest::get(format!("{base}/teams/Team%20One.png")).await.unwrap();
        assert_eq!(image.status(), 200);
        assert_eq!(image.bytes().await.unwrap().as_ref(), b"image-bytes");

        for path in ["/teams/..%2fauth.json", "/teams/%2e%2e/auth.json", "/teams/..%5cauth.json"] {
            let response = reqwest::get(format!("{base}{path}")).await.unwrap();
            assert_ne!(response.status(), 200, "{path}");
            assert!(!response.text().await.unwrap().contains("AUTH-FILE-CONTENT"), "{path}");
        }
    }

    #[tokio::test]
    async fn messages_keep_the_overlay_shape_without_app_settings() {
        let (_, overlay, settings) = start().await;
        let parsed: Value = serde_json::from_str(&overlay.message("initLoad", &settings)).unwrap();

        assert_eq!(parsed["type"], "initLoad");
        assert_eq!(parsed["settings"]["matchSettings"]["MatchType"], "1vs1");
        assert_eq!(parsed["settings"]["displayerSettings"]["SmallDisplayer"], false);
        assert!(parsed["settings"].get("matchData").is_none());
        assert!(parsed["settings"].get("appSettings").is_none());
        assert!(!parsed.to_string().contains("SITE-SECRET-KEY"));

        overlay.set_match_data(Some(json!({ "scores": { "player1": 1 } })));
        let parsed: Value = serde_json::from_str(&overlay.message("matchSettings", &settings)).unwrap();
        assert_eq!(parsed["settings"]["matchData"]["scores"]["player1"], 1);
    }

    #[tokio::test]
    async fn publishing_without_overlays_is_harmless() {
        let (_, overlay, settings) = start().await;
        overlay.publish("matchSettings", &settings);
    }
}
