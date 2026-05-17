#!/usr/bin/env node
/**
 * Emit feature_keys.json from src/shared/entitlements.ts.
 *
 * Single source of truth for feature_keys lives in TS (ALL_FEATURE_KEYS +
 * DEFAULT_TIER_FOR_FEATURE). Backend reads a JSON snapshot of these.
 *
 * Workflow:
 *   1) Edit src/shared/entitlements.ts (add/remove key, change tier).
 *   2) npm run export-feature-keys
 *   3) Commit feature_keys.json in this repo.
 *   4) `cp feature_keys.json ../ads-tracker/backend/feature_keys.json` and commit.
 *      (Cross-repo CI sync is a Phase R.0.1 follow-up; manual cp is fine now.)
 *
 * Plain Node — no tsx / ts-node. Parses entitlements.ts as text via regex.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const srcPath = join(repoRoot, 'src/shared/entitlements.ts');
const entSrc = readFileSync(srcPath, 'utf8');

const fail = (msg) => {
  console.error(`emit-feature-keys: ${msg}`);
  process.exit(1);
};

// 1) ALL_FEATURE_KEYS: readonly FeatureKey[] = [ ... ] as const;
const keysBlock = entSrc.match(/ALL_FEATURE_KEYS:\s*readonly\s+FeatureKey\[\]\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
if (!keysBlock) fail('could not find ALL_FEATURE_KEYS block in entitlements.ts');
const keys = [...keysBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (keys.length === 0) fail('ALL_FEATURE_KEYS parsed but empty');

// 2) DEFAULT_TIER_FOR_FEATURE: Record<FeatureKey, Tier> = { 'k': 'tier', ... };
const tiersBlock = entSrc.match(/DEFAULT_TIER_FOR_FEATURE:\s*Record<FeatureKey,\s*Tier>\s*=\s*\{([\s\S]*?)\}\s*;/);
if (!tiersBlock) fail('could not find DEFAULT_TIER_FOR_FEATURE block');
const tiers = {};
for (const m of tiersBlock[1].matchAll(/'([^']+)':\s*'(start|pro|business)'/g)) {
  tiers[m[1]] = m[2];
}

// 3) Validate: every key has a tier; no orphans.
const missingTier = keys.filter((k) => !tiers[k]);
if (missingTier.length) fail(`keys without DEFAULT_TIER_FOR_FEATURE entry: ${missingTier.join(', ')}`);
const orphanTier = Object.keys(tiers).filter((k) => !keys.includes(k));
if (orphanTier.length) fail(`tier entries with no matching ALL_FEATURE_KEYS: ${orphanTier.join(', ')}`);

// 4) Emit pretty JSON snapshot with trailing newline.
const out = {
  $schema: 'https://kdpbook.com/schemas/feature-keys-v1.json',
  generated_from: 'src/shared/entitlements.ts',
  v: 1,
  all_feature_keys: keys,
  default_tier_for_feature: tiers,
};
const outPath = join(repoRoot, 'feature_keys.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`emit-feature-keys: wrote ${keys.length} keys → ${outPath}`);
