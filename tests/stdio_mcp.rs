//! End-to-end test of the real binary over stdio: this is what an MCP client
//! (Claude Desktop, Cursor, an agent runtime) actually does.
//!
//! Spawns `target/.../amway-agent-mcp`, performs initialize → tools/list →
//! tools/call and checks the protocol shape of every answer.

use amway_agent_mcp::json::{self, Json};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

struct Server {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
}

impl Server {
    fn start() -> Server {
        let mut child = Command::new(env!("CARGO_BIN_EXE_amway-agent-mcp"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("the binary must start");
        let stdin = child.stdin.take().expect("stdin must be piped");
        let stdout = BufReader::new(child.stdout.take().expect("stdout must be piped"));
        Server {
            child,
            stdin: Some(stdin),
            stdout,
        }
    }

    fn write_line(&mut self, text: &str) {
        let stdin = self.stdin.as_mut().expect("stdin is still open");
        writeln!(stdin, "{}", text).expect("write to the server");
        stdin.flush().expect("flush");
    }

    fn request(&mut self, text: &str) -> Json {
        self.write_line(text);
        self.read_response()
    }

    fn read_response(&mut self) -> Json {
        let mut line = String::new();
        let read = self.stdout.read_line(&mut line).expect("read from the server");
        assert!(read > 0, "the server closed stdout unexpectedly");
        assert!(
            !line.trim().is_empty(),
            "the server wrote a blank line to stdout"
        );
        json::parse(line.trim())
            .unwrap_or_else(|err| panic!("stdout is not a JSON message ({}): {:?}", err, line))
    }

    /// Closes stdin and returns the exit code.
    fn shutdown(mut self) -> i32 {
        drop(self.stdin.take());
        let status = self.child.wait().expect("the server must exit on EOF");
        status.code().unwrap_or(-1)
    }
}

fn initialize(id: i64) -> String {
    format!(
        r#"{{"jsonrpc":"2.0","id":{},"method":"initialize","params":{{"protocolVersion":"2025-06-18","capabilities":{{}},"clientInfo":{{"name":"integration-test","version":"1.0.0"}}}}}}"#,
        id
    )
}

#[test]
fn full_mcp_handshake_and_tool_calls() {
    let mut server = Server::start();

    // 1. initialize
    let response = server.request(&initialize(1));
    assert_eq!(response.text("jsonrpc"), "2.0");
    assert_eq!(response.get("id").unwrap().as_f64(), Some(1.0));
    let result = response.get("result").expect("initialize must return a result");
    assert_eq!(result.text("protocolVersion"), "2025-06-18");
    assert!(result.get("capabilities").unwrap().get("tools").is_some());
    assert_eq!(
        result.get("serverInfo").unwrap().text("name"),
        "amway-agent-mcp"
    );
    let instructions = result.text("instructions");
    assert!(instructions.contains("비공식"), "instructions must say it is unofficial");
    assert!(instructions.contains("윤리강령"));

    // 2. initialized notification: no answer, so the next read must be tools/list.
    server.write_line(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#);

    // 3. tools/list
    let response = server.request(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#);
    let tools = response
        .get("result")
        .unwrap()
        .get("tools")
        .and_then(Json::as_arr)
        .expect("tools must be an array")
        .to_vec();
    let names: Vec<&str> = tools.iter().map(|t| t.text("name")).collect();
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
    for tool in &tools {
        assert_eq!(tool.get("inputSchema").unwrap().text("type"), "object");
    }

    // 4. tools/call: the join guide must carry the sponsor number, the official
    //    sign-up → my-shopping flow and the ethics rules.
    let call = r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_join_guide","arguments":{"member_type":"abo"}}}"#;
    let response = server.request(call);
    let result = response.get("result").expect("tools/call must return a result");
    assert_eq!(result.get("isError").unwrap().as_bool(), Some(false));
    let text = result.get("content").unwrap().at(0).unwrap().text("text");
    assert!(text.contains("7024721762"), "sponsor number missing");
    assert!(text.contains("https://www.amway.co.kr/my-shopping"));
    assert!(text.contains("공식 서비스가 아닙니다"));
    assert!(text.contains("ABO 윤리강령"));
    let structured = result.get("structuredContent").expect("structuredContent");
    let sponsor = structured
        .get("data")
        .unwrap()
        .get("sponsor")
        .expect("sponsor block");
    assert_eq!(sponsor.text("abo_number"), "7024721762");

    // 5. the other four tools answer with Markdown and structured data.
    for (id, message, marker) in [
        (
            4,
            r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_amway_facts","arguments":{"category":"all"}}}"#,
            "암웨이(한국) 팩트",
        ),
        (
            5,
            r#"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"explain_monetization","arguments":{"goal_type":"side_income"}}}"#,
            "성취 보너스 구간",
        ),
        (
            6,
            r#"{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"compare_concerns","arguments":{"topic":"all"}}}"#,
            "위험 신호",
        ),
        (
            9,
            r#"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"plan_smart_shopping","arguments":{"monthly_budget_krw":150000}}}"#,
            "합리적 소비 전환 플랜",
        ),
    ] {
        let response = server.request(message);
        assert_eq!(response.get("id").unwrap().as_f64(), Some(id as f64));
        let result = response.get("result").unwrap();
        assert_eq!(result.get("isError").unwrap().as_bool(), Some(false));
        let text = result.get("content").unwrap().at(0).unwrap().text("text");
        assert!(text.contains(marker), "missing marker for id {}", id);
        assert!(text.contains("공식 서비스가 아닙니다"));
    }

    // 6. an unknown tool is reported as a tool error, not a transport failure.
    let response = server.request(
        r#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"transfer_money","arguments":{}}}"#,
    );
    assert_eq!(
        response.get("result").unwrap().get("isError").unwrap().as_bool(),
        Some(true)
    );

    // 7. ping, then EOF must end the process cleanly.
    let response = server.request(r#"{"jsonrpc":"2.0","id":8,"method":"ping"}"#);
    assert!(response.get("result").is_some());
    assert_eq!(server.shutdown(), 0, "the server must exit 0 on EOF");
}

#[test]
fn pipelined_requests_are_answered_in_order() {
    let mut server = Server::start();
    server.write_line(&initialize(1));
    server.write_line(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#);
    server.write_line(r#"{"jsonrpc":"2.0","id":3,"method":"ping"}"#);

    let first = server.read_response();
    let second = server.read_response();
    let third = server.read_response();
    assert!(first.get("result").unwrap().text("protocolVersion").len() > 0);
    assert_eq!(second.get("id").unwrap().as_f64(), Some(2.0));
    assert_eq!(third.get("id").unwrap().as_f64(), Some(3.0));
    assert_eq!(server.shutdown(), 0);
}

#[test]
fn malformed_input_gets_a_jsonrpc_error_and_the_session_survives() {
    let mut server = Server::start();
    server.write_line("{ this is not json }");
    let response = server.read_response();
    assert_eq!(
        response.get("error").unwrap().get("code").unwrap().as_f64(),
        Some(-32700.0)
    );

    // The server must still be usable afterwards.
    let response = server.request(&initialize(1));
    assert!(response.get("result").is_some());
    assert_eq!(server.shutdown(), 0);
}
