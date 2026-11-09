// Scores a real match with your app login and saves it as a test fixture.
// cargo run --example check_match -- <id> --best-of 13 --warmups 2 [--team]
// cargo run --example check_match -- <id> --qualifiers 8
// Optional: --data-dir <folder holding auth.json>, needed for portable installs.
use otmd_lib::scoring::{
    Game, MatchResponse, MatchRules, Multipliers, OSU_API_VERSION, ScoreOutcome, ScoreSnapshot,
};
use serde::Deserialize;
use serde_json::Value;
use std::{env, error::Error, fs, path::PathBuf};

const APP_ID: &str = "com.akinari.osu-tourney-match-displayer";
const PAGE_SIZE: &str = "101";

#[derive(Deserialize)]
struct AuthFile {
    user: AuthUser,
    access_token: String,
}

#[derive(Deserialize)]
struct AuthUser {
    id: u64,
    username: String,
}

struct Args {
    match_id: u64,
    best_of: Option<u32>,
    warmups: usize,
    team: bool,
    qualifiers: Option<u32>,
    data_dir: Option<PathBuf>,
}

fn parse_args() -> Result<Args, Box<dyn Error>> {
    let mut raw = env::args().skip(1);
    let mut args = Args {
        match_id: raw.next().ok_or("missing match id")?.parse()?,
        best_of: None,
        warmups: 0,
        team: false,
        qualifiers: None,
        data_dir: None,
    };

    while let Some(flag) = raw.next() {
        match flag.as_str() {
            "--best-of" => args.best_of = Some(raw.next().ok_or("--best-of needs a number")?.parse()?),
            "--warmups" => args.warmups = raw.next().ok_or("--warmups needs a number")?.parse()?,
            "--qualifiers" => args.qualifiers = Some(raw.next().ok_or("--qualifiers needs a number")?.parse()?),
            "--data-dir" => args.data_dir = Some(raw.next().ok_or("--data-dir needs a path")?.into()),
            "--team" => args.team = true,
            other => return Err(format!("unknown option {other}").into()),
        }
    }
    Ok(args)
}

fn default_data_dir() -> Result<PathBuf, Box<dyn Error>> {
    let base = env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
        .ok_or("cannot find the app data folder, use --data-dir")?;
    Ok(base.join(APP_ID))
}

async fn fetch_match(client: &reqwest::Client, token: &str, id: u64) -> Result<Value, Box<dyn Error>> {
    let url = format!("https://osu.ppy.sh/api/v2/matches/{id}");
    let mut merged: Option<Value> = None;
    let mut events: Vec<Value> = Vec::new();
    let mut after = 0;

    loop {
        let response = client
            .get(&url)
            .bearer_auth(token)
            .header("x-api-version", OSU_API_VERSION)
            .query(&[("limit", PAGE_SIZE), ("after", &after.to_string())])
            .send()
            .await?;

        if response.status() == 401 {
            return Err("osu! rejected the login. Open oTMD once to refresh it, then retry.".into());
        }

        let page: Value = response.error_for_status()?.json().await?;
        let page_events = page["events"].as_array().cloned().unwrap_or_default();
        let last_id = page_events.iter().filter_map(|event| event["id"].as_u64()).max();
        let latest = page["latest_event_id"].as_u64().unwrap_or(0);

        events.extend(page_events);
        merged.get_or_insert(page);

        match last_id {
            Some(last) if last > after && last < latest => after = last,
            _ => break,
        }
    }

    events.sort_by_key(|event| event["id"].as_u64());
    events.dedup_by_key(|event| event["id"].as_u64());

    let mut merged = merged.ok_or("osu! returned no data")?;
    merged["events"] = Value::Array(events);
    Ok(merged)
}

async fn fetch_multipliers(client: &reqwest::Client, match_name: &str) -> Result<Multipliers, Box<dyn Error>> {
    let acronym = match_name.split(':').next().unwrap_or_default();
    let body: Value = client
        .get("https://otmd.app/api/tournaments/app")
        .query(&[("t", acronym)])
        .send()
        .await?
        .json()
        .await?;

    if body.get("error").is_some() {
        println!("Tournament '{acronym}' not found on otmd.app: all multipliers are 1.00");
        return Ok(Multipliers::default());
    }

    println!("Tournament: {}", body["tournamentName"].as_str().unwrap_or(acronym));
    Ok(serde_json::from_value(body["multipliers"].clone()).unwrap_or_default())
}

fn print_outcome(outcome: &ScoreOutcome, games: &[Game]) {
    match outcome {
        ScoreOutcome::Versus(result) => {
            for (index, map) in result.maps.iter().enumerate() {
                let point = match map.point {
                    Some(1) => "RED / player 1",
                    Some(2) => "BLUE / player 2",
                    _ => "no point",
                };
                println!(
                    "Map {:>2} (beatmap {}): {} - {}  => {point}",
                    index + 1,
                    map.beatmap_id,
                    map.first_score,
                    map.second_score
                );
            }
            println!("\nFinal: {} - {}", result.first, result.second);
            println!("Finished: {}, winner: {:?}", result.is_finished, result.winner);
            println!("Games found in the lobby, warmups included: {}", games.len());
        }
        ScoreOutcome::Qualifier(result) => {
            for (index, entry) in result.list.iter().enumerate() {
                println!("Map {:>2}: {} [{}]", index + 1, entry.score, entry.mods.join(" "));
            }
            println!("\nAverage: {}", result.average);
            println!("Maps played: {}, finished: {}", result.maps_played, result.is_finished);
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let args = parse_args()?;
    let data_dir = args.data_dir.clone().map_or_else(default_data_dir, Ok)?;
    let auth: AuthFile = serde_json::from_slice(
        &fs::read(data_dir.join("auth.json")).map_err(|_| "auth.json not found: log in from the app first")?,
    )?;
    println!("Logged in as {}", auth.user.username);

    let rules = match (args.qualifiers, args.best_of) {
        (Some(maps), _) => MatchRules::Qualifiers { me: auth.user.id, maps },
        (None, Some(best_of)) if args.team => MatchRules::TeamVs { warmups: args.warmups, best_of },
        (None, Some(best_of)) => MatchRules::OneVOne {
            me: auth.user.id,
            warmups: args.warmups,
            best_of,
        },
        (None, None) => return Err("pass --best-of or --qualifiers".into()),
    };

    let client = reqwest::Client::builder()
        .user_agent(concat!("oTMD/", env!("CARGO_PKG_VERSION")))
        .build()?;

    let raw = fetch_match(&client, &auth.access_token, args.match_id).await?;
    let response: MatchResponse = serde_json::from_value(raw.clone())?;
    println!("Match: {}\n", response.info.name);

    let multipliers = fetch_multipliers(&client, &response.info.name).await?;
    let games = response.into_games();
    let outcome = rules.score(&games, &multipliers);
    print_outcome(&outcome, &games);

    let fixtures = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures");
    fs::create_dir_all(&fixtures)?;
    fs::write(fixtures.join(format!("{}.json", args.match_id)), serde_json::to_vec(&raw)?)?;
    fs::write(
        fixtures.join(format!("{}.expected.json", args.match_id)),
        serde_json::to_vec_pretty(&ScoreSnapshot { rules, multipliers, outcome })?,
    )?;
    println!("\nSaved as a test fixture.");
    Ok(())
}
