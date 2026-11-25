import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DATA_RAW, DOCS_RAW } from '../src/assets.generated.js';
import { documents } from '../src/knowledge.js';

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The Worker bundle carries a copy of the knowledge base. These tests fail when
// someone edits data/*.json, llms.txt or SKILL.md and forgets `npm run sync-data`,
// which is what would otherwise ship stale facts to agents.

test('the bundled data matches data/*.json', () => {
  const files = {
    compensation_plan: 'data/compensation_plan.json',
    health_nutrition: 'data/health_nutrition.json',
    beauty_skincare: 'data/beauty_skincare.json',
    home_living: 'data/home_living.json',
    faq_and_risks: 'data/faq_and_risks.json',
  };
  assert.deepEqual(Object.keys(DATA_RAW).sort(), Object.keys(files).sort());
  for (const [name, file] of Object.entries(files)) {
    assert.equal(DATA_RAW[name], readFileSync(join(repoDir, file), 'utf8'), `${name} is stale: run npm run sync-data`);
  }
});

test('the bundled documents match llms.txt and SKILL.md', () => {
  assert.equal(DOCS_RAW.llmsTxt, readFileSync(join(repoDir, 'llms.txt'), 'utf8'));
  assert.equal(DOCS_RAW.skillMd, readFileSync(join(repoDir, 'SKILL.md'), 'utf8'));
});

test('the parsed documents keep the facts the tools need', () => {
  const docs = documents();
  assert.equal(docs.compensation.meta.checked_on, '2026-11-25');
  assert.equal(docs.compensation.join_guide.sponsor.abo_number, '7024721762');
  assert.equal(docs.compensation.bonus_tiers.tiers.length, 7);
  assert.ok(docs.compensation.ethics);
  for (const doc of Object.values(docs)) {
    assert.ok(doc.meta && doc.meta.sources.length > 0);
    for (const source of doc.meta.sources) assert.match(source.url, /^https:\/\//);
  }
});

test('the public bundle carries no personal or other-project information', () => {
  const blob = JSON.stringify(DATA_RAW) + DOCS_RAW.llmsTxt + DOCS_RAW.skillMd;
  const forbidden = [
    'redacted-term-1',
    'redacted-term-2',
    'redacted-term-3',
    'redacted-term-4',
    'redacted-term-5',
    'redacted-term-6',
    'redacted-term-7',
    'redacted-term-8',
  ];
  for (const needle of forbidden) {
    assert.equal(blob.includes(needle), false, `bundle leaks ${needle}`);
  }
  const phoneLike = blob.match(/01[016789]-?\d{3,4}-?\d{4}/g) || [];
  assert.deepEqual(phoneLike, [], 'no mobile-number shaped value may be published');
});
