import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_LABELS,
  RECENT_LIMIT,
  STATS_KEY,
  applyVisit,
  classifyAgent,
  kstParts,
  summarize,
} from '../src/track.js';
import { call, makeEnv, mcp } from './helpers.js';

test('User-Agent classification', () => {
  const cases = [
    ['Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'claude'],
    ['Claude/1.0 (external, cli)', 'claude'],
    ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot', 'chatgpt'],
    ['ChatGPT-User/1.0', 'chatgpt'],
    ['Mozilla/5.0 (compatible; Google-Extended)', 'gemini'],
    ['Gemini-CLI/0.1', 'gemini'],
    ['Mozilla/5.0 (compatible; PerplexityBot/1.0)', 'perplexity'],
    ['Cursor/0.45.11', 'cursor'],
    ['Mozilla/5.0 (compatible; GitHubCopilot/1.0)', 'copilot'],
    ['curl/8.4.0', 'bot'],
    ['python-requests/2.31.0', 'bot'],
    ['node-fetch/3.3.2', 'bot'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'browser'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'browser'],
    ['', 'unknown'],
    ['something-else/1.0', 'unknown'],
  ];
  for (const [ua, expected] of cases) {
    assert.equal(classifyAgent(ua), expected, ua);
  }
  for (const label of Object.values(AGENT_LABELS)) assert.ok(label.length > 0);
});

test('KST clock parts', () => {
  const parts = kstParts(new Date('2026-11-25T01:58:09Z'));
  assert.equal(parts.day, '2026-11-25');
  assert.equal(parts.time, '10:58');
  assert.equal(parts.iso, '2026-11-25T10:58:09+09:00');
  // 15:30 UTC is already the next day in Seoul.
  assert.equal(kstParts(new Date('2026-11-25T15:30:00Z')).day, '2026-11-26');
});

test('applyVisit counts paths, agents, tools, arguments and join-guide views', () => {
  const stats = {
    v: 1,
    total: 0,
    first_seen: null,
    updated: null,
    days: {},
    agents: {},
    paths: {},
    tools: {},
    args: {},
    join_guide: 0,
    recent: [],
  };
  const t = Date.parse('2026-11-25T01:00:00Z');
  applyVisit(stats, { t, p: '/mcp', a: 'claude', n: 'get_amway_facts', g: 'category=business' });
  applyVisit(stats, { t: t + 1000, p: '/mcp', a: 'chatgpt', n: 'get_join_guide', g: 'member_type=abo' });
  applyVisit(stats, { t: t + 2000, p: '/llms.txt', a: 'bot', n: '', g: '' });

  assert.equal(stats.total, 3);
  assert.deepEqual(stats.agents, { claude: 1, chatgpt: 1, bot: 1 });
  assert.deepEqual(stats.paths, { '/mcp': 2, '/llms.txt': 1 });
  assert.deepEqual(stats.tools, { get_amway_facts: 1, get_join_guide: 1 });
  assert.deepEqual(stats.args, { 'category=business': 1, 'member_type=abo': 1 });
  assert.equal(stats.join_guide, 1);
  assert.equal(stats.days['2026-11-25'], 3);
  assert.equal(stats.recent.length, 3);
  assert.equal(stats.recent[0].p, '/llms.txt');
  assert.ok(stats.first_seen);
});

test('the recent buffer stays bounded', () => {
  const stats = {
    v: 1,
    total: 0,
    first_seen: null,
    updated: null,
    days: {},
    agents: {},
    paths: {},
    tools: {},
    args: {},
    join_guide: 0,
    recent: [],
  };
  const t = Date.parse('2026-11-25T01:00:00Z');
  for (let i = 0; i < RECENT_LIMIT + 20; i += 1) {
    applyVisit(stats, { t: t + i * 1000, p: '/llms.txt', a: 'bot', n: '', g: '' });
  }
  assert.equal(stats.recent.length, RECENT_LIMIT);
  assert.equal(stats.total, RECENT_LIMIT + 20);
});

test('summarize exposes 14 days with zeros and Korean agent labels', () => {
  const stats = {
    v: 1,
    total: 2,
    first_seen: '2026-11-25T10:00:00+09:00',
    updated: '2026-11-25T10:01:00+09:00',
    days: { '2026-11-25': 2 },
    agents: { claude: 2 },
    paths: { '/mcp': 2 },
    tools: { get_join_guide: 2 },
    args: { 'member_type=abo': 2 },
    join_guide: 2,
    recent: [{ t: Date.parse('2026-11-25T01:01:00Z'), p: '/mcp', a: 'claude', n: 'get_join_guide', g: 'member_type=abo' }],
  };
  const summary = summarize(stats, new Date('2026-11-25T01:30:00Z'));
  assert.equal(summary.total, 2);
  assert.equal(summary.today_count, 2);
  assert.equal(summary.join_guide_views, 2);
  assert.equal(summary.agent_kinds, 1);
  assert.equal(summary.days.length, 14);
  assert.equal(summary.days.at(-1).date, '2026-11-25');
  assert.equal(summary.days.at(-1).count, 2);
  assert.equal(summary.agents[0].label, AGENT_LABELS.claude);
  assert.equal(summary.recent[0].time, '10:01');
  assert.equal(summary.recent[0].agent_label, AGENT_LABELS.claude);
});

test('an MCP call, llms.txt and a data file each land in KV stats', async () => {
  const env = makeEnv();
  await mcp(
    env,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_amway_facts', arguments: { category: 'health_nutrition' } },
    },
    { userAgent: 'Claude/1.0' },
  );
  await call(env, '/llms.txt', { headers: { 'user-agent': 'GPTBot/1.2' } });
  await call(env, '/data/home_living.json', { headers: { 'user-agent': 'curl/8.4.0' } });

  // Dashboard and stats polling must not be counted, so refreshing is free.
  await call(env, '/dashboard');
  await call(env, '/api/stats');
  await call(env, '/');

  const stored = JSON.parse(env.STATS.raw(STATS_KEY));
  assert.equal(stored.total, 3, 'only the three tracked requests count');
  assert.equal(stored.agents.claude, 1);
  assert.equal(stored.agents.chatgpt, 1);
  assert.equal(stored.agents.bot, 1);
  assert.equal(stored.tools.get_amway_facts, 1);
  assert.equal(stored.args['category=health_nutrition'], 1);
  assert.deepEqual(
    stored.paths,
    { '/mcp': 1, '/llms.txt': 1, '/data/home_living.json': 1 },
  );

  const api = await call(env, '/api/stats');
  assert.equal(api.body.total, 3);
  assert.equal(api.body.today_count, 3);
  assert.equal(api.body.agent_kinds, 3);
  assert.equal(api.body.recent.length, 3);
  assert.equal(api.body.recent[0].path, '/data/home_living.json');
});

test('get_join_guide views are counted separately', async () => {
  const env = makeEnv();
  for (const memberType of ['consumer', 'abo', 'abo']) {
    await mcp(env, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_join_guide', arguments: { member_type: memberType } },
    });
  }
  const api = await call(env, '/api/stats');
  assert.equal(api.body.join_guide_views, 3);
  assert.equal(api.body.topics[0].key, 'member_type=abo');
  assert.equal(api.body.topics[0].count, 2);
});

test('concurrent visits do not lose counts inside one isolate', async () => {
  const env = makeEnv();
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      mcp(
        env,
        {
          jsonrpc: '2.0',
          id: i,
          method: 'tools/call',
          params: { name: 'compare_concerns', arguments: { topic: 'all' } },
        },
        { userAgent: 'Claude/1.0' },
      ),
    ),
  );
  const stored = JSON.parse(env.STATS.raw(STATS_KEY));
  assert.equal(stored.total, 12);
  assert.equal(stored.tools.compare_concerns, 12);
});

test('a missing KV binding does not break a request', async () => {
  const env = {}; // no STATS binding at all
  const res = await mcp(env, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'get_amway_facts', arguments: { category: 'business' } },
  });
  assert.equal(res.status, 200);
  const api = await call(env, '/api/stats');
  assert.equal(api.body.total, 0);
});
