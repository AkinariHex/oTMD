use crate::settings::write_atomic;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use reqwest::header::RETRY_AFTER;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    fs, io,
    path::PathBuf,
    sync::{Mutex, MutexGuard, PoisonError},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Notify;

const SITE_URL: &str = "https://otmd.app";
const OSU_API_URL: &str = "https://osu.ppy.sh/api/v2";
const AUTH_FILE: &str = "auth.json";
const LOGIN_WINDOW_SECONDS: u64 = 600;
const HTTP_TIMEOUT: Duration = Duration::from_secs(15);
const REVOKE_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_SLEEP_SECONDS: u64 = 300;
const FIRST_BACKOFF_SECONDS: u64 = 60;
const MAX_BACKOFF_SECONDS: u64 = 900;

pub fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct User {
    pub id: u64,
    pub username: String,
    pub country: String,
}

// Holds tokens: no Debug, and commands only ever return `User` to the UI.
#[derive(Clone, Serialize, Deserialize)]
struct StoredSession {
    user: User,
    access_token: String,
    refresh_token: String,
    issued_at: u64,
    expires_at: u64,
}

impl StoredSession {
    fn refresh_due_at(&self) -> u64 {
        refresh_due_at(self.issued_at, self.expires_at)
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct OsuMe {
    id: u64,
    username: String,
    country_code: String,
}

struct PendingLogin {
    state: String,
    verifier: String,
    expires_at: u64,
}

#[derive(Deserialize)]
pub struct CallbackParams {
    state: Option<String>,
    code: Option<String>,
    code_binding: Option<String>,
    error: Option<String>,
}

pub enum CallbackOutcome {
    BadState,
    Denied,
    Failed,
    LoggedIn(User),
}

enum BrokerOutcome {
    Tokens(TokenResponse),
    InvalidGrant,
    Retry(Option<u64>),
}

#[derive(Debug, PartialEq)]
enum RefreshOutcome {
    NoSession,
    NotDue,
    Refreshed,
    Retry(Option<u64>),
    Ended,
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS random source is unavailable");
    URL_SAFE_NO_PAD.encode(bytes)
}

fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn refresh_due_at(issued_at: u64, expires_at: u64) -> u64 {
    issued_at + expires_at.saturating_sub(issued_at) / 2
}

fn backoff_seconds(failures: u32) -> u64 {
    FIRST_BACKOFF_SECONDS
        .saturating_mul(1u64 << failures.saturating_sub(1).min(16))
        .min(MAX_BACKOFF_SECONDS)
}

fn retry_delay(failures: u32, retry_after: Option<u64>) -> u64 {
    backoff_seconds(failures)
        .max(retry_after.unwrap_or(0))
        .min(MAX_BACKOFF_SECONDS)
}

// Only an explicit invalid_grant may end a session: anything else could be a temporary outage.
fn classify_broker_response(status: u16, body: &[u8], retry_after: Option<u64>) -> BrokerOutcome {
    if status == 200 {
        return match serde_json::from_slice(body) {
            Ok(tokens) => BrokerOutcome::Tokens(tokens),
            Err(_) => BrokerOutcome::Retry(None),
        };
    }

    #[derive(Deserialize)]
    struct BrokerError {
        error: String,
    }

    let is_invalid_grant = status == 400
        && serde_json::from_slice::<BrokerError>(body).is_ok_and(|body| body.error == "invalid_grant");

    if is_invalid_grant {
        BrokerOutcome::InvalidGrant
    } else {
        BrokerOutcome::Retry(retry_after)
    }
}

pub struct AuthManager {
    path: PathBuf,
    site_url: String,
    osu_api_url: String,
    http: reqwest::Client,
    session: Mutex<Option<StoredSession>>,
    pending: Mutex<Option<PendingLogin>>,
    // Serializes refresh, login and logout: refresh tokens rotate, so two writers would lose one.
    gate: tokio::sync::Mutex<()>,
    wake: Notify,
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl AuthManager {
    pub fn open(data_dir: &std::path::Path) -> reqwest::Result<Self> {
        Self::with_endpoints(data_dir, SITE_URL, OSU_API_URL)
    }

    fn with_endpoints(data_dir: &std::path::Path, site_url: &str, osu_api_url: &str) -> reqwest::Result<Self> {
        let path = data_dir.join(AUTH_FILE);
        let session = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok());
        let http = reqwest::Client::builder()
            .timeout(HTTP_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("oTMD/", env!("CARGO_PKG_VERSION")))
            .build()?;

        Ok(Self {
            path,
            site_url: site_url.into(),
            osu_api_url: osu_api_url.into(),
            http,
            session: Mutex::new(session),
            pending: Mutex::new(None),
            gate: tokio::sync::Mutex::new(()),
            wake: Notify::new(),
        })
    }

    pub fn user(&self) -> Option<User> {
        locked(&self.session).as_ref().map(|session| session.user.clone())
    }

    fn snapshot(&self) -> Option<StoredSession> {
        locked(&self.session).clone()
    }

    fn persist(&self, session: &StoredSession) -> io::Result<()> {
        write_atomic(&self.path, &serde_json::to_vec(session)?)
    }

    fn clear(&self) {
        *locked(&self.session) = None;
        if let Err(error) = fs::remove_file(&self.path)
            && error.kind() != io::ErrorKind::NotFound
        {
            eprintln!("Could not remove the session file");
        }
    }

    pub fn begin_login(&self, now: u64) -> String {
        let state = random_token();
        let verifier = random_token();
        let challenge = pkce_challenge(&verifier);
        let url = format!(
            "{}/api/auth/desktop/login?state={state}&code_challenge={challenge}",
            self.site_url
        );

        *locked(&self.pending) = Some(PendingLogin {
            state,
            verifier,
            expires_at: now + LOGIN_WINDOW_SECONDS,
        });
        url
    }

    // A wrong state leaves the pending login intact, so a local page cannot cancel it.
    fn take_verifier(&self, state: &str, now: u64) -> Option<String> {
        let mut pending = locked(&self.pending);
        match pending.as_ref() {
            Some(login) if login.state == state && now <= login.expires_at => {
                pending.take().map(|login| login.verifier)
            }
            _ => None,
        }
    }

    pub async fn complete_callback(&self, params: CallbackParams, now: u64) -> CallbackOutcome {
        let Some(verifier) = params
            .state
            .as_deref()
            .and_then(|state| self.take_verifier(state, now))
        else {
            return CallbackOutcome::BadState;
        };

        if params.error.as_deref() == Some("access_denied") {
            return CallbackOutcome::Denied;
        }

        let (Some(code), Some(binding), None) = (params.code, params.code_binding, params.error) else {
            return CallbackOutcome::Failed;
        };

        match self.exchange_code(&code, &binding, &verifier, now).await {
            Some(user) => CallbackOutcome::LoggedIn(user),
            None => CallbackOutcome::Failed,
        }
    }

    async fn exchange_code(&self, code: &str, binding: &str, verifier: &str, now: u64) -> Option<User> {
        let body = json!({ "code": code, "code_binding": binding, "code_verifier": verifier });
        let BrokerOutcome::Tokens(tokens) = self.post_broker("/api/osu/oauth/token", body).await else {
            return None;
        };

        let me: OsuMe = self
            .http
            .get(format!("{}/me", self.osu_api_url))
            .bearer_auth(&tokens.access_token)
            .send()
            .await
            .ok()?
            .error_for_status()
            .ok()?
            .json()
            .await
            .ok()?;

        let session = StoredSession {
            user: User {
                id: me.id,
                username: me.username,
                country: me.country_code,
            },
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            issued_at: now,
            expires_at: now.saturating_add(tokens.expires_in),
        };

        let _gate = self.gate.lock().await;
        if self.persist(&session).is_err() {
            eprintln!("Could not save the session file");
            return None;
        }

        let user = session.user.clone();
        *locked(&self.session) = Some(session);
        self.wake.notify_one();
        Some(user)
    }

    async fn post_broker(&self, path: &str, body: serde_json::Value) -> BrokerOutcome {
        let url = format!("{}{path}", self.site_url);
        let Ok(response) = self.http.post(url).json(&body).send().await else {
            return BrokerOutcome::Retry(None);
        };

        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get(RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse().ok());

        match response.bytes().await {
            Ok(bytes) => classify_broker_response(status, &bytes, retry_after),
            Err(_) => BrokerOutcome::Retry(retry_after),
        }
    }

    async fn refresh_if_due(&self, now: u64) -> RefreshOutcome {
        let _gate = self.gate.lock().await;

        let Some(current) = self.snapshot() else {
            return RefreshOutcome::NoSession;
        };
        if now < current.refresh_due_at() {
            return RefreshOutcome::NotDue;
        }

        let body = json!({ "refresh_token": current.refresh_token });
        match self.post_broker("/api/osu/oauth/refresh", body).await {
            BrokerOutcome::Tokens(tokens) => {
                let session = StoredSession {
                    user: current.user,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    issued_at: now,
                    expires_at: now.saturating_add(tokens.expires_in),
                };
                // The old refresh token is already dead, so keep the new one in memory even if the disk fails.
                if self.persist(&session).is_err() {
                    eprintln!("Could not save the refreshed session");
                }
                *locked(&self.session) = Some(session);
                RefreshOutcome::Refreshed
            }
            BrokerOutcome::InvalidGrant => {
                self.clear();
                RefreshOutcome::Ended
            }
            BrokerOutcome::Retry(retry_after) => RefreshOutcome::Retry(retry_after),
        }
    }

    pub async fn logout(&self) {
        let _gate = self.gate.lock().await;

        if let Some(session) = self.snapshot() {
            let revoked = self
                .http
                .delete(format!("{}/oauth/tokens/current", self.osu_api_url))
                .bearer_auth(&session.access_token)
                .timeout(REVOKE_TIMEOUT)
                .send()
                .await;
            if revoked.is_err() {
                eprintln!("Could not revoke the osu! token");
            }
        }

        self.clear();
        self.wake.notify_one();
    }

    pub async fn is_export_key_valid(&self, key: &str) -> bool {
        self.http
            .get(format!("{}/api/validate", self.site_url))
            .bearer_auth(key)
            .send()
            .await
            .is_ok_and(|response| response.status().is_success())
    }

    // Short sleeps against the wall clock also cover PC sleep, where monotonic timers can stall.
    pub async fn run_session_loop(&self, on_expired: impl Fn()) {
        let mut failures = 0;
        let mut retry_at = 0;

        loop {
            let Some(session) = self.snapshot() else {
                failures = 0;
                retry_at = 0;
                self.wake.notified().await;
                continue;
            };

            let now = now_seconds();
            let wait = session.refresh_due_at().max(retry_at).saturating_sub(now);
            if wait > 0 {
                tokio::select! {
                    () = tokio::time::sleep(Duration::from_secs(wait.min(MAX_SLEEP_SECONDS))) => {}
                    () = self.wake.notified() => {}
                }
                continue;
            }

            match self.refresh_if_due(now).await {
                RefreshOutcome::Refreshed | RefreshOutcome::NotDue | RefreshOutcome::NoSession => {
                    failures = 0;
                    retry_at = 0;
                }
                RefreshOutcome::Retry(retry_after) => {
                    failures += 1;
                    retry_at = now + retry_delay(failures, retry_after);
                }
                RefreshOutcome::Ended => on_expired(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::tests::temp_dir;
    use axum::{
        Router,
        extract::State,
        http::{HeaderMap, StatusCode},
        routing::{delete, get, post},
    };
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    const NOW: u64 = 1_000_000;
    const VALID_TOKENS: &str =
        r#"{"access_token":"new-access","refresh_token":"new-refresh","expires_in":86400,"token_type":"Bearer"}"#;

    #[derive(Clone)]
    struct Mock {
        status: StatusCode,
        body: &'static str,
        refreshes: Arc<AtomicUsize>,
        revokes: Arc<AtomicUsize>,
        token_bodies: Arc<Mutex<Vec<String>>>,
    }

    async fn refresh_route(State(mock): State<Mock>) -> (StatusCode, &'static str) {
        mock.refreshes.fetch_add(1, Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(50)).await;
        (mock.status, mock.body)
    }

    async fn token_route(State(mock): State<Mock>, body: String) -> (StatusCode, &'static str) {
        locked(&mock.token_bodies).push(body);
        (mock.status, mock.body)
    }

    async fn me_route(headers: HeaderMap) -> (StatusCode, &'static str) {
        match headers.get("authorization").and_then(|value| value.to_str().ok()) {
            Some("Bearer new-access") => (
                StatusCode::OK,
                r#"{"id":7,"username":"tester","country_code":"IT"}"#,
            ),
            _ => (StatusCode::UNAUTHORIZED, "{}"),
        }
    }

    async fn validate_route(headers: HeaderMap) -> StatusCode {
        match headers.get("authorization").and_then(|value| value.to_str().ok()) {
            Some("Bearer good-key") => StatusCode::OK,
            _ => StatusCode::UNAUTHORIZED,
        }
    }

    async fn revoke_route(State(mock): State<Mock>) -> StatusCode {
        mock.revokes.fetch_add(1, Ordering::SeqCst);
        StatusCode::NO_CONTENT
    }

    async fn start_mock(status: StatusCode, body: &'static str) -> (String, Mock) {
        let mock = Mock {
            status,
            body,
            refreshes: Arc::default(),
            revokes: Arc::default(),
            token_bodies: Arc::default(),
        };
        let router = Router::new()
            .route("/api/osu/oauth/refresh", post(refresh_route))
            .route("/api/osu/oauth/token", post(token_route))
            .route("/api/validate", get(validate_route))
            .route("/api/v2/me", get(me_route))
            .route("/api/v2/oauth/tokens/current", delete(revoke_route))
            .with_state(mock.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, router).await });
        (format!("http://{address}"), mock)
    }

    fn manager(base: &str) -> AuthManager {
        AuthManager::with_endpoints(&temp_dir(), base, &format!("{base}/api/v2")).unwrap()
    }

    fn seed_session(auth: &AuthManager, issued_at: u64) {
        let session = StoredSession {
            user: User {
                id: 7,
                username: "tester".into(),
                country: "IT".into(),
            },
            access_token: "old-access".into(),
            refresh_token: "old-refresh".into(),
            issued_at,
            expires_at: issued_at + 86_400,
        };
        auth.persist(&session).unwrap();
        *locked(&auth.session) = Some(session);
    }

    fn params(state: Option<&str>, code: Option<&str>, error: Option<&str>) -> CallbackParams {
        CallbackParams {
            state: state.map(Into::into),
            code: code.map(Into::into),
            code_binding: code.map(|_| "binding".into()),
            error: error.map(Into::into),
        }
    }

    fn state_from(url: &str) -> String {
        url.split("state=").nth(1).unwrap().split('&').next().unwrap().into()
    }

    #[test]
    fn pkce_matches_rfc_7636_vector() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn random_tokens_are_site_compatible_and_unique() {
        let token = random_token();
        assert_eq!(token.len(), 43);
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(token, random_token());
    }

    #[test]
    fn refresh_is_due_at_half_lifetime() {
        assert_eq!(refresh_due_at(1_000, 87_400), 44_200);
        assert_eq!(refresh_due_at(1_000, 1_000), 1_000);
        assert_eq!(refresh_due_at(1_000, 500), 1_000);
    }

    #[test]
    fn backoff_doubles_up_to_fifteen_minutes() {
        let delays: Vec<u64> = (1..=6).map(backoff_seconds).collect();
        assert_eq!(delays, [60, 120, 240, 480, 900, 900]);
        assert_eq!(backoff_seconds(u32::MAX), 900);
        assert_eq!(retry_delay(1, Some(300)), 300);
        assert_eq!(retry_delay(3, Some(10)), 240);
        assert_eq!(retry_delay(1, Some(999_999)), 900);
    }

    #[test]
    fn only_invalid_grant_ends_a_session() {
        let invalid = br#"{"error":"invalid_grant"}"#;
        assert!(matches!(
            classify_broker_response(400, invalid, None),
            BrokerOutcome::InvalidGrant
        ));
        assert!(matches!(
            classify_broker_response(200, VALID_TOKENS.as_bytes(), None),
            BrokerOutcome::Tokens(_)
        ));

        let temporary: [(u16, &[u8], Option<u64>); 6] = [
            (400, br#"{"error":"invalid_request"}"#, None),
            (429, br#"{"error":"rate_limited"}"#, Some(30)),
            (502, br#"{"error":"upstream_unavailable"}"#, None),
            (500, invalid, None),
            (200, b"not json", None),
            (400, b"<html>", None),
        ];

        for (status, body, retry_after) in temporary {
            assert!(
                matches!(classify_broker_response(status, body, retry_after), BrokerOutcome::Retry(after) if after == retry_after || status == 200),
                "status {status}"
            );
        }
    }

    #[tokio::test]
    async fn near_expiry_token_refreshes_and_survives_restart() {
        let (base, mock) = start_mock(StatusCode::OK, VALID_TOKENS).await;
        let auth = manager(&base);
        seed_session(&auth, NOW);

        assert_eq!(auth.refresh_if_due(NOW + 43_199).await, RefreshOutcome::NotDue);
        assert_eq!(mock.refreshes.load(Ordering::SeqCst), 0);

        let now = NOW + 86_000;
        assert_eq!(auth.refresh_if_due(now).await, RefreshOutcome::Refreshed);

        let session = auth.snapshot().unwrap();
        assert_eq!(session.access_token, "new-access");
        assert_eq!(session.refresh_token, "new-refresh");
        assert_eq!(session.expires_at, now + 86_400);

        let on_disk: StoredSession = serde_json::from_slice(&fs::read(&auth.path).unwrap()).unwrap();
        assert_eq!(on_disk.refresh_token, "new-refresh");

        let dir = auth.path.parent().unwrap();
        let reopened = AuthManager::with_endpoints(dir, &base, &base).unwrap();
        assert_eq!(reopened.user().unwrap().username, "tester");
    }

    #[tokio::test]
    async fn broker_outage_keeps_the_session() {
        let (base, _mock) = start_mock(StatusCode::BAD_GATEWAY, r#"{"error":"upstream_unavailable"}"#).await;
        let auth = manager(&base);
        seed_session(&auth, NOW);

        assert_eq!(auth.refresh_if_due(NOW + 86_000).await, RefreshOutcome::Retry(None));
        assert_eq!(auth.snapshot().unwrap().refresh_token, "old-refresh");
        assert!(auth.path.exists());
    }

    #[tokio::test]
    async fn unreachable_broker_keeps_the_session() {
        let auth = manager("http://127.0.0.1:9");
        seed_session(&auth, NOW);

        assert_eq!(auth.refresh_if_due(NOW + 86_000).await, RefreshOutcome::Retry(None));
        assert!(auth.user().is_some());
    }

    #[tokio::test]
    async fn invalid_grant_ends_the_session() {
        let (base, _mock) = start_mock(StatusCode::BAD_REQUEST, r#"{"error":"invalid_grant"}"#).await;
        let auth = manager(&base);
        seed_session(&auth, NOW);

        assert_eq!(auth.refresh_if_due(NOW + 86_000).await, RefreshOutcome::Ended);
        assert!(auth.user().is_none());
        assert!(!auth.path.exists());
    }

    #[tokio::test]
    async fn concurrent_refreshes_rotate_only_once() {
        let (base, mock) = start_mock(StatusCode::OK, VALID_TOKENS).await;
        let auth = manager(&base);
        seed_session(&auth, NOW);

        let now = NOW + 86_000;
        let (first, second, third) = tokio::join!(
            auth.refresh_if_due(now),
            auth.refresh_if_due(now),
            auth.refresh_if_due(now)
        );

        assert_eq!(mock.refreshes.load(Ordering::SeqCst), 1);
        let outcomes = [first, second, third];
        assert_eq!(outcomes.iter().filter(|o| **o == RefreshOutcome::Refreshed).count(), 1);
        assert_eq!(outcomes.iter().filter(|o| **o == RefreshOutcome::NotDue).count(), 2);
    }

    #[tokio::test]
    async fn wrong_state_is_rejected_and_keeps_the_login_pending() {
        let (base, mock) = start_mock(StatusCode::OK, VALID_TOKENS).await;
        let auth = manager(&base);
        let state = state_from(&auth.begin_login(NOW));

        for wrong in [Some("wrong"), None] {
            assert!(matches!(
                auth.complete_callback(params(wrong, Some("code"), None), NOW).await,
                CallbackOutcome::BadState
            ));
        }
        assert!(locked(&mock.token_bodies).is_empty());

        let outcome = auth.complete_callback(params(Some(&state), Some("code"), None), NOW).await;
        assert!(matches!(outcome, CallbackOutcome::LoggedIn(user) if user.username == "tester" && user.country == "IT"));

        let replay = auth.complete_callback(params(Some(&state), Some("code"), None), NOW).await;
        assert!(matches!(replay, CallbackOutcome::BadState), "state must be single use");
    }

    #[tokio::test]
    async fn login_sends_the_verifier_matching_the_challenge() {
        let (base, mock) = start_mock(StatusCode::OK, VALID_TOKENS).await;
        let auth = manager(&base);
        let url = auth.begin_login(NOW);
        let challenge = url.split("code_challenge=").nth(1).unwrap().to_owned();
        let state = state_from(&url);

        assert!(url.starts_with(&format!("{base}/api/auth/desktop/login?state=")));
        auth.complete_callback(params(Some(&state), Some("code"), None), NOW).await;

        let sent: serde_json::Value = serde_json::from_str(&locked(&mock.token_bodies)[0]).unwrap();
        assert_eq!(sent["code"], "code");
        assert_eq!(sent["code_binding"], "binding");
        assert_eq!(pkce_challenge(sent["code_verifier"].as_str().unwrap()), challenge);
    }

    #[tokio::test]
    async fn expired_login_window_is_rejected() {
        let (base, _mock) = start_mock(StatusCode::OK, VALID_TOKENS).await;
        let auth = manager(&base);
        let state = state_from(&auth.begin_login(NOW));

        let late = auth
            .complete_callback(params(Some(&state), Some("code"), None), NOW + LOGIN_WINDOW_SECONDS + 1)
            .await;
        assert!(matches!(late, CallbackOutcome::BadState));
    }

    #[tokio::test]
    async fn denied_and_failed_logins_store_nothing() {
        let (base, _mock) = start_mock(StatusCode::OK, VALID_TOKENS).await;
        let auth = manager(&base);

        let state = state_from(&auth.begin_login(NOW));
        let denied = auth.complete_callback(params(Some(&state), None, Some("access_denied")), NOW).await;
        assert!(matches!(denied, CallbackOutcome::Denied));

        let state = state_from(&auth.begin_login(NOW));
        let failed = auth.complete_callback(params(Some(&state), None, Some("server_error")), NOW).await;
        assert!(matches!(failed, CallbackOutcome::Failed));

        assert!(auth.user().is_none());
        assert!(!auth.path.exists());
    }

    #[tokio::test]
    async fn rejected_code_stores_nothing() {
        let (base, _mock) = start_mock(StatusCode::BAD_REQUEST, r#"{"error":"invalid_grant"}"#).await;
        let auth = manager(&base);
        let state = state_from(&auth.begin_login(NOW));

        let outcome = auth.complete_callback(params(Some(&state), Some("code"), None), NOW).await;
        assert!(matches!(outcome, CallbackOutcome::Failed));
        assert!(auth.user().is_none());
    }

    #[tokio::test]
    async fn export_key_is_checked_with_a_bearer_header() {
        let (base, _mock) = start_mock(StatusCode::OK, VALID_TOKENS).await;
        let auth = manager(&base);

        assert!(auth.is_export_key_valid("good-key").await);
        assert!(!auth.is_export_key_valid("wrong").await);
        assert!(!auth.is_export_key_valid("bad\nheader").await);
        assert!(!manager("http://127.0.0.1:9").is_export_key_valid("good-key").await);
    }

    #[tokio::test]
    async fn logout_revokes_and_clears_even_when_osu_is_down() {
        let (base, mock) = start_mock(StatusCode::OK, VALID_TOKENS).await;
        let auth = manager(&base);
        seed_session(&auth, NOW);

        auth.logout().await;
        assert_eq!(mock.revokes.load(Ordering::SeqCst), 1);
        assert!(auth.user().is_none());
        assert!(!auth.path.exists());

        let offline = manager("http://127.0.0.1:9");
        seed_session(&offline, NOW);
        offline.logout().await;
        assert!(offline.user().is_none());
        assert!(!offline.path.exists());
    }
}
