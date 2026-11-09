use crate::scoring::Multipliers;
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Serialize)]
pub struct Tournament {
    pub acronym: String,
    #[serde(rename = "tournamentName", skip_serializing_if = "String::is_empty")]
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<&'static str>,
    #[serde(skip)]
    pub multipliers: Multipliers,
}

impl Tournament {
    fn not_listed(acronym: &str) -> Self {
        Self {
            acronym: acronym.into(),
            name: String::new(),
            error: Some("No tournament found"),
            multipliers: Multipliers::default(),
        }
    }
}

pub struct TournamentCache {
    http: Client,
    site_url: String,
    known: HashMap<String, Tournament>,
}

impl TournamentCache {
    pub fn new(http: Client, site_url: &str) -> Self {
        Self {
            http,
            site_url: site_url.into(),
            known: HashMap::new(),
        }
    }

    async fn fetch(&self, acronym: &str) -> Option<Tournament> {
        let body: Value = self
            .http
            .get(format!("{}/api/tournaments/app", self.site_url))
            .query(&[("t", acronym)])
            .send()
            .await
            .ok()?
            .error_for_status()
            .ok()?
            .json()
            .await
            .ok()?;

        if body.get("error").is_some() {
            return Some(Tournament::not_listed(acronym));
        }

        Some(Tournament {
            acronym: acronym.into(),
            name: body.get("tournamentName")?.as_str()?.into(),
            error: None,
            multipliers: serde_json::from_value(body.get("multipliers")?.clone()).unwrap_or_default(),
        })
    }

    // The bool is false while otmd.app is unreachable: scores use 1.0 and the lookup is retried.
    pub async fn get(&mut self, acronym: &str) -> (Tournament, bool) {
        if let Some(tournament) = self.known.get(acronym) {
            return (tournament.clone(), true);
        }

        if acronym.is_empty() {
            return (Tournament::not_listed(acronym), true);
        }

        match self.fetch(acronym).await {
            Some(tournament) => {
                self.known.insert(acronym.into(), tournament.clone());
                (tournament, true)
            }
            None => (Tournament::not_listed(acronym), false),
        }
    }
}
