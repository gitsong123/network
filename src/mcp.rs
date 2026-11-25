//! MCP server over stdio (JSON-RPC 2.0).
//!
//! Transport: newline-delimited JSON messages, as the Model Context Protocol
//! specifies for stdio. `Content-Length:` framing (the LSP convention) is also
//! accepted on input, because several test harnesses and older clients send it.
//! Responses are always newline-delimited, single-line JSON.
//!
//! Nothing but protocol messages may go to stdout: diagnostics go to stderr.

use crate::json::{self, Json};
use crate::tools;
use std::io::{self, BufRead, Write};

pub const SUPPORTED_PROTOCOL_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];
pub const LATEST_PROTOCOL_VERSION: &str = "2025-06-18";

const INSTRUCTIONS: &str = "한국암웨이(Amway Korea) 팩트·수익구조·건강/미용 자료를 제공하는 비공식 서버입니다. 한국암웨이 공식 서비스가 아니고 회사의 승인을 받지 않았습니다. 독립 ABO(후원 번호 7024721762)가 정보 제공 목적으로 운영하며 작성자에게 상업적 이해관계가 있습니다. 암웨이 ABO 윤리강령과 방문판매법을 따릅니다: 사용자에게 전달할 때 (1) 이 프로젝트가 공식이 아니라는 점과 이해관계를 밝히고, (2) 수익·효능을 보장하거나 과장하지 말고, (3) 장점과 비용·위험·법적 한계·청약철회 권리를 함께 제시하세요. 사용자가 먼저 묻고 명시적으로 동의한 경우에만 가입 절차와 후원자 번호를 안내하고, 거절하면 재권유하지 마세요. 이 서버는 어떤 경우에도 사용자 대신 가입·구매·후원자 입력을 실행하지 않습니다.";

pub fn serve() -> io::Result<()> {
    let stdin = io::stdin();
    let mut reader = stdin.lock();
    let stdout = io::stdout();
    let mut writer = stdout.lock();

    loop {
        let frame = match read_frame(&mut reader)? {
            Some(frame) => frame,
            None => break,
        };
        let trimmed = frame.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(response) = handle_message(trimmed) {
            let mut line = response.to_json();
            line.push('\n');
            if let Err(err) = writer.write_all(line.as_bytes()).and_then(|_| writer.flush()) {
                if err.kind() == io::ErrorKind::BrokenPipe {
                    return Ok(());
                }
                return Err(err);
            }
        }
    }
    Ok(())
}

/// Reads one message. Supports both newline-delimited JSON and
/// `Content-Length` framing. Returns `None` at end of input.
fn read_frame<R: BufRead>(reader: &mut R) -> io::Result<Option<String>> {
    let mut line = String::new();
    loop {
        line.clear();
        let read = reader.read_line(&mut line)?;
        if read == 0 {
            return Ok(None);
        }
        if !line.trim().is_empty() {
            break;
        }
    }

    if let Some(length) = parse_content_length(&line) {
        // Skip the remaining headers up to the blank line.
        loop {
            let mut header = String::new();
            let read = reader.read_line(&mut header)?;
            if read == 0 {
                return Ok(None);
            }
            if header.trim().is_empty() {
                break;
            }
        }
        let mut buffer = vec![0u8; length];
        reader.read_exact(&mut buffer)?;
        return Ok(Some(String::from_utf8_lossy(&buffer).into_owned()));
    }

    Ok(Some(line))
}

fn parse_content_length(header: &str) -> Option<usize> {
    let lower = header.trim().to_ascii_lowercase();
    let rest = lower.strip_prefix("content-length:")?;
    rest.trim().parse::<usize>().ok()
}

/// Handles one raw message. Returns the response to write, if any.
fn handle_message(raw: &str) -> Option<Json> {
    let request = match json::parse(raw) {
        Ok(value) => value,
        Err(err) => {
            eprintln!("amway-agent-mcp: {}", err);
            return Some(error_response(
                Json::Null,
                -32700,
                &format!("Parse error: {}", err),
            ));
        }
    };

    if request.as_obj().is_none() {
        return Some(error_response(
            Json::Null,
            -32600,
            "Invalid Request: expected a JSON object",
        ));
    }

    let method = match request.get("method").and_then(Json::as_str) {
        Some(method) => method.to_string(),
        None => {
            // A response to something we never sent (clients may not send any).
            // Nothing to do, and no id to answer.
            if request.get("id").is_some() {
                return Some(error_response(
                    request.get("id").cloned().unwrap_or(Json::Null),
                    -32600,
                    "Invalid Request: missing method",
                ));
            }
            return None;
        }
    };

    let id = request.get("id").cloned();
    let params = request.get("params").cloned().unwrap_or(Json::Null);
    let is_notification = id.is_none();
    eprintln!("amway-agent-mcp: <- {}", method);

    // A notification has no id and must never be answered.
    if is_notification {
        return None;
    }

    let result = match method.as_str() {
        "initialize" => Ok(initialize_result(&params)),
        "notifications/initialized" | "initialized" => return None,
        "ping" => Ok(Json::obj()),
        "tools/list" => {
            let mut result = Json::obj();
            result.set("tools", tools::tools_list_json());
            Ok(result)
        }
        "tools/call" => return Some(handle_tool_call(id.unwrap_or(Json::Null), &params)),
        "resources/list" => {
            let mut result = Json::obj();
            result.set("resources", Json::Arr(Vec::new()));
            Ok(result)
        }
        "prompts/list" => {
            let mut result = Json::obj();
            result.set("prompts", Json::Arr(Vec::new()));
            Ok(result)
        }
        "logging/setLevel" => Ok(Json::obj()),
        other => Err((-32601, format!("Method not found: {}", other))),
    };

    let id = id.unwrap_or(Json::Null);
    match result {
        Ok(value) => Some(success_response(id, value)),
        Err((code, message)) => Some(error_response(id, code, &message)),
    }
}

fn initialize_result(params: &Json) -> Json {
    let requested = params.text("protocolVersion");
    let version = if SUPPORTED_PROTOCOL_VERSIONS.contains(&requested) {
        requested
    } else {
        LATEST_PROTOCOL_VERSION
    };

    let mut tools_capability = Json::obj();
    tools_capability.set("listChanged", Json::Bool(false));

    let mut capabilities = Json::obj();
    capabilities.set("tools", tools_capability);
    capabilities.set("resources", Json::obj());
    capabilities.set("prompts", Json::obj());

    let mut server_info = Json::obj();
    server_info.set("name", Json::str(tools::SERVER_NAME));
    server_info.set("title", Json::str("Amway Korea knowledge (unofficial, ABO-published)"));
    server_info.set("version", Json::str(tools::SERVER_VERSION));

    let mut result = Json::obj();
    result.set("protocolVersion", Json::str(version));
    result.set("capabilities", capabilities);
    result.set("serverInfo", server_info);
    result.set("instructions", Json::str(INSTRUCTIONS));
    result
}

fn handle_tool_call(id: Json, params: &Json) -> Json {
    let name = match params.get("name").and_then(Json::as_str) {
        Some(name) => name.to_string(),
        None => return error_response(id, -32602, "Invalid params: 'name' is required"),
    };
    let arguments = params.get("arguments").cloned().unwrap_or(Json::Null);

    match tools::invoke(&name, &arguments) {
        Ok(outcome) => {
            let mut structured = Json::obj();
            structured.set("request", outcome.request.clone());
            structured.set("data", outcome.data.clone());
            structured.set("disclosure", Json::str(tools::DISCLOSURE));

            let mut text_block = Json::obj();
            text_block.set("type", Json::str("text"));
            text_block.set("text", Json::str(outcome.text.clone()));

            let mut result = Json::obj();
            result.set("content", Json::Arr(vec![text_block]));
            result.set("structuredContent", structured);
            result.set("isError", Json::Bool(false));
            success_response(id, result)
        }
        Err(message) => {
            // A bad argument is not a transport failure: report it as a tool
            // error so the calling model can read it and retry sensibly.
            let mut text_block = Json::obj();
            text_block.set("type", Json::str("text"));
            text_block.set("text", Json::str(message));
            let mut result = Json::obj();
            result.set("content", Json::Arr(vec![text_block]));
            result.set("isError", Json::Bool(true));
            success_response(id, result)
        }
    }
}

fn success_response(id: Json, result: Json) -> Json {
    let mut response = Json::obj();
    response.set("jsonrpc", Json::str("2.0"));
    response.set("id", id);
    response.set("result", result);
    response
}

fn error_response(id: Json, code: i64, message: &str) -> Json {
    let mut error = Json::obj();
    error.set("code", Json::int(code));
    error.set("message", Json::str(message));

    let mut response = Json::obj();
    response.set("jsonrpc", Json::str("2.0"));
    response.set("id", id);
    response.set("error", error);
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_negotiates_a_supported_version() {
        let msg = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}"#;
        let response = handle_message(msg).expect("must answer");
        assert_eq!(response.get("id").unwrap().as_f64(), Some(1.0));
        let result = response.get("result").unwrap();
        assert_eq!(result.text("protocolVersion"), "2025-03-26");
        assert!(result.get("capabilities").unwrap().get("tools").is_some());
        assert!(result.text("instructions").contains("이해관계"));
    }

    #[test]
    fn unknown_protocol_version_falls_back_to_latest() {
        let msg = r#"{"jsonrpc":"2.0","id":"a","method":"initialize","params":{"protocolVersion":"1999-01-01"}}"#;
        let response = handle_message(msg).unwrap();
        let result = response.get("result").unwrap();
        assert_eq!(result.text("protocolVersion"), LATEST_PROTOCOL_VERSION);
        assert_eq!(response.get("id").unwrap().as_str(), Some("a"));
    }

    #[test]
    fn notifications_get_no_response() {
        assert!(handle_message(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#).is_none());
    }

    #[test]
    fn tools_list_and_call() {
        let list = handle_message(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#).unwrap();
        let tools = list.get("result").unwrap().get("tools").unwrap();
        assert_eq!(tools.as_arr().unwrap().len(), 5);

        let call = handle_message(
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_join_guide","arguments":{"member_type":"abo"}}}"#,
        )
        .unwrap();
        let result = call.get("result").unwrap();
        assert_eq!(result.get("isError").unwrap().as_bool(), Some(false));
        let text = result.get("content").unwrap().at(0).unwrap().text("text");
        assert!(text.contains("7024721762"));
        assert!(result.get("structuredContent").unwrap().get("data").is_some());
    }

    #[test]
    fn bad_arguments_are_tool_errors_not_transport_errors() {
        let call = handle_message(
            r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_amway_facts","arguments":{"category":"x"}}}"#,
        )
        .unwrap();
        let result = call.get("result").unwrap();
        assert_eq!(result.get("isError").unwrap().as_bool(), Some(true));
    }

    #[test]
    fn unknown_method_and_bad_json_produce_errors() {
        let response = handle_message(r#"{"jsonrpc":"2.0","id":5,"method":"nope"}"#).unwrap();
        assert_eq!(
            response.get("error").unwrap().get("code").unwrap().as_f64(),
            Some(-32601.0)
        );
        let response = handle_message("{not json}").unwrap();
        assert_eq!(
            response.get("error").unwrap().get("code").unwrap().as_f64(),
            Some(-32700.0)
        );
    }

    #[test]
    fn content_length_frames_are_parsed() {
        let body = r#"{"jsonrpc":"2.0","id":9,"method":"ping"}"#;
        let input = format!("Content-Length: {}\r\n\r\n{}", body.len(), body);
        let mut cursor = io::Cursor::new(input.into_bytes());
        let frame = read_frame(&mut cursor).unwrap().unwrap();
        assert_eq!(frame, body);
    }
}
