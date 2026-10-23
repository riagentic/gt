//! bwm-core: headline geotagging (Aho-Corasick over a gazetteer) and
//! near-duplicate clustering (token Jaccard + union-find). Pure; no I/O.

use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};
use serde::Serialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const STOP: &[&str] = &[
    "the", "and", "for", "with", "from", "that", "this", "after", "over", "into", "amid", "says",
    "said", "will", "are", "was", "has", "have", "its", "his", "her", "their", "who", "what",
    "new", "more", "than", "about", "out", "but", "not", "could", "would", "can", "how", "why",
    "as", "at", "by", "in", "of", "on", "to", "up", "is", "a", "an", "be", "it", "or", "us",
];

#[derive(Serialize, Debug, PartialEq)]
pub struct Analysis {
    /// per title: distinct place ids found, in order of first appearance
    pub tags: Vec<Vec<u32>>,
    /// per title: cluster id = index of the cluster's first member
    pub clusters: Vec<u32>,
}

#[wasm_bindgen]
pub struct Analyzer {
    ac: AhoCorasick,
    ids: Vec<u32>,
}

#[wasm_bindgen]
impl Analyzer {
    /// `gazetteer`: JSON `[[alias, placeId], …]`.
    #[wasm_bindgen(constructor)]
    pub fn new(gazetteer: &str) -> Result<Analyzer, JsError> {
        let rows: Vec<(String, u32)> = serde_json::from_str(gazetteer)?;
        Ok(Self::build(rows)?)
    }

    /// `titles`: JSON `string[]` → JSON `Analysis`.
    pub fn run(&self, titles: &str, threshold: f32) -> Result<String, JsError> {
        let titles: Vec<String> = serde_json::from_str(titles)?;
        Ok(serde_json::to_string(&self.analyze(&titles, threshold))?)
    }
}

impl Analyzer {
    pub fn build(rows: Vec<(String, u32)>) -> Result<Self, aho_corasick::BuildError> {
        let ids = rows.iter().map(|r| r.1).collect();
        let ac = AhoCorasickBuilder::new()
            .ascii_case_insensitive(true)
            .match_kind(MatchKind::LeftmostLongest)
            .build(rows.iter().map(|r| r.0.as_str()))?;
        Ok(Self { ac, ids })
    }

    pub fn analyze(&self, titles: &[String], threshold: f32) -> Analysis {
        Analysis {
            tags: titles.iter().map(|t| self.tag(t)).collect(),
            clusters: cluster(titles, threshold),
        }
    }

    pub fn tag(&self, text: &str) -> Vec<u32> {
        let b = text.as_bytes();
        let word = |i: usize| b.get(i).is_some_and(|c| c.is_ascii_alphanumeric());
        let mut out: Vec<u32> = Vec::new();
        for m in self.ac.find_iter(text) {
            let bounded = (m.start() == 0 || !word(m.start() - 1)) && !word(m.end());
            let id = self.ids[m.pattern().as_usize()];
            if bounded && !out.contains(&id) {
                out.push(id);
            }
        }
        out
    }
}

fn tokens(s: &str) -> Vec<u64> {
    let mut v: Vec<u64> = s
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 3)
        .map(str::to_lowercase)
        .filter(|w| !STOP.contains(&w.as_str()))
        .map(|w| fnv(w.as_bytes()))
        .collect();
    v.sort_unstable();
    v.dedup();
    v
}

fn fnv(b: &[u8]) -> u64 {
    b.iter().fold(0xcbf29ce484222325, |h, &c| (h ^ c as u64).wrapping_mul(0x100000001b3))
}

fn find(p: &mut [u32], mut i: u32) -> u32 {
    while p[i as usize] != i {
        p[i as usize] = p[p[i as usize] as usize];
        i = p[i as usize];
    }
    i
}

/// Union titles whose token-set Jaccard ≥ threshold. Inverted index keeps it
/// ~O(shared pairs), not O(n²).
pub fn cluster(titles: &[String], threshold: f32) -> Vec<u32> {
    let sets: Vec<Vec<u64>> = titles.iter().map(|t| tokens(t)).collect();
    let mut index: HashMap<u64, Vec<u32>> = HashMap::new();
    for (i, s) in sets.iter().enumerate() {
        for &t in s {
            index.entry(t).or_default().push(i as u32);
        }
    }
    let n = titles.len();
    let mut parent: Vec<u32> = (0..n as u32).collect();
    let mut shared = vec![0u32; n];
    for i in 0..n {
        let mut touched: Vec<u32> = Vec::new();
        for t in &sets[i] {
            for &j in &index[t] {
                if j as usize > i {
                    if shared[j as usize] == 0 {
                        touched.push(j);
                    }
                    shared[j as usize] += 1;
                }
            }
        }
        for j in touched {
            let inter = shared[j as usize] as f32;
            shared[j as usize] = 0;
            let union = (sets[i].len() + sets[j as usize].len()) as f32 - inter;
            if union > 0.0 && inter / union >= threshold {
                let (a, b) = (find(&mut parent, i as u32), find(&mut parent, j));
                parent[a.max(b) as usize] = a.min(b);
            }
        }
    }
    (0..n as u32).map(|i| find(&mut parent, i)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gaz() -> Analyzer {
        Analyzer::build(vec![
            ("Sudan".into(), 1),
            ("South Sudan".into(), 2),
            ("Kyiv".into(), 3),
            ("Ukraine".into(), 3),
            ("Iran".into(), 4),
        ])
        .unwrap()
    }

    #[test]
    fn tags_longest_bounded_distinct() {
        let a = gaz();
        assert_eq!(a.tag("South Sudan talks; Sudan responds"), vec![2, 1]);
        assert_eq!(a.tag("Strikes on KYIV, Ukraine says"), vec![3]);
        assert_eq!(a.tag("Iranian oil"), Vec::<u32>::new());
        assert_eq!(a.tag(""), Vec::<u32>::new());
    }

    #[test]
    fn clusters_near_duplicates() {
        let t: Vec<String> = [
            "Earthquake of magnitude 6.1 strikes off Japan coast",
            "Magnitude 6.1 earthquake strikes off coast of Japan",
            "Oil prices rise as OPEC cuts output",
            "Japan coast earthquake magnitude 6.1 strikes",
        ]
        .map(String::from)
        .to_vec();
        assert_eq!(cluster(&t, 0.5), vec![0, 0, 2, 0]);
        assert_eq!(cluster(&[], 0.5), Vec::<u32>::new());
    }
}
