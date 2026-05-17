#!/usr/bin/env node
/**
 * Sync feature_keys.json from desktop → backend.
 *
 * Run after editing src/shared/entitlements.ts:
 *   npm run export-feature-keys       # regenerate feature_keys.json here
 *   npm run sync-backend-feature-keys # copy to ../ads-tracker/backend/
 *
 * Both repos must commit their copies. CI in each repo verifies its own
 * snapshot matches the TS source (desktop) or loads cleanly (backend).
 *
 * Cross-repo equality is enforced manually until Phase R.0.1's follow-up
 * (Decisions block, 2026-05-17).
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const src = join(repoRoot, 'feature_keys.json');
const dst = join(repoRoot, '..', 'ads-tracker', 'backend', 'feature_keys.json');

if (!existsSync(src)) {
  console.error(`sync-backend-feature-keys: ${src} not found. Run 'npm run export-feature-keys' first.`);
  process.exit(1);
}
if (!existsSync(dirname(dst))) {
  console.error(`sync-backend-feature-keys: ${dirname(dst)} not found. Adjust path or clone backend repo as sibling directory.`);
  process.exit(1);
}

const srcContent = readFileSync(src, 'utf8');
const dstContent = existsSync(dst) ? readFileSync(dst, 'utf8') : '';

if (srcContent === dstContent) {
  console.log(`sync-backend-feature-keys: backend already up to date (no copy needed).`);
  process.exit(0);
}

copyFileSync(src, dst);
console.log(`sync-backend-feature-keys: copied → ${dst}`);
console.log(`Now commit feature_keys.json in BOTH repos.`);
