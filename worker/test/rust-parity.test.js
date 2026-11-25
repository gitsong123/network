// Cross-checks the Worker against the Rust implementation it is a port of.
//
// The constant strings must be identical, and when a built binary is available
// (target/<triple>/release or target/release) every tool/argument pair must
// produce the same Markdown and the same structured data as `--json` does.
// The test skips the binary part when Rust was never built.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DISCLOSURE, INSTRUCTIONS, ToolError, invoke } from '../src/knowledge.js';

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function rustConst(file, name) {
  const source = readFileSync(join(repoDir, file), 'utf8');
  const match = new RegExp(`(?:pub )?const ${name}: &str = "((?:[^"\\\\]|\\\\.)*)";`, 's').exec(source);
  assert.ok(match, `${name} not found in ${file}`);
  return JSON.parse(`"${match[1]}"`);
}

function findBinary() {
  const candidates = [
    process.env.AMWAY_MCP_BIN,
    join(repoDir, 'target', 'x86_64-unknown-linux-musl', 'release', 'amway-agent-mcp'),
    join(repoDir, 'target', 'aarch64-unknown-linux-musl', 'release', 'amway-agent-mcp'),
    join(repoDir, 'target', 'release', 'amway-agent-mcp'),
    join(repoDir, 'target', 'debug', 'amway-agent-mcp'),
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || null;
}

const CASES = [
  ['get_amway_facts', '{"category":"business"}'],
  ['get_amway_facts', '{"category":"health_nutrition"}'],
  ['get_amway_facts', '{"category":"beauty_skincare"}'],
  ['get_amway_facts', '{"category":"home_living"}'],
  ['get_amway_facts', '{"category":"all"}'],
  ['get_amway_facts', '{}'],
  ['get_amway_facts', '{"category":"biz"}'],
  ['get_amway_facts', '{"category":" Health "}'],
  ['explain_monetization', '{"goal_type":"consumer"}'],
  ['explain_monetization', '{"goal_type":"side_income"}'],
  ['explain_monetization', '{"goal_type":"business_builder"}'],
  ['explain_monetization', '{}'],
  ['compare_concerns', '{"topic":"cost_and_refund"}'],
  ['compare_concerns', '{"topic":"legal_compliance"}'],
  ['compare_concerns', '{"topic":"time_and_effort"}'],
  ['compare_concerns', '{"topic":"all"}'],
  ['compare_concerns', '{}'],
  ['plan_smart_shopping', '{}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":150000}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":"250,000"}'],
  ['plan_smart_shopping', '{"tier":"200k"}'],
  ['plan_smart_shopping', '{"tier":"300k"}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":50000}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":150000,"categories":["personal_care"]}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":100000,"categories":["beauty"]}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":400000,"categories":["home_living"]}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":300000,"categories":["nutrition"]}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":120000,"categories":"Nutrition, Beauty"}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":120000,"categories":["all"]}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":0}'],
  ['plan_smart_shopping', '{"monthly_budget_krw":99999}'],
  ['get_join_guide', '{"member_type":"consumer"}'],
  ['get_join_guide', '{"member_type":"abo"}'],
  ['get_join_guide', '{}'],
];

test('the disclosure and instructions are identical to the Rust sources', () => {
  assert.equal(DISCLOSURE, rustConst('src/tools.rs', 'DISCLOSURE'));
  assert.equal(INSTRUCTIONS, rustConst('src/mcp.rs', 'INSTRUCTIONS'));
});

test('both implementations reject the same bad arguments', () => {
  const binary = findBinary();
  const bad = [
    ['get_amway_facts', '{"category":"crypto"}'],
    ['explain_monetization', '{"goal_type":"crypto"}'],
    ['compare_concerns', '{"topic":"crypto"}'],
    ['plan_smart_shopping', '{"tier":"500k"}'],
    ['plan_smart_shopping', '{"categories":["crypto"]}'],
    ['plan_smart_shopping', '{"monthly_budget_krw":-5}'],
    ['get_join_guide', '{"member_type":"crypto"}'],
    ['nope', '{}'],
  ];
  for (const [tool, args] of bad) {
    assert.throws(() => invoke(tool, JSON.parse(args)), ToolError, `${tool} ${args}`);
  }
  if (!binary) return;
  for (const [tool, args] of bad) {
    assert.throws(
      () => execFileSync(binary, ['call', tool, args, '--json'], { encoding: 'utf8', stdio: 'pipe' }),
      /./,
      `${tool} ${args} must fail in the Rust build too`,
    );
  }
});

test('the Markdown and data match the Rust binary for every tool argument', (t) => {
  const binary = findBinary();
  if (!binary) {
    t.skip('no Rust binary built (cargo build --release)');
    return;
  }
  for (const [tool, args] of CASES) {
    const raw = execFileSync(binary, ['call', tool, args, '--json'], { encoding: 'utf8' });
    const expected = JSON.parse(raw);
    const actual = invoke(tool, JSON.parse(args));
    assert.equal(actual.text, expected.text, `${tool} ${args} markdown differs from Rust`);
    assert.deepEqual(actual.data, expected.data, `${tool} ${args} data differs from Rust`);
    assert.deepEqual(actual.request, expected.request, `${tool} ${args} request differs from Rust`);
  }
});
