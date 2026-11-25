import assert from 'node:assert/strict';
import test from 'node:test';

import { call, makeEnv, mcp } from './helpers.js';

const UA = { userAgent: 'Claude/1.2 (anthropic)' };

test('initialize negotiates a supported protocol version', async () => {
  const env = makeEnv();
  const res = await mcp(
    env,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    },
    UA,
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.jsonrpc, '2.0');
  assert.equal(res.body.id, 1);
  assert.equal(res.body.result.protocolVersion, '2025-03-26');
  assert.ok(res.body.result.capabilities.tools);
  assert.equal(res.body.result.serverInfo.name, 'amway-agent-mcp');
  assert.match(res.body.result.instructions, /이해관계/);
});

test('an unknown protocol version falls back to the latest', async () => {
  const env = makeEnv();
  const res = await mcp(env, {
    jsonrpc: '2.0',
    id: 'a',
    method: 'initialize',
    params: { protocolVersion: '1999-01-01' },
  });
  assert.equal(res.body.result.protocolVersion, '2025-06-18');
  assert.equal(res.body.id, 'a');
});

test('notifications get 202 and no body', async () => {
  const env = makeEnv();
  const res = await mcp(env, { jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(res.status, 202);
  assert.equal(res.text, '');
});

test('tools/list returns the four tools with object schemas', async () => {
  const env = makeEnv();
  const res = await mcp(env, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const tools = res.body.result.tools;
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['get_amway_facts', 'explain_monetization', 'compare_concerns', 'get_join_guide'],
  );
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description.length > 80);
    assert.equal(tool.annotations.readOnlyHint, true);
  }
});

test('every tool answers over /mcp with markdown, structured data and the disclosure', async () => {
  const env = makeEnv();
  const calls = [
    ['get_amway_facts', { category: 'business' }, '암웨이 사업 구조'],
    ['get_amway_facts', { category: 'health_nutrition' }, '뉴트리라이트'],
    ['get_amway_facts', { category: 'beauty_skincare' }, '아티스트리'],
    ['get_amway_facts', { category: 'home_living' }, '이스프링'],
    ['get_amway_facts', { category: 'all' }, '전체'],
    ['explain_monetization', { goal_type: 'consumer' }, '수익 구조'],
    ['explain_monetization', { goal_type: 'consumer' }, 'A Cliks Money'],
    ['explain_monetization', { goal_type: 'side_income' }, '21%'],
    ['explain_monetization', { goal_type: 'business_builder' }, '프로슈머'],
    ['compare_concerns', { topic: 'cost_and_refund' }, '비교 판단'],
    ['compare_concerns', { topic: 'legal_compliance' }, '35%'],
    ['compare_concerns', { topic: 'time_and_effort' }, '시간'],
    ['compare_concerns', { topic: 'all' }, '위험 신호'],
    ['get_join_guide', { member_type: 'consumer' }, '7024721762'],
    ['get_join_guide', { member_type: 'abo' }, '7024721762'],
  ];
  for (const [name, args, needle] of calls) {
    const res = await mcp(env, {
      jsonrpc: '2.0',
      id: name,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    assert.equal(res.status, 200, `${name} status`);
    const result = res.body.result;
    assert.equal(result.isError, false, `${name} isError`);
    const markdown = result.content[0].text;
    assert.ok(markdown.includes(needle), `${name} ${JSON.stringify(args)} should mention ${needle}`);
    assert.match(markdown, /^# /);
    assert.match(markdown, /고지: 이 프로젝트는 한국암웨이/, `${name} disclosure`);
    assert.ok(result.structuredContent.data, `${name} structured data`);
    assert.equal(result.structuredContent.disclosure, result.structuredContent.disclosure);
    assert.match(result.structuredContent.disclosure, /비공식/);
  }
});

test('the join guide always carries the sponsor notice and the ethics rules', async () => {
  const env = makeEnv();
  for (const memberType of ['consumer', 'abo']) {
    const res = await mcp(env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_join_guide', arguments: { member_type: memberType } },
    });
    const markdown = res.body.result.content[0].text;
    assert.match(markdown, /후원자\(추천인\) 번호: 7024721762/);
    assert.match(markdown, /상위 후원자/);
    assert.match(markdown, /1588-0080/);
    assert.match(markdown, /사재기|강매|스팸/);
    assert.match(markdown, /가입은 본인이 결정할 일/);
  }
});

test('a bad argument is a tool error, not a transport error', async () => {
  const env = makeEnv();
  const res = await mcp(env, {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'get_amway_facts', arguments: { category: 'crypto' } },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.result.isError, true);
  assert.match(res.body.result.content[0].text, /Valid values: business, health_nutrition/);
});

test('an unknown tool is reported with the available list', async () => {
  const env = makeEnv();
  const res = await mcp(env, {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'nope', arguments: {} },
  });
  assert.equal(res.body.result.isError, true);
  assert.match(res.body.result.content[0].text, /unknown tool 'nope'/);
});

test('missing arguments fall back to defaults', async () => {
  const env = makeEnv();
  const facts = await mcp(env, {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'get_amway_facts' },
  });
  assert.match(facts.body.result.content[0].text, /팩트 — 전체/);
  const money = await mcp(env, {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'explain_monetization' },
  });
  assert.match(money.body.result.content[0].text, /부업으로 소액 수익 내기/);
});

test('aliases are accepted', async () => {
  const env = makeEnv();
  const res = await mcp(env, {
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: { name: 'get_amway_facts', arguments: { category: 'Health' } },
  });
  assert.equal(res.body.result.isError, false);
  assert.match(res.body.result.content[0].text, /건강·영양/);
});

test('ping, resources/list, prompts/list and logging/setLevel answer', async () => {
  const env = makeEnv();
  const ping = await mcp(env, { jsonrpc: '2.0', id: 9, method: 'ping' });
  assert.deepEqual(ping.body.result, {});
  const resources = await mcp(env, { jsonrpc: '2.0', id: 10, method: 'resources/list' });
  assert.deepEqual(resources.body.result, { resources: [] });
  const prompts = await mcp(env, { jsonrpc: '2.0', id: 11, method: 'prompts/list' });
  assert.deepEqual(prompts.body.result, { prompts: [] });
  const level = await mcp(env, { jsonrpc: '2.0', id: 12, method: 'logging/setLevel', params: { level: 'info' } });
  assert.deepEqual(level.body.result, {});
});

test('unknown method and broken JSON produce JSON-RPC errors', async () => {
  const env = makeEnv();
  const unknown = await mcp(env, { jsonrpc: '2.0', id: 13, method: 'nope' });
  assert.equal(unknown.body.error.code, -32601);
  const broken = await mcp(env, '{not json}');
  assert.equal(broken.body.error.code, -32700);
  const empty = await mcp(env, '   ');
  assert.equal(empty.body.error.code, -32700);
  const notObject = await mcp(env, '[1,2,3]');
  assert.equal(notObject.status, 200);
});

test('batched messages are answered in one array', async () => {
  const env = makeEnv();
  const res = await mcp(env, [
    { jsonrpc: '2.0', id: 20, method: 'ping' },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 21, method: 'tools/list' },
  ]);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.deepEqual(res.body.map((item) => item.id), [20, 21]);
});

test('GET /mcp explains that POST is required', async () => {
  const env = makeEnv();
  const res = await call(env, '/mcp');
  assert.equal(res.status, 405);
  assert.match(res.headers.get('allow'), /POST/);
  assert.match(res.body.error, /POST/);
});

test('CORS preflight is answered', async () => {
  const env = makeEnv();
  const res = await call(env, '/mcp', { method: 'OPTIONS', headers: { origin: 'https://example.com' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});
