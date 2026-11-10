use crate::{
    auth::now_seconds,
    export::{self, ExportResult},
    maps::{BeatmapCache, MapEntry, MapSide, avatar_url},
    osu::{OsuClient, OsuError, RoomEvents, RoomItem},
    ranked::{self, RankedRules, RuleSources},
    server::Overlay,
    settings::{SettingsStore, write_atomic},
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

pub const IDLE_SECONDS: u64 = 30;
const LIVE_SECONDS: u64 = 10;
const RULES_FILE: &str = "ranked-rules.json";
const RULES_MAX_AGE_SECONDS: u64 = 86_400;
const RULES_FETCH_LIMIT: Duration = Duration::from_secs(20);
const RULES_FILE_MAX_BYTES: usize = 1_048_576;
const MAX_SAVE_ATTEMPTS: u8 = 5;
const RULES_MODELS: &str = "ppy/osu/master/osu.Game/Online/Multiplayer/MatchTypes/RankedPlay";
const RULES_SERVER: &str = "ppy/osu-server-spectator/master/osu.Server.Spectator/Hubs/Multiplayer/Matchmaking/RankedPlay";

#[derive(Clone, Serialize, Deserialize)]
struct StoredRules {
    rules: RankedRules,
    checked_at: u64,
    outdated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerView {
    id: u64,
    username: String,
    life: i64,
    max_life: i64,
    rounds_won: u32,
    overflow: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RoundScore {
    user_id: u64,
    score: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RoundView {
    round: usize,
    title: String,
    winner: Option<u64>,
    damage: i64,
    scores: Vec<RoundScore>,
}

// Everything the overlay sees about a ranked match: no tokens or keys can reach this type.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RankedView {
    room_id: u64,
    status: &'static str,
    round: usize,
    players: Vec<PlayerView>,
    rounds: Vec<RoundView>,
    maps: Vec<MapEntry>,
    winner: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RankedUser {
    id: u64,
    username: String,
    rank: Option<i64>,
    rating: Option<i64>,
    plays: i64,
    first_placements: i64,
    rating_change: Option<i64>,
}

struct Room {
    id: u64,
    manual: bool,
    rules: RankedRules,
}

struct PendingSave {
    payload: Value,
    attempts: u8,
}

pub struct RankedContext<'a> {
    pub osu: &'a OsuClient,
    pub http: &'a Client,
    pub site_url: &'a str,
    pub github_raw: &'a str,
    pub settings: &'a SettingsStore,
    pub overlay: &'a Overlay,
}

pub struct RankedWatch {
    rules_path: PathBuf,
    stored: Option<StoredRules>,
    room: Option<Room>,
    last_finished: Option<u64>,
    last_published: Option<String>,
    pending: Option<PendingSave>,
    beatmaps: BeatmapCache,
    user_stale: bool,
    last_rating: Option<i64>,
    rating_change: Option<i64>,
}

pub fn is_finished(events: &RoomEvents) -> bool {
    !events.room.active || events.room.ends_at.is_some()
}

// A score can land seconds after the map ends: a round counts once both are in or play has moved on.
pub fn completed_rounds(events: &RoomEvents) -> Vec<&RoomItem> {
    let mut played: Vec<&RoomItem> = events.playlist_items.iter().filter(|item| item.played_at.is_some()).collect();
    played.sort_by(|first, second| first.played_at.cmp(&second.played_at));

    let moved_on = is_finished(events) || events.playlist_items.iter().any(|item| item.played_at.is_none());
    let last = played.len().saturating_sub(1);
    played
        .into_iter()
        .enumerate()
        .filter(|(index, item)| item.scores.len() >= 2 || *index < last || moved_on)
        .map(|(_, item)| item)
        .collect()
}

fn read_stored(path: &Path) -> Option<StoredRules> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

pub fn saved_rules(data_dir: &Path) -> RankedRules {
    read_stored(&data_dir.join(RULES_FILE)).map_or_else(RankedRules::default, |stored| stored.rules)
}

async fn fetch_source(http: &Client, base: &str, path: &str) -> Option<String> {
    let mut response = http.get(format!("{base}/{path}")).send().await.ok()?.error_for_status().ok()?;
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() > RULES_FILE_MAX_BYTES {
            return None;
        }
    }
    String::from_utf8(body).ok()
}

async fn fetch_all_sources(http: &Client, base: &str) -> Option<[String; 5]> {
    Some([
        fetch_source(http, base, &format!("{RULES_MODELS}/RankedPlayUserInfo.cs")).await?,
        fetch_source(http, base, &format!("{RULES_MODELS}/RankedPlayRoomState.cs")).await?,
        fetch_source(http, base, &format!("{RULES_SERVER}/Stages/ResultsStage.cs")).await?,
        fetch_source(http, base, &format!("{RULES_SERVER}/Stages/RoundWarmupStage.cs")).await?,
        fetch_source(http, base, &format!("{RULES_SERVER}/RankedPlayMatchController.cs")).await?,
    ])
}

impl RankedWatch {
    pub fn new(data_dir: &Path) -> Self {
        let rules_path = data_dir.join(RULES_FILE);
        Self {
            stored: read_stored(&rules_path),
            rules_path,
            room: None,
            last_finished: None,
            last_published: None,
            pending: None,
            beatmaps: BeatmapCache::default(),
            user_stale: true,
            last_rating: None,
            rating_change: None,
        }
    }

    pub fn rules_outdated(&self) -> bool {
        self.stored.as_ref().is_some_and(|stored| stored.outdated)
    }

    fn rules(&self) -> RankedRules {
        self.stored.as_ref().map_or_else(RankedRules::default, |stored| stored.rules)
    }

    pub fn is_idle(&self) -> bool {
        self.room.is_none() && self.last_published.is_none()
    }

    pub fn reset(&mut self, overlay: &Overlay, settings: &SettingsStore) {
        self.room = None;
        self.last_finished = None;
        self.last_published = None;
        self.pending = None;
        self.user_stale = true;
        overlay.set_ranked(None, self.rules_outdated());
        overlay.set_ranked_user(None);
        overlay.publish("rankedState", settings);
    }

    async fn refresh_rules(&mut self, context: &RankedContext<'_>) {
        let age = self.stored.as_ref().map_or(u64::MAX, |stored| now_seconds().saturating_sub(stored.checked_at));
        if age < RULES_MAX_AGE_SECONDS {
            return;
        }

        let fetched = tokio::time::timeout(RULES_FETCH_LIMIT, fetch_all_sources(context.http, context.github_raw)).await;
        // Offline is not "outdated": the next ranked session simply tries again.
        let Ok(Some([user_info, room_state, results_stage, round_warmup_stage, match_controller])) = fetched else {
            return;
        };

        let parsed = ranked::parse_rules(&RuleSources {
            user_info: &user_info,
            room_state: &room_state,
            results_stage: &results_stage,
            round_warmup_stage: &round_warmup_stage,
            match_controller: &match_controller,
        });
        let stored = StoredRules {
            rules: parsed.unwrap_or_else(|| self.rules()),
            checked_at: now_seconds(),
            outdated: parsed.is_none(),
        };

        let saved = serde_json::to_vec_pretty(&stored).map_err(std::io::Error::other).and_then(|bytes| write_atomic(&self.rules_path, &bytes));
        if saved.is_err() {
            eprintln!("Could not save the ranked rules");
        }
        self.stored = Some(stored);
        context.overlay.set_ranked_rules_outdated(self.rules_outdated());
    }

    async fn deliver_pending(&mut self, context: &RankedContext<'_>) {
        let Some(pending) = self.pending.as_mut() else {
            return;
        };

        let export = context.settings.read(|settings| settings.appSettings.ExportMatches.clone());
        if !export.status || export.apikey.is_empty() {
            self.pending = None;
            return;
        }

        pending.attempts += 1;
        let result = export::send_room(context.http, context.site_url, &export.apikey, &pending.payload).await;
        if result != ExportResult::Retry || pending.attempts >= MAX_SAVE_ATTEMPTS {
            self.pending = None;
        }
    }

    fn publish(&mut self, context: &RankedContext<'_>, view: Option<Value>) {
        let text = view.as_ref().map(Value::to_string);
        if text != self.last_published {
            self.last_published = text;
            context.overlay.set_ranked(view, self.rules_outdated());
            context.overlay.publish("rankedState", context.settings);
        }
    }

    async fn refresh_user(&mut self, context: &RankedContext<'_>, token: &str, me: u64) -> Result<(), OsuError> {
        if !self.user_stale {
            return Ok(());
        }

        let profile = match context.osu.ranked_profile(token, me).await {
            Ok(profile) => profile,
            Err(OsuError::Unauthorized) => return Err(OsuError::Unauthorized),
            Err(OsuError::Unavailable | OsuError::RateLimited(_)) => return Ok(()),
        };
        self.user_stale = false;

        let rating = profile.stats.and_then(|stats| stats.rating);
        if let (Some(previous), Some(current)) = (self.last_rating, rating)
            && previous != current
        {
            self.rating_change = Some(current - previous);
        }
        self.last_rating = rating.or(self.last_rating);

        let user = RankedUser {
            id: me,
            username: profile.username,
            rank: profile.stats.and_then(|stats| stats.rank),
            rating,
            plays: profile.stats.map_or(0, |stats| stats.plays),
            first_placements: profile.stats.map_or(0, |stats| stats.first_placements),
            rating_change: self.rating_change,
        };
        context.overlay.set_ranked_user(serde_json::to_value(&user).ok());
        context.overlay.publish("rankedState", context.settings);
        Ok(())
    }

    pub async fn poll(&mut self, context: &RankedContext<'_>, token: &str, me: u64) -> Result<u64, OsuError> {
        self.refresh_rules(context).await;
        self.refresh_user(context, token, me).await?;
        if context.overlay.ranked_rules_outdated() != self.rules_outdated() {
            context.overlay.set_ranked_rules_outdated(self.rules_outdated());
        }
        self.deliver_pending(context).await;

        let manual = context.settings.read(|settings| settings.rankedSettings.RoomID.trim().parse::<u64>().ok());
        if self.room.as_ref().is_some_and(|room| room.manual != manual.is_some() || manual.is_some_and(|id| id != room.id)) {
            self.room = None;
        }

        if self.room.is_none() {
            let found = match manual {
                Some(id) => Some(id).filter(|id| Some(*id) != self.last_finished),
                None => context
                    .osu
                    .active_ranked_rooms(token)
                    .await?
                    .into_iter()
                    .map(|room| room.id)
                    .filter(|id| Some(*id) != self.last_finished)
                    .max(),
            };

            let Some(id) = found else {
                return Ok(IDLE_SECONDS);
            };
            self.room = Some(Room { id, manual: manual.is_some(), rules: self.rules() });
        }

        self.update_room(context, token, me).await
    }

    fn build_maps(
        &self,
        rounds: &[&RoomItem],
        played: &ranked::PlayedMatch,
        players: [u64; 2],
        names: &HashMap<u64, &str>,
        current: Option<&RoomItem>,
        rules: RankedRules,
    ) -> Vec<MapEntry> {
        let side = |player: u64, item: &RoomItem, won: bool| {
            let score = item.scores.iter().find(|score| score.user_id == player);
            MapSide {
                user_id: player,
                avatar: avatar_url(player),
                name: names.get(&player).map_or_else(String::new, |name| (*name).to_string()),
                score: score.map_or(0, |score| score.total_score.max(0) as u64),
                grade: score.and_then(|score| score.rank.clone()),
                won,
            }
        };

        let mut maps: Vec<MapEntry> = rounds
            .iter()
            .zip(&played.rounds)
            .enumerate()
            .map(|(index, (item, result))| {
                let multiplier = if result.winner.is_some() { result.multiplier } else { result.global };
                let sides = players.map(|player| side(player, item, result.winner == Some(player)));
                MapEntry {
                    damage: result.winner.is_some().then_some(result.damage),
                    ..MapEntry::new(item.id, index + 1, item.beatmap_id, self.beatmaps.get(item.beatmap_id), Some(multiplier), false, sides)
                }
            })
            .collect();

        if let Some(item) = current {
            let multiplier = rules.global_start + rules.global_step * maps.len() as f64;
            let sides = players.map(|player| side(player, item, false));
            maps.push(MapEntry::new(item.id, maps.len() + 1, item.beatmap_id, self.beatmaps.get(item.beatmap_id), Some(multiplier), true, sides));
        }
        maps
    }

    async fn update_room(&mut self, context: &RankedContext<'_>, token: &str, me: u64) -> Result<u64, OsuError> {
        let Some(room) = self.room.take() else {
            return Ok(IDLE_SECONDS);
        };

        let events = match context.osu.room_events(token, room.id).await {
            Ok(events) => events,
            Err(error) => {
                self.room = Some(room);
                return Err(error);
            }
        };

        let mut users: Vec<&crate::osu::RoomUser> = events.users.iter().collect();
        users.sort_by_key(|user| (user.id != me, user.id));
        let [first, second, ..] = users.as_slice() else {
            self.room = Some(room);
            return Ok(LIVE_SECONDS);
        };
        let players = [first.id, second.id];
        let names: HashMap<u64, &str> = users.iter().map(|user| (user.id, user.username.as_str())).collect();

        let rounds = completed_rounds(&events);
        let scores: Vec<Vec<(u64, i64)>> = rounds
            .iter()
            .map(|item| item.scores.iter().map(|score| (score.user_id, score.total_score)).collect())
            .collect();
        let played = ranked::play(&room.rules, players, &scores);

        let finished = is_finished(&events);
        let alive: Vec<u64> = players.iter().copied().filter(|player| played.lives[player] > 0).collect();
        let winner = (finished && alive.len() == 1).then(|| alive[0]);

        let current = events
            .playlist_items
            .iter()
            .filter(|item| !finished && rounds.iter().all(|round| round.id != item.id))
            .max_by_key(|item| item.id);

        for beatmap in rounds.iter().copied().chain(current).map(|item| item.beatmap_id) {
            if let Err(error) = self.beatmaps.load(context.osu, token, beatmap).await {
                self.room = Some(room);
                return Err(error);
            }
        }

        let maps = self.build_maps(&rounds, &played, players, &names, current, room.rules);

        let round_views: Vec<RoundView> = rounds
            .iter()
            .zip(&played.rounds)
            .enumerate()
            .map(|(index, (item, result))| {
                RoundView {
                    round: index + 1,
                    title: self.beatmaps.get(item.beatmap_id).map(|details| details.beatmapset.title.clone()).unwrap_or_default(),
                    winner: result.winner,
                    damage: result.damage,
                    scores: item.scores.iter().map(|score| RoundScore { user_id: score.user_id, score: score.total_score }).collect(),
                }
            })
            .collect();

        let view = RankedView {
            room_id: room.id,
            status: if finished { "ended" } else { "live" },
            round: round_views.len(),
            players: players
                .iter()
                .map(|player| PlayerView {
                    id: *player,
                    username: names[player].to_string(),
                    life: played.lives[player],
                    max_life: room.rules.max_life,
                    rounds_won: played.rounds_won[player],
                    overflow: played.overflow[player],
                })
                .collect(),
            rounds: round_views,
            maps,
            winner,
        };

        // The site keeps one row per room, and other people's rooms are never saved to this account.
        let payload = (finished && players.contains(&me) && !view.rounds.is_empty()).then(|| {
            json!({
                "room_id": room.id,
                "ended_at": events.room.ends_at.clone().unwrap_or_else(|| events.room.starts_at.clone()),
                "players": view.players.iter().map(|player| json!({
                    "id": player.id,
                    "username": player.username,
                    "hp": player.life,
                    "won": winner == Some(player.id),
                })).collect::<Vec<_>>(),
                "scores": view.rounds,
                "winner_id": winner,
                "total_rounds": view.rounds.len(),
                "match_type": "ranked_play",
                "ruleset_id": rounds.first().map_or(0, |item| item.ruleset_id),
            })
        });

        if let Ok(value) = serde_json::to_value(&view) {
            self.publish(context, Some(value));
        }

        if finished {
            self.last_finished = Some(room.id);
            self.user_stale = true;
            if let Some(payload) = payload {
                self.pending = Some(PendingSave { payload, attempts: 0 });
                self.deliver_pending(context).await;
            }
            return Ok(IDLE_SECONDS);
        }

        self.room = Some(room);
        Ok(LIVE_SECONDS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::tests::temp_dir;
    use axum::{
        Router,
        extract::{Path as UrlPath, State},
        http::HeaderMap,
        http::StatusCode,
        routing::{get, post},
    };
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    const FIXTURE: &str = include_str!("../tests/fixtures/ranked-room.json");
    const ME: u64 = 4001304;
    const TOKEN: &str = "SECRET-ACCESS-TOKEN";

    #[derive(Default)]
    struct MockState {
        rooms: Value,
        events: Value,
        posts: Vec<Value>,
        room_requests: usize,
        beatmap_requests: Vec<u64>,
        rating: i64,
    }

    type Mock = Arc<Mutex<MockState>>;

    async fn rooms_route(State(mock): State<Mock>) -> String {
        mock.lock().unwrap().rooms.to_string()
    }

    async fn events_route(State(mock): State<Mock>, UrlPath(_): UrlPath<u64>) -> String {
        let mut mock = mock.lock().unwrap();
        mock.room_requests += 1;
        mock.events.to_string()
    }

    async fn user_route(State(mock): State<Mock>, UrlPath(_): UrlPath<u64>) -> String {
        let rating = mock.lock().unwrap().rating;
        json!({ "username": "Akinari", "matchmaking_stats": [{ "rank": 640, "rating": rating, "plays": 27, "first_placements": 14, "pool": { "type": "ranked_play", "active": true, "ruleset_id": 0 } }] }).to_string()
    }

    async fn beatmap_route(State(mock): State<Mock>, UrlPath(id): UrlPath<u64>) -> String {
        mock.lock().unwrap().beatmap_requests.push(id);
        json!({
            "version": "Insane", "difficulty_rating": 6.4, "total_length": 154, "bpm": 180.0, "ar": 9.5, "accuracy": 9.0, "cs": 4.0, "drain": 5.5,
            "beatmapset": { "title": "Sample Map", "covers": { "card": "https://assets.ppy.sh/beatmaps/1/covers/card.jpg" } },
        })
        .to_string()
    }

    async fn save_route(State(mock): State<Mock>, headers: HeaderMap, body: String) -> StatusCode {
        assert_eq!(headers["authorization"], "Bearer SITE-KEY");
        mock.lock().unwrap().posts.push(serde_json::from_str(&body).unwrap());
        StatusCode::CREATED
    }

    struct Harness {
        mock: Mock,
        osu: OsuClient,
        http: Client,
        site: String,
        settings: SettingsStore,
        overlay: Overlay,
        watch: RankedWatch,
    }

    impl Harness {
        async fn new() -> Self {
            let mock = Mock::default();
            let router = Router::new()
                .route("/rooms", get(rooms_route))
                .route("/rooms/{id}/events", get(events_route))
                .route("/users/{id}", get(user_route))
                .route("/beatmaps/{id}", get(beatmap_route))
                .route("/api/rooms", post(save_route))
                .with_state(mock.clone());
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let site = format!("http://{}", listener.local_addr().unwrap());
            tokio::spawn(async move { axum::serve(listener, router).await });

            let settings = SettingsStore::open(&temp_dir(), None);
            settings
                .update(|current| {
                    current.appSettings.ExportMatches.status = true;
                    current.appSettings.ExportMatches.apikey = "SITE-KEY".into();
                })
                .unwrap();

            Self {
                mock,
                osu: OsuClient::new(&site).unwrap(),
                http: Client::new(),
                site,
                settings,
                overlay: Overlay::new(),
                watch: RankedWatch::new(&temp_dir()),
            }
        }

        async fn poll(&mut self) -> u64 {
            let context = RankedContext {
                osu: &self.osu,
                http: &self.http,
                site_url: &self.site,
                github_raw: &self.site,
                settings: &self.settings,
                overlay: &self.overlay,
            };
            self.watch.poll(&context, TOKEN, ME).await.unwrap()
        }

        fn view(&self) -> Value {
            self.overlay.ranked_view().unwrap()
        }

        fn set_events(&self, events: Value) {
            self.mock.lock().unwrap().events = events;
        }

        fn set_rooms(&self, rooms: Value) {
            self.mock.lock().unwrap().rooms = rooms;
        }
    }

    fn fixture() -> Value {
        serde_json::from_str(FIXTURE).unwrap()
    }

    fn live_with_rounds(count: usize) -> Value {
        let mut events = fixture();
        events["room"]["active"] = json!(true);
        events["room"]["ends_at"] = Value::Null;
        let mut items = events["playlist_items"].as_array().unwrap().clone();
        items.sort_by_key(|item| item["played_at"].as_str().unwrap().to_string());
        items.truncate(count);
        events["playlist_items"] = Value::Array(items);
        events
    }

    fn life_of(view: &Value, id: u64) -> i64 {
        view["players"].as_array().unwrap().iter().find(|player| player["id"] == id).unwrap()["life"].as_i64().unwrap()
    }

    // The fixture is a real room played under the current rules, which ended on its last round.
    #[test]
    fn real_room_ends_exactly_when_a_player_reaches_zero() {
        let events: RoomEvents = serde_json::from_str(FIXTURE).unwrap();
        let rounds = completed_rounds(&events);
        assert_eq!(rounds.len(), 5);

        let scores: Vec<Vec<(u64, i64)>> = rounds.iter().map(|item| item.scores.iter().map(|score| (score.user_id, score.total_score)).collect()).collect();
        let players = [events.users[0].id, events.users[1].id];
        let result = ranked::play(&RankedRules::default(), players, &scores);

        let before_last = ranked::play(&RankedRules::default(), players, &scores[..4]);
        assert!(before_last.lives.values().all(|life| *life > 0));
        assert_eq!(result.lives.values().filter(|life| **life == 0).count(), 1);
    }

    #[tokio::test]
    async fn finds_the_room_follows_it_and_saves_once() {
        let mut harness = Harness::new().await;
        harness.set_rooms(json!([{ "id": 2939320 }]));
        harness.set_events(live_with_rounds(2));

        assert_eq!(harness.poll().await, LIVE_SECONDS);
        let view = harness.view();
        assert_eq!(view["status"], "live");
        assert_eq!(view["round"], 2);
        assert_eq!(view["players"][0]["id"], ME);
        assert_eq!(view["rounds"][0]["title"], "Sample Map");
        assert_eq!(view["maps"].as_array().unwrap().len(), 2);
        assert_eq!(view["maps"][0]["sides"][0]["userId"], ME);
        assert_eq!(view["maps"][0]["ar"], 9.5);
        assert!(view["maps"][0]["multiplier"].as_f64().unwrap() > 0.0);
        assert!(view["maps"][0]["sides"][0]["grade"].is_string());

        harness.set_events(fixture());
        assert_eq!(harness.poll().await, IDLE_SECONDS);
        let view = harness.view();
        assert_eq!(view["status"], "ended");
        assert_eq!(view["round"], 5);
        assert!(view["winner"].is_u64());
        assert_eq!(harness.mock.lock().unwrap().posts.len(), 1);

        let requests = harness.mock.lock().unwrap().room_requests;
        harness.poll().await;
        assert_eq!(harness.mock.lock().unwrap().room_requests, requests, "a finished room is not read again");
        assert_eq!(harness.mock.lock().unwrap().posts.len(), 1);
        assert_eq!(harness.view()["status"], "ended", "the last result stays visible");

        let saved = harness.mock.lock().unwrap().posts[0].clone();
        assert_eq!(saved["room_id"], 2939320);
        assert_eq!(saved["total_rounds"], 5);
        assert_eq!(saved["players"].as_array().unwrap().len(), 2);

        let beatmaps = harness.mock.lock().unwrap().beatmap_requests.clone();
        let unique: std::collections::HashSet<_> = beatmaps.iter().collect();
        assert_eq!(beatmaps.len(), unique.len(), "each beatmap is requested once");
    }

    #[tokio::test]
    async fn the_map_being_played_is_shown_as_live() {
        let mut harness = Harness::new().await;
        harness.set_rooms(json!([{ "id": 1 }]));
        let mut events = live_with_rounds(2);
        events["playlist_items"].as_array_mut().unwrap().push(json!({ "id": 999999999, "beatmap_id": 77, "played_at": null, "ruleset_id": 0, "scores": [] }));
        harness.set_events(events);
        harness.poll().await;

        let view = harness.view();
        let maps = view["maps"].as_array().unwrap();
        assert_eq!(maps.len(), 3);
        assert_eq!(maps[2]["live"], true);
        assert_eq!(maps[2]["round"], 3);
        assert_eq!(maps[2]["multiplier"], 1.5, "a map in play shows the global multiplier");
        assert!(maps[2]["damage"].is_null());
        assert!(!maps[2]["sides"][0]["name"].as_str().unwrap().is_empty());
        assert!(maps[0]["damage"].as_i64().unwrap() > 0);
    }

    #[tokio::test]
    async fn the_ranked_user_block_reports_the_rating_change_after_a_match() {
        let mut harness = Harness::new().await;
        harness.mock.lock().unwrap().rating = 1600;
        harness.set_rooms(json!([{ "id": 1 }]));
        harness.set_events(fixture());
        harness.poll().await;

        let message: Value = serde_json::from_str(&harness.overlay.message("rankedState", &harness.settings)).unwrap();
        assert_eq!(message["settings"]["rankedUser"]["rating"], 1600);
        assert!(message["settings"]["rankedUser"]["ratingChange"].is_null());

        harness.mock.lock().unwrap().rating = 1618;
        harness.set_rooms(json!([]));
        harness.poll().await;
        let message: Value = serde_json::from_str(&harness.overlay.message("rankedState", &harness.settings)).unwrap();
        assert_eq!(message["settings"]["rankedUser"]["ratingChange"], 18);
    }

    #[tokio::test]
    async fn a_round_waits_for_both_scores_unless_play_moved_on() {
        let mut harness = Harness::new().await;
        harness.set_rooms(json!([{ "id": 1 }]));

        let mut waiting = live_with_rounds(2);
        waiting["playlist_items"][1]["scores"].as_array_mut().unwrap().pop();
        harness.set_events(waiting.clone());
        harness.poll().await;
        assert_eq!(harness.view()["round"], 1);

        let next_map = json!({ "id": 99, "beatmap_id": 0, "played_at": null, "ruleset_id": 0, "scores": [] });
        waiting["playlist_items"].as_array_mut().unwrap().push(next_map);
        harness.set_events(waiting);
        harness.poll().await;
        assert_eq!(harness.view()["round"], 2);
    }

    #[tokio::test]
    async fn an_abandoned_match_has_no_invented_winner() {
        let mut harness = Harness::new().await;
        harness.set_rooms(json!([{ "id": 1 }]));
        let mut abandoned = live_with_rounds(1);
        abandoned["room"]["active"] = json!(false);
        harness.set_events(abandoned);
        harness.poll().await;
        let view = harness.view();
        assert_eq!(view["status"], "ended");
        assert!(view["winner"].is_null());
    }

    #[tokio::test]
    async fn other_peoples_rooms_are_followed_but_not_saved() {
        let mut harness = Harness::new().await;
        harness.settings.update(|current| current.rankedSettings.RoomID = "555".into()).unwrap();
        let mut events = fixture();
        for user in events["users"].as_array_mut().unwrap() {
            user["id"] = json!(user["id"].as_u64().unwrap() + 1);
        }
        harness.set_events(events);
        harness.poll().await;
        assert_eq!(harness.view()["status"], "ended");
        assert!(harness.mock.lock().unwrap().posts.is_empty());
    }

    #[tokio::test]
    async fn no_room_means_a_slow_idle_check() {
        let mut harness = Harness::new().await;
        harness.set_rooms(json!([]));
        assert_eq!(harness.poll().await, IDLE_SECONDS);
        assert!(harness.overlay.ranked_view().is_none());
    }

    #[tokio::test]
    async fn the_overlay_message_never_carries_credentials() {
        let mut harness = Harness::new().await;
        harness.set_rooms(json!([{ "id": 1 }]));
        harness.set_events(live_with_rounds(3));
        harness.poll().await;

        let message = harness.overlay.message("rankedState", &harness.settings);
        assert!(!message.contains(TOKEN));
        assert!(!message.contains("SITE-KEY"));
        assert!(life_of(&harness.view(), ME) > 0);
    }

    #[tokio::test]
    async fn unreachable_sources_keep_the_built_in_rules_and_are_not_outdated() {
        let mut harness = Harness::new().await;
        harness.set_rooms(json!([]));
        harness.poll().await;
        assert!(!harness.watch.rules_outdated());
        assert_eq!(harness.watch.rules(), RankedRules::default());
    }

    // Reads the real upstream files: cargo test -- --ignored upstream
    #[tokio::test]
    #[ignore]
    async fn upstream_sources_still_parse_to_the_known_rules() {
        let http = Client::new();
        let [user_info, room_state, results_stage, round_warmup_stage, match_controller] =
            fetch_all_sources(&http, "https://raw.githubusercontent.com").await.unwrap();
        let parsed = ranked::parse_rules(&RuleSources {
            user_info: &user_info,
            room_state: &room_state,
            results_stage: &results_stage,
            round_warmup_stage: &round_warmup_stage,
            match_controller: &match_controller,
        });
        assert_eq!(parsed, Some(RankedRules::default()));
    }
}
