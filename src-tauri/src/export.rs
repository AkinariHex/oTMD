use crate::{
    poller::Player,
    scoring::{MatchCostRow, ScoreOutcome},
    tournament::Tournament,
};
use reqwest::{Client, StatusCode};
use serde_json::{Value, json};

#[derive(Debug, PartialEq)]
pub enum ExportResult {
    Delivered,
    Rejected,
    Retry,
}

pub struct ExportInput<'a> {
    pub match_id: u64,
    pub match_type: &'a str,
    pub stage: &'a str,
    pub best_of: u32,
    pub warmups: usize,
    pub total_maps: u32,
    pub tournament: &'a Tournament,
    pub match_start: &'a str,
    pub reversed: bool,
    pub players: Option<&'a [Player; 2]>,
    pub teams: Option<&'a [String]>,
    pub player: Option<&'a Player>,
    pub match_cost: Vec<MatchCostRow>,
}

pub fn build_payload(input: &ExportInput<'_>, outcome: &ScoreOutcome) -> Value {
    let shared = json!({
        "matchID": input.match_id.to_string(),
        "matchType": input.match_type,
        "stage": input.stage,
        "tournament": { "name": input.tournament.name, "acronym": input.tournament.acronym },
        "matchStart": input.match_start,
        "matchCost": input.match_cost,
    });

    let details = match outcome {
        ScoreOutcome::Qualifier(result) => json!({
            "player": input.player,
            "totalMaps": input.total_maps,
            "scores": { "list": result.list, "average": result.average },
        }),
        ScoreOutcome::Versus(result) => {
            // ScoreReverse means the title names are listed opposite to the lobby slots.
            let order = if input.reversed { [1, 0] } else { [0, 1] };
            match (input.players, input.teams) {
                (Some(players), _) => json!({
                    "bestOF": input.best_of,
                    "warmups": input.warmups,
                    "players": [players[order[0]], players[order[1]]],
                    "scores": { "player1": result.first, "player2": result.second, "winner": result.winner },
                }),
                (None, Some(teams)) => json!({
                    "bestOF": input.best_of,
                    "warmups": input.warmups,
                    "teams": [teams[order[0]], teams[order[1]]],
                    "scores": { "team1": result.first, "team2": result.second, "winner": result.winner },
                }),
                (None, None) => json!({}),
            }
        }
    };

    let mut payload = shared;
    if let (Some(target), Some(extra)) = (payload.as_object_mut(), details.as_object()) {
        target.extend(extra.clone());
    }
    payload
}

pub async fn send(http: &Client, site_url: &str, api_key: &str, payload: &Value) -> ExportResult {
    post(http, format!("{site_url}/api/match"), api_key, payload).await
}

// A room already saved answers 400 through the unique room_id, which counts as finished here.
pub async fn send_room(http: &Client, site_url: &str, api_key: &str, payload: &Value) -> ExportResult {
    post(http, format!("{site_url}/api/rooms"), api_key, payload).await
}

async fn post(http: &Client, url: String, api_key: &str, payload: &Value) -> ExportResult {
    let response = http
        .post(url)
        .bearer_auth(api_key)
        .json(payload)
        .send()
        .await;

    match response.map(|response| response.status()) {
        Ok(status) if status.is_success() => ExportResult::Delivered,
        Ok(StatusCode::BAD_REQUEST | StatusCode::UNAUTHORIZED) => ExportResult::Rejected,
        _ => ExportResult::Retry,
    }
}
