use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

// osu! returns this shape only below API version 20220705, so requests must pin it.
pub const OSU_API_VERSION: &str = "20220704";

const COMBINED_KEYS: [(&str, &str, &str); 3] = [
    ("HD", "HR", "HDHR"),
    ("HD", "EZ", "HDEZ"),
    ("EZ", "FL", "EZFL"),
];
const SCORED_MODS: [&str; 7] = ["HD", "HR", "EZ", "FL", "DT", "HT", "SD"];
const MOD_DISPLAY_ORDER: [&str; 15] = [
    "NF", "EZ", "TD", "HD", "HR", "SD", "DT", "RX", "HT", "NC", "FL", "AU", "SO", "AP", "PF",
];

#[derive(Deserialize)]
pub struct MatchResponse {
    #[serde(rename = "match")]
    pub info: MatchInfo,
    pub events: Vec<MatchEvent>,
    #[serde(default)]
    pub users: Vec<MatchUser>,
    #[serde(default)]
    pub latest_event_id: Option<u64>,
}

#[derive(Clone, Deserialize)]
pub struct MatchUser {
    pub id: u64,
    pub username: String,
}

impl MatchResponse {
    pub fn into_games(mut self) -> Vec<Game> {
        self.events.sort_by_key(|event| event.id);
        self.events.into_iter().filter_map(|event| event.game).collect()
    }
}

#[derive(Deserialize)]
pub struct MatchInfo {
    pub name: String,
    #[serde(default)]
    pub start_time: Option<String>,
}

#[derive(Deserialize)]
pub struct MatchEvent {
    pub id: u64,
    pub game: Option<Game>,
}

#[derive(Clone, Deserialize)]
pub struct Game {
    pub beatmap_id: u64,
    pub end_time: Option<String>,
    #[serde(default)]
    pub scores: Vec<GameScore>,
}

#[derive(Clone, Deserialize)]
pub struct GameScore {
    pub user_id: u64,
    pub score: u64,
    // osu! already merges the game's mods into each score, so freemod needs no special case.
    #[serde(default)]
    pub mods: Vec<String>,
    #[serde(default)]
    pub rank: Option<String>,
    #[serde(rename = "match")]
    pub slot_info: ScoreSlot,
}

#[derive(Clone, Deserialize)]
pub struct ScoreSlot {
    pub slot: u32,
    pub team: String,
    pub pass: bool,
}

// Raw JSON on purpose: tournament data comes from a site form, and one bad entry must not break scoring.
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Multipliers(pub HashMap<String, Value>);

fn as_number(value: Option<&Value>) -> Option<f64> {
    match value? {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
    .filter(|number: &f64| number.is_finite())
}

impl Multipliers {
    fn factor(&self, key: &str, failed: bool) -> f64 {
        let Some(entry) = self.0.get(key) else {
            return 1.0;
        };

        match entry.get("type").and_then(Value::as_str) {
            Some("*") => {
                let field = if failed { "failValue" } else { "value" };
                as_number(entry.get(field)).unwrap_or(1.0)
            }
            Some("/") => match as_number(entry.get("value")) {
                Some(value) if value != 0.0 => 1.0 / value,
                _ => 1.0,
            },
            _ => 1.0,
        }
    }

    fn for_score(&self, mods: &[String], passed: bool) -> f64 {
        let mut active: Vec<&str> = mods
            .iter()
            .map(|name| match name.as_str() {
                "NC" => "DT",
                "PF" => "SD",
                other => other,
            })
            .filter(|name| SCORED_MODS.contains(name))
            .collect();
        active.sort_unstable();
        active.dedup();

        if active.is_empty() {
            return self.factor("NM", false);
        }

        let mut total = 1.0;
        for (first, second, combined) in COMBINED_KEYS {
            if active.contains(&first) && active.contains(&second) && self.0.contains_key(combined) {
                total *= self.factor(combined, false);
                active.retain(|name| *name != first && *name != second);
            }
        }

        active
            .iter()
            .fold(total, |product, name| product * self.factor(name, *name == "SD" && !passed))
    }
}

fn scored_points(score: &GameScore, multipliers: &Multipliers) -> f64 {
    score.score as f64 * multipliers.for_score(&score.mods, score.slot_info.pass)
}

#[derive(Clone, Copy, PartialEq)]
enum Side {
    First,
    Second,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapResult {
    pub beatmap_id: u64,
    pub first_score: u64,
    pub second_score: u64,
    pub point: Option<u8>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersusResult {
    pub first: u32,
    pub second: u32,
    pub is_finished: bool,
    pub winner: Option<u8>,
    pub maps: Vec<MapResult>,
}

fn score_versus(
    games: &[Game],
    warmups: usize,
    best_of: u32,
    multipliers: &Multipliers,
    side_of: impl Fn(&GameScore) -> Option<Side>,
) -> VersusResult {
    let wins_needed = f64::from(best_of) / 2.0 + 0.5;
    let mut result = VersusResult::default();

    for game in games.iter().skip(warmups) {
        if game.end_time.is_some() {
            let (mut first, mut second) = (0.0, 0.0);
            for score in &game.scores {
                match side_of(score) {
                    Some(Side::First) => first += scored_points(score, multipliers),
                    Some(Side::Second) => second += scored_points(score, multipliers),
                    None => {}
                }
            }

            let point = if first > second {
                result.first += 1;
                Some(1)
            } else if second > first {
                result.second += 1;
                Some(2)
            } else {
                None
            };

            result.maps.push(MapResult {
                beatmap_id: game.beatmap_id,
                first_score: first.round() as u64,
                second_score: second.round() as u64,
                point,
            });
        }

        if f64::from(result.first) == wins_needed {
            result.winner = Some(1);
        } else if f64::from(result.second) == wins_needed {
            result.winner = Some(2);
        }

        if result.winner.is_some() {
            result.is_finished = true;
            break;
        }
    }

    result
}

fn one_v_one_side(score: &GameScore, me: u64) -> Option<Side> {
    let slot = score.slot_info.slot;
    if score.user_id != me && slot > 1 {
        None
    } else if slot == 0 {
        Some(Side::First)
    } else {
        Some(Side::Second)
    }
}

fn team_side(score: &GameScore) -> Option<Side> {
    match score.slot_info.team.as_str() {
        "red" => Some(Side::First),
        "blue" => Some(Side::Second),
        _ => None,
    }
}

pub fn one_v_one(games: &[Game], me: u64, warmups: usize, best_of: u32, multipliers: &Multipliers) -> VersusResult {
    score_versus(games, warmups, best_of, multipliers, |score| one_v_one_side(score, me))
}

pub fn team_vs(games: &[Game], warmups: usize, best_of: u32, multipliers: &Multipliers) -> VersusResult {
    score_versus(games, warmups, best_of, multipliers, team_side)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MatchCostRow {
    pub id: u64,
    pub username: String,
    pub side: &'static str,
    pub cost: f64,
}

fn median(values: &[f64]) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    let middle = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        (sorted[middle - 1] + sorted[middle]) / 2.0
    } else {
        sorted[middle]
    }
}

fn collect_match_cost(
    games: &[Game],
    warmups: usize,
    usernames: &HashMap<u64, String>,
    side_of: impl Fn(&GameScore) -> Option<Side>,
) -> Vec<MatchCostRow> {
    let mut map_scores: HashMap<u64, Vec<f64>> = HashMap::new();
    let mut players: HashMap<u64, (Side, HashMap<u64, f64>)> = HashMap::new();

    for game in games.iter().skip(warmups).filter(|game| game.end_time.is_some()) {
        for score in &game.scores {
            if let Some(side) = side_of(score) {
                let points = score.score as f64;
                map_scores.entry(game.beatmap_id).or_default().push(points);
                let player = players.entry(score.user_id).or_insert_with(|| (side, HashMap::new()));
                player.1.insert(game.beatmap_id, points);
            }
        }
    }

    let maps_played: Vec<f64> = players.values().map(|(_, maps)| maps.len() as f64).collect();
    if maps_played.is_empty() {
        return Vec::new();
    }
    let median_maps = median(&maps_played);

    let mut rows: Vec<MatchCostRow> = players
        .iter()
        .filter_map(|(id, (side, maps))| {
            let total: f64 = maps
                .iter()
                .map(|(beatmap, points)| points / median(&map_scores[beatmap]))
                .sum();
            let played = maps.len() as f64;
            let cost = total / played * (played / median_maps).cbrt();
            let username = usernames.get(id)?.clone();
            (cost.is_finite() && cost >= 0.0).then_some(MatchCostRow {
                id: *id,
                username,
                side: if *side == Side::First { "red" } else { "blue" },
                cost,
            })
        })
        .collect();

    rows.sort_by(|a, b| b.cost.total_cmp(&a.cost).then(a.id.cmp(&b.id)));
    rows
}

pub fn match_cost(games: &[Game], rules: &MatchRules, usernames: &HashMap<u64, String>) -> Vec<MatchCostRow> {
    match *rules {
        MatchRules::OneVOne { me, warmups, .. } => {
            collect_match_cost(games, warmups, usernames, |score| one_v_one_side(score, me))
        }
        MatchRules::TeamVs { warmups, .. } => collect_match_cost(games, warmups, usernames, team_side),
        MatchRules::Qualifiers { .. } => Vec::new(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QualifierEntry {
    pub score: u64,
    pub mods: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualifierResult {
    pub list: Vec<QualifierEntry>,
    pub average: u64,
    pub maps_played: u32,
    pub is_finished: bool,
}

fn display_mods(mods: &[String]) -> Vec<String> {
    if mods.is_empty() {
        return vec!["NM".into()];
    }

    let mut sorted = mods.to_vec();
    sorted.sort_by_key(|name| {
        MOD_DISPLAY_ORDER
            .iter()
            .position(|known| known == name)
            .unwrap_or(MOD_DISPLAY_ORDER.len())
    });
    sorted
}

// Qualifier scores are never multiplied, same as the Electron app.
pub fn qualifiers(games: &[Game], me: u64, maps: u32) -> QualifierResult {
    let mut result = QualifierResult::default();

    for game in games {
        if result.maps_played < maps && game.end_time.is_some() {
            for score in game.scores.iter().filter(|score| score.user_id == me) {
                result.list.push(QualifierEntry {
                    score: score.score,
                    mods: display_mods(&score.mods),
                });
                result.maps_played += 1;
            }
        }

        if result.maps_played == maps {
            result.is_finished = true;
            break;
        }
    }

    if !result.list.is_empty() {
        let total: u64 = result.list.iter().map(|entry| entry.score).sum();
        result.average = (total as f64 / result.list.len() as f64).round() as u64;
    }

    result
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum MatchRules {
    OneVOne { me: u64, warmups: usize, best_of: u32 },
    TeamVs { warmups: usize, best_of: u32 },
    Qualifiers { me: u64, maps: u32 },
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ScoreOutcome {
    Versus(VersusResult),
    Qualifier(QualifierResult),
}

impl MatchRules {
    pub fn score(&self, games: &[Game], multipliers: &Multipliers) -> ScoreOutcome {
        match *self {
            Self::OneVOne { me, warmups, best_of } => {
                ScoreOutcome::Versus(one_v_one(games, me, warmups, best_of, multipliers))
            }
            Self::TeamVs { warmups, best_of } => {
                ScoreOutcome::Versus(team_vs(games, warmups, best_of, multipliers))
            }
            Self::Qualifiers { me, maps } => ScoreOutcome::Qualifier(qualifiers(games, me, maps)),
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct ScoreSnapshot {
    pub rules: MatchRules,
    pub multipliers: Multipliers,
    pub outcome: ScoreOutcome,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const ME: u64 = 100;
    const RIVAL: u64 = 200;

    fn score(user_id: u64, slot: u32, team: &str, points: u64, mods: &[&str], pass: bool) -> GameScore {
        GameScore {
            rank: None,
            user_id,
            score: points,
            mods: mods.iter().map(|name| (*name).to_string()).collect(),
            slot_info: ScoreSlot {
                slot,
                team: team.into(),
                pass,
            },
        }
    }

    fn game(scores: Vec<GameScore>) -> Game {
        Game {
            beatmap_id: 1,
            end_time: Some("2026-11-09T10:00:00+00:00".into()),
            scores,
        }
    }

    fn duel(first: u64, second: u64) -> Game {
        game(vec![
            score(ME, 0, "none", first, &[], true),
            score(RIVAL, 1, "none", second, &[], true),
        ])
    }

    fn multipliers(value: Value) -> Multipliers {
        serde_json::from_value(value).unwrap()
    }

    fn times(value: &str) -> Value {
        json!({ "type": "*", "value": value })
    }

    fn multiplier_for(mods: &[&str], table: &Multipliers) -> f64 {
        let owned: Vec<String> = mods.iter().map(|name| (*name).to_string()).collect();
        table.for_score(&owned, true)
    }

    fn assert_close(actual: f64, expected: f64) {
        assert!((actual - expected).abs() < 1e-9, "{actual} != {expected}");
    }

    // Bug 4: Electron recomputed from the base score per mod, so HD+HR kept only the last match.
    #[test]
    fn single_mod_multipliers_stack() {
        let table = multipliers(json!({ "HD": times("1.06"), "HR": times("1.10"), "EZ": times("2") }));
        assert_close(multiplier_for(&["HD"], &table), 1.06);
        assert_close(multiplier_for(&["HD", "HR"], &table), 1.166);
        assert_close(multiplier_for(&["EZ", "HD"], &table), 2.12);
    }

    // Bug 4: Electron could never match these keys because it split mods one by one.
    #[test]
    fn combined_key_replaces_both_singles() {
        let table = multipliers(json!({
            "HD": times("1.06"), "HR": times("1.10"), "EZ": times("1.5"), "FL": times("1.2"),
            "HDHR": times("1.30"), "EZFL": times("2.00")
        }));
        assert_close(multiplier_for(&["HD", "HR"], &table), 1.30);
        assert_close(multiplier_for(&["EZ", "FL"], &table), 2.00);
        assert_close(multiplier_for(&["EZ", "HD"], &table), 1.59);
    }

    #[test]
    fn combined_key_stacks_with_remaining_mods() {
        let table = multipliers(json!({ "HDHR": times("1.30"), "FL": times("1.2") }));
        assert_close(multiplier_for(&["HD", "HR", "FL"], &table), 1.56);
    }

    // Intentional change: Electron ignored DT and HT even when the site form set them.
    #[test]
    fn dt_ht_and_nightcore_apply() {
        let table = multipliers(json!({ "DT": times("1.2"), "HT": times("0.5") }));
        assert_close(multiplier_for(&["DT"], &table), 1.2);
        assert_close(multiplier_for(&["NC"], &table), 1.2);
        assert_close(multiplier_for(&["DT", "NC"], &table), 1.2);
        assert_close(multiplier_for(&["HT"], &table), 0.5);
    }

    // Intentional change: Electron skipped the NM multiplier on NF-only scores.
    #[test]
    fn nomod_applies_when_no_scored_mod_is_active() {
        let table = multipliers(json!({ "NM": times("1.5"), "HD": times("2") }));
        assert_close(multiplier_for(&[], &table), 1.5);
        assert_close(multiplier_for(&["NF"], &table), 1.5);
        assert_close(multiplier_for(&["NF", "HD"], &table), 2.0);
    }

    #[test]
    fn sudden_death_uses_fail_value_and_perfect_counts_as_sudden_death() {
        let table = multipliers(json!({ "SD": { "type": "*", "value": "1.5", "failValue": "0.5" } }));
        let sd = vec!["SD".to_string()];
        let pf = vec!["PF".to_string()];
        assert_close(table.for_score(&sd, true), 1.5);
        assert_close(table.for_score(&sd, false), 0.5);
        assert_close(table.for_score(&pf, false), 0.5);
        assert_close(table.for_score(&[sd[0].clone(), pf[0].clone()], true), 1.5);
    }

    // Bug 4: a missing SD key crashed Electron.
    #[test]
    fn missing_or_invalid_values_count_as_one() {
        let table = multipliers(json!({
            "HD": { "type": "*", "value": "abc" },
            "HR": null,
            "EZ": { "value": "2" },
            "FL": { "type": "?", "value": "2" },
            "DT": { "type": "/", "value": "0" },
            "SD": { "type": "*", "value": "2" }
        }));
        for name in ["HD", "HR", "EZ", "FL", "DT", "HT"] {
            assert_close(multiplier_for(&[name], &table), 1.0);
        }
        assert_close(table.for_score(&["SD".to_string()], false), 1.0);
        assert_close(multiplier_for(&["HD", "SD"], &Multipliers::default()), 1.0);
    }

    #[test]
    fn multipliers_accept_numbers_strings_and_division() {
        let table = multipliers(json!({
            "HD": { "type": "*", "value": 1.25 },
            "HR": { "type": "/", "value": "2" }
        }));
        assert_close(multiplier_for(&["HD"], &table), 1.25);
        assert_close(multiplier_for(&["HR"], &table), 0.5);
    }

    #[test]
    fn multipliers_decide_the_map() {
        let table = multipliers(json!({ "EZ": times("2") }));
        let games = [game(vec![
            score(ME, 0, "none", 600_000, &["EZ"], true),
            score(RIVAL, 1, "none", 1_000_000, &[], true),
        ])];
        let result = one_v_one(&games, ME, 0, 1, &table);
        assert_eq!(result.first, 1);
        assert_eq!(result.maps[0].first_score, 1_200_000);
    }

    #[test]
    fn one_v_one_counts_maps_and_stops_at_the_winning_map() {
        let games = [duel(2, 1), duel(1, 2), duel(2, 1), duel(2, 1), duel(1, 2)];
        let result = one_v_one(&games, ME, 0, 5, &Multipliers::default());
        assert_eq!((result.first, result.second), (3, 1));
        assert!(result.is_finished);
        assert_eq!(result.winner, Some(1));
        assert_eq!(result.maps.len(), 4);
    }

    #[test]
    fn second_player_can_win() {
        let games = [duel(1, 2), duel(1, 2)];
        let result = one_v_one(&games, ME, 0, 3, &Multipliers::default());
        assert_eq!(result.winner, Some(2));
    }

    #[test]
    fn warmups_skip_the_first_games() {
        let games = [duel(9, 1), duel(9, 1), duel(1, 2)];
        let result = one_v_one(&games, ME, 2, 3, &Multipliers::default());
        assert_eq!((result.first, result.second), (0, 1));
        assert!(!result.is_finished);
        assert_eq!(result.winner, None);
    }

    #[test]
    fn unfinished_games_and_ties_award_nothing() {
        let mut aborted = duel(9, 1);
        aborted.end_time = None;
        let games = [aborted, duel(5, 5), duel(2, 1)];
        let result = one_v_one(&games, ME, 0, 5, &Multipliers::default());
        assert_eq!((result.first, result.second), (1, 0));
        assert_eq!(result.maps[0].point, None);
        assert_eq!(result.maps.len(), 2);
    }

    #[test]
    fn even_best_of_never_finishes_like_electron() {
        let games = [duel(2, 1), duel(2, 1), duel(2, 1), duel(2, 1)];
        let result = one_v_one(&games, ME, 0, 4, &Multipliers::default());
        assert_eq!(result.first, 4);
        assert!(!result.is_finished);
    }

    #[test]
    fn extra_slots_are_ignored_except_my_own_score() {
        let stranger = game(vec![
            score(RIVAL, 0, "none", 1, &[], true),
            score(300, 2, "none", 999, &[], true),
            score(400, 1, "none", 2, &[], true),
        ]);
        let result = one_v_one(std::slice::from_ref(&stranger), ME, 0, 3, &Multipliers::default());
        assert_eq!(result.second, 1);
        assert_eq!(result.maps[0].second_score, 2);

        let mine_elsewhere = game(vec![
            score(RIVAL, 0, "none", 5, &[], true),
            score(ME, 4, "none", 9, &[], true),
        ]);
        let result = one_v_one(&[mine_elsewhere], ME, 0, 3, &Multipliers::default());
        assert_eq!(result.maps[0].second_score, 9);
    }

    #[test]
    fn team_vs_sums_teams_with_red_first() {
        let map = |red: u64, blue: u64| {
            game(vec![
                score(1, 0, "red", red, &[], true),
                score(2, 1, "red", red, &[], true),
                score(3, 2, "blue", blue, &[], true),
                score(4, 3, "blue", blue, &[], true),
                score(5, 4, "none", 999_999, &[], true),
            ])
        };
        let result = team_vs(&[map(3, 1), map(1, 3), map(2, 1)], 0, 3, &Multipliers::default());
        assert_eq!((result.first, result.second), (2, 1));
        assert_eq!(result.winner, Some(1));
        assert_eq!(result.maps[0].first_score, 6);
    }

    // Bug 3: Electron removed only the first comma, so 1,234,567 was averaged as 1234.
    #[test]
    fn qualifier_average_uses_real_numbers() {
        let games = [
            game(vec![score(ME, 0, "none", 1_234_567, &[], true)]),
            game(vec![score(ME, 0, "none", 2_000_000, &["HD"], true)]),
            game(vec![score(ME, 0, "none", 1_000, &[], true)]),
        ];
        let result = qualifiers(&games, ME, 3);
        assert_eq!(result.average, 1_078_522);
        assert_eq!(result.maps_played, 3);
        assert!(result.is_finished);
        assert_eq!(result.list[0].score, 1_234_567);
    }

    #[test]
    fn qualifiers_ignore_other_players_extra_and_unfinished_maps() {
        let mut unfinished = game(vec![score(ME, 0, "none", 500, &[], true)]);
        unfinished.end_time = None;
        let games = [
            unfinished,
            game(vec![score(RIVAL, 0, "none", 999, &[], true)]),
            game(vec![score(ME, 1, "none", 10, &[], true)]),
            game(vec![score(ME, 1, "none", 20, &[], true)]),
            game(vec![score(ME, 1, "none", 40, &[], true)]),
        ];
        let result = qualifiers(&games, ME, 2);
        assert_eq!(result.list.len(), 2);
        assert_eq!(result.average, 15);
        assert!(result.is_finished);
    }

    #[test]
    fn unfinished_qualifiers_stay_open_and_empty_has_no_average() {
        let games = [game(vec![score(ME, 0, "none", 10, &[], true)])];
        assert!(!qualifiers(&games, ME, 2).is_finished);
        assert_eq!(qualifiers(&[], ME, 2).average, 0);
    }

    #[test]
    fn qualifier_mods_are_ordered_and_nomod_is_named() {
        assert_eq!(display_mods(&[]), ["NM"]);
        let mods = ["HR".to_string(), "NF".to_string(), "HD".to_string(), "XX".to_string()];
        assert_eq!(display_mods(&mods), ["NF", "HD", "HR", "XX"]);
    }

    #[test]
    fn parses_the_osu_v2_shape_and_orders_games_by_event() {
        let response: MatchResponse = serde_json::from_value(json!({
            "match": { "id": 5, "name": "TC: (a) vs (b)", "start_time": "x", "end_time": null },
            "users": [],
            "events": [
                { "id": 3, "detail": { "type": "other" }, "game": {
                    "beatmap_id": 22, "end_time": null, "mods": ["NF"],
                    "scores": []
                }},
                { "id": 1, "detail": { "type": "match-created" } },
                { "id": 2, "detail": { "type": "other" }, "game": {
                    "beatmap_id": 11, "end_time": "t", "mods": [],
                    "scores": [{ "user_id": 7, "score": 1000, "mods": ["HD"], "passed": true,
                        "match": { "slot": 0, "team": "red", "pass": false } }]
                }}
            ]
        }))
        .unwrap();

        assert_eq!(response.info.name, "TC: (a) vs (b)");
        let games = response.into_games();
        assert_eq!(games.iter().map(|g| g.beatmap_id).collect::<Vec<_>>(), [11, 22]);
        assert_eq!(games[0].scores[0].slot_info.team, "red");
        assert!(!games[0].scores[0].slot_info.pass);
    }

    #[test]
    fn match_cost_matches_a_hand_calculation() {
        // Map 1 scores 200/100: median 150. Map 2 scores 100/300: median 200.
        // ME: (200/150 + 100/200) / 2 = 0.91667. RIVAL: (100/150 + 300/200) / 2 = 1.08333.
        let mut first = duel(200, 100);
        first.beatmap_id = 1;
        let mut second = duel(100, 300);
        second.beatmap_id = 2;
        let usernames = HashMap::from([(ME, "me".to_string()), (RIVAL, "rival".to_string())]);
        let rules = MatchRules::OneVOne { me: ME, warmups: 0, best_of: 3 };

        let rows = match_cost(&[first, second], &rules, &usernames);

        assert_eq!(rows.len(), 2);
        assert_eq!((rows[0].id, rows[0].side), (RIVAL, "blue"));
        assert_close(rows[0].cost, 13.0 / 12.0);
        assert_eq!((rows[1].id, rows[1].side), (ME, "red"));
        assert_close(rows[1].cost, 11.0 / 12.0);
    }

    #[test]
    fn match_cost_penalizes_fewer_maps_and_skips_warmups() {
        let two_players = |beatmap_id: u64, with_rival: bool| {
            let mut scores = vec![score(ME, 0, "red", 100, &[], true), score(300, 1, "red", 100, &[], true)];
            if with_rival {
                scores.push(score(RIVAL, 2, "blue", 100, &[], true));
            }
            Game { beatmap_id, ..game(scores) }
        };
        let games = [two_players(9, true), two_players(1, true), two_players(2, false), two_players(3, false)];
        let usernames = HashMap::from([
            (ME, "me".to_string()),
            (300, "mate".to_string()),
            (RIVAL, "rival".to_string()),
        ]);

        let rows = match_cost(&games, &MatchRules::TeamVs { warmups: 1, best_of: 3 }, &usernames);

        let rival = rows.iter().find(|row| row.id == RIVAL).unwrap();
        let me = rows.iter().find(|row| row.id == ME).unwrap();
        assert_close(me.cost, 1.0);
        assert_close(rival.cost, (1.0_f64 / 3.0).cbrt());
    }

    #[test]
    fn match_cost_skips_unknown_players_zero_maps_and_qualifiers() {
        let usernames = HashMap::from([(ME, "me".to_string())]);
        let rules = MatchRules::OneVOne { me: ME, warmups: 0, best_of: 1 };

        let rows = match_cost(&[duel(0, 0), duel(10, 10)], &rules, &usernames);
        assert!(rows.iter().all(|row| row.id == ME));

        assert!(match_cost(&[], &rules, &usernames).is_empty());
        let qualifier = MatchRules::Qualifiers { me: ME, maps: 1 };
        assert!(match_cost(&[duel(1, 1)], &qualifier, &usernames).is_empty());
    }

    #[test]
    fn snapshot_round_trips() {
        let rules = MatchRules::OneVOne { me: ME, warmups: 0, best_of: 1 };
        let games = [duel(2, 1)];
        let table = Multipliers::default();
        let snapshot = ScoreSnapshot {
            outcome: rules.score(&games, &table),
            rules,
            multipliers: table,
        };

        let text = serde_json::to_string(&snapshot).unwrap();
        assert!(text.contains("\"kind\":\"oneVOne\""));
        assert!(text.contains("\"bestOf\":1"));
        let parsed: ScoreSnapshot = serde_json::from_str(&text).unwrap();
        assert_eq!(parsed.rules.score(&games, &parsed.multipliers), parsed.outcome);
    }
}
