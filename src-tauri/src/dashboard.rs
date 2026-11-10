use crate::{auth::AuthManager, osu::OsuClient, settings::SettingsStore};
use reqwest::{Client, StatusCode};
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const CACHE_FOR: Duration = Duration::from_secs(60);
const HTTP_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum SiteStatus {
    Ok,
    NoKey,
    InvalidKey,
    Unavailable,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedSummary {
    rank: Option<i64>,
    rating: Option<i64>,
    plays: i64,
    first_placements: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    site_status: SiteStatus,
    stats: Option<Value>,
    ranked: Option<RankedSummary>,
}

struct Cached {
    key: String,
    at: Instant,
    data: DashboardData,
}

pub struct Dashboard {
    osu: OsuClient,
    http: Client,
    site: String,
    cache: Mutex<Option<Cached>>,
}

impl Dashboard {
    pub fn new(osu_api: &str, site: &str) -> reqwest::Result<Self> {
        let http = Client::builder()
            .timeout(HTTP_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("oTMD/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { osu: OsuClient::new(osu_api)?, http, site: site.into(), cache: Mutex::new(None) })
    }

    async fn site_stats(&self, key: &str) -> (SiteStatus, Option<Value>) {
        if key.is_empty() {
            return (SiteStatus::NoKey, None);
        }

        let response = self.http.get(format!("{}/api/match/stats", self.site)).bearer_auth(key).send().await;
        match response {
            Ok(response) if response.status() == StatusCode::UNAUTHORIZED => (SiteStatus::InvalidKey, None),
            Ok(response) if response.status().is_success() => match response.json().await {
                Ok(stats) => (SiteStatus::Ok, Some(stats)),
                Err(_) => (SiteStatus::Unavailable, None),
            },
            _ => (SiteStatus::Unavailable, None),
        }
    }

    async fn ranked(&self, auth: &AuthManager) -> Option<RankedSummary> {
        let (token, user) = (auth.access_token()?, auth.user()?);
        let stats = self.osu.ranked_profile(&token, user.id).await.ok()?.stats?;
        Some(RankedSummary {
            rank: stats.rank,
            rating: stats.rating,
            plays: stats.plays,
            first_placements: stats.first_placements,
        })
    }

    // Runs only while the page is open, and the cache keeps page changes from refetching.
    pub async fn get(&self, auth: &AuthManager, settings: &SettingsStore) -> DashboardData {
        let key = settings.read(|settings| settings.appSettings.ExportMatches.apikey.clone());
        let mut cache = self.cache.lock().await;
        if let Some(cached) = cache.as_ref()
            && cached.key == key
            && cached.at.elapsed() < CACHE_FOR
        {
            return cached.data.clone();
        }

        let ((site_status, stats), ranked) = tokio::join!(self.site_stats(&key), self.ranked(auth));
        let data = DashboardData { site_status, stats, ranked };
        *cache = Some(Cached { key, at: Instant::now(), data: data.clone() });
        data
    }
}
