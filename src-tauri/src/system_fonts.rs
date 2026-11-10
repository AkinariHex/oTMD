// Scans on demand and frees everything afterwards, so installed fonts cost nothing while in the tray.
pub fn installed_families() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    sorted_unique(database.faces().filter_map(|face| face.families.first().map(|(name, _)| name.clone())))
}

// Names starting with a dot are macOS internal fonts that apps cannot select.
fn sorted_unique(names: impl Iterator<Item = String>) -> Vec<String> {
    let mut families: Vec<String> = names.filter(|name| !name.trim().is_empty() && !name.starts_with('.')).collect();
    families.sort_by_key(|name| name.to_lowercase());
    families.dedup_by_key(|name| name.to_lowercase());
    families
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn families_are_sorted_without_duplicates_or_hidden_fonts() {
        let names = ["Zeta", "arial", "Arial", " ", ".SF Hidden", "Beta"].map(String::from);
        assert_eq!(sorted_unique(names.into_iter()), ["arial", "Beta", "Zeta"]);
    }

    #[test]
    fn this_machine_reports_real_fonts() {
        assert!(!installed_families().is_empty());
    }
}
