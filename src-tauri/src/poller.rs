use crate::{
    auth::{AuthManager, RefreshOutcome, RefreshSchedule, now_seconds},
    broadcast::{self, BroadcastContext, BroadcastWatch},
    export::{self, ExportInput, ExportResult},
    maps::{BeatmapCache, MapEntry, MapSide, avatar_url},
    osu::{OsuClient, OsuError},
    ranked_watch::{self, RankedContext, RankedWatch},
    scoring::{Game, MatchRules, QualifierResult, ScoreOutcome, match_cost},
    server::Overlay,
    settings::{AppMode, MatchSettings, SettingsStore},
    settings_sync::{SettingsSync, SyncContext},
    tournament::{Tournament, TournamentCache},
};
use reqwest::{Client, Url};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Notify;

const POLL_SECONDS: u64 = 10;
const RATE_LIMIT_SECONDS: u64 = 30;
const MAX_SLEEP_MS: u64 = 300_000;
const MIN_POLL_WAIT_MS: u64 = 50;
const MS_PER_SECOND: u64 = 1000;
const MAX_EXPORT_ATTEMPTS: u8 = 5;
const HTTP_TIMEOUT: Duration = Duration::from_secs(15);
const QUALIFIERS_STAGE: &str = "Qualifiers";

#[derive(Clone, Serialize)]
pub struct Player {
    pub userid: u64,
    pub username: String,
}

#[derive(Clone, Serialize)]
pub struct TeamImage {
    name: String,
    pub path: String,
}

fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_millis() as u64)
}

#[derive(Serialize)]
#[serde(untagged)]
enum ScoresView {
    #[serde(rename_all = "camelCase")]
    Solo {
        player1: u32,
        player2: u32,
        is_finished: bool,
        winner: Option<u8>,
    },
    #[serde(rename_all = "camelCase")]
    Team {
        team1: u32,
        team2: u32,
        is_finished: bool,
        winner: Option<u8>,
    },
    Qualifier(QualifierResult),
}

// Everything the overlay sees about a match: no tokens or keys can reach this type.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MatchView {
    tournament: Tournament,
    #[serde(skip_serializing_if = "Option::is_none")]
    players: Option<[Player; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    teams: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    team_images: Option<[Option<TeamImage>; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    player: Option<Player>,
    scores: ScoresView,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_maps: Option<u32>,
    tournament_start: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    maps: Option<Vec<MapEntry>>,
}

#[derive(Clone, PartialEq)]
pub struct MatchConfig {
    pub match_id: u64,
    match_type: String,
    stage: String,
    pub rules: MatchRules,
}

impl MatchConfig {
    pub fn from_settings(settings: &MatchSettings, me: u64) -> Option<Self> {
        let match_id = settings.MatchID.trim().parse().ok()?;
        let warmups = settings.Warmups.trim().parse().unwrap_or(0);
        let best_of = settings.BestOF.trim().parse().unwrap_or(0);

        let rules = if settings.Stage == QUALIFIERS_STAGE {
            MatchRules::Qualifiers {
                me,
                maps: settings.MapsNqualifiers.trim().parse().unwrap_or(0),
            }
        } else if settings.MatchType == "1vs1" {
            MatchRules::OneVOne { me, warmups, best_of }
        } else if settings.MatchType == "teamVS" {
            MatchRules::TeamVs { warmups, best_of }
        } else {
            return None;
        };

        Some(Self {
            match_id,
            match_type: settings.MatchType.clone(),
            stage: settings.Stage.clone(),
            rules,
        })
    }
}

struct PendingExport {
    payload: Value,
    attempts: u8,
}

pub struct Tracker {
    pub config: MatchConfig,
    pub title: String,
    start_time: String,
    pub events: BTreeMap<u64, Option<Game>>,
    pub usernames: HashMap<u64, String>,
    players: Option<[Player; 2]>,
    looked_up: HashSet<String>,
    last_published: Option<String>,
    finished: bool,
    export: Option<PendingExport>,
}

impl Tracker {
    pub fn new(config: MatchConfig) -> Self {
        Self {
            config,
            title: String::new(),
            start_time: String::new(),
            events: BTreeMap::new(),
            usernames: HashMap::new(),
            players: None,
            looked_up: HashSet::new(),
            last_published: None,
            finished: false,
            export: None,
        }
    }

    // osu! finishes a game by updating its existing event, so reading only newer events would miss it.
    pub fn next_after(&self) -> u64 {
        let first_open = self
            .events
            .iter()
            .find(|(_, game)| game.as_ref().is_some_and(|game| game.end_time.is_none()))
            .map(|(id, _)| *id);

        match first_open {
            Some(id) => id.saturating_sub(1),
            None => self.events.keys().next_back().copied().unwrap_or(0),
        }
    }

    pub fn games(&self) -> Vec<Game> {
        self.events.values().flatten().cloned().collect()
    }
}

pub fn names_in_parentheses(title: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut rest = title;

    while let Some(start) = rest.find('(') {
        let after_open = &rest[start + 1..];
        let Some(end) = after_open.find(')') else {
            break;
        };
        names.push(after_open[..end].replace('(', ""));
        rest = &after_open[end + 1..];
    }
    names
}

// Seconds to wait after a 429: what osu! asked for, never less than the idle pace, capped at 5 minutes.
fn rate_limit_wait(retry_after: Option<u64>) -> u64 {
    retry_after.unwrap_or(RATE_LIMIT_SECONDS).clamp(RATE_LIMIT_SECONDS, MAX_SLEEP_MS / MS_PER_SECOND)
}

pub fn acronym_of(title: &str) -> &str {
    title.split_once(':').map_or("", |(acronym, _)| acronym)
}

pub fn team_names(title: &str) -> Vec<String> {
    let names = names_in_parentheses(title);
    if names.len() >= 2 {
        names
    } else {
        vec!["Red".into(), "Blue".into()]
    }
}

fn team_image_url(file_name: &str) -> Option<String> {
    let mut url = Url::parse("http://localhost/teams").ok()?;
    url.path_segments_mut().ok()?.push(file_name);
    Some(url.path().to_string())
}

pub fn find_team_images(directory: &PathBuf, teams: &[String]) -> [Option<TeamImage>; 2] {
    let files: Vec<String> = fs::read_dir(directory)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter_map(|entry| entry.file_name().into_string().ok())
                .collect()
        })
        .unwrap_or_default();

    let image_for = |team: &String| {
        files
            .iter()
            .find(|file| file.split('.').next() == Some(team.as_str()))
            .and_then(|file| {
                Some(TeamImage {
                    name: team.clone(),
                    path: team_image_url(file)?,
                })
            })
    };

    [image_for(&teams[0]), image_for(&teams[1])]
}

struct MapParties<'a> {
    players: Option<&'a [Player; 2]>,
    teams: Option<&'a [String]>,
    images: Option<&'a [Option<TeamImage>; 2]>,
}

pub struct Endpoints {
    pub osu_api: String,
    pub site: String,
    pub github_raw: String,
}

pub struct Poller {
    auth: Arc<AuthManager>,
    settings: Arc<SettingsStore>,
    overlay: Arc<Overlay>,
    teams_dir: PathBuf,
    wake: Arc<Notify>,
    osu: OsuClient,
    http: Client,
    site_url: String,
    tournaments: TournamentCache,
    tracker: Option<Tracker>,
    next_poll: u64,
    ranked: RankedWatch,
    broadcast: BroadcastWatch,
    beatmaps: BeatmapCache,
    sync: SettingsSync,
    github_raw: String,
    last_source: (AppMode, String),
}

impl Poller {
    pub fn new(
        auth: Arc<AuthManager>,
        settings: Arc<SettingsStore>,
        overlay: Arc<Overlay>,
        teams_dir: PathBuf,
        data_dir: &std::path::Path,
        wake: Arc<Notify>,
        endpoints: &Endpoints,
    ) -> reqwest::Result<Self> {
        let http = Client::builder()
            .timeout(HTTP_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .user_agent(concat!("oTMD/", env!("CARGO_PKG_VERSION")))
            .build()?;

        let sync = SettingsSync::new(http.clone(), &endpoints.site, data_dir);

        Ok(Self {
            sync,
            auth,
            settings,
            overlay,
            teams_dir,
            wake,
            osu: OsuClient::new(&endpoints.osu_api)?,
            tournaments: TournamentCache::new(http.clone(), &endpoints.site),
            http,
            site_url: endpoints.site.clone(),
            tracker: None,
            next_poll: 0,
            ranked: RankedWatch::new(data_dir),
            broadcast: BroadcastWatch::default(),
            beatmaps: BeatmapCache::default(),
            github_raw: endpoints.github_raw.clone(),
            last_source: (AppMode::default(), String::new()),
        })
    }

    // The single background task: poll and token refresh share one sleep, per the zero-cost goal.
    pub async fn run(mut self, on_expired: impl Fn(), on_settings_replaced: impl Fn()) {
        let mut schedule = RefreshSchedule::default();

        loop {
            let refresh_wait = self.auth.refresh_step(&mut schedule, now_seconds(), &on_expired).await;
            self.sync_config();
            let sync_wait = self.sync_settings(&on_settings_replaced).await;

            let poll_wait = if self.has_work() {
                if now_millis() >= self.next_poll {
                    let wait = if self.mode() == AppMode::Broadcast {
                        self.poll_broadcast(&on_expired).await
                    } else {
                        self.poll(&on_expired).await * MS_PER_SECOND
                    };
                    self.next_poll = now_millis() + wait;
                }
                Some(self.next_poll.saturating_sub(now_millis()).max(MIN_POLL_WAIT_MS))
            } else {
                None
            };

            let seconds_to_ms = |wait: Option<u64>| wait.map(|seconds| seconds.saturating_mul(MS_PER_SECOND));
            match [seconds_to_ms(refresh_wait), poll_wait, seconds_to_ms(sync_wait)].into_iter().flatten().min() {
                // Short sleeps against the wall clock also cover PC sleep, where monotonic timers can stall.
                Some(ms) => {
                    tokio::select! {
                        () = tokio::time::sleep(Duration::from_millis(ms.min(MAX_SLEEP_MS))) => {}
                        () = self.wake.notified() => {}
                    }
                }
                None => self.wake.notified().await,
            }
        }
    }

    async fn sync_settings(&mut self, on_replaced: &impl Fn()) -> Option<u64> {
        let (token, user) = (self.auth.access_token()?, self.auth.user()?);
        let context = SyncContext { token: &token, me: user.id, settings: &self.settings, overlay: &self.overlay };
        self.sync.step(&context, on_replaced).await
    }

    fn mode(&self) -> AppMode {
        self.settings.read(|settings| settings.appSettings.Mode)
    }

    fn is_ranked(&self) -> bool {
        self.mode() == AppMode::Ranked
    }

    fn has_work(&self) -> bool {
        if self.auth.user().is_none() {
            return false;
        }
        match self.mode() {
            AppMode::Ranked => true,
            AppMode::Broadcast => self.broadcast.has_active(),
            AppMode::Tournament => self.tracker.as_ref().is_some_and(|tracker| !tracker.finished || tracker.export.is_some()),
        }
    }

    // Logged out keeps the tracker, so the overlay holds its last data as the spec requires.
    fn sync_config(&mut self) {
        let Some(user) = self.auth.user() else {
            return;
        };

        let source = (self.mode(), self.settings.read(|settings| settings.rankedSettings.RoomID.clone()));
        if source != self.last_source {
            self.last_source = source.clone();
            self.next_poll = 0;
        }
        if source.0 != AppMode::Ranked && !self.ranked.is_idle() {
            self.ranked.reset(&self.overlay, &self.settings);
        }
        if source.0 == AppMode::Broadcast {
            let list = self.settings.read(|settings| settings.broadcastMatches.clone());
            self.broadcast.sync(&list, &self.overlay, &self.settings);
        } else if !self.broadcast.is_idle() {
            self.broadcast.reset(&self.overlay, &self.settings);
        }

        let settings = self.settings.read(|settings| settings.matchSettings.clone());
        let config = MatchConfig::from_settings(&settings, user.id);

        let restart = match (&self.tracker, &config) {
            (None, None) => false,
            (Some(tracker), Some(config)) => {
                tracker.config != *config || (tracker.finished && !settings.isFinished)
            }
            _ => true,
        };

        if restart {
            self.tracker = config.map(Tracker::new);
            self.next_poll = 0;
            self.overlay.set_match_data(None);
            self.overlay.publish("matchSettings", &self.settings);
        }
    }

    async fn poll_ranked(&mut self, on_expired: &impl Fn()) -> u64 {
        let (Some(token), Some(user)) = (self.auth.access_token(), self.auth.user()) else {
            return ranked_watch::IDLE_SECONDS;
        };

        let context = RankedContext {
            osu: &self.osu,
            http: &self.http,
            site_url: &self.site_url,
            github_raw: &self.github_raw,
            settings: &self.settings,
            overlay: &self.overlay,
        };

        match self.ranked.poll(&context, &token, user.id).await {
            Ok(wait) => wait,
            Err(OsuError::Unauthorized) => {
                if self.auth.refresh_rejected(&token, now_seconds()).await == RefreshOutcome::Ended {
                    on_expired();
                }
                ranked_watch::IDLE_SECONDS
            }
            Err(OsuError::RateLimited(seconds)) => rate_limit_wait(seconds),
            Err(OsuError::Unavailable) => ranked_watch::IDLE_SECONDS,
        }
    }

    async fn poll_broadcast(&mut self, on_expired: &impl Fn()) -> u64 {
        let Some(token) = self.auth.access_token() else {
            return broadcast::RETRY_MS;
        };

        let mut context = BroadcastContext {
            osu: &self.osu,
            tournaments: &mut self.tournaments,
            teams_dir: &self.teams_dir,
            settings: &self.settings,
            overlay: &self.overlay,
        };
        match self.broadcast.poll(&mut context, &token, now_millis()).await {
            Some(wait) => wait,
            None => {
                if self.auth.refresh_rejected(&token, now_seconds()).await == RefreshOutcome::Ended {
                    on_expired();
                }
                broadcast::RETRY_MS
            }
        }
    }

    async fn poll(&mut self, on_expired: &impl Fn()) -> u64 {
        if self.is_ranked() {
            return self.poll_ranked(on_expired).await;
        }

        let Some(mut tracker) = self.tracker.take() else {
            return POLL_SECONDS;
        };

        let mut wait = POLL_SECONDS;
        if tracker.finished {
            self.attempt_export(&mut tracker).await;
        } else if let Some(token) = self.auth.access_token() {
            match self.fetch_events(&mut tracker, &token).await {
                Ok(()) => self.update_view(&mut tracker, &token).await,
                Err(OsuError::Unauthorized) => {
                    if self.auth.refresh_rejected(&token, now_seconds()).await == RefreshOutcome::Ended {
                        on_expired();
                    }
                }
                Err(OsuError::RateLimited(seconds)) => wait = rate_limit_wait(seconds),
                Err(OsuError::Unavailable) => {}
            }
        }

        self.tracker = Some(tracker);
        wait
    }

    async fn fetch_events(&self, tracker: &mut Tracker, token: &str) -> Result<(), OsuError> {
        let mut after = tracker.next_after();

        loop {
            let page = self.osu.match_page(token, tracker.config.match_id, after).await?;
            let latest = page.latest_event_id.unwrap_or(0);
            let last = page.events.iter().map(|event| event.id).max();

            tracker.title = page.info.name;
            tracker.start_time = page.info.start_time.unwrap_or_default();
            for user in page.users {
                tracker.usernames.insert(user.id, user.username);
            }
            for event in page.events {
                tracker.events.insert(event.id, event.game);
            }

            match last {
                Some(last) if last > after && last < latest => after = last,
                _ => return Ok(()),
            }
        }
    }

    async fn resolve_players(&self, tracker: &mut Tracker, token: &str) -> [Player; 2] {
        if let Some(players) = &tracker.players {
            return players.clone();
        }

        let names = team_names(&tracker.title);
        let mut resolved = Vec::with_capacity(2);
        let real_names = names_in_parentheses(&tracker.title).len() >= 2;
        let mut complete = real_names;

        // Each real name is looked up once per match: a typo or the "Red"/"Blue" fallback must not cost a request every poll.
        for name in names.iter().take(2) {
            let known = tracker
                .usernames
                .iter()
                .find(|(_, username)| username.eq_ignore_ascii_case(name))
                .map(|(id, username)| Player { userid: *id, username: username.clone() });

            let player = match known {
                Some(player) => Some(player),
                None if real_names && !tracker.looked_up.contains(name) => match self.osu.user_by_name(token, name).await {
                    Ok(user) => Some(Player { userid: user.id, username: user.username }),
                    Err(OsuError::RateLimited(_)) => None,
                    Err(_) => {
                        tracker.looked_up.insert(name.clone());
                        None
                    }
                },
                None => None,
            };

            complete &= player.is_some();
            resolved.push(player.unwrap_or_else(|| Player { userid: 0, username: name.clone() }));
        }

        let second = resolved.pop().unwrap_or(Player { userid: 0, username: "Blue".into() });
        let first = resolved.pop().unwrap_or(Player { userid: 0, username: "Red".into() });
        let players = [first, second];
        if complete {
            tracker.players = Some(players.clone());
        }
        players
    }

    // Scored maps after the warmups, plus the map being played as a LIVE card.
    async fn build_maps(
        &mut self,
        tracker: &Tracker,
        token: &str,
        outcome: &ScoreOutcome,
        parties: MapParties<'_>,
        reversed: bool,
    ) -> Option<Vec<MapEntry>> {
        let ScoreOutcome::Versus(result) = outcome else {
            return None;
        };
        let warmups = match tracker.config.rules {
            MatchRules::OneVOne { warmups, .. } | MatchRules::TeamVs { warmups, .. } => warmups,
            MatchRules::Qualifiers { .. } => return None,
        };

        let events: Vec<(u64, &Game)> = tracker.events.iter().filter_map(|(id, game)| game.as_ref().map(|game| (*id, game))).skip(warmups).collect();
        let scored: Vec<_> = events.iter().filter(|(_, game)| game.end_time.is_some()).zip(&result.maps).collect();
        let live = (!result.is_finished).then(|| events.iter().find(|(_, game)| game.end_time.is_none())).flatten();

        for beatmap in scored.iter().map(|((_, game), _)| game.beatmap_id).chain(live.iter().map(|(_, game)| game.beatmap_id)) {
            if self.beatmaps.load(&self.osu, token, beatmap).await.is_err() {
                return None;
            }
        }

        let MapParties { players, teams, images } = parties;
        let side = |index: usize, game: &Game, score: u64, won: bool| match (players, teams) {
            (Some(players), _) => MapSide {
                user_id: players[index].userid,
                avatar: avatar_url(players[index].userid),
                name: players[index].username.clone(),
                score,
                grade: game.scores.iter().find(|entry| entry.user_id == players[index].userid).and_then(|entry| entry.rank.clone()),
                won,
            },
            (None, teams) => MapSide {
                user_id: 0,
                avatar: images.and_then(|images| images[index].as_ref().map(|image| image.path.clone())),
                name: teams.and_then(|teams| teams.get(index).cloned()).unwrap_or_default(),
                score,
                grade: None,
                won,
            },
        };
        let arrange = |first: MapSide, second: MapSide| if reversed { [second, first] } else { [first, second] };

        let mut maps: Vec<MapEntry> = scored
            .iter()
            .enumerate()
            .map(|(index, ((id, game), map))| {
                let sides = arrange(side(0, game, map.first_score, map.point == Some(1)), side(1, game, map.second_score, map.point == Some(2)));
                MapEntry::new(*id, index + 1, game.beatmap_id, self.beatmaps.get(game.beatmap_id), None, false, sides)
            })
            .collect();

        if let Some((id, game)) = live {
            let sides = arrange(side(0, game, 0, false), side(1, game, 0, false));
            maps.push(MapEntry::new(*id, maps.len() + 1, game.beatmap_id, self.beatmaps.get(game.beatmap_id), None, true, sides));
        }
        Some(maps)
    }

    async fn update_view(&mut self, tracker: &mut Tracker, token: &str) {
        let (tournament, tournament_resolved) = self.tournaments.get(acronym_of(&tracker.title)).await;
        let games = tracker.games();
        let outcome = tracker.config.rules.score(&games, &tournament.multipliers);
        let settings = self.settings.read(|settings| settings.matchSettings.clone());
        let total_maps = settings.MapsNqualifiers.trim().parse().unwrap_or(0);

        let (players, teams, team_images, player) = match tracker.config.rules {
            MatchRules::OneVOne { .. } => (Some(self.resolve_players(tracker, token).await), None, None, None),
            MatchRules::TeamVs { .. } => {
                let teams = team_names(&tracker.title);
                let images = find_team_images(&self.teams_dir, &teams);
                (None, Some(teams), Some(images), None)
            }
            MatchRules::Qualifiers { .. } => {
                let player = self.auth.user().map(|user| Player { userid: user.id, username: user.username });
                (None, None, None, player)
            }
        };

        let is_finished = match &outcome {
            ScoreOutcome::Versus(result) => result.is_finished,
            ScoreOutcome::Qualifier(result) => result.is_finished,
        };

        let scores = match (&outcome, &players) {
            (ScoreOutcome::Versus(result), Some(_)) => ScoresView::Solo {
                player1: result.first,
                player2: result.second,
                is_finished: result.is_finished,
                winner: result.winner,
            },
            (ScoreOutcome::Versus(result), None) => ScoresView::Team {
                team1: result.first,
                team2: result.second,
                is_finished: result.is_finished,
                winner: result.winner,
            },
            (ScoreOutcome::Qualifier(result), _) => ScoresView::Qualifier(result.clone()),
        };

        let parties = MapParties {
            players: players.as_ref(),
            teams: teams.as_deref(),
            images: team_images.as_ref(),
        };
        let maps = self.build_maps(tracker, token, &outcome, parties, settings.ScoreReverse).await;

        let view = MatchView {
            maps,
            tournament: tournament.clone(),
            players: players.clone(),
            teams: teams.clone(),
            team_images,
            player: player.clone(),
            scores,
            total_maps: matches!(tracker.config.rules, MatchRules::Qualifiers { .. }).then_some(total_maps),
            tournament_start: tracker.start_time.clone(),
        };

        if let Ok(value) = serde_json::to_value(&view) {
            let text = value.to_string();
            if tracker.last_published.as_deref() != Some(text.as_str()) {
                tracker.last_published = Some(text);
                self.overlay.set_match_data(Some(value));
                self.overlay.publish("matchSettings", &self.settings);
            }
        }

        // An unresolved tournament means 1.0 multipliers, which must not be recorded as the result.
        if !is_finished || !tournament_resolved {
            return;
        }

        tracker.finished = true;
        if self
            .settings
            .update(|settings| settings.matchSettings.isFinished = true)
            .is_err()
        {
            eprintln!("Could not save the finished match state");
        }
        self.overlay.notify();

        let (best_of, warmups) = match tracker.config.rules {
            MatchRules::OneVOne { best_of, warmups, .. } | MatchRules::TeamVs { best_of, warmups } => (best_of, warmups),
            MatchRules::Qualifiers { .. } => (0, 0),
        };
        let input = ExportInput {
            match_id: tracker.config.match_id,
            match_type: &tracker.config.match_type,
            stage: &tracker.config.stage,
            best_of,
            warmups,
            total_maps,
            tournament: &tournament,
            match_start: &tracker.start_time,
            reversed: settings.ScoreReverse,
            players: players.as_ref(),
            teams: teams.as_deref(),
            player: player.as_ref(),
            match_cost: match_cost(&games, &tracker.config.rules, &tracker.usernames),
        };

        tracker.export = Some(PendingExport {
            payload: export::build_payload(&input, &outcome),
            attempts: 0,
        });
        self.attempt_export(tracker).await;
    }

    async fn attempt_export(&self, tracker: &mut Tracker) {
        let Some(pending) = tracker.export.as_mut() else {
            return;
        };

        let export_settings = self.settings.read(|settings| settings.appSettings.ExportMatches.clone());
        if !export_settings.status || export_settings.apikey.is_empty() {
            tracker.export = None;
            return;
        }

        pending.attempts += 1;
        let result = export::send(&self.http, &self.site_url, &export_settings.apikey, &pending.payload).await;

        if result != ExportResult::Retry || pending.attempts >= MAX_EXPORT_ATTEMPTS {
            if result != ExportResult::Delivered {
                eprintln!("The match export was not delivered");
            }
            tracker.export = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::tests::temp_dir;
    use axum::{
        Router,
        extract::{Path, Query, State},
        http::{HeaderMap, StatusCode},
        routing::{get, post},
    };
    use serde_json::json;
    use std::sync::Mutex;

    const ME: u64 = 7;

    #[derive(Clone, Default)]
    struct Mock {
        inner: Arc<Mutex<MockState>>,
    }

    #[derive(Default)]
    struct MockState {
        match_body: Value,
        match_status: u16,
        afters: Vec<String>,
        tokens: Vec<String>,
        user_lookups: Vec<String>,
        tournament_calls: usize,
        tournament_status: u16,
        exports: Vec<Value>,
        export_keys: Vec<String>,
        export_status: u16,
        refreshes: usize,
    }

    async fn match_route(
        State(mock): State<Mock>,
        Query(query): Query<HashMap<String, String>>,
        headers: HeaderMap,
    ) -> (StatusCode, String) {
        let mut state = mock.inner.lock().unwrap();
        state.afters.push(query.get("after").cloned().unwrap_or_default());
        state
            .tokens
            .push(headers["authorization"].to_str().unwrap().to_string());
        assert_eq!(headers["x-api-version"], "20220704");
        (
            StatusCode::from_u16(state.match_status).unwrap(),
            state.match_body.to_string(),
        )
    }

    async fn user_route(State(mock): State<Mock>, Path(name): Path<String>) -> String {
        mock.inner.lock().unwrap().user_lookups.push(name.clone());
        json!({ "id": 900, "username": name.trim_start_matches('@') }).to_string()
    }

    async fn tournament_route(State(mock): State<Mock>) -> (StatusCode, String) {
        let mut state = mock.inner.lock().unwrap();
        state.tournament_calls += 1;
        (
            StatusCode::from_u16(state.tournament_status).unwrap(),
            json!({ "tournamentName": "Test Cup", "multipliers": {} }).to_string(),
        )
    }

    async fn export_route(State(mock): State<Mock>, headers: HeaderMap, body: String) -> StatusCode {
        let mut state = mock.inner.lock().unwrap();
        state.exports.push(serde_json::from_str(&body).unwrap());
        state
            .export_keys
            .push(headers["authorization"].to_str().unwrap().to_string());
        StatusCode::from_u16(state.export_status).unwrap()
    }

    async fn refresh_route(State(mock): State<Mock>) -> String {
        mock.inner.lock().unwrap().refreshes += 1;
        json!({ "access_token": "fresh-access", "refresh_token": "fresh-refresh", "expires_in": 86400, "token_type": "Bearer" })
            .to_string()
    }

    struct Harness {
        poller: Poller,
        mock: Mock,
        overlay: Arc<Overlay>,
        settings: Arc<SettingsStore>,
    }

    async fn harness(rules: impl FnOnce(&mut MatchSettings)) -> Harness {
        let mock = Mock::default();
        {
            let mut state = mock.inner.lock().unwrap();
            state.match_status = 200;
            state.tournament_status = 200;
            state.export_status = 201;
        }

        let router = Router::new()
            .route("/api/v2/matches/{id}", get(match_route))
            .route("/api/v2/users/{name}/osu", get(user_route))
            .route("/api/tournaments/app", get(tournament_route))
            .route("/api/match", post(export_route))
            .route("/api/osu/oauth/refresh", post(refresh_route))
            .with_state(mock.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, router).await });

        let wake: Arc<Notify> = Arc::default();
        let auth = Arc::new(
            AuthManager::with_endpoints(&temp_dir(), &base, &format!("{base}/api/v2"), wake.clone()).unwrap(),
        );
        auth.seed_test_session(now_seconds());

        let settings = Arc::new(SettingsStore::open(&temp_dir(), None));
        settings
            .update(|current| {
                current.matchSettings.MatchID = "555".into();
                current.matchSettings.BestOF = "3".into();
                current.matchSettings.Warmups = "0".into();
                current.matchSettings.Stage = "Finals".into();
                current.appSettings.ExportMatches.status = true;
                current.appSettings.ExportMatches.apikey = "SITE-SECRET-KEY".into();
                rules(&mut current.matchSettings);
            })
            .unwrap();

        let overlay = Arc::new(Overlay::new());
        let endpoints = Endpoints {
            osu_api: format!("{base}/api/v2"),
            github_raw: base.clone(),
            site: base,
        };
        let poller = Poller::new(auth, settings.clone(), overlay.clone(), temp_dir(), &temp_dir(), wake, &endpoints).unwrap();

        Harness { poller, mock, overlay, settings }
    }

    fn score(user: u64, slot: u32, team: &str, points: u64) -> Value {
        json!({ "user_id": user, "score": points, "mods": [], "match": { "slot": slot, "team": team, "pass": true } })
    }

    fn event(id: u64, finished: bool, scores: Vec<Value>) -> Value {
        json!({
            "id": id,
            "detail": { "type": "other" },
            "game": {
                "beatmap_id": id,
                "end_time": if finished { json!("2026-11-09T10:00:00+00:00") } else { Value::Null },
                "scores": scores,
            }
        })
    }

    fn duel(id: u64, finished: bool, first: u64, second: u64) -> Value {
        event(id, finished, vec![score(ME, 0, "none", first), score(8, 1, "none", second)])
    }

    fn body(title: &str, events: Vec<Value>) -> Value {
        let latest = events.iter().filter_map(|event| event["id"].as_u64()).max().unwrap_or(0);
        json!({
            "match": { "id": 555, "name": title, "start_time": "2026-11-09T09:00:00+00:00", "end_time": null },
            "users": [{ "id": ME, "username": "tester" }, { "id": 8, "username": "rival" }],
            "events": events,
            "latest_event_id": latest,
        })
    }

    const TITLE: &str = "TC: (tester) vs (rival)";
    const NEVER: fn() = || panic!("the session must not expire");

    impl Harness {
        fn set_body(&self, value: Value) {
            self.mock.inner.lock().unwrap().match_body = value;
        }

        fn state<T>(&self, read: impl FnOnce(&MockState) -> T) -> T {
            read(&self.mock.inner.lock().unwrap())
        }

        async fn tick(&mut self) {
            self.poller.sync_config();
            self.poller.poll(&NEVER).await;
        }

        fn match_data(&self) -> Value {
            let message: Value =
                serde_json::from_str(&self.overlay.message("initLoad", &self.settings)).unwrap();
            message["settings"]["matchData"].clone()
        }
    }

    #[test]
    fn title_parsing_matches_electron() {
        assert_eq!(names_in_parentheses("TC: (a b) vs (c)"), ["a b", "c"]);
        assert_eq!(names_in_parentheses("no names"), Vec::<String>::new());
        assert_eq!(acronym_of("TC: (a) vs (b)"), "TC");
        assert_eq!(acronym_of("plain"), "");
        assert_eq!(team_names("broken"), ["Red", "Blue"]);
    }

    // Bug 2: Electron hardcoded the dev port, and a bad sort could swap team images.
    #[test]
    fn team_images_are_relative_and_keep_team_order() {
        let directory = temp_dir();
        fs::write(directory.join("Blue Team.png"), b"x").unwrap();
        fs::write(directory.join("Other.png"), b"x").unwrap();

        let teams = vec!["Missing".to_string(), "Blue Team".to_string()];
        let images = find_team_images(&directory, &teams);

        assert!(images[0].is_none());
        assert_eq!(images[1].as_ref().unwrap().path, "/teams/Blue%20Team.png");
    }

    #[test]
    fn config_requires_a_numeric_match_id_and_known_type() {
        let mut settings = MatchSettings::default();
        assert!(MatchConfig::from_settings(&settings, ME).is_none());

        settings.MatchID = "abc".into();
        assert!(MatchConfig::from_settings(&settings, ME).is_none());

        settings.MatchID = " 12 ".into();
        assert_eq!(MatchConfig::from_settings(&settings, ME).unwrap().match_id, 12);

        settings.MatchType = "unknown".into();
        assert!(MatchConfig::from_settings(&settings, ME).is_none());

        settings.Stage = "Qualifiers".into();
        settings.MapsNqualifiers = "8".into();
        let config = MatchConfig::from_settings(&settings, ME).unwrap();
        assert!(matches!(config.rules, MatchRules::Qualifiers { maps: 8, .. }));
    }

    #[tokio::test]
    async fn a_game_in_progress_is_picked_up_when_it_finishes() {
        let mut h = harness(|_| {}).await;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1), duel(20, false, 0, 0)]));
        h.tick().await;
        assert_eq!(h.match_data()["scores"]["player1"], 1);

        h.set_body(body(TITLE, vec![duel(20, true, 2, 1)]));
        h.tick().await;

        assert_eq!(h.state(|state| state.afters.clone()), ["0", "19"]);
        assert_eq!(h.match_data()["scores"]["player1"], 2);
        assert_eq!(h.match_data()["scores"]["isFinished"], true);
    }

    #[tokio::test]
    async fn without_open_games_polling_continues_after_the_last_event() {
        let mut h = harness(|_| {}).await;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1)]));
        h.tick().await;
        h.tick().await;
        assert_eq!(h.state(|state| state.afters.clone()), ["0", "10"]);
    }

    #[tokio::test]
    async fn only_changes_are_published() {
        let mut h = harness(|_| {}).await;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1)]));
        h.tick().await;

        let mut receiver = h.overlay.subscribe();
        h.set_body(body(TITLE, vec![]));
        h.tick().await;
        assert!(receiver.try_recv().is_err(), "nothing changed");

        h.set_body(body(TITLE, vec![duel(20, true, 1, 2)]));
        h.tick().await;
        let message: Value = serde_json::from_str(&receiver.try_recv().unwrap()).unwrap();
        assert_eq!(message["settings"]["matchData"]["scores"]["player2"], 1);
    }

    #[tokio::test]
    async fn two_subscribers_receive_the_same_update() {
        let mut h = harness(|_| {}).await;
        h.tick().await;
        let mut first = h.overlay.subscribe();
        let mut second = h.overlay.subscribe();
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1)]));
        h.tick().await;
        assert_eq!(first.try_recv().unwrap(), second.try_recv().unwrap());
    }

    // Bug 1: Electron sent the whole settings file, including every API key, to the overlay.
    #[tokio::test]
    async fn overlay_payloads_never_contain_secrets() {
        let mut h = harness(|_| {}).await;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1), duel(20, true, 2, 1)]));
        h.tick().await;

        for kind in ["initLoad", "matchSettings", "displayerSettings"] {
            let message = h.overlay.message(kind, &h.settings);
            for secret in ["SITE-SECRET-KEY", "old-access", "old-refresh", "webapikey", "apikey", "appSettings", "token"] {
                assert!(!message.contains(secret), "{kind} leaks {secret}");
            }
        }
    }

    #[tokio::test]
    async fn players_come_from_lobby_users_or_lookup_once() {
        let mut h = harness(|_| {}).await;
        h.set_body(body("TC: (TESTER) vs (late joiner)", vec![duel(10, false, 0, 0)]));
        h.tick().await;
        h.tick().await;

        let data = h.match_data();
        assert_eq!(data["players"][0]["userid"], ME);
        assert_eq!(data["players"][0]["username"], "tester");
        assert_eq!(data["players"][1]["userid"], 900);
        assert_eq!(h.state(|state| state.user_lookups.len()), 1);
    }

    #[tokio::test]
    async fn a_title_without_names_never_looks_up_red_and_blue() {
        let mut h = harness(|_| {}).await;
        h.set_body(body("TC: tester vs rival", vec![duel(10, false, 0, 0)]));
        h.tick().await;
        h.tick().await;
        assert!(h.state(|state| state.user_lookups.is_empty()));
    }

    #[tokio::test]
    async fn a_rate_limit_slows_the_next_poll() {
        let mut h = harness(|_| {}).await;
        h.mock.inner.lock().unwrap().match_status = 429;
        h.poller.sync_config();
        assert!(h.poller.poll(&NEVER).await >= RATE_LIMIT_SECONDS);
    }

    // Bug 5: Electron never hit its cache and re-fetched on every poll.
    #[tokio::test]
    async fn tournaments_are_cached_but_outages_are_retried() {
        let mut h = harness(|_| {}).await;
        h.mock.inner.lock().unwrap().tournament_status = 502;
        h.set_body(body(TITLE, vec![duel(10, false, 0, 0)]));
        h.tick().await;
        h.tick().await;
        assert_eq!(h.state(|state| state.tournament_calls), 2);

        h.mock.inner.lock().unwrap().tournament_status = 200;
        h.tick().await;
        h.tick().await;
        assert_eq!(h.state(|state| state.tournament_calls), 3);
        assert_eq!(h.match_data()["tournament"]["tournamentName"], "Test Cup");
    }

    #[tokio::test]
    async fn an_unresolved_tournament_delays_the_final_result() {
        let mut h = harness(|_| {}).await;
        h.mock.inner.lock().unwrap().tournament_status = 502;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1), duel(20, true, 2, 1)]));
        h.tick().await;
        assert_eq!(h.state(|state| state.exports.len()), 0);
        assert!(!h.settings.read(|settings| settings.matchSettings.isFinished));

        h.mock.inner.lock().unwrap().tournament_status = 200;
        h.tick().await;
        assert_eq!(h.state(|state| state.exports.len()), 1);
    }

    // Bug 12: every connected overlay used to post its own copy of the match.
    #[tokio::test]
    async fn finished_match_exports_once_and_stops_polling() {
        let mut h = harness(|_| {}).await;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1), duel(20, true, 2, 1)]));
        h.tick().await;
        h.tick().await;
        h.tick().await;

        assert_eq!(h.state(|state| state.exports.len()), 1);
        assert_eq!(h.state(|state| state.afters.len()), 1);
        assert_eq!(h.state(|state| state.export_keys[0].clone()), "Bearer SITE-SECRET-KEY");
        assert!(h.settings.read(|settings| settings.matchSettings.isFinished));
        assert!(!h.poller.has_work());

        let payload = h.state(|state| state.exports[0].clone());
        assert_eq!(payload["matchID"], "555");
        assert_eq!(payload["matchType"], "1vs1");
        assert_eq!(payload["stage"], "Finals");
        assert_eq!(payload["bestOF"], 3);
        assert_eq!(payload["warmups"], 0);
        assert_eq!(payload["tournament"]["acronym"], "TC");
        assert_eq!(payload["matchStart"], "2026-11-09T09:00:00+00:00");
        assert_eq!(payload["players"][0]["userid"], ME);
        assert_eq!(payload["scores"], json!({ "player1": 2, "player2": 0, "winner": 1 }));
        assert_eq!(payload["matchCost"].as_array().unwrap().len(), 2);
        assert_eq!(payload["matchCost"][0]["side"], "red");
        assert!(!payload.to_string().contains("SITE-SECRET-KEY"));
    }

    #[tokio::test]
    async fn export_retries_temporary_errors_up_to_the_limit() {
        let mut h = harness(|_| {}).await;
        h.mock.inner.lock().unwrap().export_status = 502;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1), duel(20, true, 2, 1)]));

        for _ in 0..8 {
            h.tick().await;
        }
        assert_eq!(h.state(|state| state.exports.len()), usize::from(MAX_EXPORT_ATTEMPTS));
        assert!(!h.poller.has_work());
    }

    #[tokio::test]
    async fn export_does_not_retry_a_rejection() {
        for status in [400, 401] {
            let mut h = harness(|_| {}).await;
            h.mock.inner.lock().unwrap().export_status = status;
            h.set_body(body(TITLE, vec![duel(10, true, 2, 1), duel(20, true, 2, 1)]));
            h.tick().await;
            h.tick().await;
            assert_eq!(h.state(|state| state.exports.len()), 1, "status {status}");
        }
    }

    #[tokio::test]
    async fn export_is_skipped_when_disabled() {
        let mut h = harness(|_| {}).await;
        h.settings
            .update(|settings| settings.appSettings.ExportMatches.status = false)
            .unwrap();
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1), duel(20, true, 2, 1)]));
        h.tick().await;
        assert_eq!(h.state(|state| state.exports.len()), 0);
        assert!(!h.poller.has_work());
    }

    #[tokio::test]
    async fn team_export_swaps_names_when_reversed_and_keeps_slot_scores() {
        let mut h = harness(|settings| {
            settings.MatchType = "teamVS".into();
            settings.ScoreReverse = true;
        })
        .await;
        let map = |id| event(id, true, vec![score(1, 0, "red", 9), score(2, 1, "blue", 1)]);
        h.set_body(body("TC: (Alpha) vs (Beta)", vec![map(10), map(20)]));
        h.tick().await;

        let payload = h.state(|state| state.exports[0].clone());
        assert_eq!(payload["teams"], json!(["Beta", "Alpha"]));
        assert_eq!(payload["scores"], json!({ "team1": 2, "team2": 0, "winner": 1 }));
        assert_eq!(h.match_data()["teams"], json!(["Alpha", "Beta"]));
        assert_eq!(h.match_data()["teamImages"], json!([null, null]));
    }

    #[tokio::test]
    async fn qualifier_view_and_export_match_the_contracts() {
        let mut h = harness(|settings| {
            settings.Stage = "Qualifiers".into();
            settings.MapsNqualifiers = "1".into();
        })
        .await;
        h.set_body(body("TC: (x) vs (y)", vec![event(10, true, vec![score(ME, 0, "none", 1_234_567)])]));
        h.tick().await;

        let data = h.match_data();
        assert_eq!(data["player"], json!({ "userid": ME, "username": "tester" }));
        assert_eq!(data["totalMaps"], 1);
        assert_eq!(data["scores"]["mapsPlayed"], 1);
        assert_eq!(data["scores"]["average"], 1_234_567);
        assert_eq!(data["scores"]["list"][0]["mods"], json!(["NM"]));

        let payload = h.state(|state| state.exports[0].clone());
        assert_eq!(payload["totalMaps"], 1);
        assert_eq!(payload["player"]["username"], "tester");
        assert_eq!(payload["scores"]["average"], 1_234_567);
        assert!(payload.get("bestOF").is_none());
    }

    #[tokio::test]
    async fn unauthorized_refreshes_once_then_uses_the_new_token() {
        let mut h = harness(|_| {}).await;
        h.mock.inner.lock().unwrap().match_status = 401;
        h.set_body(body(TITLE, vec![]));
        h.tick().await;
        assert_eq!(h.state(|state| state.refreshes), 1);

        h.mock.inner.lock().unwrap().match_status = 200;
        h.tick().await;
        assert_eq!(h.state(|state| state.tokens.clone()), ["Bearer old-access", "Bearer fresh-access"]);
    }

    #[tokio::test]
    async fn osu_outage_keeps_the_last_data() {
        let mut h = harness(|_| {}).await;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1)]));
        h.tick().await;

        h.mock.inner.lock().unwrap().match_status = 500;
        h.tick().await;
        assert_eq!(h.match_data()["scores"]["player1"], 1);
        assert!(h.poller.has_work());
    }

    #[tokio::test]
    async fn changing_the_match_resets_state_and_saving_again_restarts_it() {
        let mut h = harness(|_| {}).await;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1), duel(20, true, 2, 1)]));
        h.tick().await;
        assert!(!h.poller.has_work());

        h.settings
            .update(|settings| settings.matchSettings.isFinished = false)
            .unwrap();
        h.poller.sync_config();
        assert!(h.poller.has_work());
        assert!(h.match_data().is_null());

        h.settings.update(|settings| settings.matchSettings.MatchID.clear()).unwrap();
        h.poller.sync_config();
        assert!(!h.poller.has_work());
    }

    #[tokio::test]
    async fn logging_out_keeps_the_overlay_data_and_stops_polling() {
        let mut h = harness(|_| {}).await;
        h.set_body(body(TITLE, vec![duel(10, true, 2, 1)]));
        h.tick().await;

        h.poller.auth.logout().await;
        h.poller.sync_config();

        assert_eq!(h.match_data()["scores"]["player1"], 1);
        assert!(!h.poller.has_work());
    }
}
