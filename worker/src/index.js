// amway-agent-mcp — Cloudflare Worker entry point.
//
//   POST /mcp            MCP Streamable HTTP (JSON-RPC 2.0, stateless)
//   GET  /llms.txt       agent summary, served verbatim from the repository
//   GET  /SKILL.md       agent skill, served verbatim from the repository
//   GET  /data/:name     one of the five fact files as JSON
//   GET  /api/stats      aggregated visit JSON for the dashboard
//   GET  /dashboard      live visit dashboard (Korean)
//   GET  /               landing page
//
// Free plan only: Workers Free + KV Free, one KV key for the whole aggregate.

import { DOCS_RAW, DATA_RAW } from './assets.generated.js';
import { dashboardHtml, landingHtml } from './dashboard.js';
import { handleBody } from './mcp.js';
import { classifyAgent, kstParts, readStats, recordVisit, shouldTrack, summarize } from './track.js';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

const HTML_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'";

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, HEAD, OPTIONS',
  'access-control-allow-headers':
    'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id',
  'access-control-max-age': '86400',
};

const DATA_NAMES = Object.keys(DATA_RAW);

function withHeaders(response, extra) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries({ ...SECURITY_HEADERS, ...extra })) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

function json(body, status = 200, extra = {}) {
  return withHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra },
    }),
  );
}

function text(body, contentType, extra = {}) {
  return withHeaders(
    new Response(body, { status: 200, headers: { 'content-type': contentType, ...CORS_HEADERS, ...extra } }),
  );
}

function html(body, extra = {}) {
  return withHeaders(
    new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': HTML_CSP,
        'cache-control': 'no-store',
        ...extra,
      },
    }),
  );
}

function notFound(message = 'Not found') {
  return json({ ok: false, error: message }, 404);
}

const LOCKED_HTML =
  '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<meta name="robots" content="noindex,nofollow"><title>접근 제한 — amway-agent-mcp</title></head>' +
  '<body style="font-family:system-ui,-apple-system,\'Apple SD Gothic Neo\',sans-serif;padding:40px;line-height:1.6">' +
  '<h1 style="font-size:18px;margin:0 0 8px">접근 제한 (403)</h1>' +
  '<p style="margin:0 0 8px">이 대시보드는 운영자 전용입니다. 주소 끝에 <code>?token=…</code>를 붙여 주세요.</p>' +
  '<p style="margin:0;color:#6b7280;font-size:13px">' +
  '<a href="/">홈</a> · <a href="/llms.txt">llms.txt</a> · <a href="/SKILL.md">SKILL.md</a></p>' +
  '</body></html>';

/** 403 for a locked page: a visible restriction page that also reports the refusal in its status. */
function locked() {
  return withHeaders(
    new Response(LOCKED_HTML, {
      status: 403,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': HTML_CSP,
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
      },
    }),
  );
}

function authorized(request, env, url) {
  const expected = env && env.DASHBOARD_TOKEN;
  if (!expected) return true;
  const header = request.headers.get('authorization') || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header);
  const provided = url.searchParams.get('token') || (bearer ? bearer[1] : '');
  return provided === expected;
}

/**
 * Records one visit. The write is awaited (not handed to waitUntil) so that a
 * sequence of requests from one client — a crawler walking llms.txt, SKILL.md
 * and /data — cannot overlap two read-modify-write cycles of the same KV key,
 * which KV cannot make atomic. A cold isolate would otherwise finish the write
 * after the next request had already read the old value.
 */
async function track(request, env, ctx, path, meta) {
  if (!shouldTrack(path)) return;
  const now = Date.now();
  const stamp = kstParts(new Date(now));
  const visit = {
    t: now,
    p: path,
    a: classifyAgent(request.headers.get('user-agent')),
    n: (meta && meta.tool) || '',
    g: (meta && meta.arg) || '',
    d: stamp.day,
  };
  await recordVisit(env, visit);
}

async function handleMcp(request, env, ctx) {
  if (request.method !== 'POST') {
    return json(
      {
        ok: false,
        error: 'Use POST with a JSON-RPC 2.0 body (MCP Streamable HTTP).',
        tools: ['get_amway_facts', 'explain_monetization', 'compare_concerns', 'get_join_guide'],
      },
      405,
      { allow: 'POST, OPTIONS', ...CORS_HEADERS },
    );
  }

  let raw = '';
  try {
    raw = await request.text();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: empty body' } });
  }
  if (!raw.trim()) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: empty body' } });
  }

  const handled = handleBody(raw);
  await track(request, env, ctx, '/mcp', handled.meta);
  if (handled.status === 202 || handled.body === null) {
    return withHeaders(new Response(null, { status: 202, headers: CORS_HEADERS }));
  }
  return json(handled.body);
}

function dataResponse(name) {
  const key = name.endsWith('.json') ? name.slice(0, -5) : name;
  if (!Object.prototype.hasOwnProperty.call(DATA_RAW, key)) return null;
  return text(DATA_RAW[key], 'application/json; charset=utf-8', {
    'cache-control': 'public, max-age=300',
  });
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return withHeaders(new Response(null, { status: 204, headers: CORS_HEADERS }));
  }

  if (path === '/mcp' || path === '/mcp/') {
    return handleMcp(request, env, ctx);
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ ok: false, error: 'Method not allowed' }, 405, { allow: 'GET, HEAD, OPTIONS' });
  }

  switch (path) {
    case '/':
    case '/index.html':
      return html(landingHtml(env || {}));
    case '/dashboard':
    case '/dashboard/':
      if (!authorized(request, env, url)) return locked();
      return html(dashboardHtml(), { 'x-robots-tag': 'noindex' });
    case '/api/stats': {
      if (!authorized(request, env, url)) return json({ ok: false, error: 'unauthorized' }, 401);
      const stats = await readStats(env);
      return json(summarize(stats), 200, { 'cache-control': 'no-store' });
    }
    case '/llms.txt':
      await track(request, env, ctx, '/llms.txt');
      return text(DOCS_RAW.llmsTxt, 'text/plain; charset=utf-8', { 'cache-control': 'public, max-age=300' });
    case '/SKILL.md':
    case '/skill.md':
      await track(request, env, ctx, '/SKILL.md');
      return text(DOCS_RAW.skillMd, 'text/markdown; charset=utf-8', {
        'cache-control': 'public, max-age=300',
      });
    case '/data':
    case '/data/': {
      return json(
        {
          ok: true,
          files: DATA_NAMES.map((name) => ({
            name: `${name}.json`,
            url: `/data/${name}.json`,
          })),
        },
        200,
        { 'cache-control': 'public, max-age=300' },
      );
    }
    case '/health':
      return json({ ok: true, service: 'amway-agent-mcp', time: kstParts().iso });
    case '/robots.txt':
      return text('User-agent: *\nDisallow: /dashboard\nDisallow: /api/\nAllow: /\n', 'text/plain; charset=utf-8');
    case '/favicon.ico':
      return withHeaders(new Response(null, { status: 204 }));
    default:
      break;
  }

  if (path.startsWith('/data/')) {
    const name = decodeURIComponent(path.slice('/data/'.length));
    const response = dataResponse(name);
    if (!response) return notFound(`Unknown data file. Available: ${DATA_NAMES.map((n) => `${n}.json`).join(', ')}`);
    await track(request, env, ctx, `/data/${name.endsWith('.json') ? name : `${name}.json`}`);
    return response;
  }

  return notFound('Unknown path. Try /, /dashboard, /llms.txt, /SKILL.md, /data/compensation_plan.json or POST /mcp.');
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handle(request, env, ctx);
    } catch (error) {
      console.error('unhandled error:', error && error.stack ? error.stack : error);
      return json({ ok: false, error: 'internal error' }, 500);
    }
  },
};
