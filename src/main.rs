//! amway-agent-mcp — Amway Korea facts, monetization structure and
//! health/beauty knowledge for AI agents.
//!
//! Two ways in:
//!   * `amway-agent-mcp` (or `serve`): MCP server speaking JSON-RPC 2.0 on stdio.
//!   * `amway-agent-mcp facts|monetization|compare|join ...`: the same answers as
//!     Markdown on the terminal, no MCP client required.

use amway_agent_mcp::{json, mcp, tools};

use json::Json;
use std::io::Write;
use std::process::ExitCode;

const USAGE: &str = "\
amway-agent-mcp — 한국암웨이 팩트·수익구조·건강/미용 지식 서버 (MCP, stdio)

USAGE:
  amway-agent-mcp                          MCP 서버로 실행 (stdin/stdout JSON-RPC 2.0)
  amway-agent-mcp serve                    위와 동일
  amway-agent-mcp tools [--json]           사용 가능한 도구 4개 목록
  amway-agent-mcp facts [CATEGORY]         팩트 조회
        CATEGORY: business | health_nutrition | beauty_skincare | all (기본 all)
  amway-agent-mcp monetization [GOAL]      수익 구조 설명
        GOAL: consumer | side_income | business_builder (기본 side_income)
  amway-agent-mcp compare [TOPIC]          비용·법·시간 비교
        TOPIC: cost_and_refund | legal_compliance | time_and_effort | all (기본 all)
  amway-agent-mcp join [TYPE]              가입 절차 (후원자 번호 포함)
        TYPE: consumer | abo (기본 abo)
  amway-agent-mcp call <TOOL> [JSON]       도구를 JSON 인자로 직접 호출
  amway-agent-mcp --version | --help

OPTIONS:
  --json        Markdown 대신 구조화된 JSON 출력
  --compact     JSON을 한 줄로 출력
";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(code) => code,
        Err(err) => {
            eprintln!("amway-agent-mcp: {}", err);
            ExitCode::from(2)
        }
    }
}

fn run(argv: &[String]) -> Result<ExitCode, String> {
    let mut json_mode = false;
    let mut compact = false;
    let mut words: Vec<&str> = Vec::new();

    for arg in argv {
        match arg.as_str() {
            "--json" | "-j" => json_mode = true,
            "--compact" => compact = true,
            "--version" | "-V" => {
                println!("{} {}", tools::SERVER_NAME, tools::SERVER_VERSION);
                return Ok(ExitCode::SUCCESS);
            }
            "--help" | "-h" | "help" => {
                print!("{}", USAGE);
                return Ok(ExitCode::SUCCESS);
            }
            other => words.push(other),
        }
    }

    let command = words.first().copied().unwrap_or("serve");
    let rest = &words[words.len().min(1)..];

    match command {
        "serve" | "mcp" | "server" => {
            if let Err(err) = mcp::serve() {
                return Err(format!("stdio transport failed: {}", err));
            }
            Ok(ExitCode::SUCCESS)
        }
        "tools" | "list" => {
            let list = tools::tools_list_json();
            if json_mode {
                print_json(&list, compact);
            } else {
                print_tool_help();
            }
            Ok(ExitCode::SUCCESS)
        }
        "facts" => run_tool(
            "get_amway_facts",
            "category",
            rest.first().copied(),
            json_mode,
            compact,
        ),
        "monetization" | "money" | "income" => run_tool(
            "explain_monetization",
            "goal_type",
            rest.first().copied(),
            json_mode,
            compact,
        ),
        "compare" | "concerns" => run_tool(
            "compare_concerns",
            "topic",
            rest.first().copied(),
            json_mode,
            compact,
        ),
        "join" => run_tool(
            "get_join_guide",
            "member_type",
            rest.first().copied(),
            json_mode,
            compact,
        ),
        "call" => {
            let tool = rest.first().copied().ok_or_else(|| {
                "`call` needs a tool name. Try: amway-agent-mcp call get_join_guide '{\"member_type\":\"abo\"}'".to_string()
            })?;
            let args = match rest.get(1) {
                Some(raw) => json::parse(raw).map_err(|err| format!("arguments are not valid JSON: {}", err))?,
                None => Json::Null,
            };
            dispatch(tool, &args, json_mode, compact)
        }
        other => Err(format!(
            "unknown command '{}'. Run `amway-agent-mcp --help` for usage.",
            other
        )),
    }
}

fn run_tool(
    tool: &str,
    field: &str,
    value: Option<&str>,
    json_mode: bool,
    compact: bool,
) -> Result<ExitCode, String> {
    let mut args = Json::obj();
    if let Some(value) = value {
        args.set(field, Json::str(value));
    }
    dispatch(tool, &args, json_mode, compact)
}

fn dispatch(tool: &str, args: &Json, json_mode: bool, compact: bool) -> Result<ExitCode, String> {
    match tools::invoke(tool, args) {
        Ok(outcome) => {
            if json_mode {
                print_json(&outcome.to_json(), compact);
            } else {
                println!("{}", outcome.text);
            }
            Ok(ExitCode::SUCCESS)
        }
        Err(message) => {
            if json_mode {
                let mut error = Json::obj();
                error.set("error", Json::str(message.clone()));
            print_json(&error, compact);
            }
            eprintln!("amway-agent-mcp: {}", message);
            Ok(ExitCode::from(1))
        }
    }
}

fn print_json(value: &Json, compact: bool) {
    let text = if compact {
        value.to_json()
    } else {
        value.to_json_pretty()
    };
    let stdout = std::io::stdout();
    let mut lock = stdout.lock();
    let _ = writeln!(lock, "{}", text);
}

fn print_tool_help() {
    let mut out = String::new();
    out.push_str("amway-agent-mcp tools — 4 topics\n\n");
    for tool in tools::catalog() {
        out.push_str(&format!("* {}  ({})\n", tool.name, tool.title));
        for line in tool.description.lines() {
            out.push_str(&format!("    {}\n", line));
        }
        out.push('\n');
    }
    out.push_str("CLI 예시:\n");
    out.push_str("    amway-agent-mcp facts business\n");
    out.push_str("    amway-agent-mcp monetization side_income\n");
    out.push_str("    amway-agent-mcp compare all --json\n");
    out.push_str("    amway-agent-mcp join abo\n");
    print!("{}", out);
}
