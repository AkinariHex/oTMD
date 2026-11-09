// Saves your latest osu! Ranked Play room as a test fixture, using your app login. Never prints the token.
// cargo run --example check_room [-- --data-dir <folder holding auth.json>] [--room <id>]
use otmd_lib::scoring::OSU_API_VERSION;
use serde::Deserialize;
use serde_json::Value;
use std::{env, error::Error, fs, path::PathBuf};

const APP_ID: &str = "com.akinari.osu-tourney-match-displayer";
const API: &str = "https://osu.ppy.sh/api/v2";
const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ranked-room.json");

#[derive(Deserialize)]
struct AuthFile {
    user: AuthUser,
    access_token: String,
}

#[derive(Deserialize)]
struct AuthUser {
    id: u64,
}

fn keys(value: &Value) -> String {
    value
        .as_object()
        .map(|object| object.keys().cloned().collect::<Vec<_>>().join(", "))
        .unwrap_or_else(|| "not an object".into())
}

async fn get(client: &reqwest::Client, token: &str, path: &str, query: &[(&str, &str)], pinned: bool) -> Result<Value, Box<dyn Error>> {
    let mut request = client.get(format!("{API}{path}")).bearer_auth(token).query(query);
    if pinned {
        request = request.header("x-api-version", OSU_API_VERSION);
    }
    let response = request.send().await?;
    if response.status() == 401 {
        return Err("osu! rejected the login. Open oTMD once to refresh it, then retry.".into());
    }
    Ok(response.error_for_status()?.json().await?)
}

fn rooms_of(page: &Value) -> Vec<Value> {
    page.as_array().or_else(|| page["rooms"].as_array()).cloned().unwrap_or_default()
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn Error>> {
    let mut data_dir = None;
    let mut room = None;
    let mut args = env::args().skip(1);
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--data-dir" => data_dir = Some(PathBuf::from(args.next().ok_or("--data-dir needs a path")?)),
            "--room" => room = Some(args.next().ok_or("--room needs an id")?.parse::<u64>()?),
            other => return Err(format!("unknown option {other}").into()),
        }
    }

    let data_dir = match data_dir {
        Some(path) => path,
        None => PathBuf::from(env::var_os("APPDATA").ok_or("use --data-dir")?).join(APP_ID),
    };
    let auth: AuthFile = serde_json::from_slice(&fs::read(data_dir.join("auth.json"))?)?;
    let client = reqwest::Client::builder().user_agent("oTMD-fixture").build()?;
    let token = auth.access_token.as_str();

    let participated = [("type_group", "ranked-play"), ("mode", "participated"), ("limit", "10")];
    let page = get(&client, token, "/rooms", &participated, false).await?;
    let rooms = rooms_of(&page);
    println!("participated rooms: {}", rooms.len());
    if let Some(first) = rooms.first() {
        println!("room keys: {}", keys(first));
        println!("first: id={} type={} ends_at={} active={}", first["id"], first["type"], first["ends_at"], first["active"]);
    }

    let active = [("type_group", "ranked-play"), ("mode", "participated"), ("is_active", "true")];
    println!("active rooms now: {}", rooms_of(&get(&client, token, "/rooms", &active, false).await?).len());

    let candidates: Vec<u64> = match room {
        Some(id) => vec![id],
        None => rooms.iter().filter_map(|item| item["id"].as_u64()).collect(),
    };
    let mut events = Value::Null;
    let mut most_rounds = 0;
    for id in candidates {
        let page = get(&client, token, &format!("/rooms/{id}/events"), &[("limit", "101")], false).await?;
        let rounds = page["playlist_items"].as_array().map_or(0, |items| items.iter().filter(|item| item["played_at"].is_string()).count());
        println!("room {id}: {rounds} rounds, {} events, players {}", page["events"].as_array().map_or(0, Vec::len), page["users"].as_array().map_or(0, Vec::len));
        if rounds >= most_rounds {
            most_rounds = rounds;
            events = page;
        }
    }
    println!("using room {}", events["room"]["id"]);

    println!("events keys: {}", keys(&events));
    println!("room object keys: {}", keys(&events["room"]));
    println!("event sample: {}", events["events"][0]);
    let event_types: std::collections::BTreeSet<String> = events["events"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|event| event["event_type"].as_str().map(str::to_string))
        .collect();
    println!("event types: {event_types:?}");

    if let Some(item) = events["playlist_items"].as_array().and_then(|items| items.iter().find(|item| item["scores"].as_array().is_some_and(|scores| !scores.is_empty()))) {
        println!("item keys: {}", keys(item));
        println!("score keys: {}", keys(&item["scores"][0]));
        println!("beatmap present: {}", item["beatmap"].is_object());
    }
    println!(
        "items: {:?}",
        events["playlist_items"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|item| (item["id"].as_u64(), item["played_at"].as_str().map(str::to_string), item["expired"].as_bool(), item["scores"].as_array().map(Vec::len)))
            .collect::<Vec<_>>()
    );

    fs::write(FIXTURE, serde_json::to_vec_pretty(&events)?)?;
    println!("saved {FIXTURE}");

    let path = format!("/users/{}", auth.user.id);
    for pinned in [false, true] {
        let user = get(&client, token, &path, &[], pinned).await?;
        println!("users pinned={pinned}: matchmaking_stats = {}", user["matchmaking_stats"].to_string().chars().take(300).collect::<String>());
    }
    Ok(())
}
