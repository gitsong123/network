//! `amway-agent-mcp` — Amway Korea facts, monetization structure and
//! health/beauty knowledge, packaged as an MCP server (stdio JSON-RPC 2.0) and
//! as a plain CLI.
//!
//! The crate is split so the pieces can be embedded or tested separately:
//!
//! * [`json`] — dependency-free JSON value, parser and serializer
//! * [`data`] — the bundled knowledge documents (`data/*.json`)
//! * [`tools`] — the four MCP tools and their Markdown rendering
//! * [`mcp`] — the stdio JSON-RPC transport and protocol handling
//!
//! ```no_run
//! use amway_agent_mcp::{json, tools};
//!
//! let args = json::parse(r#"{"goal_type":"side_income"}"#).unwrap();
//! let outcome = tools::invoke("explain_monetization", &args).unwrap();
//! println!("{}", outcome.text);
//! ```

pub mod data;
pub mod json;
pub mod mcp;
pub mod tools;
