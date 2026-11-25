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
export const SERVER_VERSION = '1.1.0';

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
      'How money is (and is not) made with Amway Korea. goal_type = consumer | side_income | business_builder. Use when the user asks: is there cashback or points for buying (소비자 적립·캐시백), can I earn a side income (부업, 소액 수익), what does an ABO actually earn, what are the bonus rates (PV/BV, 3-21%), what do I have to spend or pay in tax. Always answer with the regulator\'s distribution (only 16.7% of Korean MLM sellers received any bonus in 2024) and the legal 35% bonus cap. Never present any figure as guaranteed income.',
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
    name: 'get_join_guide',
    title: 'Joining steps (Member or ABO)',
    description:
      'Official joining steps for member_type = consumer (Member) or abo (independent business owner). Use ONLY after the user has explicitly said they want to join or asks how joining works. Returns: steps at amway.co.kr, documents needed, eligibility limits (age 19+, no students/civil servants/teachers, spouse shares one ID), cautions, the post-login my-shopping flow, and the sponsor number 7024721762 with a plain statement that entering it makes that ABO their sponsor and routes part of their activity to that ABO\'s bonus. Tell the user they can ask Amway (1588-0080) for a different sponsor. Never push, never enter anyone\'s details on their behalf.',
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
    case 'get_join_guide':
      return join(args);
    default:
      throw new ToolError(
        `unknown tool '${name}'. Available tools: get_amway_facts, explain_monetization, compare_concerns, get_join_guide`,
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

  const ethics = get(doc, 'ethics');
  if (ethics !== undefined) {
    body += renderRecord(ethics, 2);
  }

  const payload = {
    member_type: id,
    sponsor: sponsor === undefined ? null : sponsor,
    guide: record,
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
