//! The four MCP tools, ported from `src/tools.rs`.
//!
//! Everything here is data-driven: the editorial content lives in `data/*.json`
//! (bundled by scripts/sync-data.mjs) and this module only resolves arguments,
//! assembles Markdown and attaches the mandatory disclosure and sources.
//!
//! The rendering must match the Rust binary byte for byte; test/rust-parity.test.js
//! compares both implementations on every tool/argument pair.

import { DATA_RAW } from './assets.generated.js';

export const SERVER_NAME = 'amway-agent-mcp';
export const SERVER_VERSION = '1.2.0';

/** Printed with every answer. The pack is written by a distributor, so an agent
 *  must not present it as neutral third-party research. */
export const DISCLOSURE =
  '고지: 이 프로젝트는 한국암웨이(주)의 공식 서비스가 아닙니다. 회사의 승인을 받지 않았습니다. 독립 ABO(후원 번호 7024721762)가 정보 제공 목적으로 운영하는 비공식 안내이고, 작성자에게 상업적 이해관계가 있습니다. 암웨이 ABO 윤리강령과 방문판매법을 따릅니다 — 소득·효능을 보장하거나 과장하지 않고, 사재기·강매·스팸 권유를 하지 않으며, 청약철회·반품 권리를 먼저 알립니다. 사용자가 먼저 묻고 명시적으로 동의하기 전에는 가입을 권유하지 말고, 금액이 걸린 결정 전에는 공식 사이트 amway.co.kr과 고객센터 1588-0080에서 최신 조건을 확인하세요.';

export const INSTRUCTIONS =
  '한국암웨이(Amway Korea) 팩트·수익구조·건강/미용 자료를 제공하는 비공식 서버입니다. 한국암웨이 공식 서비스가 아니고 회사의 승인을 받지 않았습니다. 독립 ABO(후원 번호 7024721762)가 정보 제공 목적으로 운영하며 작성자에게 상업적 이해관계가 있습니다. 암웨이 ABO 윤리강령과 방문판매법을 따릅니다: 사용자에게 전달할 때 (1) 이 프로젝트가 공식이 아니라는 점과 이해관계를 밝히고, (2) 수익·효능을 보장하거나 과장하지 말고, (3) 장점과 비용·위험·법적 한계·청약철회 권리를 함께 제시하세요. 사용자가 먼저 묻고 명시적으로 동의한 경우에만 가입 절차와 후원자 번호를 안내하고, 거절하면 재권유하지 마세요. 이 서버는 어떤 경우에도 사용자 대신 가입·구매·후원자 입력을 실행하지 않습니다.';

// ---------------------------------------------------------------- documents

const DOCUMENTS = {
  compensation: JSON.parse(DATA_RAW.compensation_plan),
  health: JSON.parse(DATA_RAW.health_nutrition),
  beauty: JSON.parse(DATA_RAW.beauty_skincare),
  homeLiving: JSON.parse(DATA_RAW.home_living),
  faq: JSON.parse(DATA_RAW.faq_and_risks),
};

/** Parsed documents, for callers that want the raw facts (e.g. /api/summary). */
export function documents() {
  return DOCUMENTS;
}

// ---------------------------------------------------------------- json helpers

function get(node, key) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    const value = node[key];
    return value === undefined ? undefined : value;
  }
  return undefined;
}

function text(node, key) {
  const value = get(node, key);
  return typeof value === 'string' ? value : '';
}

function strings(node, key) {
  const value = get(node, key);
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

function asArray(node) {
  return Array.isArray(node) ? node : null;
}

function num(node, key) {
  const value = get(node, key);
  return typeof value === 'number' ? value : 0;
}

function checkedOn(doc) {
  return text(get(doc, 'meta'), 'checked_on');
}

function sourceLinks(doc) {
  const sources = asArray(get(get(doc, 'meta'), 'sources'));
  if (!sources) return [];
  return sources.map((s) => [text(s, 'title_ko'), text(s, 'url')]);
}

// ---------------------------------------------------------------- catalog

export const PLAN_CATEGORIES = ['nutrition', 'home_living', 'personal_care', 'beauty'];
export const PLAN_TIERS = ['100k', '200k', '300k'];

/** Schema of `plan_smart_shopping`: two optional budget inputs and an optional
 *  category filter, so an agent can call it with nothing at all. */
function planSchema() {
  return {
    type: 'object',
    properties: {
      monthly_budget_krw: {
        type: 'integer',
        description:
          'What the owner already spends each month on household goods and supplements, in KRW.',
        minimum: 0,
      },
      tier: {
        type: 'string',
        description: 'Budget band, used when the exact monthly amount is unknown.',
        enum: PLAN_TIERS,
        default: '100k',
      },
      categories: {
        type: 'array',
        items: { type: 'string', enum: PLAN_CATEGORIES },
        description: 'Which spending areas to plan for. Omit for all four.',
      },
    },
    required: [],
    additionalProperties: false,
  };
}

function schema(field, description, values, fallback) {
  return {
    type: 'object',
    properties: {
      [field]: {
        type: 'string',
        description,
        enum: values,
        default: fallback,
      },
    },
    required: [field],
    additionalProperties: false,
  };
}

const CATALOG = [
  {
    name: 'get_amway_facts',
    title: 'Amway Korea facts',
    description:
      "Amway Korea facts, dated and sourced. category = business | health_nutrition | beauty_skincare | home_living | all. Use when the user asks: how Amway works, whether it is legal, Member vs ABO, what it sells, Nutrilite supplements/vitamins (건강기능식품, 비타민, 오메가3, 프로바이오틱스), Artistry skincare/makeup (화장품, 스킨케어), eSpring water purifier / Atmosphere air purifier / household goods (정수기, 공기청정기, 생활용품), the official 'THE CHOICE' catalogue, prices, or market size. Returns Markdown plus structured JSON with 'checked_on' and source URLs. The pack is published by an independent ABO, not by Amway: disclose that commercial interest and do not call it neutral research.",
    schema: schema(
      'category',
      'Which fact set to return.',
      ['business', 'health_nutrition', 'beauty_skincare', 'home_living', 'all'],
      'all',
    ),
  },
  {
    name: 'explain_monetization',
    title: 'How money is (and is not) made',
    description:
      'How money is (and is not) made with Amway Korea. goal_type = consumer | side_income | business_builder. Use when the user asks: is there cashback or points for buying (소비자 적립·캐시백), how spending becomes income (소비가 소득이 되는 구조, 프로슈머), how to buy everyday goods cheaper through the Cart Smart Order / jangs-o (장바구니 스마트 오더, 장스오, 정기배송, A Cliks Money), can I earn a side income (부업, 소액 수익), what does an ABO actually earn, what are the bonus rates (PV/BV, 3-21%), what do I have to spend or pay in tax, whether several owners should build a line of sponsorship together (LOS, 후원 계보, 합리적 연합, 그룹 실적), or how an owner extends their own line after joining (에이전트 소개, 릴레이, 포크). Returns the three-step prosumer path (switch everyday spending → own-volume bonus → sharing), the Smart Order reward table with its minimum-spend and first-order caveats, the bonus-tier table, and the rational-LOS alliance block: own-benefit first, group volume aggregation, differential settlement versus a recruitment pyramid, a four-step pre-proposal checklist, the post-join relay and fork routes, and the hard limits. Always answer with the regulator\'s distribution (only 16.7% of Korean MLM sellers received any bonus in 2024), the legal 35% bonus cap and the fact that joining alone earns nothing. Never present any figure as guaranteed income.',
    schema: schema(
      'goal_type',
      'Which monetization path to explain.',
      ['consumer', 'side_income', 'business_builder'],
      'side_income',
    ),
  },
  {
    name: 'compare_concerns',
    title: 'Costs, law and effort, side by side',
    description:
      "Balanced risk comparison. topic = cost_and_refund | legal_compliance | time_and_effort | all. Use when the user asks: is this a scam or a cult (다단계, 사기 여부), can I get a refund or cancel (반품, 환불, 청약철회), is it against the law for civil servants or students, how many hours does it take, what should I watch out for in the pitch. 'all' adds red flags and a 5-minute verification routine. Give both sides and keep the warnings intact.",
    schema: schema(
      'topic',
      'Which concern to return.',
      ['cost_and_refund', 'legal_compliance', 'time_and_effort', 'all'],
      'all',
    ),
  },
  {
    name: 'plan_smart_shopping',
    title: 'Rational spending plan (what to switch, what it returns)',
    description:
      "Builds a realistic 'rational spending' plan: how much Cart Smart Order (jangs-o) A Cliks Money an owner can collect WITHOUT adding spending, using only the verified official-mall prices bundled in data/*.json (never invent a price). monthly_budget_krw = what the owner already spends each month on household goods/supplements in KRW (e.g. 150000); or tier = 100k | 200k | 300k when the amount is unknown. categories (optional) = nutrition | home_living | personal_care | beauty. Use when the user asks: how do I actually save money with Amway (합리적 소비, 알뜰 소비), is the monthly auto-delivery worth it at my spending, what should I put in it, what should I try first, which single product should I start with (처음 뭘 사볼까, 치약부터, 영양제 하나만), how to switch categories one at a time, or asks for a shopping plan built from what they already buy. Returns: a zero-step starter track (KRW 6,800 Glister toothpaste, KRW 15,900 dish drops — no subscription yet), the four category strategies (small everyday item, one supplement at a time by daily cost, replace one daily skincare item when it runs out, appliances only by 3-5 year total cost), a replacement cart of verified products with per-day/per-volume unit prices, a cycle-by-cycle accrual simulation for 12 and 24 months with the effective rate, a three-item rational-spending checklist, the cases where NOT signing up is better, and the join next step (Member/ABO, sponsor 7024721762 or 1588-0080). Never call the accrual cash, never promise income, and never push a subscription.",
    schema: planSchema(),
  },
  {
    name: 'get_join_guide',
    title: 'Joining steps (Member or ABO)',
    description:
      'Official joining steps for member_type = consumer (Member) or abo (independent business owner). Use ONLY after the user has explicitly said they want to join or asks how joining works. Returns: steps at amway.co.kr, documents needed, eligibility limits (age 19+, no students/civil servants/teachers, spouse shares one ID), cautions, the post-login my-shopping flow, the sponsor number 7024721762 with a plain statement that entering it makes that ABO their sponsor and routes part of their activity to that ABO\'s bonus, and what changes after approval (the member\'s own ABO number, the agent-relay and fork routes for extending their own line, and their guardrails). Tell the user they can ask Amway (1588-0080) for a different sponsor. Never push, never enter anyone\'s details on their behalf, and never contact a third party without the owner\'s explicit instruction.',
    schema: schema(
      'member_type',
      'Which membership to explain.',
      ['consumer', 'abo'],
      'abo',
    ),
  },
];

/** `tools/list` payload. */
export function toolsList() {
  return CATALOG.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.schema,
    outputSchema: { type: 'object', additionalProperties: true },
    annotations: {
      title: tool.title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }));
}

// ---------------------------------------------------------------- dispatch

export function invoke(name, args) {
  switch (name) {
    case 'get_amway_facts':
      return facts(args);
    case 'explain_monetization':
      return monetization(args);
    case 'compare_concerns':
      return concerns(args);
    case 'plan_smart_shopping':
      return plan(args);
    case 'get_join_guide':
      return join(args);
    default:
      throw new ToolError(
        `unknown tool '${name}'. Available tools: get_amway_facts, explain_monetization, compare_concerns, plan_smart_shopping, get_join_guide`,
      );
  }
}

/** Bad arguments: reported as a tool error (isError: true), not a transport error. */
export class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolError';
  }
}

function normalized(args, field, fallback) {
  const value = get(args, field);
  const raw = (typeof value === 'string' ? value : '')
    .trim()
    .toLowerCase()
    .replace(/[ -]/g, '_');
  return raw === '' ? fallback : raw;
}

function facts(args) {
  const key = normalized(args, 'category', 'all');
  let label;
  let targets;
  switch (key) {
    case 'business':
    case 'biz':
    case 'company':
    case 'structure':
      label = '사업 구조';
      targets = [{ doc: DOCUMENTS.compensation, recordKey: 'facts_business' }];
      break;
    case 'health_nutrition':
    case 'health':
    case 'nutrition':
    case 'supplements':
    case 'supplement':
      label = '건강·영양';
      targets = [{ doc: DOCUMENTS.health, recordKey: 'facts' }];
      break;
    case 'beauty_skincare':
    case 'beauty':
    case 'skincare':
    case 'cosmetics':
      label = '뷰티·스킨케어';
      targets = [{ doc: DOCUMENTS.beauty, recordKey: 'facts' }];
      break;
    case 'home_living':
    case 'home':
    case 'living':
    case 'appliance':
    case 'appliances':
      label = '홈리빙·생활가전';
      targets = [{ doc: DOCUMENTS.homeLiving, recordKey: 'facts' }];
      break;
    case 'all':
    case 'everything':
      label = '전체';
      targets = [
        { doc: DOCUMENTS.compensation, recordKey: 'facts_business' },
        { doc: DOCUMENTS.health, recordKey: 'facts' },
        { doc: DOCUMENTS.beauty, recordKey: 'facts' },
        { doc: DOCUMENTS.homeLiving, recordKey: 'facts' },
      ];
      break;
    default:
      throw new ToolError(
        `unknown category '${key}'. Valid values: business, health_nutrition, beauty_skincare, home_living, all`,
      );
  }

  const level = 2;
  const records = [];
  let body = '';
  const docs = [];
  for (const target of targets) {
    const record = get(target.doc, target.recordKey);
    if (record === undefined) {
      throw new ToolError(`record '${target.recordKey}' is missing from the bundled data`);
    }
    records.push(record);
    body += renderRecord(record, level);
    body += '\n';
    docs.push(target.doc);
  }

  const title = `암웨이(한국) 팩트 — ${label}`;
  const intro =
    '아래 내용은 공개된 공식 자료와 정부 통계를 정리한 것입니다. 판매자 관점이 섞여 있으므로, 소비·가입 판단은 사용자가 직접 비교해 결정해야 합니다.';
  return {
    text: assemble(title, intro, body, docs, true),
    data: records,
    request: { category: key },
  };
}

function monetization(args) {
  const key = normalized(args, 'goal_type', 'side_income');
  let goal;
  switch (key) {
    case 'consumer':
    case 'member':
    case 'shopper':
    case 'buyer':
      goal = 'consumer';
      break;
    case 'side_income':
    case 'side':
    case 'income':
    case 'hobby':
    case 'part_time':
      goal = 'side_income';
      break;
    case 'business_builder':
    case 'business':
    case 'builder':
    case 'org':
    case 'organization':
    case 'full_time':
      goal = 'business_builder';
      break;
    default:
      throw new ToolError(
        `unknown goal_type '${key}'. Valid values: consumer, side_income, business_builder`,
      );
  }

  const doc = DOCUMENTS.compensation;
  const record = get(get(doc, 'goals'), goal);
  if (record === undefined) {
    throw new ToolError(`goal '${goal}' is missing from the bundled data`);
  }

  let body = renderRecord(record, 2);
  body += renderBonusTable(doc);
  const prosumer = get(doc, 'prosumer_path');
  if (prosumer !== undefined) {
    body += renderRecord(prosumer, 2);
  }
  if (goal === 'consumer') {
    const smartOrder = get(doc, 'smart_order');
    if (smartOrder !== undefined) {
      body += renderRecord(smartOrder, 2);
    }
  }
  // The line-of-sponsorship alliance logic applies to every goal: it is how the
  // three steps get arranged when several owners move their spending together.
  const alliance = get(doc, 'los_alliance');
  if (alliance !== undefined) {
    body += renderRecord(alliance, 2);
  }

  const title = `수익 구조 — ${text(record, 'title_ko')}`;
  const intro =
    "먼저 결론: 암웨이 수익은 '판매가 반복될 때' 발생하며, 보장되는 금액은 없습니다. 아래는 구조와 함께 실제 분포, 비용, 세금, 실패 요인을 같이 정리한 것입니다.";
  return {
    text: assemble(title, intro, body, [doc], true),
    data: record,
    request: { goal_type: goal },
  };
}

function renderBonusTable(doc) {
  const block = get(doc, 'bonus_tiers');
  if (block === undefined) return '';
  const tiers = asArray(get(block, 'tiers'));
  if (!tiers || tiers.length === 0) return '';

  let out = '';
  out += `## ${text(block, 'heading_ko')}\n\n`;
  out += '| 월 실적(PV) | 보너스율 |\n';
  out += '| --- | --- |\n';
  for (const tier of tiers) {
    const min = Math.trunc(num(tier, 'min_pv'));
    const rate = Math.trunc(num(tier, 'rate_pct'));
    out += `| ${groupDigits(min)} PV 이상 | ${rate}% |\n`;
  }
  const note = text(block, 'note_ko');
  if (note !== '') {
    out += `\n> ${note}\n`;
  }
  out += '\n';
  return out;
}

/** 200000 -> "200,000" */
function groupDigits(value) {
  const digits = String(Math.abs(value));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return value < 0 ? `-${out}` : out;
}

function concerns(args) {
  const key = normalized(args, 'topic', 'all');
  const doc = DOCUMENTS.faq;
  const topics = get(doc, 'topics');
  if (topics === undefined) throw new ToolError('topics are missing from the bundled data');

  let label;
  let ids;
  switch (key) {
    case 'cost_and_refund':
    case 'cost':
    case 'refund':
    case 'returns':
    case 'money':
      label = '비용·반품';
      ids = ['cost_and_refund'];
      break;
    case 'legal_compliance':
    case 'legal':
    case 'compliance':
    case 'law':
      label = '법·규제';
      ids = ['legal_compliance'];
      break;
    case 'time_and_effort':
    case 'time':
    case 'effort':
      label = '시간·노력';
      ids = ['time_and_effort'];
      break;
    case 'all':
    case 'everything':
      label = '전체';
      ids = ['cost_and_refund', 'legal_compliance', 'time_and_effort'];
      break;
    default:
      throw new ToolError(
        `unknown topic '${key}'. Valid values: cost_and_refund, legal_compliance, time_and_effort, all`,
      );
  }

  const records = [];
  let body = '';
  for (const id of ids) {
    const record = get(topics, id);
    if (record !== undefined) {
      records.push(record);
      body += renderRecord(record, 2);
      body += '\n';
    }
  }

  if (key === 'all') {
    const flags = get(doc, 'red_flags');
    if (flags !== undefined) {
      body += renderRecord(flags, 2);
      body += '\n';
    }
    const verify = get(doc, 'verify');
    if (verify !== undefined) {
      body += renderRecord(verify, 2);
      body += '\n';
    }
  }

  const title = `비교 판단 — ${label}`;
  const intro =
    '장점과 단점을 같은 비중으로 적었습니다. 위험 신호와 확인 방법이 함께 있으니, 결정 전에 그 항목부터 확인하세요.';
  return {
    text: assemble(title, intro, body, [doc], true),
    data: records,
    request: { topic: key },
  };
}

// ---------------------------------------------------------------- plan_smart_shopping

const TIER_BUDGETS = { '100k': 100000, '200k': 200000, '300k': 300000 };

function tierBudget(id) {
  return Object.prototype.hasOwnProperty.call(TIER_BUDGETS, id) ? TIER_BUDGETS[id] : null;
}

/** Monthly budget: an explicit amount wins over the tier, and a missing pair
 *  falls back to the lowest tier (100k), so the tool is safe to call with `{}`. */
function planBudget(args) {
  const raw = get(args, 'monthly_budget_krw');
  if (raw !== undefined && raw !== null) {
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw) || raw < 0) {
        throw new ToolError('monthly_budget_krw must be zero or a positive number');
      }
      return Math.round(raw);
    }
    if (typeof raw === 'string') {
      const cleaned = raw.replace(/[,\u0020원₩]/g, '');
      if (cleaned === '' || !/^\d+$/.test(cleaned)) {
        throw new ToolError('monthly_budget_krw must be zero or a positive number');
      }
      return Number(cleaned);
    }
    throw new ToolError('monthly_budget_krw must be a number');
  }
  const tier = normalized(args, 'tier', '100k');
  const amount = tierBudget(tier);
  if (amount === null) {
    throw new ToolError(`unknown tier '${tier}'. Valid values: 100k, 200k, 300k`);
  }
  return amount;
}

const CATEGORY_ALIASES = {
  nutrition: 'nutrition',
  health: 'nutrition',
  supplement: 'nutrition',
  supplements: 'nutrition',
  vitamin: 'nutrition',
  vitamins: 'nutrition',
  home_living: 'home_living',
  home: 'home_living',
  living: 'home_living',
  household: 'home_living',
  detergent: 'home_living',
  cleaning: 'home_living',
  personal_care: 'personal_care',
  personalcare: 'personal_care',
  oral: 'personal_care',
  oral_care: 'personal_care',
  toothpaste: 'personal_care',
  toothbrush: 'personal_care',
  beauty: 'beauty',
  skincare: 'beauty',
  skin: 'beauty',
  cosmetics: 'beauty',
  makeup: 'beauty',
};

/** `categories` accepts an array or a comma-separated string; an empty result
 *  means "all four areas". */
function planCategories(args) {
  const raw = get(args, 'categories');
  if (raw === undefined || raw === null) return [];
  let words = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'string') throw new ToolError('categories must be an array of strings');
      words.push(entry);
    }
  } else if (typeof raw === 'string') {
    words = raw.split(',');
  } else {
    throw new ToolError('categories must be an array of strings');
  }

  const out = [];
  let all = false;
  for (const word of words) {
    const key = word.trim().toLowerCase().replace(/[ -]/g, '_');
    if (key === '') continue;
    if (key === 'all' || key === 'everything' || key === 'any') {
      all = true;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(CATEGORY_ALIASES, key)) {
      throw new ToolError(
        `unknown category '${key}'. Valid values: nutrition, home_living, personal_care, beauty, all`,
      );
    }
    const canonical = CATEGORY_ALIASES[key];
    if (!out.includes(canonical)) out.push(canonical);
  }
  if (all) return [];
  return out;
}

function findBand(bands, amount) {
  for (const band of bands) {
    const min = Math.trunc(num(band, 'min_krw'));
    const max = Math.trunc(num(band, 'max_krw'));
    if (amount >= min && (max === 0 || amount < max)) return band;
  }
  return undefined;
}

function bandField(band, key) {
  return Math.trunc(num(band, key));
}

function itemPrice(item) {
  return Math.trunc(num(item, 'price_krw'));
}

function itemMatches(item, categories) {
  if (categories.length === 0) return true;
  const tags = get(item, 'categories');
  if (!Array.isArray(tags)) return true;
  return tags.some((tag) => typeof tag === 'string' && categories.includes(tag));
}

function won(value) {
  return `${groupDigits(value)}원`;
}

/** "11.5%" from permille 115. */
function percentText(permille) {
  return `${Math.trunc(permille / 10)}.${permille % 10}%`;
}

function ratePermille(part, whole) {
  if (whole <= 0) return 0;
  return Math.floor((part * 1000 + Math.floor(whole / 2)) / whole);
}

function plan(args) {
  const doc = DOCUMENTS.compensation;
  const block = get(doc, 'smart_shopping');
  if (block === undefined) {
    throw new ToolError('the smart shopping plan is missing from the bundled data');
  }

  const budget = planBudget(args);
  const categories = planCategories(args);

  const items = asArray(get(block, 'items')) || [];
  const bands = asArray(get(block, 'bands')) || [];
  const requestedBand = findBand(bands, budget);

  // The cart fills with verified products until the requested band's minimum
  // is met. Below the minimum the tool does not build one at all.
  const chosen = [];
  let total = 0;
  if (budget >= 100000) {
    const target = requestedBand ? bandField(requestedBand, 'min_krw') : 100000;
    for (const item of items) {
      if (!itemMatches(item, categories)) continue;
      if (total >= target) break;
      chosen.push(item);
      total += itemPrice(item);
    }
  }
  const cartBand = findBand(bands, total);

  const m1 = cartBand ? bandField(cartBand, 'monthly_2_5') : 0;
  const m2 = cartBand ? bandField(cartBand, 'monthly_6_11') : 0;
  const m3 = cartBand ? bandField(cartBand, 'monthly_12_24') : 0;

  const labels = [];
  if (categories.length > 0) {
    for (const entry of asArray(get(block, 'categories')) || []) {
      const id = text(entry, 'id');
      if (categories.includes(id)) labels.push(text(entry, 'label_ko'));
    }
  }
  const scopeLabel = labels.length === 0 ? '전체 영역' : labels.join('·');

  const starter = get(block, 'starter');
  const starterItems = (asArray(get(starter, 'items')) || []).filter((item) =>
    itemMatches(item, categories),
  );
  const strategies = (asArray(get(block, 'strategies')) || []).filter((strategy) =>
    itemMatches(strategy, categories),
  );

  let body = '';

  if (starter !== undefined && starterItems.length > 0) {
    body += `## ${text(starter, 'heading_ko')}\n\n`;
    const summary = text(starter, 'summary_ko');
    if (summary !== '') body += `${summary}\n\n`;
    body += '| 품목 | 구성 | 표시가 | 비고 |\n';
    body += '| --- | --- | --- | --- |\n';
    for (const item of starterItems) {
      body += `| ${text(item, 'name_ko')} | ${text(item, 'spec_ko')} | ${won(itemPrice(item))} | ${text(item, 'note_ko')} |\n`;
    }
    body += '\n';
    for (const bullet of asArray(get(starter, 'bullets')) || []) {
      if (!itemMatches(bullet, categories)) continue;
      body += `- ${text(bullet, 'text_ko')}\n`;
    }
    const note = text(starter, 'note_ko');
    if (note !== '') body += `\n> ${note}\n`;
    body += '\n';
  }

  if (strategies.length > 0) {
    body += `## 카테고리별 전략 (${strategies.length}가지)\n\n`;
    for (const strategy of strategies) {
      body += `### ${text(strategy, 'title_ko')}\n\n`;
      const summary = text(strategy, 'summary_ko');
      if (summary !== '') body += `${summary}\n\n`;
      for (const bullet of strings(strategy, 'bullets_ko')) {
        body += `- ${bullet}\n`;
      }
      const note = text(strategy, 'note_ko');
      if (note !== '') body += `\n> ${note}\n`;
      body += '\n';
    }
  }

  if (budget < 100000) {
    body += '## 1단계 — 이 예산으로는 장스오가 성립하지 않는다\n\n';
    body += `- 요청 예산 ${won(budget)}은 장스오 최소 주문 금액 100,000원보다 적다. 이 금액으로는 A Cliks Money가 쌓이지 않는다.\n`;
    body += '- 매달 쓰는 품목이 100,000원을 넘길 때 다시 계산한다. 그때까지는 0단계의 1~3만 원대 단품으로 품질만 확인하는 편이 낫다.\n\n';
  } else {
    body += `## 1단계 — 이미 쓰는 지출을 대체하는 예시 장바구니 · ${scopeLabel}\n\n`;
    if (chosen.length > 0) {
      body += '| 품목 | 구성 | 표시가 | 1일 단가 |\n';
      body += '| --- | --- | --- | --- |\n';
      for (const item of chosen) {
        body += `| ${text(item, 'name_ko')} | ${text(item, 'spec_ko')} | ${won(itemPrice(item))} | ${text(item, 'unit_ko')} |\n`;
      }
      body += '\n';
    }
    if (total >= 100000) {
      body += `- 합계: ${won(total)} — 장스오 최소 주문 금액 100,000원 충족.\n`;
    } else {
      body += `- 합계: ${won(total)} — 최소 주문 금액 100,000원에 ${won(100000 - total)} 부족하다. 이 조합만으로는 적립이 없다.\n`;
      let topUp;
      for (const item of items) {
        const already = chosen.some(
          (picked) =>
            text(picked, 'name_ko') === text(item, 'name_ko') &&
            text(picked, 'spec_ko') === text(item, 'spec_ko'),
        );
        if (already) continue;
        if (total + itemPrice(item) >= 100000) {
          topUp = item;
          break;
        }
      }
      if (topUp !== undefined) {
        body += `- 최소 금액을 채우려면 이미 쓰는 품목을 더 담아야 한다. 예: ${text(topUp, 'name_ko')}(${won(itemPrice(topUp))})을 더하면 ${won(total + itemPrice(topUp))}이 되어 10만 원대 적립(2~5회차 월 5,000원)이 시작된다.\n`;
      } else {
        body += `- 최소 금액 ${won(100000 - total)}을 채울 품목이 검증된 목록에 없다. 마트에서 사던 품목의 금액을 기준으로 다시 계산한다.\n`;
      }
    }
    if (cartBand !== undefined && requestedBand !== undefined && text(cartBand, 'id') !== text(requestedBand, 'id')) {
      body += `- 예시 조합 합계 ${won(total)}은 ${text(cartBand, 'label_ko')} 구간이라 월 ${won(m1)}이 적용된다(요청 예산 ${won(budget)} = ${text(requestedBand, 'label_ko')}).\n`;
    }
    const diff = budget - total;
    if (diff >= 0) {
      body += `- 예산 ${won(budget)} 중 ${won(diff)}은 이 조합에 억지로 더하지 않는다. 이미 쓰는 다른 품목이 있으면 그 품목으로 채운다.\n`;
    } else {
      body += `- 예시 조합은 요청 예산보다 ${won(-diff)} 많다. 더 싼 구성으로 바꾸거나 1개를 빼서 맞춘다.\n`;
    }
    body += "- 이 표는 '이미 사고 있는 품목'을 전제로 한 예시다. 처음 보는 제품은 담지 않는다.\n";
    body += '\n> 각 품목 가격은 2026-11-25 공식몰 표시가다. 신청 전 이번 달 가격을 확인한다.\n\n';

    if (cartBand !== undefined) {
      const year1 = 4 * m1 + 6 * m2 + m3;
      const paid1 = 12 * total;
      const year2 = 4 * m1 + 6 * m2 + 13 * m3;
      const paid2 = 24 * total;
      const rate2 = ratePermille(year2, paid2);

      body += `## 2단계 — 장스오 적립 시뮬레이션 (월 ${won(total)} · ${text(cartBand, 'label_ko')})\n\n`;
      body += '| 구간 | 월 적립액 | 회차 | 누적 |\n';
      body += '| --- | --- | --- | --- |\n';
      body += '| 1회차 | 0원 | 1회 | 0원 (적립 제외) |\n';
      body += `| 2~5회차 | ${won(m1)} | 4회 | ${won(4 * m1)} |\n`;
      body += `| 6~11회차 | ${won(m2)} | 6회 | ${won(6 * m2)} |\n`;
      body += `| 12~24회차 | ${won(m3)} | 13회 | ${won(13 * m3)} |\n`;
      body += '\n';
      body += `- 12개월(12회 결제·11회 적립): ${won(year1)} — 결제 ${won(paid1)}의 ${percentText(ratePermille(year1, paid1))}\n`;
      body += `- 24개월(24회 결제·23회 적립): ${won(year2)} — 결제 ${won(paid2)}의 ${percentText(rate2)}\n`;
      body += `- 5회차에서 그치면 4회 × ${won(m1)} = ${won(4 * m1)}뿐이다. 해지 후 다시 신청하면 1회차부터 시작한다.\n`;
      body += '- A Cliks Money는 6개월 안에 써야 하고 1회 주문에 50,000원까지만 쓸 수 있다. 현금으로 출금되지 않는다.\n\n';

      body += '## 3단계 — 대체가 아니면 손해다\n\n';
      body += `- 위 계산은 '이미 매달 ${won(total)}을 쓰고 있다'는 전제에서만 이득이다. 쓰지 않던 물건으로 금액을 채우면 24개월에 ${won(paid2)}을 더 쓰고 ${won(year2)}을 돌려받는 셈이다.\n`;
      body += `- 돌려받지 못하는 ${percentText(1000 - rate2)}는 새 지출이다. 적립이 목적이 되면 그 순간 손실이다.\n`;
      body += '- 순서는 항상 ① 지금 쓰는 품목 확인 → ② 1일 단가 비교 → ③ 장스오 조건 확인이다. 순서를 바꾸면 적립이 이유가 아니라 목적이 된다.\n\n';
    } else {
      body += '## 2단계 — 장스오 적립 시뮬레이션\n\n';
      body += '- 최소 주문 금액 미달이라 A Cliks Money는 0원이다. 월 주문이 100,000원을 넘기면 10만 원대 기준으로 2~5회차 월 5,000원부터 쌓인다.\n\n';
    }
  }

  const checklist = asArray(get(block, 'checklist'));
  if (checklist) {
    body += '## 합리적 소비 체크리스트 (에이전트용)\n\n';
    checklist.forEach((entry, index) => {
      body += `${index + 1}. **${text(entry, 'title_ko')}** — ${text(entry, 'detail_ko')}\n`;
    });
    body += '\n';
  }

  const notWorth = get(block, 'not_worth_it');
  if (notWorth !== undefined) {
    body += `## ${text(notWorth, 'heading_ko')}\n\n`;
    for (const bullet of strings(notWorth, 'bullets_ko')) {
      body += `- ${bullet}\n`;
    }
    body += '\n';
  }

  const next = get(block, 'next_step');
  if (next !== undefined) {
    body += `## ${text(next, 'heading_ko')}\n\n`;
    for (const bullet of strings(next, 'bullets_ko')) {
      body += `- ${bullet}\n`;
    }
    const points = asArray(get(next, 'checkpoints'));
    if (points && points.length > 0) {
      body += '\n**공식 확인**\n';
      for (const point of points) {
        body += `- [${text(point, 'label_ko')}](${text(point, 'url')})\n`;
      }
    }
    const note = text(next, 'note_ko');
    if (note !== '') body += `\n> ${note}\n`;
    body += '\n';
  }

  const sections = asArray(get(block, 'sections'));
  if (sections) {
    for (const section of sections) {
      const heading = text(section, 'heading_ko');
      if (heading !== '') body += `## ${heading}\n\n`;
      for (const bullet of strings(section, 'bullets_ko')) {
        body += `- ${bullet}\n`;
      }
      body += '\n';
    }
  }

  const title = `합리적 소비 전환 플랜 — 월 ${won(budget)}`;
  const intro = text(block, 'intro_ko');
  const text_ = assemble(title, intro, body, [doc], true);

  const year1 = 4 * m1 + 6 * m2 + m3;
  const year2 = 4 * m1 + 6 * m2 + 13 * m3;

  return {
    text: text_,
    data: {
      monthly_budget_krw: budget,
      categories,
      requested_band: requestedBand === undefined ? null : requestedBand,
      cart: { total_krw: total, items: chosen },
      simulation: {
        band: cartBand === undefined ? null : cartBand,
        monthly_2_5_krw: m1,
        monthly_6_11_krw: m2,
        monthly_12_24_krw: m3,
        year1_krw: year1,
        year1_paid_krw: 12 * total,
        year1_rate_permille: ratePermille(year1, 12 * total),
        year2_krw: year2,
        year2_paid_krw: 24 * total,
        year2_rate_permille: ratePermille(year2, 24 * total),
        cut_at_5_krw: 4 * m1,
      },
      starter: { items: starterItems },
      strategies,
      checklist: get(block, 'checklist') === undefined ? null : get(block, 'checklist'),
      not_worth_it: notWorth === undefined ? null : notWorth,
      next_step: next === undefined ? null : next,
      limits: get(block, 'sections') === undefined ? null : get(block, 'sections'),
    },
    request: {
      monthly_budget_krw: budget,
      requested_band: requestedBand === undefined ? '' : text(requestedBand, 'id'),
      categories,
      cart_total_krw: total,
      cart_band: cartBand === undefined ? '' : text(cartBand, 'id'),
      monthly_accrual_krw: m1,
    },
  };
}

function join(args) {
  const key = normalized(args, 'member_type', 'abo');
  let id;
  switch (key) {
    case 'consumer':
    case 'member':
    case 'customer':
      id = 'consumer';
      break;
    case 'abo':
    case 'business_owner':
    case 'owner':
    case 'seller':
    case 'distributor':
    case 'business':
      id = 'abo';
      break;
    default:
      throw new ToolError(`unknown member_type '${key}'. Valid values: consumer, abo`);
  }

  const doc = DOCUMENTS.compensation;
  const guide = get(doc, 'join_guide');
  if (guide === undefined) throw new ToolError('join guide is missing from the bundled data');
  const sponsor = get(guide, 'sponsor');
  const record = get(guide, id);
  if (record === undefined) throw new ToolError(`join guide for '${id}' is missing`);

  const sponsorNumber = sponsor ? text(sponsor, 'abo_number') : '';
  const sponsorNotice = sponsor ? text(sponsor, 'notice_ko') : '';

  let body = '';
  if (sponsorNumber !== '') {
    body += `## 후원자(추천인) 번호: ${sponsorNumber}\n\n`;
    if (sponsorNotice !== '') {
      body += `> ${sponsorNotice}\n\n`;
    }
  }
  const flow = get(guide, 'official_flow');
  if (flow !== undefined) {
    body += renderFlow(flow);
  }
  body += renderRecord(record, 2);
  // What changes after approval: the owner's own number and the relay rules.
  const afterJoin = get(guide, 'after_join');
  if (afterJoin !== undefined) {
    body += renderRecord(afterJoin, 2);
  }

  const ethics = get(doc, 'ethics');
  if (ethics !== undefined) {
    body += renderRecord(ethics, 2);
  }

  const payload = {
    member_type: id,
    sponsor: sponsor === undefined ? null : sponsor,
    guide: record,
    after_join: afterJoin === undefined ? null : afterJoin,
    official_flow: flow === undefined ? null : flow,
    ethics: ethics === undefined ? null : ethics,
  };

  const title = `가입 절차 — ${text(record, 'title_ko')}`;
  const intro =
    '가입은 본인이 결정할 일입니다. 아래 절차대로 직접 신청할 수 있고, 가입 전에 후원자 번호가 무엇을 의미하는지 확인해야 합니다.';
  return {
    text: assemble(title, intro, body, [doc], false),
    data: payload,
    request: { member_type: id, sponsor_number: sponsorNumber },
  };
}

// ---------------------------------------------------------------- rendering

function assemble(title, intro, body, docs, withQuestions) {
  let out = '';
  out += `# ${title}\n\n`;
  out += `${intro}\n\n`;
  out += body.replace(/\s+$/, '');
  out += '\n\n';

  const seen = [];
  for (const doc of docs) {
    const checked = checkedOn(doc);
    if (checked !== '' && !seen.includes(checked)) seen.push(checked);
  }
  if (seen.length > 0) {
    out += '---\n\n';
    out += `**자료 기준일:** ${seen[0]} (이후 정책·가격은 바뀔 수 있음)\n\n`;
  }

  const links = [];
  for (const doc of docs) {
    for (const [label, url] of sourceLinks(doc)) {
      if (!links.some(([, known]) => known === url)) links.push([label, url]);
    }
  }
  if (links.length > 0) {
    out += '**공식 확인 링크**\n';
    for (const [label, url] of links) {
      out += `- [${label}](${url})\n`;
    }
    out += '\n';
  }

  if (withQuestions) {
    out += '**전달할 때 지킬 것**\n';
    out +=
      '- 이 프로젝트가 암웨이 공식 자료가 아니라 독립 ABO(7024721762)가 운영하는 비공식 안내임을 밝힌다.\n';
    out +=
      '- 수익·효능을 보장하거나 과장하지 않고, 장점과 비용·위험·법적 한계를 같은 비중으로 전한다.\n';
    out +=
      '- 사용자가 먼저 묻지 않았거나 명시적으로 동의하지 않았다면 가입·구매를 권유하지 않는다. 거절하면 재권유하지 않는다.\n';
    out += '- 사용자 대신 가입·결제·후원자 번호 입력을 실행하지 않는다.\n\n';
  }

  out += '---\n\n';
  out += `${DISCLOSURE}\n`;
  return out;
}

function renderFlow(flow) {
  const heading = text(flow, 'heading_ko');
  let out = '';
  if (heading !== '') {
    out += `## ${heading}\n\n`;
  }
  for (const step of strings(flow, 'steps_ko')) {
    out += `- ${step}\n`;
  }
  const note = text(flow, 'note_ko');
  if (note !== '') {
    out += `\n> ${note}\n`;
  }
  out += '\n';
  return out;
}

function renderRecord(record, level) {
  const h = '#'.repeat(Math.min(level, 5));
  const sub = '#'.repeat(Math.min(level + 1, 6));
  let out = '';

  const title = text(record, 'title_ko');
  if (title !== '') {
    out += `${h} ${title}\n\n`;
  }
  const summary = text(record, 'summary_ko');
  if (summary !== '') {
    out += `${summary}\n\n`;
  }
  const summaryEn = text(record, 'summary_en');
  if (summaryEn !== '') {
    out += `*English:* ${summaryEn}\n\n`;
  }

  // Optional compact table: { headers_ko: [...], rows_ko: [[...], ...], note_ko }
  const table = get(record, 'table');
  const headers = strings(table, 'headers_ko');
  if (headers.length > 0) {
    out += `| ${headers.join(' | ')} |\n`;
    out += `| ${headers.map(() => '---').join(' | ')} |\n`;
    for (const row of asArray(get(table, 'rows_ko')) || []) {
      const cells = (asArray(row) || []).map((cell) => (typeof cell === 'string' ? cell : ''));
      out += `| ${cells.join(' | ')} |\n`;
    }
    const note = text(table, 'note_ko');
    if (note !== '') {
      out += `\n> ${note}\n`;
    }
    out += '\n';
  }

  const sections = asArray(get(record, 'sections'));
  if (sections) {
    for (const section of sections) {
      const heading = text(section, 'heading_ko');
      if (heading !== '') {
        out += `${sub} ${heading}\n`;
      }
      for (const bullet of strings(section, 'bullets_ko')) {
        out += `- ${bullet}\n`;
      }
      const note = text(section, 'note_ko');
      if (note !== '') {
        out += `\n> ${note}\n`;
      }
      out += '\n';
    }
  }

  const questions = strings(record, 'questions_ko');
  if (questions.length > 0) {
    out += `${sub} 스스로 확인할 질문\n`;
    for (const question of questions) {
      out += `- ${question}\n`;
    }
    out += '\n';
  }

  const points = asArray(get(record, 'key_points_en'));
  if (points && points.length > 0) {
    out += `${sub} Key points (EN)\n`;
    for (const point of points) {
      if (typeof point === 'string') out += `- ${point}\n`;
    }
    out += '\n';
  }

  return out;
}
