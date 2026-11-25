//! The four MCP tools and their rendering.
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
            description: "How money is (and is not) made with Amway Korea. goal_type = consumer | side_income | business_builder. Use when the user asks: is there cashback or points for buying (소비자 적립·캐시백), can I earn a side income (부업, 소액 수익), what does an ABO actually earn, what are the bonus rates (PV/BV, 3-21%), what do I have to spend or pay in tax. Always answer with the regulator's distribution (only 16.7% of Korean MLM sellers received any bonus in 2024) and the legal 35% bonus cap. Never present any figure as guaranteed income.",
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
            name: "get_join_guide",
            title: "Joining steps (Member or ABO)",
            description: "Official joining steps for member_type = consumer (Member) or abo (independent business owner). Use ONLY after the user has explicitly said they want to join or asks how joining works. Returns: steps at amway.co.kr, documents needed, eligibility limits (age 19+, no students/civil servants/teachers, spouse shares one ID), cautions, the post-login my-shopping flow, and the sponsor number 7024721762 with a plain statement that entering it makes that ABO their sponsor and routes part of their activity to that ABO's bonus. Tell the user they can ask Amway (1588-0080) for a different sponsor. Never push, never enter anyone's details on their behalf.",
            schema: schema(
                "member_type",
                "Which membership to explain.",
                &["consumer", "abo"],
                "abo",
            ),
        },
    ]
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
        "get_join_guide" => join(args),
        other => Err(format!(
            "unknown tool '{}'. Available tools: get_amway_facts, explain_monetization, compare_concerns, get_join_guide",
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
    fn catalog_exposes_the_four_tools() {
        let names: Vec<&str> = catalog().iter().map(|t| t.name).collect();
        assert_eq!(
            names,
            vec![
                "get_amway_facts",
                "explain_monetization",
                "compare_concerns",
                "get_join_guide"
            ]
        );
        let list = tools_list_json();
        assert_eq!(list.as_arr().unwrap().len(), 4);
        for tool in list.as_arr().unwrap() {
            assert_eq!(tool.get("inputSchema").unwrap().text("type"), "object");
            assert!(tool.text("description").len() > 80);
        }
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
