// The Korean dashboard and the landing page, rendered as plain HTML with an
// inline script that polls /api/stats. No build step, no framework, no fonts
// from a CDN: one request and the page works.

const REPO_URL = 'https://github.com/gitsong123/network';

const STYLE = `
:root{
  --bg:#f5f6f8; --panel:#ffffff; --ink:#16181d; --muted:#6b7280; --line:#e6e8ec;
  --accent:#2f6fed; --accent-soft:#e8efff; --good:#0f9d58; --warn:#d97706;
  --shadow:0 1px 2px rgba(16,24,40,.06),0 4px 14px rgba(16,24,40,.05);
}
@media (prefers-color-scheme: dark){
  :root{ --bg:#0f1115; --panel:#171a20; --ink:#e8eaed; --muted:#9aa2ae; --line:#262a32;
         --accent:#6f9bff; --accent-soft:#1b2540; --good:#31c48d; --warn:#f0b429;
         --shadow:0 1px 2px rgba(0,0,0,.4),0 4px 14px rgba(0,0,0,.25); }
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
html{overflow-x:hidden}
body{background:var(--bg);color:var(--ink);
  font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Malgun Gothic","Noto Sans KR",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;line-height:1.5}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
header{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--panel) 88%,transparent);
  backdrop-filter:saturate(1.2) blur(8px);border-bottom:1px solid var(--line)}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-height:60px;padding:10px 0}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:-.01em}
.brand .cloud{font-size:20px}
.badge{font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;
  background:var(--accent-soft);color:var(--accent);border:1px solid transparent;white-space:nowrap}
.badge.warn{background:transparent;color:var(--warn);border-color:color-mix(in srgb,var(--warn) 35%,transparent)}
.spacer{flex:1}
.crumb{color:var(--muted);font-weight:600}
.crumb::before{content:'·';margin:0 6px;color:var(--line)}
.live{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);flex-wrap:wrap}
.dot{width:8px;height:8px;border-radius:50%;background:var(--good);display:inline-block;
  box-shadow:0 0 0 0 rgba(15,157,88,.5);animation:pulse 2.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(15,157,88,.45)}70%{box-shadow:0 0 0 8px rgba(15,157,88,0)}100%{box-shadow:0 0 0 0 rgba(15,157,88,0)}}
button{font:inherit;font-size:13px;font-weight:600;color:var(--ink);background:var(--panel);
  border:1px solid var(--line);border-radius:8px;padding:7px 12px;cursor:pointer;box-shadow:var(--shadow)}
button:hover{border-color:var(--accent);color:var(--accent)}
button:active{transform:translateY(1px)}
.switch{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
main{padding:24px 0 48px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
@media (max-width:860px){.cards{grid-template-columns:repeat(2,1fr)}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;box-shadow:var(--shadow)}
.card .label{font-size:12.5px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:6px}
.card .value{font-size:30px;font-weight:750;letter-spacing:-.02em;margin-top:6px;
  font-variant-numeric:tabular-nums}
.card .sub{font-size:12px;color:var(--muted);margin-top:2px}
.card.hero .value{color:var(--accent)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
@media (max-width:860px){.grid{grid-template-columns:1fr}}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow);margin-bottom:16px}
.panel h2{font-size:14px;margin:0 0 14px;font-weight:700;display:flex;align-items:center;gap:8px}
.panel h2 .hint{font-weight:500;color:var(--muted);font-size:12px}
.rows{display:flex;flex-direction:column;gap:10px}
.row{display:grid;grid-template-columns:168px minmax(0,1fr) 46px;align-items:center;gap:10px;font-size:12.5px}
@media (max-width:520px){.row{grid-template-columns:128px minmax(0,1fr) 40px}}
.row .name{color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .track{height:8px;background:var(--accent-soft);border-radius:999px;overflow:hidden}
.row .fill{height:100%;background:var(--accent);border-radius:999px;min-width:2px;transition:width .4s ease}
.row .num{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums;font-weight:600}
.empty{color:var(--muted);font-size:13px;padding:8px 0}
.days{display:flex;align-items:flex-end;gap:6px;height:120px;padding-top:6px}
.day{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;height:100%}
.day .bar2{width:100%;background:var(--accent);border-radius:6px 6px 3px 3px;min-height:3px;
  opacity:.85;transition:height .4s ease}
.day.zero .bar2{background:var(--line)}
.day .d{font-size:10.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.day .v{font-size:11px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}
.recent{display:flex;flex-direction:column}
.ev{display:grid;grid-template-columns:108px minmax(0,1fr);gap:12px;align-items:center;
  padding:9px 0;border-top:1px solid var(--line);font-size:13px}
.ev:first-child{border-top:0}
@media (max-width:640px){.ev{grid-template-columns:88px minmax(0,1fr);gap:8px}}
.ev .when{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12.5px;white-space:nowrap}
.ev .what{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tag{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent);white-space:nowrap}
.tag.grey{background:transparent;border:1px solid var(--line);color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--muted)}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:12px;padding:18px 0 40px}
footer .wrap{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.notice{font-size:12px;color:var(--muted);margin-top:10px}
`;

const CLIENT_SCRIPT = String.raw`
(function(){
  var REFRESH_MS = 30000;
  var timer = null;
  var lastAt = null;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function n(v){ return (v || 0).toLocaleString('ko-KR'); }
  function pct(part, whole){ return whole > 0 ? Math.max(1.5, Math.round(part / whole * 100)) : 0; }

  function rows(el, items, emptyText){
    if(!items || !items.length){ el.innerHTML = '<div class="empty">' + esc(emptyText) + '</div>'; return; }
    var max = items.reduce(function(m, it){ return Math.max(m, it.count); }, 0);
    el.innerHTML = items.map(function(it){
      return '<div class="row"><div class="name" title="' + esc(it.key) + '">' + esc(it.label || it.key) + '</div>' +
        '<div class="track"><div class="fill" style="width:' + pct(it.count, max) + '%"></div></div>' +
        '<div class="num">' + n(it.count) + '</div></div>';
    }).join('');
  }

  function render(s){
    document.getElementById('v-total').textContent = n(s.total);
    document.getElementById('v-today').textContent = n(s.today_count);
    document.getElementById('v-join').textContent = n(s.join_guide_views);
    document.getElementById('v-agents').textContent = n(s.agent_kinds);
    document.getElementById('s-total').textContent = s.first_seen ? ('처음 기록 ' + s.first_seen.slice(0,10)) : '아직 기록 없음';
    document.getElementById('s-today').textContent = s.today + ' (KST)';
    document.getElementById('s-join').textContent = 'get_join_guide 호출 누적';
    document.getElementById('s-agents').textContent = '구분된 에이전트 종류';

    rows(document.getElementById('agents'), s.agents.filter(function(a){ return a.count > 0; }),
      '아직 AI 에이전트 방문이 없습니다.');
    rows(document.getElementById('topics'), s.topics, '아직 도구 호출이 없습니다.');

    var el = document.getElementById('days');
    var max = s.days.reduce(function(m, d){ return Math.max(m, d.count); }, 0);
    el.innerHTML = s.days.map(function(d){
      var h = max > 0 ? Math.round(d.count / max * 100) : 0;
      return '<div class="day' + (d.count ? '' : ' zero') + '" title="' + esc(d.date) + ' · ' + d.count + '회">' +
        '<div class="v">' + (d.count ? d.count : '') + '</div>' +
        '<div class="bar2" style="height:' + (d.count ? Math.max(6, h) : 3) + '%"></div>' +
        '<div class="d">' + esc(d.date.slice(5).replace('-', '/')) + '</div></div>';
    }).join('');

    var rc = document.getElementById('recent');
    if(!s.recent.length){
      rc.innerHTML = '<div class="empty">아직 방문 기록이 없습니다. <span class="mono">/llms.txt</span>나 <span class="mono">/mcp</span>를 한 번 호출하면 여기에 나타납니다.</div>';
    } else {
      rc.innerHTML = s.recent.map(function(e){
        var what = '<span class="tag">' + esc(e.agent_label) + '</span>' +
          '<span class="mono">' + esc(e.path) + '</span>' +
          (e.tool ? '<span class="tag grey">' + esc(e.tool) + '</span>' : '') +
          (e.arg ? '<span class="mono">' + esc(e.arg) + '</span>' : '');
        return '<div class="ev"><div class="when">' + esc(e.at.slice(5,16).replace('T',' ')) + '</div>' +
          '<div class="what">' + what + '</div></div>';
      }).join('');
    }

    lastAt = new Date();
    document.getElementById('updated').textContent = '갱신 ' + lastAt.toTimeString().slice(0,8);
  }

  // The page is only served when ?token=… matched, so the same token is carried
  // to /api/stats; otherwise a locked dashboard would render but never load data.
  function token(){
    try{ return new URLSearchParams(location.search).get('token') || ''; }catch(e){ return ''; }
  }

  function load(){
    var q = token();
    fetch('/api/stats' + (q ? '?token=' + encodeURIComponent(q) : ''), {cache:'no-store'})
      .then(function(r){ if(r.status === 401 || r.status === 403){ throw new Error('unauthorized'); } return r.json(); })
      .then(render)
      .catch(function(){ document.getElementById('updated').textContent = '불러오기 실패 — 토큰을 확인하거나 잠시 후 다시 시도합니다'; });
  }

  function schedule(){
    if(timer){ clearInterval(timer); timer = null; }
    if(document.getElementById('auto').checked){
      timer = setInterval(function(){
        if(document.visibilityState === 'visible'){ load(); }
      }, REFRESH_MS);
    }
  }

  document.getElementById('refresh').addEventListener('click', load);
  document.getElementById('auto').addEventListener('change', function(){
    try{ localStorage.setItem('amway-auto', this.checked ? '1' : '0'); }catch(e){}
    schedule();
  });
  try{
    var saved = localStorage.getItem('amway-auto');
    if(saved === '0'){ document.getElementById('auto').checked = false; }
  }catch(e){}
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && document.getElementById('auto').checked){ load(); }
  });
  schedule();
  load();
})();
`;

export function dashboardHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>방문 대시보드 — amway-agent-mcp (비공식)</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <div class="wrap bar">
    <div class="brand"><span class="cloud">☁️</span> amway-agent-mcp <span class="badge">비공식 · ABO 운영</span> <span class="crumb">방문 대시보드</span></div>
    <div class="spacer"></div>
    <div class="live">
      <span class="dot"></span><span id="updated">불러오는 중…</span>
      <label class="switch"><input type="checkbox" id="auto" checked> 자동 새로고침 30초</label>
      <button id="refresh" type="button">지금 새로고침</button>
    </div>
  </div>
</header>
<main class="wrap">
  <div class="cards">
    <div class="card hero"><div class="label">총 방문</div><div class="value" id="v-total">–</div><div class="sub" id="s-total">–</div></div>
    <div class="card"><div class="label">오늘 방문</div><div class="value" id="v-today">–</div><div class="sub" id="s-today">–</div></div>
    <div class="card"><div class="label">가입안내 조회</div><div class="value" id="v-join">–</div><div class="sub" id="s-join">–</div></div>
    <div class="card"><div class="label">AI 에이전트</div><div class="value" id="v-agents">–</div><div class="sub" id="s-agents">–</div></div>
  </div>

  <div class="grid">
    <div class="panel">
      <h2>AI 에이전트별 방문 <span class="hint">User-Agent로 구분</span></h2>
      <div class="rows" id="agents"></div>
    </div>
    <div class="panel">
      <h2>많이 찾은 주제 <span class="hint">도구·인자별</span></h2>
      <div class="rows" id="topics"></div>
    </div>
  </div>

  <div class="panel">
    <h2>최근 14일 방문 <span class="hint">KST</span></h2>
    <div class="days" id="days"></div>
  </div>

  <div class="panel">
    <h2>최근 방문 <span class="hint">최대 50건 · IP·쿠키·User-Agent 원문은 저장하지 않습니다</span></h2>
    <div class="recent" id="recent"></div>
  </div>

  <div class="notice">
    이 대시보드는 무료 Cloudflare Workers + KV 위에서 동작합니다. 방문자 개인정보 대신
    <b>경로 · 도구 · 인자 · 에이전트 분류 · 시각</b>만 집계합니다.
  </div>
</main>
<footer>
  <div class="wrap">
    <span>한국암웨이 공식 서비스가 아닙니다. 독립 ABO(후원 번호 7024721762)가 운영하는 비공식 안내입니다.</span>
    <span class="spacer"></span>
    <a href="/llms.txt">llms.txt</a>
    <a href="/SKILL.md">SKILL.md</a>
    <a href="/">홈</a>
    <a href="${REPO_URL}" rel="noopener">GitHub</a>
  </div>
</footer>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

export function landingHtml(env) {
  const endpoint = (env && env.PUBLIC_URL) || '';
  const mcpLine = endpoint ? `${endpoint}/mcp` : '<span class="mono">https://&lt;worker&gt;.workers.dev/mcp</span>';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>amway-agent-mcp — 원격 MCP (비공식)</title>
<style>${STYLE}
.hero2{padding:36px 0 8px}
.hero2 h1{font-size:28px;margin:0 0 10px;letter-spacing:-.02em}
.hero2 p{color:var(--muted);margin:0 0 18px;max-width:720px}
.links{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin:18px 0 8px}
.link{display:block;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.link b{display:block;margin-bottom:2px}
.link span{font-size:12.5px;color:var(--muted)}
pre{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;overflow:auto;font-size:12.5px}
</style>
</head>
<body>
<header><div class="wrap bar">
  <div class="brand"><span class="cloud">☁️</span> amway-agent-mcp <span class="badge">비공식 · ABO 운영</span></div>
  <div class="spacer"></div>
  <div class="live"><a href="/dashboard">방문 대시보드 →</a></div>
</div></header>
<main class="wrap">
  <div class="hero2">
    <h1>한국암웨이 팩트를 AI 에이전트가 바로 읽는 원격 MCP</h1>
    <p>사업 구조·수익 구조·제품·법규·반품 규정을 균형 있게 답하는 비공식 지식 서버입니다.
    한국암웨이 공식 서비스가 아니고 회사의 승인을 받지 않았으며, 독립 ABO(후원 번호 <b>7024721762</b>)가
    정보 제공 목적으로 운영합니다. 소득·효능을 보장하지 않습니다.</p>
    <div class="links">
      <a class="link" href="/llms.txt"><b>llms.txt</b><span>에이전트용 요약 (핵심값·질문 매핑)</span></a>
      <a class="link" href="/SKILL.md"><b>SKILL.md</b><span>에이전트 규칙·니즈별 매핑</span></a>
      <a class="link" href="/mcp"><b>/mcp</b><span>MCP Streamable HTTP (POST, JSON-RPC 2.0)</span></a>
      <a class="link" href="/dashboard"><b>/dashboard</b><span>실시간 방문·조회 대시보드 (토큰 필요)</span></a>
      <a class="link" href="/api/stats"><b>/api/stats</b><span>집계 JSON (토큰 필요)</span></a>
      <a class="link" href="/data/compensation_plan.json"><b>/data/:name</b><span>원본 팩트 JSON 5종</span></a>
    </div>
    <pre>curl -s ${escAttr(mcpLine)} -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_amway_facts","arguments":{"category":"business"}}}'</pre>
    <p class="notice">MCP 클라이언트에는 <span class="mono">${escAttr(mcpLine)}</span> 를 원격 MCP 서버 주소로 등록하세요(전송: Streamable HTTP).</p>
  </div>
</main>
<footer><div class="wrap">
  <span>비공식 · 공식 정보는 <a href="https://www.amway.co.kr" rel="noopener">amway.co.kr</a> · 고객센터 1588-0080</span>
  <span class="spacer"></span><a href="${REPO_URL}" rel="noopener">GitHub</a>
</div></footer>
</body>
</html>`;
}

function escAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
