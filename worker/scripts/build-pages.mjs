#!/usr/bin/env node
// Builds the Cloudflare Pages bundle (Functions advanced mode).
//
// The Pages project cannot take `--config`, so it keeps its own wrangler.toml
// under pages/ and serves the same bundled Worker from pages/dist/_worker.js.
// This script produces that file from src/ with the same esbuild pass wrangler
// uses for the Worker, so both endpoints run identical code.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(here, '..');
const outDir = join(workerDir, '.pages-build');
const distDir = join(workerDir, 'pages', 'dist');

const wrangler = join(workerDir, 'node_modules', '.bin', 'wrangler');
if (!existsSync(wrangler)) {
  console.error('build-pages: wrangler is not installed — run `npm install` first');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
const result = spawnSync(wrangler, ['deploy', '--dry-run', '--outdir', outDir], {
  cwd: workerDir,
  stdio: 'pipe',
  encoding: 'utf8',
});
if (result.status !== 0) {
  console.error(result.stdout || '');
  console.error(result.stderr || '');
  console.error('build-pages: wrangler dry-run failed');
  process.exit(result.status || 1);
}

const bundle = join(outDir, 'index.js');
if (!existsSync(bundle)) {
  console.error('build-pages: wrangler did not produce index.js');
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
copyFileSync(bundle, join(distDir, '_worker.js'));
// Pages serves static assets for everything else; keep the folder to the worker.
writeFileSync(join(distDir, '.assetsignore'), '*\n', 'utf8');
rmSync(outDir, { recursive: true, force: true });

const size = readFileSync(join(distDir, '_worker.js')).length;
console.log(`build-pages: wrote pages/dist/_worker.js (${(size / 1024).toFixed(1)} KB)`);
