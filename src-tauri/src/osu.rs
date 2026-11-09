use crate::scoring::{MatchResponse, MatchUser, OSU_API_VERSION};
use reqwest::{Client, StatusCode, Url};
use serde::de::DeserializeOwned;
use std::time::Duration;

pub const OSU_API_URL: &str = "https://osu.ppy.sh/api/v2";
const PAGE_SIZE: &str = "101";
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, PartialEq)]
pub enum OsuError {
    Unauthorized,
    Unavailable,
}

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

    async fn get<T: DeserializeOwned>(&self, url: Url, token: &str, query: &[(&str, &str)]) -> Result<T, OsuError> {
        let response = self
            .http
            .get(url)
            .bearer_auth(token)
            .header("x-api-version", OSU_API_VERSION)
            .query(query)
            .send()
            .await
            .map_err(|_| OsuError::Unavailable)?;

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
        self.get(url, token, &[("limit", PAGE_SIZE), ("after", &after.to_string())])
            .await
    }

    pub async fn user_by_name(&self, token: &str, name: &str) -> Result<MatchUser, OsuError> {
        let url = self.url(&["users", &format!("@{name}"), "osu"])?;
        self.get(url, token, &[]).await
    }
}
