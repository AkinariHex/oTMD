use crate::{
    auth::AuthManager,
    maps::safe_cover,
    osu::{OsuClient, RoomEvents, RoomItem, RoomSummary},
    ranked::{self, RankedRules},
    ranked_watch::{completed_rounds, is_finished, saved_rules},
    settings::SettingsStore,
};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    cmp::Reverse,
    collections::HashMap,
    path::PathBuf,
    time::{Duration, Instant},
};
use tokio::{sync::Mutex, task::JoinSet};

const CACHE_FOR: Duration = Duration::from_secs(60);
const HTTP_TIMEOUT: Duration = Duration::from_secs(15);
const PAGE_SIZE: usize = 20;
// ponytail: the most osu! returns in one request; older rooms need its cursor if anyone plays more than this.
const MAX_ROOMS: &str = "250";
const DATE_PRECISION: usize = 19;
// The current damage rules start here, so health cannot be worked out for older rooms.
const RULES_SINCE: &str = "2026-05-18";

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
struct RankedPlayer {
    id: u64,
    username: String,
    rounds_won: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RankedRound {
    round: usize,
    title: String,
    version: String,
    stars: f64,
    cover: Option<String>,
    scores: [i64; 2],
    winner: Option<usize>,
    damage: i64,
    multiplier: f64,
    life: [i64; 2],
}

// Players are always [me, opponent], so a side index means the same thing everywhere.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedCard {
    room_id: u64,
    date: String,
    winner: Option<usize>,
    max_life: i64,
    players: [RankedPlayer; 2],
    rounds: Vec<RankedRound>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardData {
    site_status: SiteStatus,
    stats: Option<Value>,
    ranked: Option<RankedSummary>,
}

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedCursor {
    saved: Option<usize>,
    ranked: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedPage {
    matches: Vec<Value>,
    ranked_matches: Vec<RankedCard>,
    next: Option<FeedCursor>,
}

const FIRST_PAGE: FeedCursor = FeedCursor { saved: Some(0), ranked: 0 };

struct Cached<T> {
    key: String,
    at: Instant,
    data: T,
}

impl<T: Clone> Cached<T> {
    fn fresh(slot: &Option<Self>, key: &str) -> Option<T> {
        slot.as_ref().filter(|cached| cached.key == key && cached.at.elapsed() < CACHE_FOR).map(|cached| cached.data.clone())
    }
}

pub struct Dashboard {
    osu: OsuClient,
    http: Client,
    site: String,
    data_dir: PathBuf,
    cache: Mutex<Option<Cached<DashboardData>>>,
    first_page: Mutex<Option<Cached<FeedPage>>>,
    finished_rooms: Mutex<HashMap<u64, Option<RankedCard>>>,
}

fn date_key(date: &str) -> &str {
    date.get(..DATE_PRECISION).unwrap_or(date)
}

// How many entries of each source make up the next page, newest first. Saved matches come
// from a page of at most PAGE_SIZE, so this can never run past what was actually fetched.
fn plan_page(saved: &[Value], rooms: &[RoomSummary]) -> (usize, usize) {
    let (mut from_saved, mut from_rooms) = (0, 0);
    while from_saved + from_rooms < PAGE_SIZE && (from_saved < saved.len() || from_rooms < rooms.len()) {
        let saved_date = saved.get(from_saved).map(|row| date_key(row["startTime"].as_str().unwrap_or_default()));
        let room_date = rooms.get(from_rooms).map(|room| date_key(room.ends_at.as_deref().unwrap_or_default()));
        match (saved_date, room_date) {
            (Some(saved), Some(room)) if saved >= room => from_saved += 1,
            (Some(_), None) => from_saved += 1,
            _ => from_rooms += 1,
        }
    }
    (from_saved, from_rooms)
}

fn score_of(item: &RoomItem, player: u64) -> i64 {
    item.scores.iter().find(|score| score.user_id == player).map_or(0, |score| score.total_score)
}

fn ranked_card(rules: &RankedRules, me: u64, room: u64, events: &RoomEvents) -> Option<RankedCard> {
    if !is_finished(events) || events.room.starts_at.as_str() < RULES_SINCE {
        return None;
    }

    let mut users: Vec<_> = events.users.iter().collect();
    users.sort_by_key(|user| (user.id != me, user.id));
    let [first, second, ..] = users.as_slice() else {
        return None;
    };
    if first.id != me {
        return None;
    }
    let ids = [first.id, second.id];

    let items = completed_rounds(events);
    if items.is_empty() {
        return None;
    }
    let scores: Vec<Vec<(u64, i64)>> = items.iter().map(|item| item.scores.iter().map(|score| (score.user_id, score.total_score)).collect()).collect();
    let played = ranked::play(rules, ids, &scores);
    let side_of = |player: u64| usize::from(player != ids[0]);

    let rounds = items
        .iter()
        .zip(&played.rounds)
        .enumerate()
        .map(|(index, (item, result))| {
            let beatmap = events.beatmaps.iter().find(|beatmap| beatmap.id == item.beatmap_id);
            let set = beatmap.and_then(|beatmap| events.beatmapsets.iter().find(|set| set.id == beatmap.beatmapset_id));
            RankedRound {
                round: index + 1,
                title: set.map_or_else(String::new, |set| set.title.clone()),
                version: beatmap.map_or_else(String::new, |beatmap| beatmap.version.clone()),
                stars: beatmap.map_or(0.0, |beatmap| beatmap.difficulty_rating),
                cover: set.and_then(|set| safe_cover(&set.covers.cover)),
                scores: ids.map(|player| score_of(item, player)),
                winner: result.winner.map(side_of),
                damage: result.damage,
                multiplier: result.multiplier,
                life: result.lives,
            }
        })
        .collect();

    let mut alive = ids.iter().filter(|player| played.lives[player] > 0);
    let winner = match (alive.next(), alive.next()) {
        (Some(player), None) => Some(side_of(*player)),
        _ => None,
    };

    Some(RankedCard {
        room_id: room,
        date: events.room.ends_at.clone().unwrap_or_else(|| events.room.starts_at.clone()),
        winner,
        max_life: rules.max_life,
        players: [first, second].map(|user| RankedPlayer { id: user.id, username: user.username.clone(), rounds_won: played.rounds_won[&user.id] }),
        rounds,
    })
}

impl Dashboard {
    pub fn new(osu_api: &str, site: &str, data_dir: PathBuf) -> reqwest::Result<Self> {
        let http = Client::builder()
            .timeout(HTTP_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("oTMD/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            osu: OsuClient::new(osu_api)?,
            http,
            site: site.into(),
            data_dir,
            cache: Mutex::new(None),
            first_page: Mutex::new(None),
            finished_rooms: Mutex::new(HashMap::new()),
        })
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

    async fn saved_matches(&self, key: &str, offset: usize) -> Option<(Vec<Value>, bool)> {
        if key.is_empty() {
            return None;
        }
        let url = format!("{}/api/match/recent", self.site);
        let response = self.http.get(url).bearer_auth(key).query(&[("offset", offset)]).send().await.ok()?;
        let body: Value = response.error_for_status().ok()?.json().await.ok()?;
        let mut matches = body["matches"].as_array()?.clone();
        matches.truncate(PAGE_SIZE);
        Some((matches, body["hasMore"].as_bool().unwrap_or(false)))
    }

    async fn played_rooms(&self, auth: &AuthManager) -> Vec<RoomSummary> {
        let Some(token) = auth.access_token() else {
            return Vec::new();
        };
        let Ok(mut rooms) = self.osu.recent_ranked_rooms(&token, MAX_ROOMS).await else {
            return Vec::new();
        };
        rooms.retain(|room| room.ends_at.is_some() && room.starts_at.as_deref().is_some_and(|start| start >= RULES_SINCE));
        rooms.sort_unstable_by_key(|room| Reverse(room.id));
        rooms
    }

    // A finished room never changes, so each one costs a single request for the whole session.
    async fn ranked_cards(&self, auth: &AuthManager, rooms: &[RoomSummary]) -> Vec<RankedCard> {
        let (Some(token), Some(user)) = (auth.access_token(), auth.user()) else {
            return Vec::new();
        };
        let mut finished = self.finished_rooms.lock().await;

        let mut requests = JoinSet::new();
        for id in rooms.iter().map(|room| room.id).filter(|id| !finished.contains_key(id)) {
            let (osu, token) = (self.osu.clone(), token.clone());
            requests.spawn(async move { (id, osu.room_events(&token, id).await) });
        }

        let rules = saved_rules(&self.data_dir);
        while let Some(done) = requests.join_next().await {
            if let Ok((id, Ok(events))) = done
                && is_finished(&events)
            {
                finished.insert(id, ranked_card(&rules, user.id, id, &events));
            }
        }

        rooms.iter().filter_map(|room| finished.get(&room.id).cloned().flatten()).collect()
    }

    async fn build_page(&self, auth: &AuthManager, key: &str, cursor: FeedCursor) -> FeedPage {
        let saved_request = async {
            match cursor.saved {
                Some(offset) => self.saved_matches(key, offset).await,
                None => None,
            }
        };
        let (saved_page, rooms) = tokio::join!(saved_request, self.played_rooms(auth));
        let site_answered = saved_page.is_some();
        let (mut saved, saved_has_more) = saved_page.unwrap_or_default();
        let remaining = rooms.get(cursor.ranked..).unwrap_or_default();

        let (from_saved, from_rooms) = plan_page(&saved, remaining);
        let saved_left = saved.len() > from_saved || saved_has_more;
        saved.truncate(from_saved);
        let ranked_matches = self.ranked_cards(auth, &remaining[..from_rooms]).await;

        let next_saved = cursor.saved.filter(|_| site_answered && saved_left).map(|offset| offset + from_saved);
        let next_ranked = cursor.ranked + from_rooms;
        FeedPage {
            matches: saved,
            ranked_matches,
            next: (next_saved.is_some() || next_ranked < rooms.len()).then_some(FeedCursor { saved: next_saved, ranked: next_ranked }),
        }
    }

    // Only the first page is cached: it is the one every visit to the Dashboard asks for.
    pub async fn feed(&self, auth: &AuthManager, settings: &SettingsStore, cursor: FeedCursor) -> FeedPage {
        let key = settings.read(|settings| settings.appSettings.ExportMatches.apikey.clone());
        if cursor != FIRST_PAGE {
            return self.build_page(auth, &key, cursor).await;
        }

        let mut first_page = self.first_page.lock().await;
        if let Some(page) = Cached::fresh(&first_page, &key) {
            return page;
        }
        let data = self.build_page(auth, &key, cursor).await;
        *first_page = Some(Cached { key, at: Instant::now(), data: data.clone() });
        data
    }

    pub async fn popular_fonts(&self) -> Vec<String> {
        let url = format!("{}/api/fonts/popular", self.site);
        let fetched: reqwest::Result<Value> = async { self.http.get(url).send().await?.error_for_status()?.json().await }.await;
        let Ok(body) = fetched else {
            return Vec::new();
        };

        body["fonts"].as_array().map_or_else(Vec::new, |fonts| fonts.iter().filter_map(Value::as_str).map(String::from).collect())
    }

    // Runs only while the page is open, and the cache keeps page changes from refetching.
    pub async fn get(&self, auth: &AuthManager, settings: &SettingsStore) -> DashboardData {
        let key = settings.read(|settings| settings.appSettings.ExportMatches.apikey.clone());
        let mut cache = self.cache.lock().await;
        if let Some(data) = Cached::fresh(&cache, &key) {
            return data;
        }

        let ((site_status, stats), ranked) = tokio::join!(self.site_stats(&key), self.ranked(auth));
        let data = DashboardData { site_status, stats, ranked };
        *cache = Some(Cached { key, at: Instant::now(), data: data.clone() });
        data
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../tests/fixtures/ranked-room.json");
    const ME: u64 = 4001304;

    fn events() -> RoomEvents {
        serde_json::from_str(FIXTURE).unwrap()
    }

    fn card(events: &RoomEvents, me: u64) -> Option<RankedCard> {
        ranked_card(&RankedRules::default(), me, 1, events)
    }

    fn saved(dates: &[&str]) -> Vec<Value> {
        dates.iter().map(|date| serde_json::json!({ "startTime": date })).collect()
    }

    fn rooms(dates: &[&str]) -> Vec<RoomSummary> {
        dates.iter().enumerate().map(|(index, date)| RoomSummary { id: index as u64, starts_at: None, ends_at: Some((*date).into()) }).collect()
    }

    #[test]
    fn a_page_takes_the_newest_entries_of_both_sources() {
        let saved = saved(&["2026-11-08T10:00:00+00:00", "2026-11-01T10:00:00+00:00"]);
        let rooms = rooms(&["2026-11-09T10:00:00Z", "2026-11-05T10:00:00Z", "2026-10-01T10:00:00Z"]);
        assert_eq!(plan_page(&saved, &rooms), (2, 3));
        assert_eq!(plan_page(&saved, &rooms[..0]), (2, 0));
        assert_eq!(plan_page(&saved[..0], &rooms), (0, 3));
    }

    #[test]
    fn a_page_never_holds_more_than_its_size_and_leaves_older_rooms_for_later() {
        let saved_dates = vec!["2026-11-08T10:00:00Z"; PAGE_SIZE];
        let room_dates = ["2026-11-09T10:00:00Z", "2026-11-01T10:00:00Z"];
        assert_eq!(plan_page(&saved(&saved_dates), &rooms(&room_dates)), (PAGE_SIZE - 1, 1));
    }

    #[test]
    fn a_saved_match_without_a_date_counts_as_the_oldest() {
        let rows = vec![serde_json::json!({ "startTime": null })];
        assert_eq!(plan_page(&rows, &rooms(&["2026-11-09T10:00:00Z"])), (1, 1));
        let mut newest_first = rows.clone();
        newest_first.insert(0, serde_json::json!({ "startTime": "2026-12-01T00:00:00Z" }));
        assert_eq!(plan_page(&newest_first[..1], &rooms(&["2026-11-09T10:00:00Z"])), (1, 1));
    }

    #[test]
    fn a_finished_room_becomes_a_card_with_the_full_health_history() {
        let result = card(&events(), ME).unwrap();
        assert_eq!(result.players[0].id, ME);
        assert_eq!(result.rounds.len(), 5);
        assert!(result.winner.is_some());

        let mut life = [result.max_life, result.max_life];
        for round in &result.rounds {
            let loser = 1 - round.winner.unwrap();
            assert!(round.life[loser] < life[loser], "the loser of round {} lost health", round.round);
            assert_eq!(round.life[1 - loser], life[1 - loser], "the winner kept their health");
            life = round.life;
        }
        assert_eq!(life.iter().filter(|health| **health == 0).count(), 1);
    }

    #[test]
    fn rounds_carry_map_details_and_only_official_covers() {
        let mut room = events();
        let result = card(&room, ME).unwrap();
        assert!(result.rounds.iter().all(|round| !round.title.is_empty() && !round.version.is_empty() && round.stars > 0.0));
        assert!(result.rounds.iter().all(|round| round.cover.as_deref().is_some_and(|cover| cover.starts_with("https://assets.ppy.sh/"))));

        for set in &mut room.beatmapsets {
            set.covers.cover = "https://evil.test/cover.jpg".into();
        }
        assert!(card(&room, ME).unwrap().rounds.iter().all(|round| round.cover.is_none()));
    }

    #[test]
    fn rooms_that_cannot_be_shown_are_left_out() {
        assert!(card(&events(), ME + 1).is_none(), "someone else's room");

        let mut older = events();
        older.room.starts_at = "2026-05-17T23:59:59Z".into();
        assert!(card(&older, ME).is_none(), "older than the current damage rules");

        let mut live = events();
        live.room.active = true;
        live.room.ends_at = None;
        assert!(card(&live, ME).is_none(), "still being played");
    }
}
