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
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    path::Path,
    sync::{
        Arc, Mutex, OnceLock, PoisonError,
        atomic::{AtomicUsize, Ordering},
    },
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
    ranked: Mutex<RankedState>,
    broadcast: Mutex<Option<Value>>,
    match_sources: AtomicUsize,
    ranked_sources: AtomicUsize,
    broadcast_sources: AtomicUsize,
    on_change: OnceLock<Box<dyn Fn(OverlaySources) + Send + Sync>>,
}

#[derive(Default)]
struct RankedState {
    view: Option<Value>,
    user: Option<Value>,
    rules_outdated: bool,
}

#[derive(Clone, Copy, Serialize)]
pub struct OverlaySources {
    #[serde(rename = "match")]
    pub match_overlay: usize,
    pub ranked: usize,
    pub broadcast: usize,
}

#[derive(Clone, Copy)]
enum SourceKind {
    Match,
    Ranked,
    Broadcast,
}

impl SourceKind {
    fn from_param(source: Option<&str>) -> Self {
        match source {
            Some("ranked") => Self::Ranked,
            Some("broadcast") => Self::Broadcast,
            _ => Self::Match,
        }
    }
}

// Dropping it counts the disconnect, however the session ended.
struct SourceConnection {
    overlay: Arc<Overlay>,
    kind: SourceKind,
}

impl SourceConnection {
    fn open(overlay: Arc<Overlay>, kind: SourceKind) -> Self {
        overlay.counter(kind).fetch_add(1, Ordering::Relaxed);
        overlay.notify();
        Self { overlay, kind }
    }
}

impl Drop for SourceConnection {
    fn drop(&mut self) {
        self.overlay.counter(self.kind).fetch_sub(1, Ordering::Relaxed);
        self.overlay.notify();
    }
}

impl Overlay {
    pub fn new() -> Self {
        Self {
            sender: broadcast::channel(OVERLAY_BACKLOG).0,
            match_data: Mutex::new(None),
            ranked: Mutex::default(),
            broadcast: Mutex::default(),
            match_sources: AtomicUsize::new(0),
            ranked_sources: AtomicUsize::new(0),
            broadcast_sources: AtomicUsize::new(0),
            on_change: OnceLock::new(),
        }
    }

    fn counter(&self, kind: SourceKind) -> &AtomicUsize {
        match kind {
            SourceKind::Match => &self.match_sources,
            SourceKind::Ranked => &self.ranked_sources,
            SourceKind::Broadcast => &self.broadcast_sources,
        }
    }

    pub fn set_on_change(&self, listener: impl Fn(OverlaySources) + Send + Sync + 'static) {
        let _ = self.on_change.set(Box::new(listener));
    }

    pub fn sources(&self) -> OverlaySources {
        OverlaySources {
            match_overlay: self.match_sources.load(Ordering::Relaxed),
            ranked: self.ranked_sources.load(Ordering::Relaxed),
            broadcast: self.broadcast_sources.load(Ordering::Relaxed),
        }
    }

    pub fn notify(&self) {
        if let Some(listener) = self.on_change.get() {
            listener(self.sources());
        }
    }

    pub fn set_ranked(&self, view: Option<Value>, rules_outdated: bool) {
        let mut state = self.ranked.lock().unwrap_or_else(PoisonError::into_inner);
        state.view = view;
        state.rules_outdated = rules_outdated;
    }

    pub fn set_ranked_user(&self, user: Option<Value>) {
        self.ranked.lock().unwrap_or_else(PoisonError::into_inner).user = user;
    }

    pub fn ranked_view(&self) -> Option<Value> {
        self.ranked.lock().unwrap_or_else(PoisonError::into_inner).view.clone()
    }

    pub fn set_ranked_rules_outdated(&self, rules_outdated: bool) {
        self.ranked.lock().unwrap_or_else(PoisonError::into_inner).rules_outdated = rules_outdated;
        self.notify();
    }

    pub fn ranked_rules_outdated(&self) -> bool {
        self.ranked.lock().unwrap_or_else(PoisonError::into_inner).rules_outdated
    }

    pub fn set_broadcast(&self, view: Option<Value>) {
        *self.broadcast.lock().unwrap_or_else(PoisonError::into_inner) = view;
    }

    pub fn broadcast_view(&self) -> Option<Value> {
        self.broadcast.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    pub fn subscribe(&self) -> Receiver<String> {
        self.sender.subscribe()
    }

    pub fn set_match_data(&self, data: Option<Value>) {
        *self.match_data.lock().unwrap_or_else(PoisonError::into_inner) = data;
    }

    // Built field by field: app settings hold the website API key and must never be included.
    pub fn message(&self, kind: &str, settings: &SettingsStore) -> String {
        let (match_settings, displayer_settings, ranked_settings, broadcast_style) = settings.read(|settings| {
            (settings.matchSettings.clone(), settings.displayerSettings.clone(), settings.rankedSettings.clone(), settings.broadcastStyle.clone())
        });

        let mut message = json!({
            "type": kind,
            "settings": {
                "matchSettings": match_settings,
                "displayerSettings": displayer_settings,
                "rankedStyles": {
                    "Health": ranked_settings.Health,
                    "Maps": ranked_settings.Maps,
                    "Ratio": ranked_settings.Ratio,
                },
                "broadcastStyle": broadcast_style,
            },
        });

        if let Some(view) = self.broadcast_view() {
            message["settings"]["broadcastData"] = view;
        }

        let ranked = self.ranked.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(view) = &ranked.view {
            message["settings"]["rankedData"] = view.clone();
        }
        if let Some(user) = &ranked.user {
            message["settings"]["rankedUser"] = user.clone();
        }
        drop(ranked);

        if let Some(data) = self.match_data.lock().unwrap_or_else(PoisonError::into_inner).clone() {
            message["settings"]["matchData"] = data;
        }
        message.to_string()
    }

    pub fn publish(&self, kind: &str, settings: &SettingsStore) {
        // An error only means no overlay is connected right now.
        let _ = self.sender.send(self.message(kind, settings));
        self.notify();
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

#[derive(Deserialize)]
struct SocketParams {
    preview: Option<String>,
    source: Option<String>,
}

async fn overlay_socket(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    Query(params): Query<SocketParams>,
    State(state): State<OverlayState>,
) -> Response {
    if !is_allowed_origin(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }

    // Subscribing before reading the state means no update can fall between the two.
    let receiver = state.overlay.subscribe();
    let initial = state.overlay.message("initLoad", &state.settings);
    let overlay = state.overlay.clone();
    ws.on_upgrade(move |socket| async move {
        // The app's own preview is not an OBS source.
        let kind = SourceKind::from_param(params.source.as_deref());
        let _connection = params.preview.is_none().then(|| SourceConnection::open(overlay, kind));
        run_overlay_session(socket, initial, receiver).await;
    })
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

async fn ranked_page() -> Response {
    embedded_file("ranked.html")
}

async fn ranked_ratio_page() -> Response {
    embedded_file("ranked-ratio.html")
}

async fn broadcast_page() -> Response {
    embedded_file("broadcast.html")
}

async fn maps_page() -> Response {
    embedded_file("maps.html")
}

async fn overlay_asset(uri: Uri) -> Response {
    embedded_file(uri.path().trim_start_matches('/'))
}

fn overlay_routes(overlay: Arc<Overlay>, settings: Arc<SettingsStore>, teams_dir: &Path) -> Router {
    Router::new()
        .route("/visualizer", get(visualizer))
        .route("/visualizer/maps", get(maps_page))
        .route("/ranked", get(ranked_page))
        .route("/ranked/maps", get(maps_page))
        .route("/ranked/ratio", get(ranked_ratio_page))
        .route("/broadcast", get(broadcast_page))
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

    async fn open_socket(base: &str, query: &str) -> tokio::net::TcpStream {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let host = base.trim_start_matches("http://");
        let mut stream = tokio::net::TcpStream::connect(host).await.unwrap();
        let request = format!(
            "GET /ws{query} HTTP/1.1\r\nHost: {host}\r\nConnection: upgrade\r\nUpgrade: websocket\r\n\
             Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\
             Origin: http://localhost:21086\r\n\r\n"
        );
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut response = [0u8; 1024];
        let read = stream.read(&mut response).await.unwrap();
        assert!(String::from_utf8_lossy(&response[..read]).contains("101"));
        stream
    }

    async fn wait_for_sources(overlay: &Overlay, expected: usize) {
        for _ in 0..200 {
            if overlay.sources().match_overlay == expected {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        assert_eq!(overlay.sources().match_overlay, expected);
    }

    #[tokio::test]
    async fn the_broadcast_page_is_served_and_counts_its_own_sources() {
        let (base, overlay, _) = start().await;

        let page = reqwest::get(format!("{base}/broadcast")).await.unwrap();
        assert_eq!(page.status(), 200);
        assert!(page.text().await.unwrap().contains("/broadcast.js"));
        for asset in ["broadcast.js", "broadcast.css"] {
            assert_eq!(reqwest::get(format!("{base}/{asset}")).await.unwrap().status(), 200);
        }

        let _source = open_socket(&base, "?source=broadcast").await;
        for _ in 0..200 {
            if overlay.sources().broadcast == 1 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        assert_eq!(overlay.sources().broadcast, 1);
        assert_eq!(overlay.sources().match_overlay, 0);
    }

    #[tokio::test]
    async fn sources_count_connections_but_not_the_app_preview() {
        let (base, overlay, _) = start().await;
        let changes = Arc::new(AtomicUsize::new(0));
        let counter = changes.clone();
        overlay.set_on_change(move |_| {
            counter.fetch_add(1, Ordering::Relaxed);
        });

        let source = open_socket(&base, "").await;
        wait_for_sources(&overlay, 1).await;

        let preview = open_socket(&base, "?preview=1").await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(overlay.sources().match_overlay, 1);

        let ranked = open_socket(&base, "?source=ranked").await;
        for _ in 0..200 {
            if overlay.sources().ranked == 1 {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        assert_eq!(overlay.sources().ranked, 1);
        assert_eq!(overlay.sources().match_overlay, 1);
        drop(ranked);

        drop(preview);
        drop(source);
        wait_for_sources(&overlay, 0).await;
        assert!(changes.load(Ordering::Relaxed) >= 2);
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
