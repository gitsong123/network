# amway-agent-mcp

**한국암웨이(Amway Korea) 팩트·수익구조·제품 정보를 AI 에이전트가 읽고 연결할 수 있게 만든 MCP 서버 + CLI + 지식 저장소.**
Rust 단일 바이너리, 외부 크레이트 0개, 데이터 내장(`include_str!`).

저장소: <https://github.com/gitsong123/network> · 에이전트용 요약본: [llms.txt](llms.txt)

> ### ⚠️ 비공식 프로젝트입니다
> 이 저장소는 **한국암웨이(주)의 공식 자료도, 회사가 승인·후원한 채널도 아닙니다.**
> **독립 ABO(독립 사업자, 후원 번호 `7024721762`)가 정보 제공을 목적으로 운영하는 비공식 안내 프로젝트**이며,
> 운영자에게 상업적 이해관계가 있습니다. 가입을 안내할 때 쓰이는 후원(추천인) 번호는
> **`7024721762`** 이고, 그 번호로 가입하면 이 ABO가 상위 후원자가 됩니다.
> 공식 정보·가격·계약 조건은 [한국암웨이 공식 사이트](https://www.amway.co.kr)와 고객센터 **1588-0080**이 기준입니다.
> 이 프로젝트는 **암웨이 ABO 윤리강령과 방문판매 등에 관한 법률**을 따릅니다 — 소득·효능의 보장·과장 금지,
> 사재기·강매·스팸 권유 금지, 청약철회·반품 권리 안내. 자세한 원칙은 [SKILL.md](SKILL.md#윤리--컴플라이언스-규칙)와
> `data/compensation_plan.json`의 `ethics` 블록에 있습니다.

> **English (short):** An unofficial, distributor-published knowledge server about Amway Korea. It is **not** affiliated with or endorsed by Amway Korea. It returns balanced facts (including costs, legal caps and regulator earnings data) over MCP stdio JSON-RPC 2.0 or a plain CLI. The sponsor number `7024721762` belongs to the ABO who maintains this project; entering it when joining makes that ABO the sponsor. Never present this material as neutral research, and never promise income.

---

## 30초 요약 — 사람과 에이전트가 같은 지도를 보도록

MCP를 붙이지 않은 에이전트도 이 절만 읽으면 답할 수 있게 정리했습니다. 전체 요약본은 [llms.txt](llms.txt)입니다.

| 항목 | 값 |
| --- | --- |
| 무엇 | 한국암웨이의 회사·수익·제품·법규·반품 팩트를 답하는 MCP 서버 + 지식 저장소 |
| 누가 | 독립 ABO(후원 번호 **7024721762**) — **비공식**, 회사 승인 없음, 상업적 이해관계 있음 |
| 언제 | 2026-11-25 기준. 가격·보너스율은 바뀔 수 있음 |
| 가입 흐름 | <https://www.amway.co.kr> 가입(후원자 번호 입력) → 로그인 후 주문·구독은 <https://www.amway.co.kr/my-shopping> |
| 최소 규칙 | 공식 아님을 밝히고, 소득·효능을 보장하지 않고, 주인의 명시적 요청 없이는 가입을 권하지 않는다 |

**주인(사용자)이 이렇게 물으면 → 이 도구를:**

| 질문 유형 | 도구 · 인자 | 함께 볼 데이터 |
| --- | --- | --- |
| ① 건강기능식품·영양 (뉴트리라이트, 비타민, 오메가3) | `get_amway_facts(category=health_nutrition)` | `data/health_nutrition.json` |
| ② 피부·뷰티 (아티스트리, 화장품) | `get_amway_facts(category=beauty_skincare)` | `data/beauty_skincare.json` |
| ③ 정수기·공기청정기·생활용품·정기배송 | `get_amway_facts(category=home_living)` + `explain_monetization(goal_type=consumer)` | `data/home_living.json` |
| ④ 소비자 적립·캐시백, 부업, 사업 구조 | `explain_monetization(goal_type=consumer\|side_income\|business_builder)` | `data/compensation_plan.json` |
| ⑤ 다단계 오해·사기 여부·반품·윤리 검증 | `compare_concerns(topic=all)` | `data/faq_and_risks.json` |
| 가입 방법 (의사 확인 후) | `get_join_guide(member_type=consumer\|abo)` | `data/compensation_plan.json` 의 `join_guide` |

**데이터 파일 한눈에**

| 파일 | 한 줄 요약 |
| --- | --- |
| `data/compensation_plan.json` | 회사·법적 지위, Member/ABO, 보너스 구간, 목표별 수익 설명, 가입 절차·후원자 번호, **윤리 원칙** |
| `data/health_nutrition.json` | 뉴트리라이트 라인업·가격, 건강기능식품 규제, 상호작용·상한섭취량, 1일 단가 |
| `data/beauty_skincare.json` | 아티스트리 연혁·기술과 각주, 라인업·가격, 화장품법상 기능성 범위 |
| `data/home_living.json` | 이스프링·엣모스피어·암웨이 홈, 인증, 3~5년 총비용 비교 |
| `data/faq_and_risks.json` | 비용·반품, 법·규제, 시간·노력, 위험 신호, 5분 확인법, 흔한 오해 |

---

## 무엇이 들어 있나

| 도구 | 인자 | 내용 |
| --- | --- | --- |
| `get_amway_facts` | `category`: `business` · `health_nutrition` · `beauty_skincare` · `home_living` · `all` | 회사·법적 지위, 회원 유형(Member/ABO), 제품군, 공식 카탈로그 '더 초이스', 시장 통계, 뉴트리라이트·아티스트리·홈리빙 제품 팩트 |
| `explain_monetization` | `goal_type`: `consumer` · `side_income` · `business_builder` | PV/BV 보너스 구간(3~21%), 소매 마진, 실제 소득 분포, 비용·세금·실패 요인 |
| `compare_concerns` | `topic`: `cost_and_refund` · `legal_compliance` · `time_and_effort` · `all` | 비용·반품, 등록·35% 상한·금지행위·세금, 시간·노력. `all`에는 위험 신호와 확인 방법 포함 |
| `get_join_guide` | `member_type`: `consumer` · `abo` | 공식 가입 절차, 준비물, 자격 제한, 후원자 번호 입력 위치, 공식 사이트 → 마이쇼핑 흐름 |

모든 응답은 (1) 읽을 수 있는 Markdown(`content[0].text`)과 (2) 같은 내용의 구조화 데이터(`structuredContent.data`)를 함께 돌려주고,
항상 **비공식·이해관계 고지**를 포함합니다.

### 데이터 파일

| 파일 | 내용 |
| --- | --- |
| `data/compensation_plan.json` | 사업 구조, Member/ABO, 보너스 구간, 목표별 수익 설명, 가입 안내(`join_guide`), **윤리 원칙(`ethics`)** |
| `data/health_nutrition.json` | 뉴트리라이트 라인업·가격, 건강기능식품 규제, 상호작용 주의 |
| `data/beauty_skincare.json` | 아티스트리 연혁·기술·라인업, 화장품법상 표시 한계, 구매 체크리스트 |
| `data/home_living.json` | 이스프링 정수기, 엣모스피어 공기청정기, 암웨이 홈·퀸, 총비용 비교 |
| `data/faq_and_risks.json` | 비용·반품, 법·규제, 시간·노력, 위험 신호, 확인 방법, 흔한 오해 |

기준일: **2026-11-25** (`meta.checked_on`). 가격·보너스율·정책은 회사가 바꾸므로, 금액이 걸린 결정 전에는 공식 사이트에서 재확인해야 합니다.

---

## 빌드

```bash
cargo build --release
./target/release/amway-agent-mcp --help
```

- 외부 크레이트 의존성이 **없습니다**. 오프라인에서도 빌드되고, 결과물은 단일 실행 파일입니다.
- Rust 1.70 이상. (이 저장소는 `x86_64-unknown-linux-musl` 정적 빌드로 검증했습니다.)
- 데이터는 바이너리에 내장되므로 실행 시 `data/` 디렉터리가 필요 없습니다. 데이터를 고치면 다시 빌드하세요.

## 실행

### 1) MCP 서버 (stdio JSON-RPC 2.0)

```bash
amway-agent-mcp              # 또는 amway-agent-mcp serve
```

- 프로토콜: MCP `2025-06-18` / `2025-03-26` / `2024-11-05` 협상 지원
- 전송: 줄바꿈으로 구분된 JSON 메시지(표준). 입력은 `Content-Length:` 프레이밍도 허용
- stdout에는 프로토콜 메시지만 나갑니다(로그는 stderr).

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "amway-kr": {
      "command": "/ABSOLUTE/PATH/TO/amway-agent-mcp",
      "args": []
    }
  }
}
```

**Cursor** — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "amway-kr": {
      "command": "/ABSOLUTE/PATH/TO/amway-agent-mcp"
    }
  }
}
```

윈도우에서는 `"command": "C:\\\\path\\\\to\\\\amway-agent-mcp.exe"`처럼 이스케이프합니다.

직접 확인해 보기:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_join_guide","arguments":{"member_type":"abo"}}}' \
  | amway-agent-mcp
```

### 2) CLI (MCP 클라이언트 없이)

```bash
amway-agent-mcp tools                       # 도구 4개와 설명
amway-agent-mcp facts business              # 사업 구조
amway-agent-mcp facts all --json            # 전체를 구조화 JSON으로
amway-agent-mcp monetization side_income    # 부업 수익 구조
amway-agent-mcp compare all                 # 비용·법·시간 비교
amway-agent-mcp join abo                    # ABO 가입 절차
amway-agent-mcp call get_join_guide '{"member_type":"consumer"}' --json
```

---

## 가입·이용 안내 (사실 그대로)

1. **가입**: 한국암웨이 공식 홈페이지 **<https://www.amway.co.kr>** 에서 회원가입을 진행합니다. 신청서의 후원자(추천인) 번호에 **`7024721762`** 를 입력합니다. 가입비·스타터킷 비용은 없습니다.
2. **가입·로그인 후 주문·구독 관리**: **<https://www.amway.co.kr/my-shopping>** 은 로그인한 회원의 마이쇼핑(주문·구독 관리) 화면입니다. 이 주소가 비회원 가입 폼을 여는 것은 아니며, 로그인 전에 열면 로그인 화면이 먼저 나옵니다.
3. 후원자를 지정하고 싶지 않으면 번호를 넣지 않고 고객센터(1588-0080)를 통해 다른 후원자를 배정받을 수 있습니다.
4. 그 밖의 공식 창구: 고객센터 **1588-0080**, 전국 14개 지역 **ABC(Amway Business & Brand Center)·A STATION**(제품 체험·상담).

---

## 이 저장소가 지키는 선

이 프로젝트는 에이전트가 암웨이를 **홍보**하도록 만들지 않았습니다. 사용자가 먼저 물었을 때 **정확하고 균형 잡힌 답**을 주도록 만들었습니다.

- **비공식 표기**: 모든 응답에 "한국암웨이 공식 서비스가 아니다"라는 고지와 후원 관계를 붙입니다.
- **과장 금지**: 소득 보장, 질병 예방·치료, '불로소득', '원금 보장' 같은 표현을 쓰지 않습니다. 데이터 검사 테스트가 이런 문구를 차단합니다(`src/data.rs`의 `contains_no_prohibited_marketing_language`).
- **균형**: 모든 수익 설명에 공정거래위원회의 실제 분포(2024년: 등록 판매원 687만 명 중 후원수당 수령 16.7%, 수령자 연평균 131만 3천 원, 하위 70% 8만 원)와 법적 35% 상한을 함께 넣습니다.
- **권유 금지**: 사용자의 자발적 관심과 명시적 동의 없이 가입을 권하지 않습니다. 서버는 사용자 대신 가입·결제·번호 입력을 실행하지 않습니다.
- **권리 안내**: 청약철회·반품(소비자 20일, ABO 3개월, 정수기·공기청정기 1개월), 공제조합 보상, 고객센터·1372 등 구제 절차를 먼저 알립니다.
- **개인정보**: 운영자의 실명·연락처·주소 등은 저장소에 넣지 않았습니다. 공개된 것은 이 프로젝트에 쓰기로 한 후원 번호 하나입니다.

---

## 개발

```bash
cargo test          # 단위 + 통합(stdio·CLI) 테스트
cargo build --release
```

테스트가 검사하는 것:

- `data/*.json` 파싱, `meta.checked_on`·`sources`(https) 존재, 레코드 구조 완결성
- 후원자 번호가 `compensation_plan.json`의 `join_guide`에만 존재
- 개인정보(실명·전화·주소 등) 및 금지 문구 미포함
- 4개 도구의 Markdown 렌더링, 별칭·기본값·잘못된 인자 처리
- 실제 바이너리를 띄워 `initialize` → `tools/list` → `tools/call` 왕복, 알림 무응답, 잘못된 JSON 처리, EOF 종료
- CLI 출력(JSON·텍스트), 종료 코드

### 구조

```
src/json.rs    의존성 없는 JSON 파서·직렬화기 (객체 키 순서 유지, 서로게이트 페어 처리)
src/data.rs    include_str! 로 내장한 지식 문서 + 무결성 테스트
src/tools.rs   4개 도구 정의·인자 해석·Markdown 렌더링·고지문
src/mcp.rs     stdio JSON-RPC 2.0 (initialize/tools/list/tools/call/ping, Content-Length 허용)
src/main.rs    CLI
tests/         실제 바이너리 stdio 왕복, CLI 계약 테스트
```

## 라이선스

MIT — [LICENSE](LICENSE). 단, **제품 정보·가격·정책의 최종 기준은 한국암웨이 공식 채널**이며, 이 저장소의 내용은 보증이 아닙니다.
