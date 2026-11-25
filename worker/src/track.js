// Visit tracking on Workers KV (free tier).
//
// Privacy: no IP address, no cookie, no referrer and no full User-Agent string is
// stored. Only the request path, the tool name and its single enum argument, a
// coarse agent class derived from the User-Agent, and the KST time.
//
// Free-tier efficiency: one KV key (`stats:v1`) holds the whole aggregate plus a
// ring buffer of the last 50 visits, so a visit costs one read and one write.
// Writes inside one isolate are serialised through a promise chain; the free
// plan allows 1,000 writes/day, which is far above the traffic this endpoint
// sees. Dashboard and /api/stats requests are never counted, so refreshing the
// dashboard cannot consume the quota.

export const STATS_KEY = 'stats:v1';
export const RECENT_LIMIT = 50;
export const DAYS_KEPT = 120;

/** Agent classes, with the Korean label the dashboard shows. */
export const AGENT_LABELS = {
  claude: 'Claude (Anthropic)',
  chatgpt: 'ChatGPT / OpenAI',
  gemini: 'Gemini / Google',
  copilot: 'GitHub Copilot',
  cursor: 'Cursor',
  perplexity: 'Perplexity',
  vscode: 'VS Code / IDE',
  bot: '스크립트·봇 (curl 등)',
  browser: '사람(브라우저)',
  unknown: '알 수 없음',
};

/**
 * Coarse agent class from a User-Agent header. AI agent markers win over the
 * browser tokens because most of them append a Mozilla-compatible suffix.
 */
export function classifyAgent(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (ua === '') return 'unknown';
  if (/claude|anthropic/.test(ua)) return 'claude';
  if (/chatgpt|openai|gptbot|oai-searchbot/.test(ua)) return 'chatgpt';
  if (/gemini|google-extended|googleother|google-genai|google-cloud/.test(ua)) return 'gemini';
  if (/copilot/.test(ua)) return 'copilot';
  if (/cursor/.test(ua)) return 'cursor';
  if (/perplexity/.test(ua)) return 'perplexity';
  if (/vscode|visual studio code|windsurf|cline|continue\.dev|zed\//.test(ua)) return 'vscode';
  if (
    /bot\b|crawler|spider|curl|wget|python-requests|python-urllib|httpx|aiohttp|node-fetch|undici|go-http-client|okhttp|java\/|libwww|postmanruntime|insomnia|axios/.test(
      ua,
    )
  ) {
    return 'bot';
  }
  if (/mozilla|chrome|crios|safari|firefox|edg\/|opr\//.test(ua)) return 'browser';
  return 'unknown';
}

/** KST clock parts for a Date (Asia/Seoul, no DST since 1988). */
export function kstParts(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const iso = kst.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ, but the wall clock is KST
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return { day, time, iso: `${day}T${time}:${iso.slice(17, 19)}+09:00` };
}

/** Paths worth counting. Everything else (dashboard, stats, assets) is free. */
export function shouldTrack(pathname) {
  if (pathname === '/mcp' || pathname === '/llms.txt' || pathname === '/SKILL.md') return true;
  if (pathname.startsWith('/data/')) return true;
  if (pathname.startsWith('/skills/')) return true;
  return false;
}

function emptyStats() {
  return {
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
}

function count(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function normalize(raw) {
  const base = emptyStats();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  out.total = Number.isFinite(raw.total) ? raw.total : 0;
  out.first_seen = typeof raw.first_seen === 'string' ? raw.first_seen : null;
  out.updated = typeof raw.updated === 'string' ? raw.updated : null;
  out.join_guide = Number.isFinite(raw.join_guide) ? raw.join_guide : 0;
  for (const field of ['days', 'agents', 'paths', 'tools', 'args']) {
    if (raw[field] && typeof raw[field] === 'object' && !Array.isArray(raw[field])) {
      out[field] = { ...raw[field] };
    }
  }
  if (Array.isArray(raw.recent)) {
    out.recent = raw.recent.filter((item) => item && typeof item === 'object').slice(0, RECENT_LIMIT);
  }
  return out;
}

/** Adds one visit to the aggregate (mutates `stats`). */
export function applyVisit(stats, visit) {
  const { t, p, a, n, g, d } = visit;
  stats.total += 1;
  count(stats.days, d || kstParts(new Date(t)).day);
  count(stats.agents, a);
  count(stats.paths, p);
  if (n) count(stats.tools, n);
  if (g) count(stats.args, g);
  if (n === 'get_join_guide') stats.join_guide += 1;
  stats.recent.unshift({ t, p, a, n: n || '', g: g || '' });
  if (stats.recent.length > RECENT_LIMIT) stats.recent.length = RECENT_LIMIT;
  const cutoff = Object.keys(stats.days).sort().slice(-DAYS_KEPT);
  if (cutoff.length > 0) {
    const keep = new Set(cutoff);
    for (const day of Object.keys(stats.days)) {
      if (!keep.has(day)) delete stats.days[day];
    }
  }
  const stamp = kstParts(new Date(t));
  if (!stats.first_seen) stats.first_seen = stamp.iso;
  stats.updated = stamp.iso;
  return stats;
}

export async function readStats(env) {
  if (!env || !env.STATS) return emptyStats();
  try {
    // cacheTtl 30 (the KV minimum) keeps a stale aggregate from sitting at the
    // edge for the default 60s, which would make the dashboard lag.
    return normalize(await env.STATS.get(STATS_KEY, { type: 'json', cacheTtl: 30 }));
  } catch (error) {
    console.warn('stats read failed:', error && error.message);
    return emptyStats();
  }
}

// One isolate handles its requests concurrently, so read-modify-write of the
// single aggregate key is serialised here to avoid losing counts.
let chain = Promise.resolve();
// The highest total this isolate has written. A read that comes back lower is a
// stale edge copy, and re-reading after a moment is cheaper than losing a count.
let highestSeen = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function recordVisit(env, visit) {
  if (!env || !env.STATS) return Promise.resolve();
  const task = async () => {
    let stats = await readStats(env);
    if (stats.total < highestSeen) {
      await sleep(120);
      stats = await readStats(env);
    }
    applyVisit(stats, visit);
    await env.STATS.put(STATS_KEY, JSON.stringify(stats));
    highestSeen = Math.max(highestSeen, stats.total);
  };
  chain = chain.then(task).catch((error) => {
    console.warn('stats write failed:', error && error.message);
  });
  return chain;
}

function sortedCounts(map) {
  return Object.entries(map)
    .map(([key, value]) => ({ key, count: value }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Dashboard/API view of the aggregate. */
export function summarize(stats, now = new Date()) {
  const today = kstParts(now).day;
  const agents = sortedCounts(stats.agents).map((entry) => ({
    ...entry,
    label: AGENT_LABELS[entry.key] || entry.key,
  }));
  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const day = kstParts(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)).day;
    days.push({ date: day, count: stats.days[day] || 0 });
  }
  return {
    ok: true,
    generated_at: kstParts(now).iso,
    today,
    total: stats.total,
    today_count: stats.days[today] || 0,
    join_guide_views: stats.join_guide,
    agent_kinds: agents.filter((entry) => entry.count > 0).length,
    first_seen: stats.first_seen,
    updated: stats.updated,
    agents,
    paths: sortedCounts(stats.paths),
    tools: sortedCounts(stats.tools),
    topics: sortedCounts(stats.args),
    days,
    recent: stats.recent.map((item) => {
      const stamp = kstParts(new Date(item.t));
      return {
        at: stamp.iso,
        day: stamp.day,
        time: stamp.time,
        path: item.p,
        agent: item.a,
        agent_label: AGENT_LABELS[item.a] || item.a,
        tool: item.n || '',
        arg: item.g || '',
      };
    }),
  };
}
