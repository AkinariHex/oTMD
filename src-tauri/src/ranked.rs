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
            results.push(RoundResult { winner: None, loser: None, damage: 0, multiplier: 0.0, global });
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
        results.push(RoundResult { winner: Some(winner), loser: Some(loser), damage, multiplier, global });
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
}
