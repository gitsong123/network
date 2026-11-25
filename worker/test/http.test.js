import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DATA_RAW } from '../src/assets.generated.js';
import { call, makeEnv } from './helpers.js';

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_FILES = [
  'compensation_plan.json',
  'health_nutrition.json',
  'beauty_skincare.json',
  'home_living.json',
  'faq_and_risks.json',
];

test('llms.txt is served byte for byte', async () => {
  const env = makeEnv();
  const res = await call(env, '/llms.txt');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  assert.equal(res.text, readFileSync(join(repoDir, 'llms.txt'), 'utf8'));
  assert.match(res.text, /7024721762/);
  assert.match(res.text, /비공식/);
});

test('SKILL.md is served byte for byte as markdown', async () => {
  const env = makeEnv();
  const res = await call(env, '/SKILL.md');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/markdown/);
  assert.equal(res.text, readFileSync(join(repoDir, 'SKILL.md'), 'utf8'));
});

test('every data file is served at /data/:name with and without .json', async () => {
  const env = makeEnv();
  for (const file of DATA_FILES) {
    const name = file.replace(/\.json$/, '');
    for (const path of [`/data/${file}`, `/data/${name}`]) {
      const res = await call(env, path);
      assert.equal(res.status, 200, path);
      assert.match(res.headers.get('content-type'), /application\/json/);
      assert.equal(res.text, readFileSync(join(repoDir, 'data', file), 'utf8'), path);
      assert.deepEqual(JSON.parse(res.text), JSON.parse(DATA_RAW[name]), path);
    }
  }
});

test('/data lists the five files and an unknown name is a 404', async () => {
  const env = makeEnv();
  const index = await call(env, '/data');
  assert.equal(index.status, 200);
  assert.equal(index.body.files.length, 5);
  const missing = await call(env, '/data/nope.json');
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /Available/);
});

test('the dashboard renders its cards and the empty state', async () => {
  const env = makeEnv();
  const res = await call(env, '/dashboard');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  for (const needle of ['총 방문', '오늘 방문', '가입안내 조회', 'AI 에이전트', '최근 방문', '자동 새로고침']) {
    assert.ok(res.text.includes(needle), `dashboard should include ${needle}`);
  }
  assert.match(res.text, /fetch\('\/api\/stats'/);
  assert.match(res.text, /noindex/);
});

test('the landing page links every endpoint', async () => {
  const env = makeEnv({ PUBLIC_URL: 'https://amway-agent-mcp.test' });
  const res = await call(env, '/');
  assert.equal(res.status, 200);
  assert.match(res.text, /https:\/\/amway-agent-mcp\.test\/mcp/);
  for (const href of ['/llms.txt', '/SKILL.md', '/dashboard', '/api/stats', '/data/compensation_plan.json']) {
    assert.ok(res.text.includes(`href="${href}"`), `landing should link ${href}`);
  }
  assert.match(res.text, /비공식/);
});

test('/api/stats returns a complete shape before any visit', async () => {
  const env = makeEnv();
  const res = await call(env, '/api/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.total, 0);
  assert.equal(res.body.today_count, 0);
  assert.deepEqual(res.body.agents, []);
  assert.equal(res.body.days.length, 14);
  assert.deepEqual(res.body.recent, []);
  assert.match(res.body.generated_at, /\+09:00$/);
});

test('health, robots and an unknown path', async () => {
  const env = makeEnv();
  const health = await call(env, '/health');
  assert.equal(health.body.ok, true);
  const robots = await call(env, '/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.text, /Disallow: \/dashboard/);
  const missing = await call(env, '/nope');
  assert.equal(missing.status, 404);
});

test('a configured dashboard token gates the dashboard and the API', async () => {
  const env = makeEnv({ DASHBOARD_TOKEN: 'secret-token' });
  const locked = await call(env, '/dashboard');
  assert.equal(locked.status, 200);
  assert.match(locked.text, /접근 제한/);
  const lockedApi = await call(env, '/api/stats');
  assert.equal(lockedApi.status, 401);
  const open = await call(env, '/dashboard?token=secret-token');
  assert.match(open.text, /총 방문/);
  const bearer = await call(env, '/api/stats', { headers: { authorization: 'Bearer secret-token' } });
  assert.equal(bearer.status, 200);
});
