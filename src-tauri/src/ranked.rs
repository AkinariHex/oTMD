use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const MAX_LIFE_LIMIT: f64 = 100_000_000.0;
const MAX_BASE_DAMAGE: f64 = 10_000_000.0;
const MAX_MULTIPLIER: f64 = 100.0;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct RankedRules {
    pub max_life: i64,
    pub base_damage: i64,
    pub global_start: f64,
    pub global_step: f64,
    pub personal_start: f64,
    pub personal_step: f64,
}

// Upstream cbb4d38 (2026-05-18), used until the official sources have been read once.
impl Default for RankedRules {
    fn default() -> Self {
        Self {
            max_life: 1_000_000,
            base_damage: 50_000,
            global_start: 0.5,
            global_step: 0.5,
            personal_start: 0.5,
            personal_step: 0.5,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct RoundResult {
    pub winner: Option<u64>,
    pub loser: Option<u64>,
    pub damage: i64,
    pub multiplier: f64,
    pub global: f64,
    pub lives: [i64; 2],
}

#[derive(Debug, PartialEq)]
pub struct PlayedMatch {
    pub lives: HashMap<u64, i64>,
    pub rounds_won: HashMap<u64, u32>,
    pub rounds: Vec<RoundResult>,
    pub overflow: HashMap<u64, i64>,
}

fn score_of(round: &[(u64, i64)], player: u64) -> i64 {
    round.iter().find(|(user, _)| *user == player).map_or(0, |(_, score)| *score)
}

// Mirrors ResultsStage and RankedPlayMatchController.Damage on the official spectator server.
pub fn play(rules: &RankedRules, players: [u64; 2], rounds: &[Vec<(u64, i64)>]) -> PlayedMatch {
    let mut lives: HashMap<u64, i64> = players.iter().map(|player| (*player, rules.max_life)).collect();
    let mut rounds_won: HashMap<u64, u32> = players.iter().map(|player| (*player, 0)).collect();
    let mut results = Vec::with_capacity(rounds.len());
    let mut global = rules.global_start;
    let mut overflow: HashMap<u64, i64> = players.iter().map(|player| (*player, 0)).collect();

    for (index, round) in rounds.iter().enumerate() {
        if index > 0 {
            global += rules.global_step;
        }

        let (first, second) = (score_of(round, players[0]), score_of(round, players[1]));
        if first == second {
            let snapshot = players.map(|player| lives[&player]);
            results.push(RoundResult { winner: None, loser: None, damage: 0, multiplier: 0.0, global, lives: snapshot });
            continue;
        }

        let (winner, loser, difference) = if first > second {
            (players[0], players[1], first - second)
        } else {
            (players[1], players[0], second - first)
        };
        let personal = rules.personal_start + rules.personal_step * f64::from(rounds_won[&winner]);
        let multiplier = global + personal;
        let damage = (difference as f64 * multiplier).ceil() as i64 + rules.base_damage;

        let life = lives[&loser];
        let survives_at = if life == rules.max_life { 1 } else { 0 };
        let remaining = life - damage;
        lives.insert(loser, remaining.max(survives_at));
        if remaining < 0 && survives_at == 0 {
            overflow.insert(loser, remaining);
        }
        *rounds_won.entry(winner).or_default() += 1;
        let snapshot = players.map(|player| lives[&player]);
        results.push(RoundResult { winner: Some(winner), loser: Some(loser), damage, multiplier, global, lives: snapshot });
    }

    PlayedMatch { lives, rounds_won, rounds: results, overflow }
}

// Rules before upstream cbb4d38, frozen here: those rooms are finished and will never be scored differently.
// Before then there was no base damage and no personal multiplier, only a per-round multiplier.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Curve {
    // 1, 1, 2, 2, 5, 5, 10, 10, then 100.
    Table,
    // 1 for the first two rounds, then start, start + step, ...
    Linear { start: f64, step: f64 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum LastStand {
    Never,
    // A fatal hit leaves 1 life unless the player is already at 1.
    AboveOne,
    // Only a hit taken at full life leaves 1 life (same as today).
    FullLife,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LegacyRules {
    osu: Curve,
    // taiko, catch and mania had their own curve for a while.
    other_modes: Curve,
    last_stand: LastStand,
}

pub const LEGACY_MAX_LIFE: i64 = 1_000_000;
const TABLE: [f64; 10] = [1.0, 1.0, 2.0, 2.0, 5.0, 5.0, 10.0, 10.0, 100.0, 100.0];
const OSU_LINEAR: Curve = Curve::Linear { start: 2.0, step: 0.5 };
const OTHER_LINEAR: Curve = Curve::Linear { start: 2.5, step: 1.0 };

// Starts are the first osu-server-spectator tag holding each change: merge dates are not deploy dates,
// and production deploy records stop after 2026-04-21, so the tag time is the closest public proxy.
const ERAS: [(&str, LegacyRules); 5] = [
    ("", LegacyRules { osu: Curve::Table, other_modes: Curve::Table, last_stand: LastStand::Never }),
    ("2026-03-25T07:31", LegacyRules { osu: OSU_LINEAR, other_modes: OSU_LINEAR, last_stand: LastStand::Never }),
    ("2026-05-05T08:44", LegacyRules { osu: OSU_LINEAR, other_modes: OTHER_LINEAR, last_stand: LastStand::Never }),
    ("2026-05-13T04:17", LegacyRules { osu: OSU_LINEAR, other_modes: OTHER_LINEAR, last_stand: LastStand::AboveOne }),
    ("2026-05-14T17:00", LegacyRules { osu: OSU_LINEAR, other_modes: OTHER_LINEAR, last_stand: LastStand::FullLife }),
];

// Rooms starting from here use RankedRules (base damage and personal multipliers).
pub const CURRENT_RULES_SINCE: &str = "2026-05-18T07:41";

// None when the room is under the current rules.
pub fn legacy_rules(started_at: &str) -> Option<LegacyRules> {
    if started_at >= CURRENT_RULES_SINCE {
        return None;
    }
    ERAS.iter().rev().find(|(since, _)| started_at >= *since).map(|(_, rules)| *rules)
}

fn round_multiplier(curve: Curve, round: usize) -> f64 {
    match curve {
        Curve::Table => TABLE[round.saturating_sub(1).min(TABLE.len() - 1)],
        Curve::Linear { start, step } if round > 2 => start + (round - 3) as f64 * step,
        Curve::Linear { .. } => 1.0,
    }
}

// Mirrors the old ResultsStage: the loser takes ceil(gap x round multiplier), ties hurt nobody.
// ponytail: a round skipped by a timeout still advanced the server round counter but has no scores, so later multipliers can be one step low.
pub fn play_legacy(rules: &LegacyRules, ruleset: u32, players: [u64; 2], rounds: &[Vec<(u64, i64)>]) -> PlayedMatch {
    let curve = if ruleset == 0 { rules.osu } else { rules.other_modes };
    let mut lives: HashMap<u64, i64> = players.iter().map(|player| (*player, LEGACY_MAX_LIFE)).collect();
    let mut rounds_won: HashMap<u64, u32> = players.iter().map(|player| (*player, 0)).collect();
    let mut overflow: HashMap<u64, i64> = players.iter().map(|player| (*player, 0)).collect();
    let mut results = Vec::with_capacity(rounds.len());

    for (index, round) in rounds.iter().enumerate() {
        let multiplier = round_multiplier(curve, index + 1);
        let (first, second) = (score_of(round, players[0]), score_of(round, players[1]));
        if first == second {
            let snapshot = players.map(|player| lives[&player]);
            results.push(RoundResult { winner: None, loser: None, damage: 0, multiplier, global: multiplier, lives: snapshot });
            continue;
        }

        let (winner, loser, difference) = if first > second {
            (players[0], players[1], first - second)
        } else {
            (players[1], players[0], second - first)
        };
        let damage = (difference as f64 * multiplier).ceil() as i64;
        let life = lives[&loser];
        let floor = match rules.last_stand {
            LastStand::Never => 0,
            LastStand::AboveOne => i64::from(life > 1),
            LastStand::FullLife => i64::from(life == LEGACY_MAX_LIFE),
        };
        let remaining = life - damage;
        lives.insert(loser, remaining.max(floor));
        if remaining < 0 && floor == 0 {
            overflow.insert(loser, remaining);
        }
        *rounds_won.entry(winner).or_default() += 1;
        let snapshot = players.map(|player| lives[&player]);
        results.push(RoundResult { winner: Some(winner), loser: Some(loser), damage, multiplier, global: multiplier, lives: snapshot });
    }

    PlayedMatch { lives, rounds_won, rounds: results, overflow }
}

pub struct RuleSources<'a> {
    pub user_info: &'a str,
    pub room_state: &'a str,
    pub results_stage: &'a str,
    pub round_warmup_stage: &'a str,
    pub match_controller: &'a str,
}

fn normalize(source: &str) -> String {
    source.split_whitespace().collect::<Vec<_>>().join(" ")
}

// Literal prefix plus digits only: downloaded text is read as data and never interpreted.
fn number_after(source: &str, prefix: &str) -> Option<f64> {
    let rest = &source[source.find(prefix)? + prefix.len()..];
    let end = rest.find(|character: char| !(character.is_ascii_digit() || character == '_' || character == '.'))?;
    if end == 0 {
        return None;
    }
    rest[..end].replace('_', "").parse().ok()
}

fn in_range(value: f64, low: f64, high: f64) -> Option<f64> {
    (low..=high).contains(&value).then_some(value)
}

fn whole(value: f64) -> Option<i64> {
    (value.fract() == 0.0).then_some(value as i64)
}

pub fn parse_rules(sources: &RuleSources<'_>) -> Option<RankedRules> {
    let user_info = normalize(sources.user_info);
    let room_state = normalize(sources.room_state);
    let results = normalize(sources.results_stage);
    let warmup = normalize(sources.round_warmup_stage);
    let controller = normalize(sources.match_controller);

    let shape_unchanged = [
        results.contains("int attackDamage = winningTotalScore - (int)losingScore.total_score;"),
        results.contains("double attackMultiplier = State.DamageMultiplier + State.Users[winningUserId.Value].DamageMultiplier;"),
        results.contains("Controller.Damage((int)losingScore.user_id, attackDamage, attackMultiplier, BaseDamage)"),
        warmup.contains("State.CurrentRound++;"),
        controller.contains("int totalDamage = (int)Math.Ceiling(directDamage * multiplier) + bonusDamage;"),
        controller.contains("? 1 : 0, userInfo.Life - totalDamage)"),
    ];
    if shape_unchanged.contains(&false) {
        return None;
    }

    const MULTIPLIER_DEFAULT: &str = "public double DamageMultiplier { get; set; } = ";
    let max_life = number_after(&user_info, "public int Life { get; set; } = ")?;
    let survival_check = number_after(&controller, "NewLife = Math.Max(userInfo.Life == ")?;
    if survival_check != max_life {
        return None;
    }

    Some(RankedRules {
        max_life: whole(in_range(max_life, 1.0, MAX_LIFE_LIMIT)?)?,
        base_damage: whole(in_range(number_after(&results, "public int BaseDamage { get; set; } = ")?, 0.0, MAX_BASE_DAMAGE)?)?,
        global_start: in_range(number_after(&room_state, MULTIPLIER_DEFAULT)?, 0.0, MAX_MULTIPLIER)?,
        global_step: in_range(number_after(&warmup, "if (State.CurrentRound > 1) State.DamageMultiplier += ")?, 0.0, MAX_MULTIPLIER)?,
        personal_start: in_range(number_after(&user_info, MULTIPLIER_DEFAULT)?, 0.0, MAX_MULTIPLIER)?,
        personal_step: in_range(number_after(&results, "State.Users[winningUserId.Value].DamageMultiplier += ")?, 0.0, MAX_MULTIPLIER)?,
    })
}

#[cfg(test)]
pub mod tests {
    use super::*;

    const RED: u64 = 1;
    const BLUE: u64 = 2;
    const PLAYERS: [u64; 2] = [RED, BLUE];

    fn round(red: i64, blue: i64) -> Vec<(u64, i64)> {
        vec![(RED, red), (BLUE, blue)]
    }

    fn life(result: &PlayedMatch, player: u64) -> i64 {
        result.lives[&player]
    }

    #[test]
    fn damage_combines_both_multipliers_and_adds_unmultiplied_base() {
        let rules = RankedRules::default();
        let result = play(&rules, PLAYERS, &[round(300_000, 100_000)]);
        // 200,000 x (0.5 global + 0.5 personal) + 50,000
        assert_eq!(result.rounds[0].damage, 250_000);
        assert_eq!(life(&result, BLUE), 750_000);
        assert_eq!(life(&result, RED), 1_000_000);
    }

    #[test]
    fn damage_rounds_up() {
        let rules = RankedRules { global_start: 0.25, personal_start: 0.5, base_damage: 0, ..RankedRules::default() };
        // 3 x 0.75 = 2.25
        assert_eq!(play(&rules, PLAYERS, &[round(3, 0)]).rounds[0].damage, 3);
    }

    #[test]
    fn a_fatal_hit_from_full_life_leaves_one_and_the_next_one_kills() {
        let rules = RankedRules::default();
        let first = play(&rules, PLAYERS, &[round(1_000_000, 0)]);
        assert_eq!(life(&first, BLUE), 1);

        assert_eq!(first.overflow[&BLUE], 0, "surviving at 1 is not overflow");

        let second = play(&rules, PLAYERS, &[round(1_000_000, 0), round(1, 0)]);
        assert_eq!(life(&second, BLUE), 0);
        assert_eq!(second.overflow[&BLUE], 1 - second.rounds[1].damage);
    }

    #[test]
    fn a_tie_deals_nothing_but_the_global_multiplier_still_grows() {
        let rules = RankedRules { base_damage: 0, ..RankedRules::default() };
        let result = play(&rules, PLAYERS, &[round(10, 10), round(100, 0)]);
        assert_eq!(result.rounds[0].damage, 0);
        assert_eq!(result.rounds[0].winner, None);
        // Round 2: global 1.0 + personal 0.5, because the tie gave nobody a win.
        assert_eq!(result.rounds[1].damage, 150);
    }

    #[test]
    fn personal_multiplier_grows_only_for_the_winner() {
        let rules = RankedRules { base_damage: 0, ..RankedRules::default() };
        let result = play(&rules, PLAYERS, &[round(100, 0), round(100, 0), round(0, 100)]);
        assert_eq!(result.rounds[1].multiplier, 2.0); // 1.0 global + 1.0 personal
        assert_eq!(result.rounds[2].multiplier, 2.0); // 1.5 global + 0.5 personal
        assert_eq!(result.rounds_won[&RED], 2);
    }

    #[test]
    fn a_missing_score_counts_as_zero() {
        let result = play(&RankedRules::default(), PLAYERS, &[vec![(RED, 100_000)]]);
        assert_eq!(result.rounds[0].winner, Some(RED));
    }

    const USER_INFO: &str = "public int Life { get; set; } = 1_000_000;\n public double DamageMultiplier { get; set; } = 0.5;";
    const ROOM_STATE: &str = "public double DamageMultiplier { get; set; } = 0.5;";
    const RESULTS: &str = "public int BaseDamage { get; set; } = 50_000;
        int attackDamage = winningTotalScore - (int)losingScore.total_score;
        double attackMultiplier = State.DamageMultiplier + State.Users[winningUserId.Value].DamageMultiplier;
        State.Users[(int)losingScore.user_id].DamageInfo = Controller.Damage((int)losingScore.user_id, attackDamage, attackMultiplier, BaseDamage);
        State.Users[winningUserId.Value].DamageMultiplier += 0.5;";
    const WARMUP: &str = "State.CurrentRound++;\n if (State.CurrentRound > 1)\n     State.DamageMultiplier += 0.5;";
    const CONTROLLER: &str = "int totalDamage = (int)Math.Ceiling(directDamage * multiplier) + bonusDamage;
        NewLife = Math.Max(userInfo.Life == 1_000_000 ? 1 : 0, userInfo.Life - totalDamage),";

    fn parse_with(results: &str, warmup: &str, controller: &str, user_info: &str) -> Option<RankedRules> {
        parse_rules(&RuleSources {
            user_info,
            room_state: ROOM_STATE,
            results_stage: results,
            round_warmup_stage: warmup,
            match_controller: controller,
        })
    }

    #[test]
    fn official_sources_produce_the_known_rules() {
        assert_eq!(parse_with(RESULTS, WARMUP, CONTROLLER, USER_INFO), Some(RankedRules::default()));
    }

    #[test]
    fn a_changed_constant_is_picked_up() {
        let results = RESULTS.replace("= 50_000", "= 75_000");
        assert_eq!(parse_with(&results, WARMUP, CONTROLLER, USER_INFO).unwrap().base_damage, 75_000);
    }

    #[test]
    fn a_changed_formula_is_refused() {
        let controller = CONTROLLER.replace("Math.Ceiling", "Math.Floor");
        assert_eq!(parse_with(RESULTS, WARMUP, &controller, USER_INFO), None);
        let results = RESULTS.replace("State.DamageMultiplier + State.Users", "State.DamageMultiplier * State.Users");
        assert_eq!(parse_with(&results, WARMUP, CONTROLLER, USER_INFO), None);
    }

    #[test]
    fn a_life_that_disagrees_with_the_survival_check_is_refused() {
        let user_info = USER_INFO.replace("1_000_000", "2_000_000");
        assert_eq!(parse_with(RESULTS, WARMUP, CONTROLLER, &user_info), None);
    }

    #[test]
    fn malformed_or_out_of_range_values_are_refused() {
        let expression = WARMUP.replace("+= 0.5", "+= Math.Pow(2, 3)");
        assert_eq!(parse_with(RESULTS, &expression, CONTROLLER, USER_INFO), None);
        let huge = WARMUP.replace("+= 0.5", "+= 5000");
        assert_eq!(parse_with(RESULTS, &huge, CONTROLLER, USER_INFO), None);
        let fractional = RESULTS.replace("= 50_000", "= 50.5");
        assert_eq!(parse_with(&fractional, WARMUP, CONTROLLER, USER_INFO), None);
        assert_eq!(parse_with("", "", "", ""), None);
    }

    #[test]
    fn eras_follow_the_room_start() {
        assert_eq!(legacy_rules("2026-02-10T12:00:00Z").unwrap().osu, Curve::Table);
        assert_eq!(legacy_rules("2026-04-01T12:00:00Z").unwrap().other_modes, OSU_LINEAR);
        assert_eq!(legacy_rules("2026-05-06T12:00:00Z").unwrap().other_modes, OTHER_LINEAR);
        assert_eq!(legacy_rules("2026-05-13T12:00:00Z").unwrap().last_stand, LastStand::AboveOne);
        assert_eq!(legacy_rules("2026-05-16T12:00:00Z").unwrap().last_stand, LastStand::FullLife);
        assert!(legacy_rules("2026-05-18T07:41:00Z").is_none());
        assert!(legacy_rules("2026-05-18T07:40:59Z").is_some());
    }

    #[test]
    fn round_multipliers_match_each_curve() {
        let table: Vec<f64> = (1..=11).map(|round| round_multiplier(Curve::Table, round)).collect();
        assert_eq!(table, [1.0, 1.0, 2.0, 2.0, 5.0, 5.0, 10.0, 10.0, 100.0, 100.0, 100.0]);
        let osu: Vec<f64> = (1..=5).map(|round| round_multiplier(OSU_LINEAR, round)).collect();
        assert_eq!(osu, [1.0, 1.0, 2.0, 2.5, 3.0]);
        let other: Vec<f64> = (1..=5).map(|round| round_multiplier(OTHER_LINEAR, round)).collect();
        assert_eq!(other, [1.0, 1.0, 2.5, 3.5, 4.5]);
    }

    #[test]
    fn legacy_damage_has_no_base_and_rounds_up() {
        let rules = legacy_rules("2026-04-01T00:00:00Z").unwrap();
        let rounds = [round(300_000, 100_000), round(0, 1), round(500_001, 0)];
        let result = play_legacy(&rules, 0, PLAYERS, &rounds);
        assert_eq!(result.rounds[0].damage, 200_000);
        assert_eq!(result.rounds[1].damage, 1);
        // Round 3 multiplier 2: ceil(500,001 x 2) kills from 800,000, no last stand yet.
        assert_eq!(life(&result, BLUE), 0);
        assert_eq!(result.overflow[&BLUE], 800_000 - 1_000_002);
    }

    #[test]
    fn legacy_last_stand_changed_twice() {
        let fatal = [round(0, 1_000_000), round(0, 1_000_000)];
        let above_one = play_legacy(&legacy_rules("2026-05-13T12:00:00Z").unwrap(), 0, PLAYERS, &fatal);
        assert_eq!(above_one.rounds.iter().map(|round| round.lives[0]).collect::<Vec<_>>(), [1, 0]);
        let full_life_rules = legacy_rules("2026-05-16T12:00:00Z").unwrap();
        let from_full = play_legacy(&full_life_rules, 0, PLAYERS, &[round(0, 1_000_000)]);
        assert_eq!(from_full.lives[&RED], 1, "fatal hit at full life");
        let after_a_hit = play_legacy(&full_life_rules, 0, PLAYERS, &[round(400_000, 0), round(1_000_000, 0)]);
        assert_eq!(after_a_hit.lives[&BLUE], 0, "below full life, no second chance");
    }
}
