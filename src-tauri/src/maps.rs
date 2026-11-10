use crate::osu::{BeatmapDetails, OsuClient, OsuError};
use serde::Serialize;
use std::collections::HashMap;

const COVER_HOST: &str = "https://assets.ppy.sh/";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapSide {
    pub user_id: u64,
    pub avatar: Option<String>,
    pub name: String,
    pub score: u64,
    pub grade: Option<String>,
    pub won: bool,
}

// One card of the map list overlays: shared by ranked rooms and tournament matches.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEntry {
    pub key: u64,
    pub round: usize,
    pub beatmap_id: u64,
    pub title: Option<String>,
    pub version: Option<String>,
    pub cover: Option<String>,
    pub multiplier: Option<f64>,
    pub damage: Option<i64>,
    pub stars: f64,
    pub length: u32,
    pub bpm: f64,
    pub ar: f64,
    pub od: f64,
    pub cs: f64,
    pub hp: f64,
    pub live: bool,
    pub sides: [MapSide; 2],
}

impl MapEntry {
    pub fn new(key: u64, round: usize, beatmap_id: u64, details: Option<&BeatmapDetails>, multiplier: Option<f64>, live: bool, sides: [MapSide; 2]) -> Self {
        Self {
            key,
            round,
            beatmap_id,
            title: details.map(|details| details.beatmapset.title.clone()),
            version: details.map(|details| details.version.clone()),
            cover: details.and_then(|details| safe_cover(&details.beatmapset.covers.card)),
            multiplier,
            damage: None,
            stars: details.map_or(0.0, |details| details.difficulty_rating),
            length: details.map_or(0, |details| details.total_length),
            bpm: details.and_then(|details| details.bpm).unwrap_or(0.0),
            ar: details.map_or(0.0, |details| details.ar),
            od: details.map_or(0.0, |details| details.accuracy),
            cs: details.map_or(0.0, |details| details.cs),
            hp: details.map_or(0.0, |details| details.drain),
            live,
            sides,
        }
    }
}

pub fn avatar_url(user_id: u64) -> Option<String> {
    (user_id != 0).then(|| format!("https://a.ppy.sh/{user_id}"))
}

// The URL ends up in the overlay's CSS, so only the official image host is accepted.
pub fn safe_cover(url: &str) -> Option<String> {
    url.starts_with(COVER_HOST).then(|| url.to_string())
}

// One API call per beatmap for the whole session; a failed lookup is simply retried next poll.
#[derive(Default)]
pub struct BeatmapCache {
    beatmaps: HashMap<u64, BeatmapDetails>,
}

impl BeatmapCache {
    pub async fn load(&mut self, osu: &OsuClient, token: &str, id: u64) -> Result<(), OsuError> {
        if id != 0 && !self.beatmaps.contains_key(&id) {
            match osu.beatmap(token, id).await {
                Ok(details) => {
                    self.beatmaps.insert(id, details);
                }
                Err(OsuError::Unauthorized) => return Err(OsuError::Unauthorized),
                Err(OsuError::Unavailable) => {}
            }
        }
        Ok(())
    }

    pub fn get(&self, id: u64) -> Option<&BeatmapDetails> {
        self.beatmaps.get(&id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn covers_are_accepted_only_from_the_official_host() {
        assert!(safe_cover("https://assets.ppy.sh/beatmaps/1/covers/card.jpg?1").is_some());
        assert!(safe_cover("https://evil.test/card.jpg").is_none());
        assert!(safe_cover("https://assets.ppy.sh.evil.test/card.jpg").is_none());
        assert!(safe_cover("javascript:alert(1)").is_none());
        assert!(safe_cover("").is_none());
    }

    #[test]
    fn no_avatar_without_a_user() {
        assert_eq!(avatar_url(0), None);
        assert_eq!(avatar_url(7).as_deref(), Some("https://a.ppy.sh/7"));
    }
}
