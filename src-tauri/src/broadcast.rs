use crate::{
    maps::avatar_url,
    osu::{OsuClient, OsuError},
    poller::{MatchConfig, Player, Tracker, acronym_of, find_team_images, names_in_parentheses, team_names},
    scoring::{self, MatchRules, VersusResult},
    server::Overlay,
    settings::{BroadcastMatch, MatchSettings, SettingsStore},
    tournament::TournamentCache,
};
use serde::Serialize;
use std::{collections::HashSet, path::PathBuf};

pub const MAX_MATCHES: usize = 8;
pub const MAX_TITLE_CHARS: usize = 80;
pub const RETRY_MS: u64 = 10_000;

const CYCLE_MS: u64 = 10_000;
const MIN_SLICE_MS: u64 = 1_250;
const MAX_LOBBY_BACKOFF_MS: u64 = 60_000;
const RATE_LIMIT_PAUSE_MS: u64 = 30_000;
const MAX_RATE_LIMIT_PAUSE_MS: u64 = 300_000;
const MAX_ID_DIGITS: usize = 12;
const MAX_BEST_OF: u32 = 25;
const MAX_WARMUPS: u32 = 20;
const MATCH_TYPES: [&str; 2] = ["1vs1", "teamVS"];
// No Qualifiers: they score one specific player, and a broadcast has nobody to anchor on.
const STAGES: [&str; 9] = ["Friendly", "Round of 128", "Round of 64", "Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Finals", "Grandfinals"];

fn is_valid(item: &BroadcastMatch) -> bool {
    !item.MatchID.is_empty()
        && item.MatchID.len() <= MAX_ID_DIGITS
        && item.MatchID.bytes().all(|byte| byte.is_ascii_digit())
        && MATCH_TYPES.contains(&item.MatchType.as_str())
        && STAGES.contains(&item.Stage.as_str())
        && item.BestOF.parse::<u32>().is_ok_and(|best_of| best_of % 2 == 1 && best_of <= MAX_BEST_OF)
        && item.Warmups.parse::<u32>().is_ok_and(|warmups| warmups <= MAX_WARMUPS)
}

pub fn is_valid_list(list: &[BroadcastMatch]) -> bool {
    let unique: HashSet<&str> = list.iter().map(|item| item.MatchID.as_str()).collect();
    list.len() <= MAX_MATCHES && unique.len() == list.len() && list.iter().all(is_valid)
}

fn config_of(item: &BroadcastMatch) -> Option<MatchConfig> {
    if !is_valid(item) {
        return None;
    }
    let settings = MatchSettings {
        MatchID: item.MatchID.clone(),
        MatchType: item.MatchType.clone(),
        Stage: item.Stage.clone(),
        BestOF: item.BestOF.clone(),
        Warmups: item.Warmups.clone(),
        ..MatchSettings::default()
    };
    MatchConfig::from_settings(&settings, 0)
}

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum Status {
    Loading,
    Live,
    Finished,
    Error,
}

#[derive(Clone, Default, Serialize)]
struct SideView {
    name: String,
    avatar: Option<String>,
    score: u32,
}

// Everything an overlay sees about a broadcast match: no tokens or keys can reach this type.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CardView {
    match_id: String,
    status: Status,
    stage: String,
    best_of: u32,
    acronym: String,
    tournament_name: String,
    sides: [SideView; 2],
    winner: Option<u8>,
}

enum Interrupted {
    Unauthorized,
    RateLimited(Option<u64>),
}

pub struct BroadcastContext<'a> {
    pub osu: &'a OsuClient,
    pub tournaments: &'a mut TournamentCache,
    pub teams_dir: &'a PathBuf,
    pub settings: &'a SettingsStore,
    pub overlay: &'a Overlay,
}

struct Entry {
    item: BroadcastMatch,
    tracker: Tracker,
    catch_up_after: Option<u64>,
    closed: bool,
    players: [Option<Player>; 2],
    looked_up: [bool; 2],
    status: Status,
    acronym: String,
    tournament_name: String,
    sides: [SideView; 2],
    winner: Option<u8>,
    failures: u32,
    retry_at: u64,
}

impl Entry {
    fn new(item: BroadcastMatch, config: MatchConfig) -> Self {
        Self {
            item,
            tracker: Tracker::new(config),
            catch_up_after: None,
            closed: false,
            players: [None, None],
            looked_up: [false, false],
            status: Status::Loading,
            acronym: String::new(),
            tournament_name: String::new(),
            sides: Default::default(),
            winner: None,
            failures: 0,
            retry_at: 0,
        }
    }

    fn apply(&mut self, item: BroadcastMatch, config: MatchConfig) {
        if self.tracker.config != config {
            self.tracker.config = config;
            if self.status == Status::Finished {
                self.status = Status::Live;
            }
        }
        self.item = item;
    }

    fn is_finished(&self) -> bool {
        self.status == Status::Finished
    }

    fn adopt_known_players(&mut self) {
        if !matches!(self.tracker.config.rules, MatchRules::OneVOne { .. }) {
            return;
        }
        let names = names_in_parentheses(&self.tracker.title);
        for (index, name) in names.iter().take(2).enumerate() {
            if self.players[index].is_some() {
                continue;
            }
            self.players[index] = self
                .tracker
                .usernames
                .iter()
                .find(|(_, username)| username.eq_ignore_ascii_case(name))
                .map(|(id, username)| Player { userid: *id, username: username.clone() });
        }
    }

    // Only real names from the title, once each: a lobby without them would otherwise look up "Red" and "Blue".
    fn pending_lookup(&self) -> Option<(usize, String)> {
        if !matches!(self.tracker.config.rules, MatchRules::OneVOne { .. }) {
            return None;
        }
        let names = names_in_parentheses(&self.tracker.title);
        if names.len() < 2 {
            return None;
        }
        (0..2).find(|index| self.players[*index].is_none() && !self.looked_up[*index]).map(|index| (index, names[index].clone()))
    }

    // Exactly one osu! request per call, which is what keeps the whole list inside the budget.
    async fn step(&mut self, context: &mut BroadcastContext<'_>, token: &str, now: u64) -> Result<(), Interrupted> {
        self.adopt_known_players();

        if let Some((index, name)) = self.pending_lookup() {
            match context.osu.user_by_name(token, &name).await {
                Ok(user) => self.players[index] = Some(Player { userid: user.id, username: user.username }),
                Err(OsuError::Unauthorized) => return Err(Interrupted::Unauthorized),
                Err(OsuError::RateLimited(seconds)) => return Err(Interrupted::RateLimited(seconds)),
                Err(OsuError::Unavailable) => {}
            }
            self.looked_up[index] = true;
        } else {
            let after = self.catch_up_after.unwrap_or_else(|| self.tracker.next_after());
            match context.osu.match_page(token, self.tracker.config.match_id, after).await {
                Ok(page) => {
                    let latest = page.latest_event_id.unwrap_or(0);
                    let last = page.events.iter().map(|event| event.id).max();
                    self.catch_up_after = last.filter(|last| *last > after && *last < latest);
                    self.closed = page.info.end_time.is_some() && self.catch_up_after.is_none();
                    self.tracker.title = page.info.name;
                    for user in page.users {
                        self.tracker.usernames.insert(user.id, user.username);
                    }
                    for event in page.events {
                        self.tracker.events.insert(event.id, event.game);
                    }
                    self.failures = 0;
                    self.retry_at = 0;
                    self.adopt_known_players();
                }
                Err(OsuError::Unauthorized) => return Err(Interrupted::Unauthorized),
                Err(OsuError::RateLimited(seconds)) => return Err(Interrupted::RateLimited(seconds)),
                Err(OsuError::Unavailable) => {
                    self.failures += 1;
                    let backoff = RETRY_MS.saturating_mul(1 << self.failures.saturating_sub(1).min(6)).min(MAX_LOBBY_BACKOFF_MS);
                    self.retry_at = now + backoff;
                    self.status = Status::Error;
                    return Ok(());
                }
            }
        }

        self.refresh(context).await;
        Ok(())
    }

    async fn refresh(&mut self, context: &mut BroadcastContext<'_>) {
        if self.tracker.title.is_empty() {
            return;
        }

        let (tournament, resolved) = context.tournaments.get(acronym_of(&self.tracker.title)).await;
        let games = self.tracker.games();
        let names = team_names(&self.tracker.title);

        let (result, avatars): (VersusResult, [Option<String>; 2]) = match self.tracker.config.rules {
            MatchRules::OneVOne { warmups, best_of, .. } => {
                let ids = [0, 1].map(|index: usize| self.players[index].as_ref().map_or(0, |player| player.userid));
                (scoring::one_v_one_named(&games, ids, warmups, best_of, &tournament.multipliers), ids.map(avatar_url))
            }
            MatchRules::TeamVs { warmups, best_of } => {
                let images = find_team_images(context.teams_dir, &names);
                (scoring::team_vs(&games, warmups, best_of, &tournament.multipliers), images.map(|image| image.map(|image| image.path)))
            }
            MatchRules::Qualifiers { .. } => return,
        };

        let [first_avatar, second_avatar] = avatars;
        let name_of = |index: usize| self.players[index].as_ref().map_or_else(|| names[index].clone(), |player| player.username.clone());
        self.sides = [
            SideView { name: name_of(0), avatar: first_avatar, score: result.first },
            SideView { name: name_of(1), avatar: second_avatar, score: result.second },
        ];
        self.acronym = tournament.acronym.clone();
        self.tournament_name = tournament.name.clone();
        self.winner = result.winner.map(|winner| winner - 1);
        // An unresolved tournament means 1.0 multipliers, which must not be shown as the final result.
        self.status = if (result.is_finished || self.closed) && resolved { Status::Finished } else { Status::Live };
    }

    fn view(&self) -> CardView {
        let reversed = self.item.ScoreReverse;
        let sides = if reversed { [self.sides[1].clone(), self.sides[0].clone()] } else { self.sides.clone() };
        CardView {
            match_id: self.item.MatchID.clone(),
            status: self.status,
            stage: self.item.Stage.clone(),
            best_of: self.item.BestOF.parse().unwrap_or(0),
            acronym: self.acronym.clone(),
            tournament_name: self.tournament_name.clone(),
            sides,
            winner: self.winner.map(|winner| if reversed { 1 - winner } else { winner }),
        }
    }
}

#[derive(Default)]
pub struct BroadcastWatch {
    entries: Vec<Entry>,
    list: Vec<BroadcastMatch>,
    cursor: usize,
    pause_until: u64,
    rate_limit_strikes: u32,
    last_published: Option<String>,
}

impl BroadcastWatch {
    pub fn is_idle(&self) -> bool {
        self.entries.is_empty() && self.list.is_empty()
    }

    pub fn has_active(&self) -> bool {
        self.entries.iter().any(|entry| !entry.is_finished())
    }

    pub fn reset(&mut self, overlay: &Overlay, settings: &SettingsStore) {
        *self = Self::default();
        overlay.set_broadcast(None);
        overlay.publish("broadcastState", settings);
    }

    // Keeps what is already known about matches that stay, so adding one never restarts the others.
    pub fn sync(&mut self, list: &[BroadcastMatch], overlay: &Overlay, settings: &SettingsStore) {
        if self.list == list {
            return;
        }
        self.list = list.to_vec();

        let mut previous = std::mem::take(&mut self.entries);
        self.entries = list
            .iter()
            .take(MAX_MATCHES)
            .filter_map(|item| {
                let config = config_of(item)?;
                let existing = previous.iter().position(|entry| entry.tracker.config.match_id == config.match_id).map(|index| previous.swap_remove(index));
                Some(match existing {
                    Some(mut entry) => {
                        entry.apply(item.clone(), config);
                        entry
                    }
                    None => Entry::new(item.clone(), config),
                })
            })
            .collect();
        self.cursor = 0;
        self.publish(overlay, settings);
    }

    fn publish(&mut self, overlay: &Overlay, settings: &SettingsStore) {
        let views: Vec<CardView> = self.entries.iter().map(Entry::view).collect();
        let Ok(value) = serde_json::to_value(&views) else {
            return;
        };
        let text = value.to_string();
        if self.last_published.as_deref() != Some(text.as_str()) {
            self.last_published = Some(text);
            overlay.set_broadcast(Some(value));
            overlay.publish("broadcastState", settings);
        }
    }

    fn next_due(&self, now: u64) -> Option<usize> {
        let count = self.entries.len();
        (0..count).map(|offset| (self.cursor + offset) % count).find(|index| {
            let entry = &self.entries[*index];
            !entry.is_finished() && entry.retry_at <= now
        })
    }

    fn pause_for(&mut self, seconds: Option<u64>) -> u64 {
        let doubled = RATE_LIMIT_PAUSE_MS.saturating_mul(1 << self.rate_limit_strikes.min(4));
        let pause = seconds.map_or(doubled, |seconds| seconds.saturating_mul(1000)).min(MAX_RATE_LIMIT_PAUSE_MS);
        self.rate_limit_strikes += 1;
        pause
    }

    // Returns how many milliseconds to wait, or None when the token was refused.
    pub async fn poll(&mut self, context: &mut BroadcastContext<'_>, token: &str, now: u64) -> Option<u64> {
        if self.pause_until > now {
            return Some(self.pause_until - now);
        }

        let active = self.entries.iter().filter(|entry| !entry.is_finished()).count() as u64;
        if active == 0 {
            return Some(CYCLE_MS);
        }
        let slice = (CYCLE_MS / active).max(MIN_SLICE_MS);

        let Some(index) = self.next_due(now) else {
            let soonest = self.entries.iter().filter(|entry| !entry.is_finished()).map(|entry| entry.retry_at).min().unwrap_or(now);
            return Some(soonest.saturating_sub(now).max(slice));
        };
        self.cursor = (index + 1) % self.entries.len();

        let outcome = self.entries[index].step(context, token, now).await;
        let wait = match outcome {
            Ok(()) => {
                self.rate_limit_strikes = 0;
                slice
            }
            Err(Interrupted::RateLimited(seconds)) => {
                let pause = self.pause_for(seconds);
                self.pause_until = now + pause;
                pause
            }
            Err(Interrupted::Unauthorized) => return None,
        };
        self.publish(context.overlay, context.settings);
        Some(wait)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::tests::temp_dir;
    use axum::{
        Router,
        extract::{Path, Query, State},
        http::{HeaderMap, StatusCode, Uri, header::RETRY_AFTER},
        response::{IntoResponse, Response},
        routing::get,
    };
    use serde_json::{Value, json};
    use std::{
        collections::HashMap,
        sync::{Arc, Mutex},
    };

    const TOKEN: &str = "broadcast-secret-token";
    const PAGE: usize = 2;

    #[derive(Clone, Default)]
    struct Lobby {
        title: String,
        users: Vec<(u64, String)>,
        events: Vec<Value>,
        status: u16,
        retry_after: Option<u64>,
        closed: bool,
    }

    #[derive(Default)]
    struct MockState {
        lobbies: HashMap<u64, Lobby>,
        match_requests: Vec<u64>,
        user_requests: Vec<String>,
        unexpected: Vec<String>,
    }

    type Mock = Arc<Mutex<MockState>>;

    async fn match_route(State(mock): State<Mock>, Path(id): Path<u64>, Query(query): Query<HashMap<String, String>>) -> Response {
        let mut state = mock.lock().unwrap();
        state.match_requests.push(id);
        let lobby = state.lobbies.get(&id).cloned().unwrap_or_default();
        if lobby.status == 429 {
            let mut headers = HeaderMap::new();
            if let Some(seconds) = lobby.retry_after {
                headers.insert(RETRY_AFTER, seconds.to_string().parse().unwrap());
            }
            return (StatusCode::TOO_MANY_REQUESTS, headers).into_response();
        }
        if lobby.status != 0 {
            return StatusCode::from_u16(lobby.status).unwrap().into_response();
        }

        let after: u64 = query.get("after").and_then(|value| value.parse().ok()).unwrap_or(0);
        let latest = lobby.events.iter().filter_map(|event| event["id"].as_u64()).max().unwrap_or(0);
        let events: Vec<&Value> = lobby.events.iter().filter(|event| event["id"].as_u64().unwrap() > after).take(PAGE).collect();
        let users: Vec<Value> = lobby.users.iter().map(|(id, username)| json!({ "id": id, "username": username })).collect();
        let body = json!({
            "match": { "id": id, "name": lobby.title, "start_time": null, "end_time": if lobby.closed { json!("2026-11-09T10:00:00+00:00") } else { Value::Null } },
            "users": users,
            "events": events,
            "latest_event_id": latest,
        });
        body.to_string().into_response()
    }

    async fn user_route(State(mock): State<Mock>, Path(name): Path<String>) -> String {
        mock.lock().unwrap().user_requests.push(name.clone());
        json!({ "id": 900, "username": name.trim_start_matches('@') }).to_string()
    }

    async fn tournament_route() -> String {
        json!({ "tournamentName": "Test Cup", "multipliers": {} }).to_string()
    }

    async fn unexpected_route(State(mock): State<Mock>, uri: Uri) -> StatusCode {
        mock.lock().unwrap().unexpected.push(uri.to_string());
        StatusCode::NOT_FOUND
    }

    struct Harness {
        watch: BroadcastWatch,
        mock: Mock,
        osu: OsuClient,
        tournaments: TournamentCache,
        teams_dir: PathBuf,
        settings: Arc<SettingsStore>,
        overlay: Overlay,
        now: u64,
    }

    fn score(user: u64, slot: u32, team: &str, points: u64) -> Value {
        json!({ "user_id": user, "score": points, "mods": [], "match": { "slot": slot, "team": team, "pass": true } })
    }

    fn game(id: u64, scores: Vec<Value>) -> Value {
        json!({ "id": id, "game": { "beatmap_id": id, "end_time": "2026-11-09T10:00:00+00:00", "scores": scores } })
    }

    fn entry(id: &str) -> BroadcastMatch {
        BroadcastMatch { MatchID: id.into(), BestOF: "3".into(), ..BroadcastMatch::default() }
    }

    fn duel(id: u64, first_wins: bool) -> Value {
        let (first, second) = if first_wins { (900_000, 100_000) } else { (100_000, 900_000) };
        game(id, vec![score(1, 0, "none", first), score(2, 1, "none", second)])
    }

    fn known_lobby(events: Vec<Value>) -> Lobby {
        Lobby { title: "TC: (alpha) vs (beta)".into(), users: vec![(1, "alpha".into()), (2, "beta".into())], events, ..Lobby::default() }
    }

    async fn harness() -> Harness {
        let mock = Mock::default();
        let router = Router::new()
            .route("/api/v2/matches/{id}", get(match_route))
            .route("/api/v2/users/{name}/osu", get(user_route))
            .route("/api/tournaments/app", get(tournament_route))
            .fallback(unexpected_route)
            .with_state(mock.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, router).await });

        Harness {
            watch: BroadcastWatch::default(),
            mock,
            osu: OsuClient::new(&format!("{base}/api/v2")).unwrap(),
            tournaments: TournamentCache::new(reqwest::Client::new(), &base),
            teams_dir: temp_dir(),
            settings: Arc::new(SettingsStore::open(&temp_dir(), None)),
            overlay: Overlay::new(),
            now: 1_000_000,
        }
    }

    impl Harness {
        fn set(&self, id: u64, lobby: Lobby) {
            self.mock.lock().unwrap().lobbies.insert(id, lobby);
        }

        fn sync(&mut self, list: &[BroadcastMatch]) {
            self.watch.sync(list, &self.overlay, &self.settings);
        }

        async fn poll(&mut self) -> u64 {
            let mut context = BroadcastContext {
                osu: &self.osu,
                tournaments: &mut self.tournaments,
                teams_dir: &self.teams_dir,
                settings: &self.settings,
                overlay: &self.overlay,
            };
            self.watch.poll(&mut context, TOKEN, self.now).await.unwrap()
        }

        async fn advance(&mut self) -> u64 {
            let wait = self.poll().await;
            self.now += wait;
            wait
        }

        fn requests(&self) -> usize {
            let state = self.mock.lock().unwrap();
            state.match_requests.len() + state.user_requests.len()
        }

        fn view(&self) -> Value {
            self.overlay.broadcast_view().unwrap()
        }
    }

    #[tokio::test]
    async fn eight_matches_stay_under_the_budget_including_lookups() {
        let mut h = harness().await;
        let ids: Vec<String> = (1..=8).map(|id| id.to_string()).collect();
        for id in 1..=8 {
            h.set(id, Lobby { title: format!("TC: (one{id}) vs (two{id})"), ..Lobby::default() });
        }
        h.sync(&ids.iter().map(|id| entry(id)).collect::<Vec<_>>());

        let start = h.now;
        let mut waits = Vec::new();
        while h.now < start + 60_000 {
            let before = h.requests();
            waits.push(h.advance().await);
            assert!(h.requests() - before <= 1, "one osu! request per slice");
        }

        assert!(h.requests() < 60, "made {} requests in a minute", h.requests());
        assert_eq!(h.mock.lock().unwrap().user_requests.len(), 16, "every name is looked up once");
        assert!(waits.iter().all(|wait| *wait == MIN_SLICE_MS));
    }

    #[tokio::test]
    async fn a_lobby_without_real_names_makes_no_lookups() {
        let mut h = harness().await;
        h.set(1, Lobby { title: "just a lobby".into(), ..Lobby::default() });
        h.sync(&[entry("1")]);
        for _ in 0..4 {
            h.advance().await;
        }
        assert!(h.mock.lock().unwrap().user_requests.is_empty());
        assert_eq!(h.view()[0]["sides"][0]["name"], "Red");
    }

    #[tokio::test]
    async fn a_long_lobby_loads_one_page_per_slice_past_an_abandoned_game() {
        let mut h = harness().await;
        let abandoned = json!({ "id": 1, "game": { "beatmap_id": 1, "end_time": null, "scores": [] } });
        h.set(1, known_lobby(vec![abandoned, json!({ "id": 2, "game": null }), duel(3, true), json!({ "id": 4, "game": null }), duel(5, true)]));
        h.sync(&[entry("1")]);

        for _ in 0..3 {
            let before = h.requests();
            h.advance().await;
            assert_eq!(h.requests() - before, 1);
        }

        assert_eq!(h.view()[0]["sides"][0]["score"], 2);
    }

    #[tokio::test]
    async fn too_many_requests_pauses_every_match() {
        let mut h = harness().await;
        h.set(1, Lobby { status: 429, retry_after: Some(40), ..Lobby::default() });
        h.set(2, known_lobby(vec![]));
        h.sync(&[entry("1"), entry("2")]);

        assert_eq!(h.poll().await, 40_000);
        let after_first = h.requests();
        h.now += 39_000;
        assert_eq!(h.poll().await, 1_000);
        assert_eq!(h.requests(), after_first, "nothing is sent during the pause");

        h.now += 1_000;
        h.poll().await;
        assert_eq!(h.requests(), after_first + 1);
    }

    #[tokio::test]
    async fn repeated_rate_limits_without_a_header_back_off_further() {
        let mut h = harness().await;
        h.set(1, Lobby { status: 429, ..Lobby::default() });
        h.sync(&[entry("1")]);

        assert_eq!(h.advance().await, 30_000);
        assert_eq!(h.advance().await, 60_000);
        assert_eq!(h.advance().await, 120_000);
        assert_eq!(h.advance().await, 240_000);
        assert_eq!(h.advance().await, MAX_RATE_LIMIT_PAUSE_MS);
    }

    #[tokio::test]
    async fn one_failing_lobby_keeps_its_score_and_does_not_stall_the_others() {
        let mut h = harness().await;
        h.set(1, known_lobby(vec![duel(1, true)]));
        h.set(2, known_lobby(vec![]));
        h.sync(&[entry("1"), entry("2")]);
        h.advance().await;
        h.advance().await;
        assert_eq!(h.view()[0]["sides"][0]["score"], 1);

        h.set(1, Lobby { status: 500, ..Lobby::default() });
        h.set(2, known_lobby(vec![duel(1, true)]));
        for _ in 0..8 {
            h.advance().await;
        }

        let view = h.view();
        assert_eq!(view[0]["status"], "error");
        assert_eq!(view[0]["sides"][0]["score"], 1);
        assert_eq!(view[1]["status"], "live");
        assert_eq!(view[1]["sides"][0]["score"], 1);
        let polls_of_failed = h.mock.lock().unwrap().match_requests.iter().filter(|id| **id == 1).count();
        assert_eq!(polls_of_failed, 4, "one good poll, then failures at 0, 10 and 30 seconds");
    }

    #[tokio::test]
    async fn adding_and_removing_keeps_the_other_matches() {
        let mut h = harness().await;
        h.set(1, known_lobby(vec![duel(1, true)]));
        h.set(2, known_lobby(vec![duel(1, false)]));
        h.sync(&[entry("1")]);
        h.advance().await;

        h.sync(&[entry("1"), entry("2")]);
        let view = h.view();
        assert_eq!(view[0]["sides"][0]["score"], 1, "known data survives adding a match");
        assert_eq!(view[1]["status"], "loading");

        h.sync(&[entry("2")]);
        assert_eq!(h.view().as_array().unwrap().len(), 1);
        assert_eq!(h.view()[0]["matchId"], "2");
    }

    #[tokio::test]
    async fn finished_matches_stop_polling_and_leave_no_timer() {
        let mut h = harness().await;
        h.set(1, known_lobby(vec![duel(1, true), duel(2, true)]));
        h.set(2, known_lobby(vec![duel(1, false)]));
        h.sync(&[entry("1"), entry("2")]);

        for _ in 0..4 {
            h.advance().await;
        }
        assert_eq!(h.view()[0]["status"], "finished");
        assert_eq!(h.view()[0]["winner"], 0);
        assert!(h.watch.has_active(), "the other match is still going");

        let polls = h.mock.lock().unwrap().match_requests.iter().filter(|id| **id == 1).count();
        h.advance().await;
        h.advance().await;
        assert_eq!(h.mock.lock().unwrap().match_requests.iter().filter(|id| **id == 1).count(), polls);

        h.set(2, Lobby { closed: true, ..known_lobby(vec![duel(1, false)]) });
        h.advance().await;
        assert_eq!(h.view()[1]["status"], "finished");
        assert_eq!(h.view()[1]["winner"], Value::Null);
        assert!(!h.watch.has_active(), "nothing left to poll");
    }

    #[tokio::test]
    async fn sides_follow_the_lobby_name_when_slots_are_swapped_and_reverse_flips_them() {
        let mut h = harness().await;
        let swapped = game(1, vec![score(2, 0, "none", 900_000), score(1, 1, "none", 100_000)]);
        h.set(1, known_lobby(vec![swapped]));
        h.sync(&[entry("1")]);
        h.advance().await;

        let view = h.view();
        assert_eq!(view[0]["sides"][0]["name"], "alpha");
        assert_eq!(view[0]["sides"][0]["score"], 0);
        assert_eq!(view[0]["sides"][1]["score"], 1);
        assert_eq!(view[0]["sides"][1]["avatar"], "https://a.ppy.sh/2");

        h.sync(&[BroadcastMatch { ScoreReverse: true, ..entry("1") }]);
        assert_eq!(h.view()[0]["sides"][0]["name"], "beta");
    }

    #[tokio::test]
    async fn team_matches_use_lobby_teams() {
        let mut h = harness().await;
        let map = game(1, vec![score(1, 0, "blue", 900_000), score(2, 1, "red", 100_000)]);
        h.set(1, Lobby { title: "TC: (Reds) vs (Blues)".into(), events: vec![map], ..Lobby::default() });
        h.sync(&[BroadcastMatch { MatchType: "teamVS".into(), ..entry("1") }]);
        h.advance().await;

        assert_eq!(h.view()[0]["sides"][1]["name"], "Blues");
        assert_eq!(h.view()[0]["sides"][1]["score"], 1);
        assert!(h.mock.lock().unwrap().user_requests.is_empty());
    }

    #[tokio::test]
    async fn nothing_is_exported_and_no_token_reaches_the_payload() {
        let mut h = harness().await;
        h.settings
            .update(|current| {
                current.appSettings.ExportMatches.status = true;
                current.appSettings.ExportMatches.apikey = "SITE-SECRET-KEY".into();
            })
            .unwrap();
        h.set(1, known_lobby(vec![duel(1, true), duel(2, true)]));
        h.sync(&[entry("1")]);
        h.advance().await;
        h.advance().await;

        assert_eq!(h.view()[0]["status"], "finished");
        assert!(h.mock.lock().unwrap().unexpected.is_empty(), "no request besides osu! and the tournament lookup");

        let message = h.overlay.message("initLoad", &h.settings);
        assert!(!message.contains(TOKEN));
        assert!(!message.contains("SITE-SECRET-KEY"));
    }

    #[tokio::test]
    async fn invalid_entries_in_a_hand_edited_file_are_ignored() {
        let mut h = harness().await;
        h.sync(&[entry("abc"), BroadcastMatch { Stage: "Qualifiers".into(), ..entry("1") }, entry("2")]);
        assert_eq!(h.view().as_array().unwrap().len(), 1);
        assert_eq!(h.view()[0]["matchId"], "2");
    }

    #[test]
    fn the_saved_list_is_validated() {
        assert!(is_valid_list(&[entry("1"), entry("2")]));
        assert!(!is_valid_list(&[entry("1"), entry("1")]), "duplicates");
        assert!(!is_valid_list(&(0..9).map(|id| entry(&id.to_string())).collect::<Vec<_>>()), "too many");
        assert!(!is_valid_list(&[entry("12a")]), "not numeric");
        assert!(!is_valid_list(&[BroadcastMatch { MatchType: "other".into(), ..entry("1") }]), "type");
        assert!(!is_valid_list(&[BroadcastMatch { Stage: "Qualifiers".into(), ..entry("1") }]), "qualifiers");
        assert!(!is_valid_list(&[BroadcastMatch { BestOF: "4".into(), ..entry("1") }]), "even best of");
        assert!(!is_valid_list(&[BroadcastMatch { Warmups: "-1".into(), ..entry("1") }]), "warmups");
    }
}
