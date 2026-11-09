use otmd_lib::scoring::{MatchResponse, ScoreSnapshot};
use std::{fs, path::Path};

// Fixtures come from `cargo run --example check_match`, once a human confirmed the printed result.
#[test]
fn real_matches_score_as_confirmed() {
    let directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures");
    let Ok(entries) = fs::read_dir(&directory) else {
        return;
    };

    for entry in entries {
        let path = entry.unwrap().path();
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let Some(id) = name.strip_suffix(".expected.json") else {
            continue;
        };

        let snapshot: ScoreSnapshot = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        let raw = fs::read(directory.join(format!("{id}.json"))).unwrap();
        let response: MatchResponse = serde_json::from_slice(&raw).unwrap();

        let actual = snapshot.rules.score(&response.into_games(), &snapshot.multipliers);
        assert_eq!(actual, snapshot.outcome, "match {id}");
    }
}
