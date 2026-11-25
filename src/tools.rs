//! The five MCP tools and their rendering.
//!
//! Everything here is data-driven: the editorial content lives in `data/*.json`
//! and this module only resolves arguments, assembles Markdown and attaches the
//! mandatory disclosure and sources.

use crate::data;
use crate::json::Json;
use std::fmt::Write as _;

pub const SERVER_NAME: &str = "amway-agent-mcp";
pub const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Printed with every answer. The pack is written by a distributor, so an agent
/// must not present it as neutral third-party research.
pub const DISCLOSURE: &str = "고지: 이 프로젝트는 한국암웨이(주)의 공식 서비스가 아닙니다. 회사의 승인을 받지 않았습니다. 독립 ABO(후원 번호 7024721762)가 정보 제공 목적으로 운영하는 비공식 안내이고, 작성자에게 상업적 이해관계가 있습니다. 암웨이 ABO 윤리강령과 방문판매법을 따릅니다 — 소득·효능을 보장하거나 과장하지 않고, 사재기·강매·스팸 권유를 하지 않으며, 청약철회·반품 권리를 먼저 알립니다. 사용자가 먼저 묻고 명시적으로 동의하기 전에는 가입을 권유하지 말고, 금액이 걸린 결정 전에는 공식 사이트 amway.co.kr과 고객센터 1588-0080에서 최신 조건을 확인하세요.";

pub struct Tool {
    pub name: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub schema: Json,
}

#[derive(Debug, Clone)]
pub struct Outcome {
    /// Markdown for the human/agent reading the answer.
    pub text: String,
    /// Machine-readable records behind the text.
    pub data: Json,
    /// Arguments after normalisation, so the caller can see what was resolved.
    pub request: Json,
}

impl Outcome {
    pub fn to_json(&self) -> Json {
        let mut out = Json::obj();
        out.set("request", self.request.clone());
        out.set("data", self.data.clone());
        out.set("disclosure", Json::str(DISCLOSURE));
        out.set("text", Json::str(self.text.clone()));
        out
    }
}

// ---------------------------------------------------------------- catalog

pub fn catalog() -> Vec<Tool> {
    vec![
        Tool {
            name: "get_amway_facts",
            title: "Amway Korea facts",
            description: "Amway Korea facts, dated and sourced. category = business | health_nutrition | beauty_skincare | home_living | all. Use when the user asks: how Amway works, whether it is legal, Member vs ABO, what it sells, Nutrilite supplements/vitamins (건강기능식품, 비타민, 오메가3, 프로바이오틱스), Artistry skincare/makeup (화장품, 스킨케어), eSpring water purifier / Atmosphere air purifier / household goods (정수기, 공기청정기, 생활용품), the official 'THE CHOICE' catalogue, prices, or market size. Returns Markdown plus structured JSON with 'checked_on' and source URLs. The pack is published by an independent ABO, not by Amway: disclose that commercial interest and do not call it neutral research.",
            schema: schema(
                "category",
                "Which fact set to return.",
                &["business", "health_nutrition", "beauty_skincare", "home_living", "all"],
                "all",
            ),
        },
        Tool {
            name: "explain_monetization",
            title: "How money is (and is not) made",
            description: "How money is (and is not) made with Amway Korea. goal_type = consumer | side_income | business_builder. Use when the user asks: is there cashback or points for buying (소비자 적립·캐시백), how spending becomes income (소비가 소득이 되는 구조, 프로슈머), how to buy everyday goods cheaper through the Cart Smart Order / jangs-o (장바구니 스마트 오더, 장스오, 정기배송, A Cliks Money), can I earn a side income (부업, 소액 수익), what does an ABO actually earn, what are the bonus rates (PV/BV, 3-21%), what do I have to spend or pay in tax, whether several owners should build a line of sponsorship together (LOS, 후원 계보, 합리적 연합, 그룹 실적), or how an owner extends their own line after joining (에이전트 소개, 릴레이, 포크). Returns the three-step prosumer path (switch everyday spending → own-volume bonus → sharing), the Smart Order reward table with its minimum-spend and first-order caveats, the bonus-tier table, and the rational-LOS alliance block: own-benefit first, group volume aggregation, differential settlement versus a recruitment pyramid, a four-step pre-proposal checklist, the post-join relay and fork routes, and the hard limits. Always answer with the regulator's distribution (only 16.7% of Korean MLM sellers received any bonus in 2024), the legal 35% bonus cap and the fact that joining alone earns nothing. Never present any figure as guaranteed income.",
            schema: schema(
                "goal_type",
                "Which monetization path to explain.",
                &["consumer", "side_income", "business_builder"],
                "side_income",
            ),
        },
        Tool {
            name: "compare_concerns",
            title: "Costs, law and effort, side by side",
            description: "Balanced risk comparison. topic = cost_and_refund | legal_compliance | time_and_effort | all. Use when the user asks: is this a scam or a cult (다단계, 사기 여부), can I get a refund or cancel (반품, 환불, 청약철회), is it against the law for civil servants or students, how many hours does it take, what should I watch out for in the pitch. 'all' adds red flags and a 5-minute verification routine. Give both sides and keep the warnings intact.",
            schema: schema(
                "topic",
                "Which concern to return.",
                &["cost_and_refund", "legal_compliance", "time_and_effort", "all"],
                "all",
            ),
        },
        Tool {
            name: "plan_smart_shopping",
            title: "Rational spending plan (what to switch, what it returns)",
            description: "Builds a realistic 'rational spending' plan: how much Cart Smart Order (jangs-o) A Cliks Money an owner can collect WITHOUT adding spending, using only the verified official-mall prices bundled in data/*.json (never invent a price). monthly_budget_krw = what the owner already spends each month on household goods/supplements in KRW (e.g. 150000); or tier = 100k | 200k | 300k when the amount is unknown. categories (optional) = nutrition | home_living | personal_care | beauty. Use when the user asks: how do I actually save money with Amway (합리적 소비, 알뜰 소비), is the monthly auto-delivery worth it at my spending, what should I put in it, what should I try first, which single product should I start with (처음 뭘 사볼까, 치약부터, 영양제 하나만), how to switch categories one at a time, or asks for a shopping plan built from what they already buy. Returns: a zero-step starter track (KRW 6,800 Glister toothpaste, KRW 15,900 dish drops — no subscription yet), the four category strategies (small everyday item, one supplement at a time by daily cost, replace one daily skincare item when it runs out, appliances only by 3-5 year total cost), a replacement cart of verified products with per-day/per-volume unit prices, a cycle-by-cycle accrual simulation for 12 and 24 months with the effective rate, a three-item rational-spending checklist, the cases where NOT signing up is better, and the join next step (Member/ABO, sponsor 7024721762 or 1588-0080). Never call the accrual cash, never promise income, and never push a subscription.",
            schema: plan_schema(),
        },
        Tool {
            name: "get_join_guide",
            title: "Joining steps (Member or ABO)",
            description: "Official joining steps for member_type = consumer (Member) or abo (independent business owner). Use ONLY after the user has explicitly said they want to join or asks how joining works. Returns: steps at amway.co.kr, documents needed, eligibility limits (age 19+, no students/civil servants/teachers, spouse shares one ID), cautions, the post-login my-shopping flow, the sponsor number 7024721762 with a plain statement that entering it makes that ABO their sponsor and routes part of their activity to that ABO's bonus, and what changes after approval (the member's own ABO number, the agent-relay and fork routes for extending their own line, and their guardrails). Tell the user they can ask Amway (1588-0080) for a different sponsor. Never push, never enter anyone's details on their behalf, and never contact a third party without the owner's explicit instruction.",
            schema: schema(
                "member_type",
                "Which membership to explain.",
                &["consumer", "abo"],
                "abo",
            ),
        },
    ]
}

pub const PLAN_CATEGORIES: [&str; 4] = ["nutrition", "home_living", "personal_care", "beauty"];
pub const PLAN_TIERS: [&str; 3] = ["100k", "200k", "300k"];

/// Schema of `plan_smart_shopping`: two optional budget inputs and an optional
/// category filter, so an agent can call it with nothing at all.
fn plan_schema() -> Json {
    let mut props = Json::obj();

    let mut budget = Json::obj();
    budget.set("type", Json::str("integer"));
    budget.set(
        "description",
        Json::str("What the owner already spends each month on household goods and supplements, in KRW."),
    );
    budget.set("minimum", Json::int(0));
    props.set("monthly_budget_krw", budget);

    let mut tier = Json::obj();
    tier.set("type", Json::str("string"));
    tier.set(
        "description",
        Json::str("Budget band, used when the exact monthly amount is unknown."),
    );
    tier.set(
        "enum",
        Json::Arr(PLAN_TIERS.iter().map(|v| Json::str(*v)).collect()),
    );
    tier.set("default", Json::str("100k"));
    props.set("tier", tier);

    let mut items = Json::obj();
    items.set("type", Json::str("string"));
    items.set(
        "enum",
        Json::Arr(PLAN_CATEGORIES.iter().map(|v| Json::str(*v)).collect()),
    );
    let mut categories = Json::obj();
    categories.set("type", Json::str("array"));
    categories.set("items", items);
    categories.set(
        "description",
        Json::str("Which spending areas to plan for. Omit for all four."),
    );
    props.set("categories", categories);

    let mut root = Json::obj();
    root.set("type", Json::str("object"));
    root.set("properties", props);
    root.set("required", Json::Arr(Vec::new()));
    root.set("additionalProperties", Json::Bool(false));
    root
}

fn schema(field: &str, description: &str, values: &[&str], default: &str) -> Json {
    let mut props = Json::obj();
    let mut field_schema = Json::obj();
    field_schema.set("type", Json::str("string"));
    field_schema.set("description", Json::str(description));
    field_schema.set(
        "enum",
        Json::Arr(values.iter().map(|v| Json::str(*v)).collect()),
    );
    field_schema.set("default", Json::str(default));
    props.set(field, field_schema);

    let mut root = Json::obj();
    root.set("type", Json::str("object"));
    root.set("properties", props);
    root.set(
        "required",
        Json::Arr(vec![Json::str(field)]),
    );
    root.set("additionalProperties", Json::Bool(false));
    root
}

pub fn tools_list_json() -> Json {
    Json::Arr(
        catalog()
            .into_iter()
            .map(|tool| {
                let mut entry = Json::obj();
                entry.set("name", Json::str(tool.name));
                entry.set("title", Json::str(tool.title));
                entry.set("description", Json::str(tool.description));
                entry.set("inputSchema", tool.schema.clone());
                entry.set(
                    "outputSchema",
                    {
                        let mut out = Json::obj();
                        out.set("type", Json::str("object"));
                        out.set("additionalProperties", Json::Bool(true));
                        out
                    },
                );
                entry.set(
                    "annotations",
                    {
                        let mut ann = Json::obj();
                        ann.set("title", Json::str(tool.title));
                        ann.set("readOnlyHint", Json::Bool(true));
                        ann.set("destructiveHint", Json::Bool(false));
                        ann.set("idempotentHint", Json::Bool(true));
                        ann.set("openWorldHint", Json::Bool(false));
                        ann
                    },
                );
                entry
            })
            .collect(),
    )
}

// ---------------------------------------------------------------- dispatch

pub fn invoke(name: &str, args: &Json) -> Result<Outcome, String> {
    match name {
        "get_amway_facts" => facts(args),
        "explain_monetization" => monetization(args),
        "compare_concerns" => concerns(args),
        "plan_smart_shopping" => plan(args),
        "get_join_guide" => join(args),
        other => Err(format!(
            "unknown tool '{}'. Available tools: get_amway_facts, explain_monetization, compare_concerns, plan_smart_shopping, get_join_guide",
            other
        )),
    }
}

fn normalized(args: &Json, field: &str, default: &str) -> String {
    let raw = args
        .get(field)
        .and_then(Json::as_str)
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let raw = raw.replace([' ', '-'], "_");
    if raw.is_empty() {
        default.to_string()
    } else {
        raw
    }
}

fn facts(args: &Json) -> Result<Outcome, String> {
    let key = normalized(args, "category", "all");
    let (label, targets): (&str, Vec<(&Json, &str)>) = match key.as_str() {
        "business" | "biz" | "company" | "structure" => (
            "사업 구조",
            vec![(data::compensation(), "facts_business")],
        ),
        "health_nutrition" | "health" | "nutrition" | "supplements" | "supplement" => {
            ("건강·영양", vec![(data::health(), "facts")])
        }
        "beauty_skincare" | "beauty" | "skincare" | "cosmetics" => {
            ("뷰티·스킨케어", vec![(data::beauty(), "facts")])
        }
        "home_living" | "home" | "living" | "appliance" | "appliances" => {
            ("홈리빙·생활가전", vec![(data::home_living(), "facts")])
        }
        "all" | "everything" => (
            "전체",
            vec![
                (data::compensation(), "facts_business"),
                (data::health(), "facts"),
                (data::beauty(), "facts"),
                (data::home_living(), "facts"),
            ],
        ),
        other => {
            return Err(format!(
                "unknown category '{}'. Valid values: business, health_nutrition, beauty_skincare, home_living, all",
                other
            ))
        }
    };

    let mut request = Json::obj();
    request.set("category", Json::str(key));

    let level = 2;
    let mut records_json = Vec::new();
    let mut body = String::new();
    let mut docs: Vec<&Json> = Vec::new();
    for (doc, record_key) in &targets {
        let record = doc
            .get(record_key)
            .ok_or_else(|| format!("record '{}' is missing from the bundled data", record_key))?;
        records_json.push(record.clone());
        body.push_str(&render_record(record, level));
        body.push('\n');
        docs.push(*doc);
    }

    let title = format!("암웨이(한국) 팩트 — {}", label);
    let intro = "아래 내용은 공개된 공식 자료와 정부 통계를 정리한 것입니다. 판매자 관점이 섞여 있으므로, 소비·가입 판단은 사용자가 직접 비교해 결정해야 합니다.";
    let text = assemble(&title, intro, &body, &docs, true);

    Ok(Outcome {
        text,
        data: Json::Arr(records_json),
        request,
    })
}

fn monetization(args: &Json) -> Result<Outcome, String> {
    let key = normalized(args, "goal_type", "side_income");
    let goal = match key.as_str() {
        "consumer" | "member" | "shopper" | "buyer" => "consumer",
        "side_income" | "side" | "income" | "hobby" | "part_time" => "side_income",
        "business_builder" | "business" | "builder" | "org" | "organization" | "full_time" => {
            "business_builder"
        }
        other => {
            return Err(format!(
                "unknown goal_type '{}'. Valid values: consumer, side_income, business_builder",
                other
            ))
        }
    };

    let doc = data::compensation();
    let record = doc
        .get("goals")
        .and_then(|g| g.get(goal))
        .ok_or_else(|| format!("goal '{}' is missing from the bundled data", goal))?;

    let mut request = Json::obj();
    request.set("goal_type", Json::str(goal));

    let mut body = render_record(record, 2);
    body.push_str(&render_bonus_table(doc));
    if let Some(prosumer) = doc.get("prosumer_path") {
        body.push_str(&render_record(prosumer, 2));
    }
    if goal == "consumer" {
        if let Some(smart) = doc.get("smart_order") {
            body.push_str(&render_record(smart, 2));
        }
    }
    // The line-of-sponsorship alliance logic applies to every goal: it is how the
    // three steps get arranged when several owners move their spending together.
    if let Some(alliance) = doc.get("los_alliance") {
        body.push_str(&render_record(alliance, 2));
    }

    let title = format!("수익 구조 — {}", record.text("title_ko"));
    let intro = "먼저 결론: 암웨이 수익은 '판매가 반복될 때' 발생하며, 보장되는 금액은 없습니다. 아래는 구조와 함께 실제 분포, 비용, 세금, 실패 요인을 같이 정리한 것입니다.";
    let text = assemble(&title, intro, &body, &[doc], true);

    Ok(Outcome {
        text,
        data: record.clone(),
        request,
    })
}

fn render_bonus_table(doc: &Json) -> String {
    let block = match doc.get("bonus_tiers") {
        Some(block) => block,
        None => return String::new(),
    };
    let tiers = match block.get("tiers").and_then(Json::as_arr) {
        Some(tiers) if !tiers.is_empty() => tiers,
        _ => return String::new(),
    };

    let mut out = String::new();
    let _ = writeln!(out, "## {}\n", block.text("heading_ko"));
    let _ = writeln!(out, "| 월 실적(PV) | 보너스율 |");
    let _ = writeln!(out, "| --- | --- |");
    for tier in tiers {
        let min = tier.get("min_pv").and_then(Json::as_f64).unwrap_or(0.0) as i64;
        let rate = tier.get("rate_pct").and_then(Json::as_f64).unwrap_or(0.0) as i64;
        let _ = writeln!(out, "| {} PV 이상 | {}% |", group_digits(min), rate);
    }
    let note = block.text("note_ko");
    if !note.is_empty() {
        let _ = writeln!(out, "\n> {}", note);
    }
    out.push('\n');
    out
}

/// 200000 -> "200,000"
fn group_digits(value: i64) -> String {
    let digits = value.abs().to_string();
    let mut out = String::new();
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    if value < 0 {
        format!("-{}", out)
    } else {
        out
    }
}

fn concerns(args: &Json) -> Result<Outcome, String> {
    let key = normalized(args, "topic", "all");
    let doc = data::faq();
    let topics = doc
        .get("topics")
        .ok_or_else(|| "topics are missing from the bundled data".to_string())?;

    let (label, ids): (&str, Vec<&str>) = match key.as_str() {
        "cost_and_refund" | "cost" | "refund" | "returns" | "money" => {
            ("비용·반품", vec!["cost_and_refund"])
        }
        "legal_compliance" | "legal" | "compliance" | "law" => ("법·규제", vec!["legal_compliance"]),
        "time_and_effort" | "time" | "effort" => ("시간·노력", vec!["time_and_effort"]),
        "all" | "everything" => (
            "전체",
            vec!["cost_and_refund", "legal_compliance", "time_and_effort"],
        ),
        other => {
            return Err(format!(
                "unknown topic '{}'. Valid values: cost_and_refund, legal_compliance, time_and_effort, all",
                other
            ))
        }
    };

    let mut records_json = Vec::new();
    let mut body = String::new();
    for id in &ids {
        if let Some(record) = topics.get(id) {
            records_json.push(record.clone());
            body.push_str(&render_record(record, 2));
            body.push('\n');
        }
    }

    if key == "all" {
        if let Some(flags) = doc.get("red_flags") {
            body.push_str(&render_record(flags, 2));
            body.push('\n');
        }
        if let Some(verify) = doc.get("verify") {
            body.push_str(&render_record(verify, 2));
            body.push('\n');
        }
    }

    let mut request = Json::obj();
    request.set("topic", Json::str(key));

    let title = format!("비교 판단 — {}", label);
    let intro = "장점과 단점을 같은 비중으로 적었습니다. 위험 신호와 확인 방법이 함께 있으니, 결정 전에 그 항목부터 확인하세요.";
    let text = assemble(&title, intro, &body, &[doc], true);

    Ok(Outcome {
        text,
        data: Json::Arr(records_json),
        request,
    })
}

// ---------------------------------------------------------------- plan_smart_shopping

fn tier_budget(id: &str) -> Option<i64> {
    match id {
        "100k" => Some(100000),
        "200k" => Some(200000),
        "300k" => Some(300000),
        _ => None,
    }
}

/// Monthly budget: an explicit amount wins over the tier, and a missing pair
/// falls back to the lowest tier (100k), so the tool is safe to call with `{}`.
fn plan_budget(args: &Json) -> Result<i64, String> {
    if let Some(value) = args.get("monthly_budget_krw") {
        if !value.is_null() {
            return match value {
                Json::Num(n) => {
                    if !n.is_finite() || *n < 0.0 {
                        Err("monthly_budget_krw must be zero or a positive number".to_string())
                    } else {
                        Ok(n.round() as i64)
                    }
                }
                Json::Str(s) => {
                    let cleaned: String = s
                        .chars()
                        .filter(|c| !matches!(c, ',' | ' ' | '원' | '₩'))
                        .collect();
                    if cleaned.is_empty() || !cleaned.chars().all(|c| c.is_ascii_digit()) {
                        return Err(
                            "monthly_budget_krw must be zero or a positive number".to_string(),
                        );
                    }
                    cleaned.parse::<i64>().map_err(|_| {
                        "monthly_budget_krw must be zero or a positive number".to_string()
                    })
                }
                _ => Err("monthly_budget_krw must be a number".to_string()),
            };
        }
    }
    let tier = normalized(args, "tier", "100k");
    match tier_budget(&tier) {
        Some(amount) => Ok(amount),
        None => Err(format!(
            "unknown tier '{}'. Valid values: 100k, 200k, 300k",
            tier
        )),
    }
}

/// `categories` accepts an array or a comma-separated string; an empty result
/// means "all four areas".
fn plan_categories(args: &Json) -> Result<Vec<String>, String> {
    let raw = match args.get("categories") {
        Some(value) if !value.is_null() => value,
        _ => return Ok(Vec::new()),
    };
    let mut words: Vec<String> = Vec::new();
    match raw {
        Json::Arr(entries) => {
            for entry in entries {
                match entry.as_str() {
                    Some(text) => words.push(text.to_string()),
                    None => return Err("categories must be an array of strings".to_string()),
                }
            }
        }
        Json::Str(text) => {
            for part in text.split(',') {
                words.push(part.to_string());
            }
        }
        _ => return Err("categories must be an array of strings".to_string()),
    }

    let mut out: Vec<String> = Vec::new();
    let mut all = false;
    for word in words {
        let key = word.trim().to_lowercase().replace([' ', '-'], "_");
        if key.is_empty() {
            continue;
        }
        let canonical = match key.as_str() {
            "all" | "everything" | "any" => {
                all = true;
                continue;
            }
            "nutrition" | "health" | "supplement" | "supplements" | "vitamin" | "vitamins" => {
                "nutrition"
            }
            "home_living" | "home" | "living" | "household" | "detergent" | "cleaning" => {
                "home_living"
            }
            "personal_care" | "personalcare" | "oral" | "oral_care" | "toothpaste"
            | "toothbrush" => "personal_care",
            "beauty" | "skincare" | "skin" | "cosmetics" | "makeup" => "beauty",
            other => {
                return Err(format!(
                    "unknown category '{}'. Valid values: nutrition, home_living, personal_care, beauty, all",
                    other
                ))
            }
        };
        if !out.iter().any(|known| known == canonical) {
            out.push(canonical.to_string());
        }
    }
    if all {
        return Ok(Vec::new());
    }
    Ok(out)
}

fn find_band<'a>(bands: &'a [Json], amount: i64) -> Option<&'a Json> {
    bands.iter().find(|band| {
        let min = band.get("min_krw").and_then(Json::as_f64).unwrap_or(0.0) as i64;
        let max = band.get("max_krw").and_then(Json::as_f64).unwrap_or(0.0) as i64;
        amount >= min && (max == 0 || amount < max)
    })
}

fn band_field(band: &Json, key: &str) -> i64 {
    band.get(key).and_then(Json::as_f64).unwrap_or(0.0) as i64
}

fn item_price(item: &Json) -> i64 {
    item.get("price_krw").and_then(Json::as_f64).unwrap_or(0.0) as i64
}

fn item_matches(item: &Json, categories: &[String]) -> bool {
    if categories.is_empty() {
        return true;
    }
    item.get("categories")
        .and_then(Json::as_arr)
        .map(|list| {
            list.iter().any(|tag| {
                tag.as_str()
                    .map(|value| categories.iter().any(|known| known == value))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(true)
}

fn won(value: i64) -> String {
    format!("{}원", group_digits(value))
}

/// "11.5%" from permille 115.
fn percent_text(permille: i64) -> String {
    format!("{}.{}%", permille / 10, permille % 10)
}

fn rate_permille(part: i64, whole: i64) -> i64 {
    if whole <= 0 {
        return 0;
    }
    (part * 1000 + whole / 2) / whole
}

fn plan(args: &Json) -> Result<Outcome, String> {
    let doc = data::compensation();
    let block = doc
        .get("smart_shopping")
        .ok_or_else(|| "the smart shopping plan is missing from the bundled data".to_string())?;

    let budget = plan_budget(args)?;
    let categories = plan_categories(args)?;

    let items = block.get("items").and_then(Json::as_arr).unwrap_or(&[]);
    let bands = block.get("bands").and_then(Json::as_arr).unwrap_or(&[]);
    let requested_band = find_band(bands, budget);

    // The cart fills with verified products until the requested band's minimum
    // is met. Below the minimum the tool does not build one at all.
    let mut chosen: Vec<&Json> = Vec::new();
    let mut total = 0i64;
    if budget >= 100000 {
        let target = requested_band
            .map(|band| band_field(band, "min_krw"))
            .unwrap_or(100000);
        for item in items {
            if !item_matches(item, &categories) {
                continue;
            }
            if total >= target {
                break;
            }
            chosen.push(item);
            total += item_price(item);
        }
    }
    let cart_band = find_band(bands, total);

    let m1 = cart_band.map(|band| band_field(band, "monthly_2_5")).unwrap_or(0);
    let m2 = cart_band.map(|band| band_field(band, "monthly_6_11")).unwrap_or(0);
    let m3 = cart_band.map(|band| band_field(band, "monthly_12_24")).unwrap_or(0);

    let mut labels: Vec<String> = Vec::new();
    if !categories.is_empty() {
        if let Some(list) = block.get("categories").and_then(Json::as_arr) {
            for entry in list {
                let id = entry.text("id");
                if categories.iter().any(|known| known == id) {
                    labels.push(entry.text("label_ko").to_string());
                }
            }
        }
    }
    let scope_label = if labels.is_empty() {
        "전체 영역".to_string()
    } else {
        labels.join("·")
    };

    let starter = block.get("starter");
    let starter_items: Vec<&Json> = starter
        .and_then(|node| node.get("items"))
        .and_then(Json::as_arr)
        .unwrap_or(&[])
        .iter()
        .filter(|item| item_matches(item, &categories))
        .collect();

    let strategies: Vec<&Json> = block
        .get("strategies")
        .and_then(Json::as_arr)
        .unwrap_or(&[])
        .iter()
        .filter(|strategy| item_matches(strategy, &categories))
        .collect();

    let mut body = String::new();

    if let Some(starter) = starter {
        if !starter_items.is_empty() {
            let _ = writeln!(body, "## {}\n", starter.text("heading_ko"));
            let summary = starter.text("summary_ko");
            if !summary.is_empty() {
                let _ = writeln!(body, "{}\n", summary);
            }
            let _ = writeln!(body, "| 품목 | 구성 | 표시가 | 비고 |");
            let _ = writeln!(body, "| --- | --- | --- | --- |");
            for item in &starter_items {
                let _ = writeln!(
                    body,
                    "| {} | {} | {} | {} |",
                    item.text("name_ko"),
                    item.text("spec_ko"),
                    won(item_price(item)),
                    item.text("note_ko")
                );
            }
            body.push('\n');
            if let Some(bullets) = starter.get("bullets").and_then(Json::as_arr) {
                for bullet in bullets {
                    if !item_matches(bullet, &categories) {
                        continue;
                    }
                    let _ = writeln!(body, "- {}", bullet.text("text_ko"));
                }
            }
            let note = starter.text("note_ko");
            if !note.is_empty() {
                let _ = writeln!(body, "\n> {}", note);
            }
            body.push('\n');
        }
    }

    if !strategies.is_empty() {
        let _ = writeln!(body, "## 카테고리별 전략 ({}가지)\n", strategies.len());
        for strategy in &strategies {
            let _ = writeln!(body, "### {}\n", strategy.text("title_ko"));
            let summary = strategy.text("summary_ko");
            if !summary.is_empty() {
                let _ = writeln!(body, "{}\n", summary);
            }
            for bullet in strategy.strings("bullets_ko") {
                let _ = writeln!(body, "- {}", bullet);
            }
            let note = strategy.text("note_ko");
            if !note.is_empty() {
                let _ = writeln!(body, "\n> {}", note);
            }
            body.push('\n');
        }
    }

    if budget < 100000 {
        let _ = writeln!(body, "## 1단계 — 이 예산으로는 장스오가 성립하지 않는다\n");
        let _ = writeln!(
            body,
            "- 요청 예산 {}은 장스오 최소 주문 금액 100,000원보다 적다. 이 금액으로는 A Cliks Money가 쌓이지 않는다.",
            won(budget)
        );
        let _ = writeln!(body, "- 매달 쓰는 품목이 100,000원을 넘길 때 다시 계산한다. 그때까지는 0단계의 1~3만 원대 단품으로 품질만 확인하는 편이 낫다.\n");
    } else {
        let _ = writeln!(
            body,
            "## 1단계 — 이미 쓰는 지출을 대체하는 예시 장바구니 · {}\n",
            scope_label
        );
        if !chosen.is_empty() {
            let _ = writeln!(body, "| 품목 | 구성 | 표시가 | 1일 단가 |");
            let _ = writeln!(body, "| --- | --- | --- | --- |");
            for item in &chosen {
                let _ = writeln!(
                    body,
                    "| {} | {} | {} | {} |",
                    item.text("name_ko"),
                    item.text("spec_ko"),
                    won(item_price(item)),
                    item.text("unit_ko")
                );
            }
            body.push('\n');
        }
        if total >= 100000 {
            let _ = writeln!(
                body,
                "- 합계: {} — 장스오 최소 주문 금액 100,000원 충족.",
                won(total)
            );
        } else {
            let _ = writeln!(
                body,
                "- 합계: {} — 최소 주문 금액 100,000원에 {} 부족하다. 이 조합만으로는 적립이 없다.",
                won(total),
                won(100000 - total)
            );
            let mut top_up: Option<&Json> = None;
            for item in items {
                let already = chosen.iter().any(|picked| {
                    picked.text("name_ko") == item.text("name_ko")
                        && picked.text("spec_ko") == item.text("spec_ko")
                });
                if already {
                    continue;
                }
                if total + item_price(item) >= 100000 {
                    top_up = Some(item);
                    break;
                }
            }
            match top_up {
                Some(item) => {
                    let _ = writeln!(
                        body,
                        "- 최소 금액을 채우려면 이미 쓰는 품목을 더 담아야 한다. 예: {}({})을 더하면 {}이 되어 10만 원대 적립(2~5회차 월 5,000원)이 시작된다.",
                        item.text("name_ko"),
                        won(item_price(item)),
                        won(total + item_price(item))
                    );
                }
                None => {
                    let _ = writeln!(
                        body,
                        "- 최소 금액 {}을 채울 품목이 검증된 목록에 없다. 마트에서 사던 품목의 금액을 기준으로 다시 계산한다.",
                        won(100000 - total)
                    );
                }
            }
        }
        if let (Some(cart_band), Some(requested_band)) = (cart_band, requested_band) {
            if cart_band.text("id") != requested_band.text("id") {
                let _ = writeln!(
                    body,
                    "- 예시 조합 합계 {}은 {} 구간이라 월 {}이 적용된다(요청 예산 {} = {}).",
                    won(total),
                    cart_band.text("label_ko"),
                    won(m1),
                    won(budget),
                    requested_band.text("label_ko")
                );
            }
        }
        let diff = budget - total;
        if diff >= 0 {
            let _ = writeln!(
                body,
                "- 예산 {} 중 {}은 이 조합에 억지로 더하지 않는다. 이미 쓰는 다른 품목이 있으면 그 품목으로 채운다.",
                won(budget),
                won(diff)
            );
        } else {
            let _ = writeln!(
                body,
                "- 예시 조합은 요청 예산보다 {} 많다. 더 싼 구성으로 바꾸거나 1개를 빼서 맞춘다.",
                won(-diff)
            );
        }
        let _ = writeln!(body, "- 이 표는 '이미 사고 있는 품목'을 전제로 한 예시다. 처음 보는 제품은 담지 않는다.");
        let _ = writeln!(
            body,
            "\n> 각 품목 가격은 2026-11-25 공식몰 표시가다. 신청 전 이번 달 가격을 확인한다.\n"
        );

        match cart_band {
            Some(band) => {
                let year1 = 4 * m1 + 6 * m2 + m3;
                let paid1 = 12 * total;
                let year2 = 4 * m1 + 6 * m2 + 13 * m3;
                let paid2 = 24 * total;
                let rate2 = rate_permille(year2, paid2);

                let _ = writeln!(
                    body,
                    "## 2단계 — 장스오 적립 시뮬레이션 (월 {} · {})\n",
                    won(total),
                    band.text("label_ko")
                );
                let _ = writeln!(body, "| 구간 | 월 적립액 | 회차 | 누적 |");
                let _ = writeln!(body, "| --- | --- | --- | --- |");
                let _ = writeln!(body, "| 1회차 | 0원 | 1회 | 0원 (적립 제외) |");
                let _ = writeln!(body, "| 2~5회차 | {} | 4회 | {} |", won(m1), won(4 * m1));
                let _ = writeln!(body, "| 6~11회차 | {} | 6회 | {} |", won(m2), won(6 * m2));
                let _ = writeln!(body, "| 12~24회차 | {} | 13회 | {} |", won(m3), won(13 * m3));
                body.push('\n');
                let _ = writeln!(
                    body,
                    "- 12개월(12회 결제·11회 적립): {} — 결제 {}의 {}",
                    won(year1),
                    won(paid1),
                    percent_text(rate_permille(year1, paid1))
                );
                let _ = writeln!(
                    body,
                    "- 24개월(24회 결제·23회 적립): {} — 결제 {}의 {}",
                    won(year2),
                    won(paid2),
                    percent_text(rate2)
                );
                let _ = writeln!(
                    body,
                    "- 5회차에서 그치면 4회 × {} = {}뿐이다. 해지 후 다시 신청하면 1회차부터 시작한다.",
                    won(m1),
                    won(4 * m1)
                );
                let _ = writeln!(body, "- A Cliks Money는 6개월 안에 써야 하고 1회 주문에 50,000원까지만 쓸 수 있다. 현금으로 출금되지 않는다.\n");

                let _ = writeln!(body, "## 3단계 — 대체가 아니면 손해다\n");
                let _ = writeln!(
                    body,
                    "- 위 계산은 '이미 매달 {}을 쓰고 있다'는 전제에서만 이득이다. 쓰지 않던 물건으로 금액을 채우면 24개월에 {}을 더 쓰고 {}을 돌려받는 셈이다.",
                    won(total),
                    won(paid2),
                    won(year2)
                );
                let _ = writeln!(
                    body,
                    "- 돌려받지 못하는 {}는 새 지출이다. 적립이 목적이 되면 그 순간 손실이다.",
                    percent_text(1000 - rate2)
                );
                let _ = writeln!(body, "- 순서는 항상 ① 지금 쓰는 품목 확인 → ② 1일 단가 비교 → ③ 장스오 조건 확인이다. 순서를 바꾸면 적립이 이유가 아니라 목적이 된다.\n");
            }
            None => {
                let _ = writeln!(body, "## 2단계 — 장스오 적립 시뮬레이션\n");
                let _ = writeln!(
                    body,
                    "- 최소 주문 금액 미달이라 A Cliks Money는 0원이다. 월 주문이 100,000원을 넘기면 10만 원대 기준으로 2~5회차 월 5,000원부터 쌓인다.\n"
                );
            }
        }
    }

    if let Some(checklist) = block.get("checklist").and_then(Json::as_arr) {
        let _ = writeln!(body, "## 합리적 소비 체크리스트 (에이전트용)\n");
        for (index, entry) in checklist.iter().enumerate() {
            let _ = writeln!(
                body,
                "{}. **{}** — {}",
                index + 1,
                entry.text("title_ko"),
                entry.text("detail_ko")
            );
        }
        body.push('\n');
    }

    if let Some(not_worth) = block.get("not_worth_it") {
        let _ = writeln!(body, "## {}\n", not_worth.text("heading_ko"));
        for bullet in not_worth.strings("bullets_ko") {
            let _ = writeln!(body, "- {}", bullet);
        }
        body.push('\n');
    }

    if let Some(next) = block.get("next_step") {
        let _ = writeln!(body, "## {}\n", next.text("heading_ko"));
        for bullet in next.strings("bullets_ko") {
            let _ = writeln!(body, "- {}", bullet);
        }
        if let Some(points) = next.get("checkpoints").and_then(Json::as_arr) {
            if !points.is_empty() {
                let _ = writeln!(body, "\n**공식 확인**");
                for point in points {
                    let _ = writeln!(
                        body,
                        "- [{}]({})",
                        point.text("label_ko"),
                        point.text("url")
                    );
                }
            }
        }
        let note = next.text("note_ko");
        if !note.is_empty() {
            let _ = writeln!(body, "\n> {}", note);
        }
        body.push('\n');
    }

    if let Some(sections) = block.get("sections").and_then(Json::as_arr) {
        for section in sections {
            let heading = section.text("heading_ko");
            if !heading.is_empty() {
                let _ = writeln!(body, "## {}\n", heading);
            }
            for bullet in section.strings("bullets_ko") {
                let _ = writeln!(body, "- {}", bullet);
            }
            body.push('\n');
        }
    }

    let title = format!("합리적 소비 전환 플랜 — 월 {}", won(budget));
    let intro = block.text("intro_ko");
    let text = assemble(&title, intro, &body, &[doc], true);

    let mut cart = Json::obj();
    cart.set("total_krw", Json::int(total));
    cart.set(
        "items",
        Json::Arr(chosen.iter().map(|item| (*item).clone()).collect()),
    );

    let year1 = 4 * m1 + 6 * m2 + m3;
    let year2 = 4 * m1 + 6 * m2 + 13 * m3;
    let mut simulation = Json::obj();
    simulation.set("band", cart_band.cloned().unwrap_or(Json::Null));
    simulation.set("monthly_2_5_krw", Json::int(m1));
    simulation.set("monthly_6_11_krw", Json::int(m2));
    simulation.set("monthly_12_24_krw", Json::int(m3));
    simulation.set("year1_krw", Json::int(year1));
    simulation.set("year1_paid_krw", Json::int(12 * total));
    simulation.set("year1_rate_permille", Json::int(rate_permille(year1, 12 * total)));
    simulation.set("year2_krw", Json::int(year2));
    simulation.set("year2_paid_krw", Json::int(24 * total));
    simulation.set("year2_rate_permille", Json::int(rate_permille(year2, 24 * total)));
    simulation.set("cut_at_5_krw", Json::int(4 * m1));

    let mut starter_payload = Json::obj();
    starter_payload.set(
        "items",
        Json::Arr(starter_items.iter().map(|item| (*item).clone()).collect()),
    );

    let mut payload = Json::obj();
    payload.set("monthly_budget_krw", Json::int(budget));
    payload.set("categories", Json::str_arr(&categories));
    payload.set(
        "requested_band",
        requested_band.cloned().unwrap_or(Json::Null),
    );
    payload.set("cart", cart);
    payload.set("simulation", simulation);
    payload.set("starter", starter_payload);
    payload.set(
        "strategies",
        Json::Arr(strategies.iter().map(|strategy| (*strategy).clone()).collect()),
    );
    payload.set(
        "checklist",
        block.get("checklist").cloned().unwrap_or(Json::Null),
    );
    payload.set(
        "not_worth_it",
        block.get("not_worth_it").cloned().unwrap_or(Json::Null),
    );
    payload.set(
        "next_step",
        block.get("next_step").cloned().unwrap_or(Json::Null),
    );
    payload.set("limits", block.get("sections").cloned().unwrap_or(Json::Null));

    let mut request = Json::obj();
    request.set("monthly_budget_krw", Json::int(budget));
    request.set(
        "requested_band",
        Json::str(requested_band.map(|band| band.text("id")).unwrap_or("")),
    );
    request.set("categories", Json::str_arr(&categories));
    request.set("cart_total_krw", Json::int(total));
    request.set(
        "cart_band",
        Json::str(cart_band.map(|band| band.text("id")).unwrap_or("")),
    );
    request.set("monthly_accrual_krw", Json::int(m1));

    Ok(Outcome {
        text,
        data: payload,
        request,
    })
}

fn join(args: &Json) -> Result<Outcome, String> {
    let key = normalized(args, "member_type", "abo");
    let id = match key.as_str() {
        "consumer" | "member" | "customer" => "consumer",
        "abo" | "business_owner" | "owner" | "seller" | "distributor" | "business" => "abo",
        other => {
            return Err(format!(
                "unknown member_type '{}'. Valid values: consumer, abo",
                other
            ))
        }
    };

    let doc = data::compensation();
    let guide = doc
        .get("join_guide")
        .ok_or_else(|| "join guide is missing from the bundled data".to_string())?;
    let sponsor = guide.get("sponsor");
    let record = guide
        .get(id)
        .ok_or_else(|| format!("join guide for '{}' is missing", id))?;

    let sponsor_number = sponsor.map(|s| s.text("abo_number")).unwrap_or("");
    let sponsor_notice = sponsor.map(|s| s.text("notice_ko")).unwrap_or("");

    let mut body = String::new();
    if !sponsor_number.is_empty() {
        let _ = writeln!(body, "## 후원자(추천인) 번호: {}\n", sponsor_number);
        if !sponsor_notice.is_empty() {
            let _ = writeln!(body, "> {}\n", sponsor_notice);
        }
    }
    if let Some(flow) = guide.get("official_flow") {
        body.push_str(&render_flow(flow));
    }
    body.push_str(&render_record(record, 2));
    // What changes after approval: the owner's own number and the relay rules.
    if let Some(after_join) = guide.get("after_join") {
        body.push_str(&render_record(after_join, 2));
    }

    let ethics = doc.get("ethics");
    if let Some(ethics) = ethics {
        body.push_str(&render_record(ethics, 2));
    }

    let mut request = Json::obj();
    request.set("member_type", Json::str(id));
    request.set("sponsor_number", Json::str(sponsor_number));

    let mut payload = Json::obj();
    payload.set("member_type", Json::str(id));
    payload.set(
        "sponsor",
        sponsor.cloned().unwrap_or(Json::Null),
    );
    payload.set("guide", record.clone());
    payload.set(
        "after_join",
        guide.get("after_join").cloned().unwrap_or(Json::Null),
    );
    payload.set(
        "official_flow",
        guide.get("official_flow").cloned().unwrap_or(Json::Null),
    );
    payload.set("ethics", ethics.cloned().unwrap_or(Json::Null));

    let title = format!("가입 절차 — {}", record.text("title_ko"));
    let intro = "가입은 본인이 결정할 일입니다. 아래 절차대로 직접 신청할 수 있고, 가입 전에 후원자 번호가 무엇을 의미하는지 확인해야 합니다.";
    let text = assemble(&title, intro, &body, &[doc], false);

    Ok(Outcome {
        text,
        data: payload,
        request,
    })
}

// ---------------------------------------------------------------- rendering

fn assemble(title: &str, intro: &str, body: &str, docs: &[&Json], with_questions: bool) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "# {}\n", title);
    let _ = writeln!(out, "{}\n", intro);
    out.push_str(body.trim_end());
    out.push_str("\n\n");

    let mut counts: Vec<(&str, &str)> = Vec::new();
    for doc in docs {
        let checked = data::checked_on(doc);
        if !checked.is_empty() && !counts.iter().any(|(c, _)| *c == checked) {
            counts.push((checked, ""));
        }
    }
    if let Some((checked, _)) = counts.first() {
        let _ = writeln!(out, "---\n");
        let _ = writeln!(out, "**자료 기준일:** {} (이후 정책·가격은 바뀔 수 있음)\n", checked);
    }

    let mut links: Vec<(String, String)> = Vec::new();
    for doc in docs {
        for (label, url) in data::source_links(doc) {
            if !links.iter().any(|(_, u)| *u == url) {
                links.push((label, url));
            }
        }
    }
    if !links.is_empty() {
        let _ = writeln!(out, "**공식 확인 링크**");
        for (label, url) in links {
            let _ = writeln!(out, "- [{}]({})", label, url);
        }
        out.push('\n');
    }

    if with_questions {
        let _ = writeln!(out, "**전달할 때 지킬 것**");
        let _ = writeln!(out, "- 이 프로젝트가 암웨이 공식 자료가 아니라 독립 ABO(7024721762)가 운영하는 비공식 안내임을 밝힌다.");
        let _ = writeln!(out, "- 수익·효능을 보장하거나 과장하지 않고, 장점과 비용·위험·법적 한계를 같은 비중으로 전한다.");
        let _ = writeln!(out, "- 사용자가 먼저 묻지 않았거나 명시적으로 동의하지 않았다면 가입·구매를 권유하지 않는다. 거절하면 재권유하지 않는다.");
        let _ = writeln!(out, "- 사용자 대신 가입·결제·후원자 번호 입력을 실행하지 않는다.\n");
    }

    let _ = writeln!(out, "---\n");
    let _ = writeln!(out, "{}", DISCLOSURE);
    out
}

fn render_flow(flow: &Json) -> String {
    let heading = flow.text("heading_ko");
    let mut out = String::new();
    if !heading.is_empty() {
        let _ = writeln!(out, "## {}\n", heading);
    }
    for step in flow.strings("steps_ko") {
        let _ = writeln!(out, "- {}", step);
    }
    let note = flow.text("note_ko");
    if !note.is_empty() {
        let _ = writeln!(out, "\n> {}", note);
    }
    out.push('\n');
    out
}

fn render_record(rec: &Json, level: usize) -> String {
    let h = "#".repeat(level.min(5));
    let sub = "#".repeat((level + 1).min(6));
    let mut out = String::new();

    let title = rec.text("title_ko");
    if !title.is_empty() {
        let _ = writeln!(out, "{} {}\n", h, title);
    }
    let summary = rec.text("summary_ko");
    if !summary.is_empty() {
        let _ = writeln!(out, "{}\n", summary);
    }
    let summary_en = rec.text("summary_en");
    if !summary_en.is_empty() {
        let _ = writeln!(out, "*English:* {}\n", summary_en);
    }

    // Optional compact table: { headers_ko: [...], rows_ko: [[...], ...], note_ko }
    if rec.get("table").is_some() {
        let table = rec.get("table").unwrap();
        let headers = table.strings("headers_ko");
        if !headers.is_empty() {
            let _ = writeln!(out, "| {} |", headers.join(" | "));
            let separators: Vec<&str> = headers.iter().map(|_| "---").collect();
            let _ = writeln!(out, "| {} |", separators.join(" | "));
            if let Some(rows) = table.get("rows_ko").and_then(Json::as_arr) {
                for row in rows {
                    let cells: Vec<String> = row
                        .as_arr()
                        .map(|cells| {
                            cells
                                .iter()
                                .map(|cell| cell.as_str().unwrap_or("").to_string())
                                .collect()
                        })
                        .unwrap_or_default();
                    let _ = writeln!(out, "| {} |", cells.join(" | "));
                }
            }
            let note = table.text("note_ko");
            if !note.is_empty() {
                let _ = writeln!(out, "\n> {}", note);
            }
            out.push('\n');
        }
    }

    if let Some(sections) = rec.get("sections").and_then(Json::as_arr) {
        for section in sections {
            let heading = section.text("heading_ko");
            if !heading.is_empty() {
                let _ = writeln!(out, "{} {}", sub, heading);
            }
            for bullet in section.strings("bullets_ko") {
                let _ = writeln!(out, "- {}", bullet);
            }
            let note = section.text("note_ko");
            if !note.is_empty() {
                let _ = writeln!(out, "\n> {}", note);
            }
            out.push('\n');
        }
    }

    let questions = rec.strings("questions_ko");
    if !questions.is_empty() {
        let _ = writeln!(out, "{} 스스로 확인할 질문", sub);
        for q in questions {
            let _ = writeln!(out, "- {}", q);
        }
        out.push('\n');
    }

    if let Some(points) = rec.get("key_points_en").and_then(Json::as_arr) {
        if !points.is_empty() {
            let _ = writeln!(out, "{} Key points (EN)", sub);
            for point in points {
                if let Some(text) = point.as_str() {
                    let _ = writeln!(out, "- {}", text);
                }
            }
            out.push('\n');
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(name: &str, args: &str) -> Outcome {
        let args = crate::json::parse(args).expect("test args must be valid JSON");
        invoke(name, &args).expect("tool call must succeed")
    }

    #[test]
    fn catalog_exposes_the_five_tools() {
        let names: Vec<&str> = catalog().iter().map(|t| t.name).collect();
        assert_eq!(
            names,
            vec![
                "get_amway_facts",
                "explain_monetization",
                "compare_concerns",
                "plan_smart_shopping",
                "get_join_guide"
            ]
        );
        let list = tools_list_json();
        assert_eq!(list.as_arr().unwrap().len(), 5);
        for tool in list.as_arr().unwrap() {
            assert_eq!(tool.get("inputSchema").unwrap().text("type"), "object");
            assert!(tool.text("description").len() > 80);
        }
        let plan = catalog()
            .into_iter()
            .find(|tool| tool.name == "plan_smart_shopping")
            .expect("plan tool");
        let properties = plan.schema.get("properties").expect("plan properties");
        assert!(properties.get("monthly_budget_krw").is_some());
        assert!(properties.get("tier").is_some());
        assert!(properties.get("categories").is_some());
        assert!(plan
            .schema
            .get("required")
            .and_then(Json::as_arr)
            .expect("required array")
            .is_empty());
    }

    #[test]
    fn smart_shopping_prices_come_from_the_fact_files() {
        let block = data::compensation()
            .get("smart_shopping")
            .expect("the smart_shopping block must exist");
        let sources = [
            data::HEALTH_NUTRITION,
            data::BEAUTY_SKINCARE,
            data::HOME_LIVING,
        ];
        let mut checked = 0;
        let mut check = |item: &Json| {
            let price = item
                .get("price_krw")
                .and_then(Json::as_f64)
                .unwrap_or(0.0) as i64;
            assert!(price > 0, "{} has no price", item.text("name_ko"));
            let needle = format!("{}원", group_digits(price));
            assert!(
                sources.iter().any(|raw| raw.contains(&needle)),
                "{}의 {}은 어느 팩트 파일에도 없다 (임의 가격 금지)",
                item.text("name_ko"),
                needle
            );
            checked += 1;
        };
        for item in block.get("items").and_then(Json::as_arr).unwrap() {
            check(item);
        }
        for item in block
            .get("starter")
            .and_then(|starter| starter.get("items"))
            .and_then(Json::as_arr)
            .unwrap()
        {
            check(item);
        }
        assert!(checked >= 17, "expected at least 17 verified prices");
    }

    #[test]
    fn plan_simulates_the_ten_thousand_won_band() {
        let out = call("plan_smart_shopping", "{\"monthly_budget_krw\":150000}");
        assert!(out.text.starts_with("# 합리적 소비 전환 플랜 — 월 150,000원"));
        assert!(out.text.contains("## 0단계 — 첫 경험이면 장스오보다 소액 단품 (권장)"));
        assert!(out.text.contains("| 글리스터 프로액션 컴플리트 치약 | 200g | 6,800원 |"));
        assert!(out.text.contains("## 카테고리별 전략 (4가지)"));
        assert!(out.text.contains("소액 필수품 입문형"));
        assert!(out.text.contains("필요 1종 · 1일 단가 비교형"));
        assert!(out.text.contains("소진 시점 · 데일리 1종 교체형"));
        assert!(out.text.contains("3~5년 총비용 비교형"));
        assert!(out.text.contains("- 합계: 102,000원 — 장스오 최소 주문 금액 100,000원 충족."));
        assert!(out.text.contains("| 2~5회차 | 5,000원 | 4회 | 20,000원 |"));
        assert!(out.text.contains("- 12개월(12회 결제·11회 적립): 95,000원 — 결제 1,224,000원의 7.8%"));
        assert!(out.text.contains("- 24개월(24회 결제·23회 적립): 275,000원 — 결제 2,448,000원의 11.2%"));
        assert!(out.text.contains("## 합리적 소비 체크리스트 (에이전트용)"));
        assert!(out.text.contains("지금 안 쓰는 제품은 담지 않는다"));
        assert!(out.text.contains("1588-0080"));
        assert!(out.text.contains("고지:"));
    }

    #[test]
    fn plan_bands_tiers_and_similar() {
        let out = call("plan_smart_shopping", "{\"tier\":\"200k\"}");
        assert!(out.text.starts_with("# 합리적 소비 전환 플랜 — 월 200,000원"));
        assert!(out.text.contains("- 합계: 230,000원 — 장스오 최소 주문 금액 100,000원 충족."));
        assert!(out.text.contains("| 12~24회차 | 30,000원 | 13회 | 390,000원 |"));
        let out = call("plan_smart_shopping", "{\"tier\":\"300k\"}");
        assert!(out.text.contains("- 합계: 321,000원 — 장스오 최소 주문 금액 100,000원 충족."));
        assert!(out.text.contains("| 12~24회차 | 45,000원 | 13회 | 585,000원 |"));
        // Defaults work with no arguments at all.
        let out = invoke("plan_smart_shopping", &Json::Null).expect("defaults must work");
        assert!(out.text.starts_with("# 합리적 소비 전환 플랜 — 월 100,000원"));
    }

    #[test]
    fn plan_handles_a_budget_below_the_minimum() {
        let out = call("plan_smart_shopping", "{\"monthly_budget_krw\":50000}");
        assert!(out.text.contains("## 1단계 — 이 예산으로는 장스오가 성립하지 않는다"));
        assert!(out.text.contains("요청 예산 50,000원은 장스오 최소 주문 금액 100,000원보다 적다"));
        assert!(!out.text.contains("## 2단계 — 장스오 적립 시뮬레이션 ("));
    }

    #[test]
    fn plan_filters_categories_and_flags_a_short_cart() {
        let out = call(
            "plan_smart_shopping",
            "{\"monthly_budget_krw\":150000,\"categories\":[\"personal_care\"]}",
        );
        assert!(out.text.contains("예시 장바구니 · 구강·퍼스널케어"));
        assert!(out.text.contains("- 합계: 23,800원 — 최소 주문 금액 100,000원에 76,200원 부족하다."));
        assert!(out.text.contains("최소 금액을 채우려면 이미 쓰는 품목을 더 담아야 한다. 예: 칼맥 디(82,000원)을 더하면 105,800원"));
        assert!(out.text.contains("최소 주문 금액 미달이라 A Cliks Money는 0원이다"));
        // Only strategies that cover this area.
        assert!(out.text.contains("## 카테고리별 전략 (1가지)"));
        assert!(out.text.contains("소액 필수품 입문형"));
        assert!(!out.text.contains("필요 1종 · 1일 단가 비교형"));
    }

    #[test]
    fn plan_flags_a_cart_that_lands_in_a_higher_band() {
        let out = call(
            "plan_smart_shopping",
            "{\"monthly_budget_krw\":100000,\"categories\":[\"beauty\"]}",
        );
        assert!(out.text.contains("- 합계: 206,000원 — 장스오 최소 주문 금액 100,000원 충족."));
        assert!(out.text.contains(
            "- 예시 조합 합계 206,000원은 20만 원대 구간이라 월 10,000원이 적용된다(요청 예산 100,000원 = 10만 원대)."
        ));
        assert!(out.text.contains("| 2~5회차 | 10,000원 | 4회 | 40,000원 |"));
        assert!(out.text.contains("## 카테고리별 전략 (1가지)"));
        assert!(out.text.contains("소진 시점 · 데일리 1종 교체형"));
    }

    #[test]
    fn plan_rejects_unknown_inputs_with_the_valid_list() {
        let err = invoke(
            "plan_smart_shopping",
            &crate::json::parse("{\"tier\":\"500k\"}").unwrap(),
        )
        .unwrap_err();
        assert!(err.contains("100k, 200k, 300k"));
        let err = invoke(
            "plan_smart_shopping",
            &crate::json::parse("{\"categories\":[\"crypto\"]}").unwrap(),
        )
        .unwrap_err();
        assert!(err.contains("nutrition, home_living, personal_care, beauty, all"));
        let err = invoke(
            "plan_smart_shopping",
            &crate::json::parse("{\"monthly_budget_krw\":-5}").unwrap(),
        )
        .unwrap_err();
        assert!(err.contains("positive"));
    }

    #[test]
    fn facts_categories_render() {
        for category in [
            "business",
            "health_nutrition",
            "beauty_skincare",
            "home_living",
            "all",
            "",
        ] {
            let args = format!("{{\"category\":\"{}\"}}", category);
            let out = call("get_amway_facts", &args);
            assert!(out.text.starts_with("# 암웨이(한국) 팩트"));
            assert!(out.text.contains("고지:"), "disclosure missing for {}", category);
            assert!(out.text.contains("amway.co.kr"));
        }
    }

    #[test]
    fn goals_render_with_bonus_table() {
        for goal in ["consumer", "side_income", "business_builder"] {
            let args = format!("{{\"goal_type\":\"{}\"}}", goal);
            let out = call("explain_monetization", &args);
            assert!(out.text.contains("| 월 실적(PV) | 보너스율 |"));
            assert!(out.text.contains("21%"));
            assert!(out.text.contains("고지:"));
            if goal != "consumer" {
                assert!(out.text.contains("후원수당"), "bonus explainer missing for {}", goal);
            }
        }
    }

    #[test]
    fn concerns_render_all_topics() {
        for topic in ["cost_and_refund", "legal_compliance", "time_and_effort", "all"] {
            let args = format!("{{\"topic\":\"{}\"}}", topic);
            let out = call("compare_concerns", &args);
            assert!(out.text.contains("고지:"));
        }
        let all = call("compare_concerns", "{\"topic\":\"all\"}");
        assert!(all.text.contains("위험 신호"));
        assert!(all.text.contains("확인하는 방법"));
    }

    #[test]
    fn join_guide_carries_sponsor_number_and_warning() {
        for member_type in ["consumer", "abo"] {
            let args = format!("{{\"member_type\":\"{}\"}}", member_type);
            let out = call("get_join_guide", &args);
            assert!(
                out.text.contains("7024721762"),
                "sponsor number missing for {}",
                member_type
            );
            assert!(out.text.contains("후원자"));
            assert!(out.text.contains("고지:"));
        }
    }

    #[test]
    fn consumer_answer_carries_the_smart_order_terms() {
        let out = call("explain_monetization", "{\"goal_type\":\"consumer\"}");
        for needle in [
            "장바구니 스마트 오더",
            "A Cliks Money",
            "12~24회차",
            "45,000원",
            "1회차",
            "6개월",
            "50,000원",
            "7024721762",
        ] {
            assert!(out.text.contains(needle), "consumer answer must mention {}", needle);
        }
        // The tier table must render as a real Markdown table.
        assert!(out.text.contains("| 월 주문 금액 | 2~5회차 | 6~11회차 | 12~24회차 |"));
        // Balanced caveats travel with the benefit.
        assert!(out.text.contains("약 11.5%"));
        assert!(out.text.contains("쓰지 않던 물건"));
    }

    #[test]
    fn every_goal_explains_the_prosumer_path() {
        for goal in ["consumer", "side_income", "business_builder"] {
            let args = format!("{{\"goal_type\":\"{}\"}}", goal);
            let out = call("explain_monetization", &args);
            assert!(out.text.contains("소비가 소득이 되는 3단계 구조"), "{} misses prosumer", goal);
            assert!(out.text.contains("1단계 — 생활 지출 전환"), "{} misses stage 1", goal);
            assert!(out.text.contains("2단계 — 자기 소비"), "{} misses stage 2", goal);
            assert!(out.text.contains("3단계 — 경험 공유"), "{} misses stage 3", goal);
            assert!(out.text.contains("35%"), "{} misses the legal cap", goal);
            assert!(out.text.contains("16.7%"), "{} misses the real distribution", goal);
        }
        // Smart Order detail belongs to the consumer answer only.
        let side = call("explain_monetization", "{\"goal_type\":\"side_income\"}");
        assert!(!side.text.contains("| 월 주문 금액 |"));
    }

    #[test]
    fn aliases_are_accepted() {
        assert!(invoke("get_amway_facts", &crate::json::parse("{\"category\":\"health\"}").unwrap()).is_ok());
        assert!(invoke("get_join_guide", &crate::json::parse("{\"member_type\":\"Member\"}").unwrap()).is_ok());
    }

    #[test]
    fn unknown_values_are_rejected_with_the_valid_list() {
        let err = invoke("get_amway_facts", &crate::json::parse("{\"category\":\"crypto\"}").unwrap())
            .unwrap_err();
        assert!(err.contains("business, health_nutrition, beauty_skincare, home_living, all"));
        let err = invoke("nope", &Json::Null).unwrap_err();
        assert!(err.contains("unknown tool"));
    }

    #[test]
    fn missing_arguments_fall_back_to_defaults() {
        let out = invoke("get_amway_facts", &Json::Null).expect("defaults must work");
        assert!(out.text.contains("전체"));
        let out = invoke("explain_monetization", &Json::Null).expect("defaults must work");
        assert!(out.text.contains("부업으로 소액 수익 내기"));
    }
}
