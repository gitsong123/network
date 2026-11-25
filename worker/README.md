# worker/ — 무료 Cloudflare 원격 MCP + 실시간 방문 대시보드

이 폴더는 같은 지식 베이스(`../data/*.json`, `../llms.txt`, `../SKILL.md`)를 **설치 없이 URL로 바로 쓰는
원격 MCP 서버**로 서빙하고, **AI 에이전트가 언제 무엇을 물었는지** 실시간으로 보여 주는 대시보드를
**Cloudflare 무료 플랜**(Workers Free + KV Free / Pages Free)에 올리는 코드입니다. 유료 플랜·과금 설정은 쓰지 않습니다.

배포된 주소(공개):

| 경로 | 내용 |
| --- | --- |
| <https://amway-agent-mcp.pages.dev/mcp> | 원격 MCP (Streamable HTTP, JSON-RPC 2.0) |
| <https://amway-agent-mcp.pages.dev/llms.txt> | 에이전트용 요약 |
| <https://amway-agent-mcp.pages.dev/SKILL.md> | 에이전트 스킬 |
| <https://amway-agent-mcp.pages.dev/data/compensation_plan.json> | 팩트 JSON 5종 |
| <https://amway-agent-mcp.pages.dev/dashboard> | 방문 대시보드 (한국어) |
| <https://amway-agent-mcp.pages.dev/api/stats> | 집계 JSON |

같은 코드가 Cloudflare **Workers**(`<worker-name>.<account>.workers.dev`)에도 올라가 있고, 두 배포는
**같은 KV 네임스페이스**를 쓰므로 방문 집계가 한 대시보드로 합쳐집니다. 공개 주소는 위의 `pages.dev`입니다
(Workers 주소는 계정 서브도메인을 그대로 드러내므로 문서에 싣지 않습니다).

## 무엇을 하나

- **MCP**: `initialize` · `tools/list` · `tools/call` · `ping` (+ `resources/list` · `prompts/list` · `logging/setLevel`)을
  지원합니다. Rust MCP 서버(`src/tools.rs`)와 **같은 4개 도구**(`get_amway_facts`, `explain_monetization`,
  `compare_concerns`, `get_join_guide`)에 **같은 Markdown·같은 구조화 데이터**를 돌려줍니다.
  세션을 만들지 않는(stateless) 방식이라 어느 콜드 스타트에서도 바로 호출됩니다.
- **문서 서빙**: `llms.txt` · `SKILL.md` · `data/*.json`을 저장소 원문 그대로 내보냅니다.
- **비공식 고지 유지**: 모든 도구 응답에 비공식·이해관계 고지, 후원자 번호 `7024721762`의 의미,
  암웨이 윤리강령(사재기·강매·스팸 금지, 청약철회·반품 고지)이 그대로 들어갑니다.
- **방문 추적**: `/mcp`, `/llms.txt`, `/SKILL.md`, `/data/*` 요청마다 User-Agent로 분류한 에이전트
  (Claude, ChatGPT/OpenAI, Gemini, Copilot, Cursor, Perplexity, 봇/스크립트, 브라우저), 경로, 호출한 도구와
  인자(`category`, `goal_type`, `topic`, `member_type`), KST 시각을 기록합니다. **IP·쿠키·User-Agent 원문은
  저장하지 않습니다.**

## 무료 한도 안에서 도는 방식

| 항목 | 설계 | 무료 한도 |
| --- | --- | --- |
| 집계 저장 | KV 키 **하나**(`stats:v1`)에 전체 집계 + 최근 50건 링버퍼 | KV 읽기 100,000/일 |
| 방문 1건 비용 | 읽기 1 + 쓰기 1 | KV 쓰기 1,000/일 |
| 대시보드 새로고침 | `/dashboard`, `/api/stats`는 **집계에 포함하지 않음** | 쓰기 0 |
| 기록 시점 | 응답 전에 대기(await)해 한 클라이언트의 연속 요청이 겹치지 않게 함 | — |

KV는 원자적 증가를 지원하지 않으므로, 서로 다른 콜로에서 **완전히 동시에** 들어온 요청은 드물게
한 건이 유실될 수 있습니다. 정확한 정산용 카운터가 아니라 "AI가 실제로 방문했는가"를 보는 용도입니다.

## 로컬에서 돌리기

```bash
cd worker
npm install            # wrangler (devDependency)
npm test               # node --test, 40개 (KV는 인메모리 목)
npm run dev            # wrangler dev --local → http://127.0.0.1:8787
npm run smoke          # 배포된 인스턴스 실사용 점검 (10개 검사, 실제 방문으로 집계됨)
```

`npm run smoke`는 의존성 없이 `fetch`만으로 `/health`·`/llms.txt`·`/SKILL.md`·`/data/*`·`initialize`·
`tools/list`·`tools/call`·잘못된 인자 처리·`/api/stats`·`/dashboard`를 확인하고, 실패가 있으면 0이 아닌
종료 코드를 돌려줍니다. 다른 배포를 향할 때는 `node scripts/smoke.mjs https://<host>`.

테스트가 확인하는 것:

- MCP 4개 도구 전 인자 조합의 Markdown·구조화 데이터가 **Rust 바이너리와 바이트 단위로 동일**한지
  (`test/rust-parity.test.js` — Rust를 빌드하지 않았으면 그 부분만 건너뜀)
- `initialize`/`tools/list`/`tools/call`/`ping`/알림(202)/배치/오류 코드
- `/llms.txt`·`/SKILL.md`·`/data/*`가 저장소 원문과 **바이트 단위로 동일**한지
- 방문 기록이 집계·KST 일자·최근 50건에 쌓이는지, 대시보드 조회는 집계되지 않는지
- 동시 요청에서 카운트가 유실되지 않는지, KV 바인딩이 없어도 응답이 정상인지
- 번들에 개인정보·타 프로젝트 정보·실명이 섞이지 않았는지

데이터를 고쳤다면:

```bash
npm run sync-data      # ../data/*.json, ../llms.txt, ../SKILL.md → src/assets.generated.js
```

`npm test`가 먼저 `sync-data`를 실행하고, `test/assets.test.js`가 번들이 원본과 어긋나면 실패합니다.

## 배포

```bash
cd worker
npx wrangler login                                   # 또는 CLOUDFLARE_API_TOKEN 환경변수
npx wrangler kv namespace create amway-agent-mcp-STATS
#   → 출력된 id를 wrangler.toml 과 pages/wrangler.toml 의 [[kv_namespaces]].id 에 넣는다

npx wrangler deploy                                  # ① Workers (workers.dev)
npm run deploy:pages                                 # ② Pages (pages.dev) — 같은 코드, 같은 KV
```

- ②는 `scripts/build-pages.mjs`가 `pages/dist/_worker.js`를 만들고 `wrangler pages deploy`로 올립니다.
  Pages는 `--config`를 받지 않아 `pages/wrangler.toml`을 따로 둡니다.
- `PUBLIC_URL`(`wrangler.toml`, `pages/wrangler.toml`의 `[vars]`)은 랜딩 페이지에 표시할 공개 주소입니다.
- 커스텀 도메인·유료 라우팅은 쓰지 않습니다(`*.workers.dev`, `*.pages.dev`만).

## 대시보드 잠그기 (선택)

기본은 공개입니다(저장하는 값 자체가 개인정보가 아니므로). 방문 기록을 남에게 보이지 않게 하려면
시크릿을 넣고 `?token=...`으로만 열면 됩니다:

```bash
# ① Workers
npx wrangler secret put DASHBOARD_TOKEN
# ② Pages (둘 다 같은 값을 넣어야 두 주소가 함께 잠깁니다)
npx wrangler pages secret put DASHBOARD_TOKEN --project-name amway-agent-mcp
# ②는 시크릿을 넣은 뒤 Pages를 한 번 다시 배포해야 반영됩니다
npm run deploy:pages
# → https://<host>/dashboard?token=<값>
#    Authorization: Bearer <값> 도 허용 (대시보드와 /api/stats 둘 다 적용)
```

잠긴 상태의 동작:

| 경로 | 토큰 없음 | 토큰 있음 |
| --- | --- | --- |
| `/dashboard` | 403 (접근 제한 페이지) | 200 대시보드 |
| `/api/stats` | 401 `{"ok":false,"error":"unauthorized"}` | 200 집계 JSON |
| `/`, `/mcp`, `/llms.txt`, `/SKILL.md`, `/data/*` | 200 (그대로 공개) | 200 |

- 대시보드 페이지는 주소의 `?token=`을 `/api/stats` 호출에 그대로 넘깁니다. 토큰 없이 열면 카드가 비어 있습니다.
- `/dashboard`와 `/api/stats`는 집계에서 제외되므로 대시보드를 새로고침해도 방문 수가 늘지 않습니다.
- 토큰 값을 저장소·커밋·문서에 적지 마세요. 값을 잊으면 시크릿을 새로 넣고 같은 방식으로 다시 배포하면 됩니다.

## 파일

```
src/index.js             라우터 (CORS, 캐시, 보안 헤더, 추적)
src/mcp.js               JSON-RPC 2.0 / MCP Streamable HTTP (stateless)
src/knowledge.js         도구 4종 — src/tools.rs 포팅 (Markdown 렌더링)
src/track.js             User-Agent 분류, KST 시각, KV 집계
src/dashboard.js         대시보드·랜딩 HTML (프레임워크 없음, 인라인 CSS/JS)
src/assets.generated.js  sync-data가 만드는 번들 (직접 수정 금지)
scripts/sync-data.mjs    지식 베이스 번들러
scripts/build-pages.mjs  Pages용 번들 생성
scripts/smoke.mjs        배포본 실사용 점검 (의존성 없음)
pages/wrangler.toml      Pages 프로젝트 설정 (dist/_worker.js)
test/                    node --test (MCP, HTTP, 추적, 번들 무결성, Rust 패리티)
```

## MCP 클라이언트에 등록하기

원격 MCP를 지원하는 클라이언트(Claude Code, Cursor, VS Code 등)에서 서버 주소로
`https://amway-agent-mcp.pages.dev/mcp`를 넣고 전송 방식은 **Streamable HTTP**를 고릅니다.
stdio 방식이 필요하면 상위 폴더의 Rust 바이너리를 쓰세요.
