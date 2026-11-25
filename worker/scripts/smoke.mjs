#!/usr/bin/env node
// End-to-end smoke test against a deployed instance (no dependencies).
//
//   node scripts/smoke.mjs                                  # pages.dev
//   node scripts/smoke.mjs https://<host>                   # any deployment
//
// Every check is a real request, so running it adds visits to the dashboard —
// that is the point: it proves visits are being recorded.

const base = (process.argv[2] || 'https://amway-agent-mcp.pages.dev').replace(/\/+$/, '');
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path, init) {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  return { status: response.status, contentType: response.headers.get('content-type') || '', text };
}

async function rpc(message, userAgent) {
  const res = await get('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent || 'amway-smoke/1.0' },
    body: JSON.stringify(message),
  });
  expect(res.status === 200, `POST /mcp ${res.status}`);
  return JSON.parse(res.text);
}

await check('/health', async () => {
  const res = await get('/health');
  expect(res.status === 200, `status ${res.status}`);
  return JSON.parse(res.text).service;
});

await check('/llms.txt', async () => {
  const res = await get('/llms.txt');
  expect(res.status === 200, `status ${res.status}`);
  expect(res.text.includes('7024721762'), 'sponsor number missing');
  expect(res.text.includes('비공식'), 'unofficial notice missing');
  return `${res.text.length} chars`;
});

await check('/SKILL.md', async () => {
  const res = await get('/SKILL.md');
  expect(res.status === 200, `status ${res.status}`);
  expect(res.contentType.includes('markdown'), res.contentType);
  return `${res.text.length} chars`;
});

await check('/data/compensation_plan.json', async () => {
  const res = await get('/data/compensation_plan.json');
  expect(res.status === 200, `status ${res.status}`);
  const doc = JSON.parse(res.text);
  expect(doc.meta && doc.meta.checked_on, 'meta.checked_on missing');
  return `checked_on ${doc.meta.checked_on}`;
});

await check('initialize', async () => {
  const body = await rpc(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {} },
    },
    'Claude/1.0 (smoke)',
  );
  expect(body.result && body.result.protocolVersion, 'no protocolVersion');
  return `${body.result.serverInfo.name} ${body.result.protocolVersion}`;
});

await check('tools/list', async () => {
  const body = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'Claude/1.0 (smoke)');
  const names = (body.result.tools || []).map((tool) => tool.name);
  expect(names.length === 4, `expected 4 tools, got ${names.length}`);
  return names.join(', ');
});

await check('tools/call get_join_guide', async () => {
  const body = await rpc(
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_join_guide', arguments: { member_type: 'abo' } },
    },
    'Claude/1.0 (smoke)',
  );
  const result = body.result;
  expect(result && result.isError === false, 'tool error');
  const text = result.content[0].text;
  expect(text.includes('7024721762'), 'sponsor number missing from the answer');
  expect(text.includes('고지:'), 'disclosure missing from the answer');
  expect(result.structuredContent && result.structuredContent.data, 'structuredContent missing');
  return `${text.length} chars`;
});

await check('tools/call bad argument is a tool error', async () => {
  const body = await rpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'get_amway_facts', arguments: { category: 'crypto' } },
  });
  expect(body.result && body.result.isError === true, 'expected isError true');
  return 'isError true';
});

await check('/api/stats', async () => {
  const res = await get('/api/stats');
  expect(res.status === 200, `status ${res.status}`);
  const stats = JSON.parse(res.text);
  expect(stats.ok === true, 'ok flag missing');
  expect(stats.total > 0, 'no visit recorded yet');
  expect(Array.isArray(stats.recent), 'recent missing');
  return `total ${stats.total}, today ${stats.today_count}, agents ${stats.agent_kinds}`;
});

await check('/dashboard', async () => {
  const res = await get('/dashboard');
  expect(res.status === 200, `status ${res.status}`);
  expect(res.text.includes('방문 대시보드'), 'dashboard markup missing');
  return 'html ok';
});

let failed = 0;
for (const result of results) {
  if (!result.ok) failed += 1;
  console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name.padEnd(34)} ${result.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed — ${base}`);
process.exit(failed === 0 ? 0 : 1);
