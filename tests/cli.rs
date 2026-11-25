//! CLI surface: the same knowledge must be readable without an MCP client.

use amway_agent_mcp::json::{self, Json};
use std::process::Command;

fn run(args: &[&str]) -> (i32, String, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_amway-agent-mcp"))
        .args(args)
        .output()
        .expect("the binary must run");
    (
        output.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&output.stdout).into_owned(),
        String::from_utf8_lossy(&output.stderr).into_owned(),
    )
}

fn run_json(args: &[&str]) -> Json {
    let (code, stdout, stderr) = run(args);
    assert_eq!(code, 0, "command {:?} failed: {}", args, stderr);
    json::parse(stdout.trim()).unwrap_or_else(|err| {
        panic!("stdout of {:?} is not JSON ({}): {:?}", args, err, stdout)
    })
}

#[test]
fn facts_returns_structured_json() {
    let value = run_json(&["facts", "business", "--json"]);
    assert_eq!(value.get("request").unwrap().text("category"), "business");
    let data = value.get("data").unwrap().as_arr().expect("data array");
    assert_eq!(data.len(), 1);
    assert_eq!(data[0].text("id"), "business");
    assert!(value.text("text").contains("암웨이(한국) 팩트"));
    assert!(value.text("disclosure").contains("공식 서비스가 아닙니다"));
}

#[test]
fn join_guide_prints_the_sponsor_number_and_the_flow() {
    let (code, stdout, _) = run(&["join", "consumer"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("7024721762"));
    assert!(stdout.contains("https://www.amway.co.kr"));
    assert!(stdout.contains("https://www.amway.co.kr/my-shopping"));
    assert!(stdout.contains("로그인"));
}

#[test]
fn compare_all_mentions_the_refund_window_and_the_legal_cap() {
    let (code, stdout, _) = run(&["compare", "all"]);
    assert_eq!(code, 0);
    assert!(stdout.contains("20일"));
    assert!(stdout.contains("35%"));
    assert!(stdout.contains("공제조합"));
}

#[test]
fn defaults_apply_when_the_argument_is_omitted() {
    let value = run_json(&["monetization", "--json"]);
    assert_eq!(value.get("request").unwrap().text("goal_type"), "side_income");
    assert!(value.text("text").contains("성취 보너스 구간"));
}

#[test]
fn call_subcommand_accepts_raw_json_arguments() {
    let value = run_json(&[
        "call",
        "get_join_guide",
        r#"{"member_type":"abo"}"#,
        "--json",
    ]);
    assert_eq!(value.get("request").unwrap().text("member_type"), "abo");
    assert_eq!(
        value.get("data").unwrap().get("sponsor").unwrap().text("abo_number"),
        "7024721762"
    );
}

#[test]
fn invalid_arguments_exit_non_zero_with_a_hint() {
    let (code, _, stderr) = run(&["facts", "crypto"]);
    assert_eq!(code, 1);
    assert!(stderr.contains("business, health_nutrition, beauty_skincare, home_living, all"));
}

#[test]
fn unknown_command_is_a_usage_error() {
    let (code, _, stderr) = run(&["frobnicate"]);
    assert_eq!(code, 2);
    assert!(stderr.contains("--help") || stderr.contains("unknown command"));
}

#[test]
fn tools_and_version_are_available() {
    let (code, stdout, _) = run(&["--version"]);
    assert_eq!(code, 0);
    assert!(stdout.starts_with("amway-agent-mcp "));

    let (code, stdout, _) = run(&["tools"]);
    assert_eq!(code, 0);
    for name in [
        "get_amway_facts",
        "explain_monetization",
        "compare_concerns",
        "plan_smart_shopping",
        "get_join_guide",
    ] {
        assert!(stdout.contains(name));
    }
}
