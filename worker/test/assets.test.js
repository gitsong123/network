import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
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

// ---------------------------------------------------------------------------
// Privacy screen
//
// This repository is public, so the terms it must never carry — the operator's
// real name and phone number, and the other projects of theirs — are not written
// anywhere in it, not even here. Only their SHA-256 digests are, grouped by
// character width so the scan knows which window size to hash. Pasting one of
// those terms into data/*.json, llms.txt, SKILL.md or any other file still fails
// the suite; the failure names the file and the offset, not the term.
//
// To change what is screened: take the term, lowercase it, hash its UTF-8 bytes
// with SHA-256, and add the hex digest under its character count below.
// ---------------------------------------------------------------------------
const SCREENED_SHA256 = [
  [2, ['396d2b487da4d665575207729bbfaa133a5a2183aaa7b58e30f7baec8babab11']],
  [
    3,
    [
      'fd7938fe5c7d9c80c7b2f8c0c120bdb140631572ab93c3d7676e1a412e83d801',
      'fcabd04401099e98d6935b015794a3e60d6773857900fb13baf43f60748a0ec2',
    ],
  ],
  [6, ['d29f104bbae965d9cbe707d2af38f91b6981afe6531a1ed5889a36da07f17441']],
  [
    8,
    [
      '29351aac914ad76eb594c570b3189cef72955706cfd78039210e12588e885504',
      '7c3b6b090e350307edc9b333b5d8a6acd3e7527c62dff22e905322f1752a983c',
      '605c2eccad171eb94ef6b4ca04c771896e239ed5746fa74b9dae3698ff8a278c',
    ],
  ],
  [10, ['fd6a4cfa863c4e6ef028f185bda69ad4f2c5e9b85e40a3692eef18249727f471']],
  [11, ['2cc18a2b143b3261ce0f5e83e95d4d92e4102752f500bf32378c2547d5998245']],
];

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// Sliding n-gram screen. Walks every window of each screened width, hashes the
// distinct ones and keeps the offsets that match a digest. Case-insensitive:
// lowercasing leaves Hangul and ASCII offsets untouched, which the guard below
// checks so a future non-BMP corpus cannot silently shift the reported offsets.
function screen(text, table = SCREENED_SHA256) {
  const haystack = text.toLowerCase();
  if (haystack.length !== text.length) throw new Error('lowercasing changed the text length');
  const hits = [];
  for (const [width, digests] of table) {
    const wanted = new Set(digests);
    const checked = new Set();
    for (let i = 0; i + width <= haystack.length; i += 1) {
      const gram = haystack.slice(i, i + width);
      if (checked.has(gram)) continue;
      checked.add(gram);
      if (wanted.has(sha256(gram))) hits.push({ offset: i, width });
    }
  }
  return hits.sort((a, b) => a.offset - b.offset || a.width - b.width);
}

// A mobile-number shape is screened in any separator style, which is stricter
// than hashing a single spelling. This pattern carries no one's number.
const MOBILE_SHAPE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g;

test('the digest screen catches a planted term and clears clean text', () => {
  // A malformed digest would make the table silently vacuous, so check the shape.
  for (const [width, digests] of SCREENED_SHA256) {
    assert.ok(Number.isInteger(width) && width >= 2, 'each group needs a window width');
    assert.ok(digests.length > 0, `the ${width}-character group is empty`);
    for (const digest of digests) assert.match(digest, /^[0-9a-f]{64}$/);
  }
  const probe = 'zqx-probe-token'; // synthetic, not one of the screened terms
  const table = [[probe.length, [sha256(probe)]]];
  const planted = `lead ${probe} trail`;
  assert.deepEqual(screen(planted, table), [{ offset: 5, width: probe.length }]);
  assert.deepEqual(screen(planted.toUpperCase(), table), [{ offset: 5, width: probe.length }]);
  assert.deepEqual(screen('nothing to see here', table), []);
  assert.deepEqual(screen('', table), []);
});

test('the public bundle carries no personal or other-project information', () => {
  const blob = JSON.stringify(DATA_RAW) + DOCS_RAW.llmsTxt + DOCS_RAW.skillMd;
  const leaks = screen(blob);
  assert.deepEqual(
    leaks,
    [],
    `the bundle matches a screened term at offset(s) ${leaks.map((hit) => hit.offset).join(', ')}`,
  );
  const phoneLike = blob.match(MOBILE_SHAPE) || [];
  assert.deepEqual(phoneLike, [], 'no mobile-number shaped value may be published');
});

// The same screen over the whole working tree, so a term pasted into a README,
// a comment or a test fixture is caught as well as one that reached the bundle.
const SKIP_SEGMENTS = new Set(['.git', 'node_modules', 'target', '.wrangler', 'dist']);
const SKIP_BYTES = 512 * 1024;

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    if (SKIP_SEGMENTS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.isFile()) yield path;
  }
}

test('no file in the repository repeats a screened term', () => {
  const offenders = [];
  let scanned = 0;
  for (const file of sourceFiles(repoDir)) {
    if (statSync(file).size > SKIP_BYTES) continue;
    const bytes = readFileSync(file);
    if (bytes.includes(0)) continue; // binary
    const hits = screen(bytes.toString('utf8'));
    if (hits.length > 0) {
      offenders.push(`${relative(repoDir, file)} at offset(s) ${hits.map((hit) => hit.offset).join(', ')}`);
    }
    scanned += 1;
  }
  assert.ok(scanned > 30, `the repository scan should cover the sources (scanned ${scanned})`);
  assert.deepEqual(offenders, []);
});
