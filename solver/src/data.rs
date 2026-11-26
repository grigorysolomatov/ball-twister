//! Readers for the JSON files written by tools/gen_fixtures.mjs.

use serde::Deserialize;

#[derive(Deserialize, Clone, Debug)]
pub struct Level {
    pub id: usize,
    pub chapter: usize,
    pub name: String,
    pub target: String,
    #[serde(default)]
    pub pars: Vec<usize>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Puzzle {
    #[serde(default)]
    pub number: Option<i64>,
    #[serde(default)]
    pub weekday: Option<usize>,
    #[serde(default)]
    pub id: Option<usize>,
    #[serde(default)]
    pub level: Option<usize>,
    #[serde(default)]
    pub depth: Option<usize>,
    #[serde(default)]
    pub name: Option<String>,
    pub target: String,
    pub start: String,
    pub solution: Vec<u32>,
}

pub fn read<T: for<'de> Deserialize<'de>>(path: &str) -> T {
    let text = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("cannot read {path}: {e}"));
    serde_json::from_str(&text)
        .unwrap_or_else(|e| panic!("cannot parse {path}: {e}"))
}
