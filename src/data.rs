//! Embedded knowledge base.
//!
//! The JSON documents under `data/` are compiled into the binary with
//! `include_str!`, so the executable has no runtime file dependencies and can be
//! dropped anywhere (a Claude Desktop config entry, a container, a USB stick).

use crate::json::{self, Json};
use std::sync::OnceLock;

pub const COMPENSATION_PLAN: &str = include_str!("../data/compensation_plan.json");
pub const HEALTH_NUTRITION: &str = include_str!("../data/health_nutrition.json");
pub const BEAUTY_SKINCARE: &str = include_str!("../data/beauty_skincare.json");
pub const HOME_LIVING: &str = include_str!("../data/home_living.json");
pub const FAQ_AND_RISKS: &str = include_str!("../data/faq_and_risks.json");

fn parse_or_die(name: &str, source: &str) -> Json {
    match json::parse(source) {
        Ok(value) => value,
        Err(err) => panic!("embedded data file {} is not valid JSON: {}", name, err),
    }
}

pub fn compensation() -> &'static Json {
    static CELL: OnceLock<Json> = OnceLock::new();
    CELL.get_or_init(|| parse_or_die("compensation_plan.json", COMPENSATION_PLAN))
}

pub fn health() -> &'static Json {
    static CELL: OnceLock<Json> = OnceLock::new();
    CELL.get_or_init(|| parse_or_die("health_nutrition.json", HEALTH_NUTRITION))
}

pub fn beauty() -> &'static Json {
    static CELL: OnceLock<Json> = OnceLock::new();
    CELL.get_or_init(|| parse_or_die("beauty_skincare.json", BEAUTY_SKINCARE))
}

pub fn home_living() -> &'static Json {
    static CELL: OnceLock<Json> = OnceLock::new();
    CELL.get_or_init(|| parse_or_die("home_living.json", HOME_LIVING))
}

pub fn faq() -> &'static Json {
    static CELL: OnceLock<Json> = OnceLock::new();
    CELL.get_or_init(|| parse_or_die("faq_and_risks.json", FAQ_AND_RISKS))
}

/// `meta` block of a document, used for the "checked on" line and sources.
pub fn meta(doc: &Json) -> &Json {
    doc.get("meta").unwrap_or(&Json::Null)
}

pub fn checked_on(doc: &Json) -> &str {
    meta(doc).text("checked_on")
}

/// Sources of a document as (title, url) pairs.
pub fn source_links(doc: &Json) -> Vec<(String, String)> {
    meta(doc)
        .get("sources")
        .and_then(Json::as_arr)
        .map(|items| {
            items
                .iter()
                .map(|s| {
                    (
                        s.text("title_ko").to_string(),
                        s.text("url").to_string(),
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn documents() -> Vec<(&'static str, &'static str, &'static Json)> {
        vec![
            ("compensation_plan.json", COMPENSATION_PLAN, compensation()),
            ("health_nutrition.json", HEALTH_NUTRITION, health()),
            ("beauty_skincare.json", BEAUTY_SKINCARE, beauty()),
            ("home_living.json", HOME_LIVING, home_living()),
            ("faq_and_risks.json", FAQ_AND_RISKS, faq()),
        ]
    }

    #[test]
    fn every_document_has_meta_and_https_sources() {
        for (name, _, doc) in documents() {
            let meta = meta(doc);
            assert!(!checked_on(doc).is_empty(), "{} has no meta.checked_on", name);
            assert!(
                !meta.text("publisher_note").is_empty(),
                "{} has no publisher note",
                name
            );
            let sources = source_links(doc);
            assert!(!sources.is_empty(), "{} lists no sources", name);
            for (label, url) in sources {
                assert!(!label.is_empty(), "{} has a source without a label", name);
                assert!(url.starts_with("https://"), "{} has a non-https source: {}", name, url);
            }
        }
    }

    #[test]
    fn sponsor_number_appears_only_in_the_compensation_document() {
        for (name, raw, _) in documents() {
            let hits = raw.matches("7024721762").count();
            if name == "compensation_plan.json" {
                assert!(hits > 0, "the join guide must carry the sponsor number");
            } else {
                assert_eq!(hits, 0, "{} must not carry the sponsor number", name);
            }
        }
        let sponsor = compensation()
            .get("join_guide")
            .and_then(|j| j.get("sponsor"))
            .expect("join_guide.sponsor must exist");
        let number = sponsor.text("abo_number");
        assert_eq!(number, "7024721762");
        assert_eq!(number.len(), 10);
        assert!(!sponsor.text("notice_ko").is_empty(), "sponsor notice must explain the effect");
    }

    #[test]
    fn contains_no_personal_or_unrelated_information() {
        // Structural guard, so the test itself carries no private value:
        // no mobile-number shapes, and no 10-digit number other than the sponsor number.
        for (name, raw, _) in documents() {
            assert!(
                !has_mobile_number(raw),
                "{} contains a mobile-number shaped value",
                name
            );
            let mut rest = raw.replace("7024721762", "");
            while let Some((digits, tail)) = take_long_digits(&rest) {
                assert_ne!(
                    digits.len(),
                    10,
                    "{} contains an unexpected 10-digit number",
                    name
                );
                rest = tail.to_string();
            }
        }
    }

    fn has_mobile_number(text: &str) -> bool {
        let chars: Vec<char> = text.chars().collect();
        let mut i = 0;
        while i + 1 < chars.len() {
            if chars[i] == '0' && chars[i + 1] == '1' {
                let mut digits = 0;
                let mut j = i;
                while j < chars.len() && (chars[j].is_ascii_digit() || chars[j] == '-') {
                    if chars[j].is_ascii_digit() {
                        digits += 1;
                    }
                    j += 1;
                }
                if (10..=11).contains(&digits) {
                    return true;
                }
                i = j.max(i + 1);
            } else {
                i += 1;
            }
        }
        false
    }

    fn take_long_digits(text: &str) -> Option<(String, &str)> {
        let bytes = text.as_bytes();
        let mut start = None;
        for (i, b) in bytes.iter().enumerate() {
            if b.is_ascii_digit() {
                if start.is_none() {
                    start = Some(i);
                }
            } else if let Some(s) = start.take() {
                if i - s >= 9 {
                    return Some((text[s..i].to_string(), &text[i..]));
                }
            }
        }
        if let Some(s) = start {
            if text.len() - s >= 9 {
                return Some((text[s..].to_string(), ""));
            }
        }
        None
    }

    #[test]
    fn contains_no_prohibited_marketing_language() {
        // Quoted examples of bad pitches are fine; these affirmative forms are not.
        let forbidden = [
            "불로소득",
            "무조건 수익",
            "무조건 월",
            "수익을 보장",
            "원금 보장한다",
            "확실한 수익",
            "누구나 월",
            "질병을 치료한다",
            "치료 효과가 있다",
            "100% 보장",
            "부자 된다",
        ];
        for (name, raw, _) in documents() {
            for needle in forbidden {
                assert!(
                    !raw.contains(needle),
                    "{} uses prohibited wording: {}",
                    name,
                    needle
                );
            }
        }
    }

    #[test]
    fn keeps_the_compliance_facts_that_balance_the_pitch() {
        let plan = COMPENSATION_PLAN;
        assert!(plan.contains("35%"), "the legal bonus cap must be stated");
        assert!(plan.contains("공제조합"));
        assert!(plan.contains("청약철회") || plan.contains("반품"));
        assert!(plan.contains("16.7%"), "the regulator distribution must be stated");

        assert!(HEALTH_NUTRITION.contains("질병의 예방·치료"));
        assert!(BEAUTY_SKINCARE.contains("화장품법"));
        assert!(FAQ_AND_RISKS.contains("금지행위"));
        assert!(FAQ_AND_RISKS.contains("1372"));
    }

    #[test]
    fn every_record_is_renderable() {
        for (name, _, doc) in documents() {
            let mut found = 0;
            walk(doc, &mut |node| {
                if node.get("id").is_some() && node.get("title_ko").is_some() {
                    found += 1;
                    assert!(
                        !node.text("summary_ko").is_empty(),
                        "{}: a record has no summary",
                        name
                    );
                    let sections = node
                        .get("sections")
                        .and_then(Json::as_arr)
                        .unwrap_or_else(|| panic!("{}: a record has no sections", name));
                    assert!(!sections.is_empty(), "{}: a record has empty sections", name);
                    for section in sections {
                        assert!(
                            !section.text("heading_ko").is_empty()
                                || !section.strings("bullets_ko").is_empty(),
                            "{}: an empty section",
                            name
                        );
                    }
                    if let Some(checkpoints) = node.get("checkpoints").and_then(Json::as_arr) {
                        for checkpoint in checkpoints {
                            assert!(checkpoint.text("url").starts_with("https://"));
                        }
                    }
                }
            });
            assert!(found >= 1, "{} yielded no records", name);
        }
    }

    fn bullets_of(record: &Json) -> Vec<String> {
        record
            .get("sections")
            .and_then(Json::as_arr)
            .map(|sections| {
                sections
                    .iter()
                    .flat_map(|section| section.strings("bullets_ko"))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn walk(node: &Json, visit: &mut impl FnMut(&Json)) {
        visit(node);
        match node {
            Json::Arr(items) => items.iter().for_each(|item| walk(item, visit)),
            Json::Obj(entries) => entries.iter().for_each(|(_, value)| walk(value, visit)),
            _ => {}
        }
    }

    #[test]
    fn states_that_the_project_is_unofficial_and_follows_the_ethics_code() {
        let ethics = compensation()
            .get("ethics")
            .expect("the ethics block must exist");
        assert!(ethics.text("summary_ko").contains("비공식"));
        let joined = bullets_of(ethics).join (" ");
        assert!(joined.contains("사재기"));
        assert!(!joined.is_empty());
        assert!(COMPENSATION_PLAN.contains("ABO 윤리강령"));
        assert!(COMPENSATION_PLAN.contains("사재기"));
        assert!(COMPENSATION_PLAN.contains("청약철회"));
        assert!(COMPENSATION_PLAN.contains("스팸"));

        let flow = compensation()
            .get("join_guide")
            .and_then(|j| j.get("official_flow"))
            .expect("the official flow must exist");
        let steps = flow.strings("steps_ko").join(" ");
        assert!(steps.contains("https://www.amway.co.kr"));
        assert!(steps.contains("https://www.amway.co.kr/my-shopping"));
        assert!(
            steps.contains("로그인"),
            "my-shopping must be described as a post-login screen"
        );
        assert!(
            !steps.contains("my-shopping에서 가입"),
            "my-shopping must not be presented as a sign-up form"
        );
    }

    #[test]
    fn bonus_tiers_are_ordered_and_bounded() {
        let tiers = compensation()
            .get("bonus_tiers")
            .and_then(|b| b.get("tiers"))
            .and_then(Json::as_arr)
            .expect("bonus_tiers.tiers must exist");
        assert_eq!(tiers.len(), 7);
        let mut previous_pv = 0.0;
        let mut previous_rate = 0.0;
        for tier in tiers {
            let pv = tier.get("min_pv").and_then(Json::as_f64).unwrap();
            let rate = tier.get("rate_pct").and_then(Json::as_f64).unwrap();
            assert!(pv > previous_pv, "PV tiers must increase");
            assert!(rate > previous_rate, "rates must increase");
            assert!((3.0..=21.0).contains(&rate));
            previous_pv = pv;
            previous_rate = rate;
        }
        assert_eq!(previous_rate, 21.0, "the top tier is 21%");
    }
}
