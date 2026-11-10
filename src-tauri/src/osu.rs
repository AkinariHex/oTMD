use crate::scoring::{MatchResponse, MatchUser, OSU_API_VERSION};
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::Value;
use std::time::Duration;

pub const OSU_API_URL: &str = "https://osu.ppy.sh/api/v2";
const PAGE_SIZE: &str = "101";
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Deserialize)]
pub struct RoomSummary {
    pub id: u64,
    #[serde(default)]
    pub starts_at: Option<String>,
    #[serde(default)]
    pub ends_at: Option<String>,
}

#[derive(Deserialize)]
pub struct RoomInfo {
    pub active: bool,
    pub ends_at: Option<String>,
    pub starts_at: String,
}

#[derive(Deserialize)]
pub struct RoomUser {
    pub id: u64,
    pub username: String,
}

#[derive(Deserialize)]
pub struct RoomScore {
    pub user_id: u64,
    pub total_score: i64,
    #[serde(default)]
    pub rank: Option<String>,
}

#[derive(Deserialize)]
pub struct RoomItem {
    pub id: u64,
    pub beatmap_id: u64,
    pub played_at: Option<String>,
    #[serde(default)]
    pub ruleset_id: u32,
    #[serde(default)]
    pub scores: Vec<RoomScore>,
}

#[derive(Default, Deserialize)]
pub struct BeatmapCovers {
    #[serde(default)]
    pub card: String,
    #[serde(default)]
    pub cover: String,
}

#[derive(Deserialize)]
pub struct RoomBeatmap {
    pub id: u64,
    pub beatmapset_id: u64,
    pub version: String,
    pub difficulty_rating: f64,
}

#[derive(Deserialize)]
pub struct RoomBeatmapset {
    pub id: u64,
    pub title: String,
    #[serde(default)]
    pub covers: BeatmapCovers,
}

#[derive(Deserialize)]
pub struct BeatmapSetDetails {
    pub title: String,
    #[serde(default)]
    pub covers: BeatmapCovers,
}

#[derive(Deserialize)]
pub struct BeatmapDetails {
    pub version: String,
    pub difficulty_rating: f64,
    pub total_length: u32,
    pub bpm: Option<f64>,
    pub ar: f64,
    pub accuracy: f64,
    pub cs: f64,
    pub drain: f64,
    pub beatmapset: BeatmapSetDetails,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RankedStats {
    pub rank: Option<i64>,
    pub rating: Option<i64>,
    pub plays: i64,
    pub first_placements: i64,
}

#[derive(Debug, PartialEq)]
pub struct RankedProfile {
    pub username: String,
    pub stats: Option<RankedStats>,
}

#[derive(Deserialize)]
pub struct RoomEvents {
    pub room: RoomInfo,
    #[serde(default)]
    pub users: Vec<RoomUser>,
    #[serde(default)]
    pub playlist_items: Vec<RoomItem>,
    #[serde(default)]
    pub beatmaps: Vec<RoomBeatmap>,
    #[serde(default)]
    pub beatmapsets: Vec<RoomBeatmapset>,
}

#[derive(Debug, PartialEq)]
pub enum OsuError {
    Unauthorized,
    Unavailable,
}

#[derive(Clone)]
pub struct OsuClient {
    http: Client,
    base: String,
}

impl OsuClient {
    pub fn new(base: &str) -> reqwest::Result<Self> {
        let http = Client::builder()
            .timeout(TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("oTMD/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { http, base: base.into() })
    }

    // Room scores use the current format, so only match requests pin the old API version.
    async fn get<T: DeserializeOwned>(&self, url: Url, token: &str, query: &[(&str, &str)], pinned: bool) -> Result<T, OsuError> {
        let mut request = self.http.get(url).bearer_auth(token).query(query);
        if pinned {
            request = request.header("x-api-version", OSU_API_VERSION);
        }
        let response = request.send().await.map_err(|_| OsuError::Unavailable)?;

        if response.status() == StatusCode::UNAUTHORIZED {
            return Err(OsuError::Unauthorized);
        }

        response
            .error_for_status()
            .map_err(|_| OsuError::Unavailable)?
            .json()
            .await
            .map_err(|_| OsuError::Unavailable)
    }

    fn url(&self, segments: &[&str]) -> Result<Url, OsuError> {
        let mut url = Url::parse(&self.base).map_err(|_| OsuError::Unavailable)?;
        url.path_segments_mut()
            .map_err(|()| OsuError::Unavailable)?
            .pop_if_empty()
            .extend(segments);
        Ok(url)
    }

    pub async fn match_page(&self, token: &str, match_id: u64, after: u64) -> Result<MatchResponse, OsuError> {
        let url = self.url(&["matches", &match_id.to_string()])?;
        self.get(url, token, &[("limit", PAGE_SIZE), ("after", &after.to_string())], true)
            .await
    }

    pub async fn user_by_name(&self, token: &str, name: &str) -> Result<MatchUser, OsuError> {
        let url = self.url(&["users", &format!("@{name}"), "osu"])?;
        self.get(url, token, &[], true).await
    }

    pub async fn active_ranked_rooms(&self, token: &str) -> Result<Vec<RoomSummary>, OsuError> {
        let query = [("type_group", "ranked-play"), ("mode", "participated"), ("is_active", "true")];
        self.get(self.url(&["rooms"])?, token, &query, false).await
    }

    pub async fn recent_ranked_rooms(&self, token: &str, limit: &str) -> Result<Vec<RoomSummary>, OsuError> {
        let query = [("type_group", "ranked-play"), ("mode", "participated"), ("limit", limit)];
        self.get(self.url(&["rooms"])?, token, &query, false).await
    }

    // ponytail: only the latest 101 events; a match long enough to exceed that would need paging.
    pub async fn room_events(&self, token: &str, room: u64) -> Result<RoomEvents, OsuError> {
        let url = self.url(&["rooms", &room.to_string(), "events"])?;
        self.get(url, token, &[("limit", PAGE_SIZE)], false).await
    }

    pub async fn beatmap(&self, token: &str, id: u64) -> Result<BeatmapDetails, OsuError> {
        self.get(self.url(&["beatmaps", &id.to_string()])?, token, &[], false).await
    }

    pub async fn ranked_profile(&self, token: &str, user: u64) -> Result<RankedProfile, OsuError> {
        let profile: Value = self.get(self.url(&["users", &user.to_string()])?, token, &[], false).await?;
        let stats = profile["matchmaking_stats"].as_array().and_then(|pools| {
            pools.iter().find(|stats| {
                stats["pool"]["type"] == "ranked_play" && stats["pool"]["active"] == true && stats["pool"]["ruleset_id"] == 0
            })
        });

        Ok(RankedProfile {
            username: profile["username"].as_str().unwrap_or_default().to_string(),
            stats: stats.map(|stats| RankedStats {
                rank: stats["rank"].as_i64(),
                rating: stats["rating"].as_i64(),
                plays: stats["plays"].as_i64().unwrap_or(0),
                first_placements: stats["first_placements"].as_i64().unwrap_or(0),
            }),
        })
    }
}
