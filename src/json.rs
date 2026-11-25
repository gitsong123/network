//! A tiny, dependency-free JSON implementation.
//!
//! The server needs to (a) ship editorial data inside the binary, (b) answer
//! JSON-RPC 2.0 requests and (c) print JSON from the CLI. That is a small enough
//! surface that a hand-written parser/serializer is cheaper than a dependency
//! graph: `cargo build` stays offline and the release binary is a single file.
//!
//! Object keys keep insertion order so generated documents stay readable and
//! diffs stay stable.

// A small utility API: some helpers are only exercised from tests and the CLI,
// so unused-item warnings are expected in a plain `cargo build`.
#![allow(dead_code)]

use std::fmt::Write as _;

pub const MAX_DEPTH: usize = 128;

#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    // ---------- constructors ----------
    pub fn obj() -> Json {
        Json::Obj(Vec::new())
    }

    pub fn str<S: Into<String>>(s: S) -> Json {
        Json::Str(s.into())
    }

    pub fn int<I: Into<i64>>(i: I) -> Json {
        Json::Num(i.into() as f64)
    }

    pub fn arr_of(v: Vec<Json>) -> Json {
        Json::Arr(v)
    }

    pub fn str_arr<S: AsRef<str>>(items: &[S]) -> Json {
        Json::Arr(items.iter().map(|s| Json::Str(s.as_ref().to_string())).collect())
    }

    /// Builder-style object insertion; no-op when `self` is not an object.
    pub fn set<K: Into<String>>(&mut self, key: K, value: Json) -> &mut Json {
        let key = key.into();
        if let Json::Obj(entries) = self {
            if let Some(slot) = entries.iter_mut().find(|(k, _)| *k == key) {
                slot.1 = value;
            } else {
                entries.push((key, value));
            }
        }
        self
    }

    // ---------- readers ----------
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Obj(entries) => entries.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    pub fn at(&self, index: usize) -> Option<&Json> {
        match self {
            Json::Arr(items) => items.get(index),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn as_arr(&self) -> Option<&[Json]> {
        match self {
            Json::Arr(items) => Some(items.as_slice()),
            _ => None,
        }
    }

    pub fn as_obj(&self) -> Option<&[(String, Json)]> {
        match self {
            Json::Obj(entries) => Some(entries.as_slice()),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Json::Num(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Json::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn is_null(&self) -> bool {
        matches!(self, Json::Null)
    }

    pub fn type_name(&self) -> &'static str {
        match self {
            Json::Null => "null",
            Json::Bool(_) => "boolean",
            Json::Num(_) => "number",
            Json::Str(_) => "string",
            Json::Arr(_) => "array",
            Json::Obj(_) => "object",
        }
    }

    /// Convenience for the very common "string field or empty" case.
    pub fn text(&self, key: &str) -> &str {
        self.get(key).and_then(Json::as_str).unwrap_or("")
    }

    /// Every string inside an array field.
    pub fn strings(&self, key: &str) -> Vec<String> {
        self.get(key)
            .and_then(Json::as_arr)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    }

    // ---------- writer ----------
    pub fn to_json(&self) -> String {
        let mut out = String::new();
        write_json(self, &mut out, None, 0);
        out
    }

    pub fn to_json_pretty(&self) -> String {
        let mut out = String::new();
        write_json(self, &mut out, Some(2), 0);
        out
    }
}

fn write_json(value: &Json, out: &mut String, indent: Option<usize>, depth: usize) {
    match value {
        Json::Null => out.push_str("null"),
        Json::Bool(true) => out.push_str("true"),
        Json::Bool(false) => out.push_str("false"),
        Json::Num(n) => out.push_str(&format_number(*n)),
        Json::Str(s) => write_string(s, out),
        Json::Arr(items) => {
            if items.is_empty() {
                out.push_str("[]");
                return;
            }
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                newline_indent(out, indent, depth + 1);
                write_json(item, out, indent, depth + 1);
            }
            newline_indent(out, indent, depth);
            out.push(']');
        }
        Json::Obj(entries) => {
            if entries.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push('{');
            for (i, (key, item)) in entries.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                newline_indent(out, indent, depth + 1);
                write_string(key, out);
                out.push(':');
                if indent.is_some() {
                    out.push(' ');
                }
                write_json(item, out, indent, depth + 1);
            }
            newline_indent(out, indent, depth);
            out.push('}');
        }
    }
}

fn newline_indent(out: &mut String, indent: Option<usize>, depth: usize) {
    if let Some(width) = indent {
        out.push('\n');
        for _ in 0..width * depth {
            out.push(' ');
        }
    }
}

fn format_number(n: f64) -> String {
    if !n.is_finite() {
        return "null".to_string();
    }
    if n == 0.0 {
        return "0".to_string();
    }
    if n.fract() == 0.0 && n.abs() < 1e15 {
        return format!("{}", n as i64);
    }
    let mut s = format!("{}", n);
    if s.contains('e') || s.contains('E') {
        s = s.replace('e', "e");
    }
    s
}

fn write_string(s: &str, out: &mut String) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

// ------------------------------- parsing -------------------------------

#[derive(Debug, Clone)]
pub struct ParseError {
    pub position: usize,
    pub message: String,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "JSON parse error at byte {}: {}", self.position, self.message)
    }
}

impl std::error::Error for ParseError {}

pub fn parse(src: &str) -> Result<Json, ParseError> {
    let mut parser = Parser {
        bytes: src.as_bytes(),
        src,
        pos: 0,
    };
    parser.skip_ws();
    let value = parser.parse_value(0)?;
    parser.skip_ws();
    if parser.pos != parser.bytes.len() {
        return Err(parser.error("trailing characters after the top-level value"));
    }
    Ok(value)
}

struct Parser<'a> {
    bytes: &'a [u8],
    src: &'a str,
    pos: usize,
}

impl<'a> Parser<'a> {
    fn error(&self, message: &str) -> ParseError {
        ParseError {
            position: self.pos,
            message: message.to_string(),
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn bump(&mut self) -> Option<u8> {
        let b = self.peek();
        if b.is_some() {
            self.pos += 1;
        }
        b
    }

    fn skip_ws(&mut self) {
        while let Some(b) = self.peek() {
            if b == b' ' || b == b'\t' || b == b'\n' || b == b'\r' {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    fn expect(&mut self, expected: u8) -> Result<(), ParseError> {
        match self.bump() {
            Some(b) if b == expected => Ok(()),
            _ => Err(self.error(&format!("expected '{}'", expected as char))),
        }
    }

    fn parse_value(&mut self, depth: usize) -> Result<Json, ParseError> {
        if depth > MAX_DEPTH {
            return Err(self.error("nesting is too deep"));
        }
        self.skip_ws();
        match self.peek() {
            Some(b'{') => self.parse_object(depth),
            Some(b'[') => self.parse_array(depth),
            Some(b'"') => Ok(Json::Str(self.parse_string()?)),
            Some(b't') => {
                self.parse_literal("true")?;
                Ok(Json::Bool(true))
            }
            Some(b'f') => {
                self.parse_literal("false")?;
                Ok(Json::Bool(false))
            }
            Some(b'n') => {
                self.parse_literal("null")?;
                Ok(Json::Null)
            }
            Some(b) if b == b'-' || b.is_ascii_digit() => self.parse_number(),
            Some(_) => Err(self.error("unexpected character where a value was expected")),
            None => Err(self.error("unexpected end of input where a value was expected")),
        }
    }

    fn parse_literal(&mut self, literal: &str) -> Result<(), ParseError> {
        if self.bytes[self.pos..].starts_with(literal.as_bytes()) {
            self.pos += literal.len();
            Ok(())
        } else {
            Err(self.error(&format!("expected literal '{}'", literal)))
        }
    }

    fn parse_object(&mut self, depth: usize) -> Result<Json, ParseError> {
        self.expect(b'{')?;
        let mut entries: Vec<(String, Json)> = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(Json::Obj(entries));
        }
        loop {
            self.skip_ws();
            let key = self.parse_string()?;
            self.skip_ws();
            self.expect(b':')?;
            let value = self.parse_value(depth + 1)?;
            if let Some(slot) = entries.iter_mut().find(|(k, _)| *k == key) {
                slot.1 = value;
            } else {
                entries.push((key, value));
            }
            self.skip_ws();
            match self.bump() {
                Some(b',') => continue,
                Some(b'}') => return Ok(Json::Obj(entries)),
                _ => return Err(self.error("expected ',' or '}' in object")),
            }
        }
    }

    fn parse_array(&mut self, depth: usize) -> Result<Json, ParseError> {
        self.expect(b'[')?;
        let mut items = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(Json::Arr(items));
        }
        loop {
            let value = self.parse_value(depth + 1)?;
            items.push(value);
            self.skip_ws();
            match self.bump() {
                Some(b',') => continue,
                Some(b']') => return Ok(Json::Arr(items)),
                _ => return Err(self.error("expected ',' or ']' in array")),
            }
        }
    }

    fn parse_number(&mut self) -> Result<Json, ParseError> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        let mut digits = 0;
        while let Some(b) = self.peek() {
            if b.is_ascii_digit() {
                self.pos += 1;
                digits += 1;
            } else {
                break;
            }
        }
        if digits == 0 {
            return Err(self.error("invalid number: expected digits"));
        }
        if digits > 1 && self.bytes[start] == b'0' {
            return Err(self.error("invalid number: leading zero"));
        }
        if self.peek() == Some(b'.') {
            self.pos += 1;
            let mut frac = 0;
            while let Some(b) = self.peek() {
                if b.is_ascii_digit() {
                    self.pos += 1;
                    frac += 1;
                } else {
                    break;
                }
            }
            if frac == 0 {
                return Err(self.error("invalid number: expected digits after '.'"));
            }
        }
        if let Some(b'e' | b'E') = self.peek() {
            self.pos += 1;
            if let Some(b'+' | b'-') = self.peek() {
                self.pos += 1;
            }
            let mut exp = 0;
            while let Some(b) = self.peek() {
                if b.is_ascii_digit() {
                    self.pos += 1;
                    exp += 1;
                } else {
                    break;
                }
            }
            if exp == 0 {
                return Err(self.error("invalid number: expected exponent digits"));
            }
        }
        let raw = &self.src[start..self.pos];
        raw.parse::<f64>()
            .map(Json::Num)
            .map_err(|_| self.error("invalid number literal"))
    }

    fn parse_string(&mut self) -> Result<String, ParseError> {
        self.expect(b'"')?;
        let mut out = String::new();
        loop {
            let b = match self.bump() {
                Some(b) => b,
                None => return Err(self.error("unterminated string")),
            };
            match b {
                b'"' => return Ok(out),
                b'\\' => {
                    let esc = match self.bump() {
                        Some(e) => e,
                        None => return Err(self.error("unterminated escape sequence")),
                    };
                    match esc {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{08}'),
                        b'f' => out.push('\u{0c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let hi = self.parse_hex4()?;
                            let ch = if (0xD800..0xDC00).contains(&hi) {
                                // High surrogate: a low surrogate must follow.
                                if self.bytes[self.pos..].starts_with(b"\\u") {
                                    self.pos += 2;
                                    let lo = self.parse_hex4()?;
                                    if !(0xDC00..0xE000).contains(&lo) {
                                        return Err(self.error("invalid low surrogate"));
                                    }
                                    let combined =
                                        0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
                                    char::from_u32(combined)
                                        .ok_or_else(|| self.error("invalid surrogate pair"))?
                                } else {
                                    return Err(self.error("unpaired high surrogate"));
                                }
                            } else if (0xDC00..0xE000).contains(&hi) {
                                return Err(self.error("unpaired low surrogate"));
                            } else {
                                char::from_u32(hi)
                                    .ok_or_else(|| self.error("invalid \\u escape"))?
                            };
                            out.push(ch);
                        }
                        _ => return Err(self.error("unknown escape character")),
                    }
                }
                b if b < 0x20 => {
                    return Err(self.error("unescaped control character in string"))
                }
                _ => {
                    // Copy this UTF-8 sequence verbatim.
                    let len = utf8_len(b);
                    if len == 0 || self.pos - 1 + len > self.bytes.len() {
                        return Err(self.error("invalid UTF-8 sequence"));
                    }
                    let start = self.pos - 1;
                    let end = start + len;
                    match self.src.get(start..end) {
                        Some(slice) => {
                            out.push_str(slice);
                            self.pos = end;
                        }
                        None => return Err(self.error("invalid UTF-8 boundary")),
                    }
                }
            }
        }
    }

    fn parse_hex4(&mut self) -> Result<u32, ParseError> {
        let mut value: u32 = 0;
        for _ in 0..4 {
            let b = match self.bump() {
                Some(b) => b,
                None => return Err(self.error("truncated \\u escape")),
            };
            let digit = match b {
                b'0'..=b'9' => b - b'0',
                b'a'..=b'f' => b - b'a' + 10,
                b'A'..=b'F' => b - b'A' + 10,
                _ => return Err(self.error("invalid hex digit in \\u escape")),
            };
            value = value * 16 + digit as u32;
        }
        Ok(value)
    }
}

fn utf8_len(first: u8) -> usize {
    match first {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        0xF0..=0xF7 => 4,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scalars() {
        assert_eq!(parse("null").unwrap(), Json::Null);
        assert_eq!(parse("true").unwrap(), Json::Bool(true));
        assert_eq!(parse("-12.5e2").unwrap(), Json::Num(-1250.0));
        assert_eq!(parse("\"hi\"").unwrap(), Json::Str("hi".into()));
    }

    #[test]
    fn parses_nested_and_keeps_key_order() {
        let v = parse(r#"{"b":1,"a":[1,2,{"c":"d"}]}"#).unwrap();
        let keys: Vec<&str> = v.as_obj().unwrap().iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(keys, vec!["b", "a"]);
        assert_eq!(v.get("a").unwrap().at(2).unwrap().get("c").unwrap().as_str(), Some("d"));
    }

    #[test]
    fn handles_escapes_and_korean() {
        let v = parse(r#""\uc548\ub155 \"x\" \n \u00e9 \ud83d\ude00""#).unwrap();
        assert_eq!(v.as_str().unwrap(), "안녕 \"x\" \n é 😀");
    }

    #[test]
    fn rejects_malformed_input() {
        for bad in ["", "{", "{\"a\":}", "[1,]", "01", "\"unterminated", "{} {}", "tru"] {
            assert!(parse(bad).is_err(), "expected parse failure for {:?}", bad);
        }
    }

    #[test]
    fn round_trips_through_serializer() {
        let src = r#"{"name":"뉴트리라이트","tiers":[{"min_pv":200000,"rate":3}],"ok":true,"none":null}"#;
        let value = parse(src).unwrap();
        assert_eq!(parse(&value.to_json()).unwrap(), value);
        assert_eq!(parse(&value.to_json_pretty()).unwrap(), value);
        assert!(value.to_json().contains("\"min_pv\":200000"));
    }

    #[test]
    fn serializes_numbers_without_trailing_zero() {
        assert_eq!(Json::Num(21.0).to_json(), "21");
        assert_eq!(Json::Num(131.3).to_json(), "131.3");
        assert_eq!(Json::Num(-0.5).to_json(), "-0.5");
    }
}
