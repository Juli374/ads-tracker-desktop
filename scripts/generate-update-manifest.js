#!/usr/bin/env node
// Generates electron-updater manifest files (latest-mac.yml, latest.yml,
// latest-linux.yml) from the artefacts produced by `electron-forge make`.
//
// electron-forge's PublisherGithub uploads .zip/.dmg/.exe/.deb/.rpm assets
// but doesn't generate the channel-file manifests that electron-updater
// reads to detect new versions. Without these, the auto-update pipeline
// dead-ends at "404 — no latest-mac.yml in latest release".
//
// We compute sha512 over the .zip (macOS) / .exe (Windows) / .AppImage
// (Linux) and emit the YAML next to them. CI uploads the .yml alongside
// the existing assets via `gh release upload`.
//
// Usage:
//   node scripts/generate-update-manifest.js <out-make-dir> <output-dir>
//
// Or with defaults (out/make → out/manifests):
//   node scripts/generate-update-manifest.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function findFiles(rootDir, predicate) {
  const results = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (predicate(p)) results.push(p);
    }
  }
  walk(rootDir);
  return results;
}

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

// electron-updater's YAML reader (js-yaml) handles standard YAML — we don't
// need a library, just careful string assembly. Single-quote strings so date
// stays unambiguous; numeric fields are bare.
function toYaml({ version, files, path: topPath, sha512, releaseDate }) {
  const lines = [`version: ${version}`, 'files:'];
  for (const f of files) {
    lines.push(`  - url: ${f.url}`);
    lines.push(`    sha512: ${f.sha512}`);
    lines.push(`    size: ${f.size}`);
  }
  lines.push(`path: ${topPath}`);
  lines.push(`sha512: ${sha512}`);
  lines.push(`releaseDate: '${releaseDate}'`);
  return lines.join('\n') + '\n';
}

function manifestFor(targetFile, version, releaseDate) {
  const stat = fs.statSync(targetFile);
  const sha = sha512Base64(targetFile);
  const url = path.basename(targetFile);
  return toYaml({
    version,
    files: [{ url, sha512: sha, size: stat.size }],
    path: url,
    sha512: sha,
    releaseDate,
  });
}

function main() {
  const outMake = process.argv[2] || path.join(process.cwd(), 'out', 'make');
  const outDir = process.argv[3] || path.join(process.cwd(), 'out', 'manifests');
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const version = pkg.version;
  const releaseDate = new Date().toISOString();

  if (!fs.existsSync(outMake)) {
    console.error(`[generate-update-manifest] out/make dir not found: ${outMake}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  // electron-updater on macOS reads `latest-mac.yml` and downloads the .zip
  // (NOT the .dmg — the .dmg is for human-driven first install only).
  const macZips = findFiles(outMake, (p) => /-darwin-.+\.zip$/i.test(p));
  if (macZips.length > 0) {
    // If multiple arches, prefer arm64 for Apple Silicon. electron-updater
    // also supports listing both in the files: array with arch suffixes; for
    // a single-arch build we just emit the one we have.
    const zip = macZips.find((p) => /arm64/i.test(p)) || macZips[0];
    const yaml = manifestFor(zip, version, releaseDate);
    const out = path.join(outDir, 'latest-mac.yml');
    fs.writeFileSync(out, yaml);
    console.log(`[generate-update-manifest] ${out} → ${path.basename(zip)}`);
  } else {
    console.log('[generate-update-manifest] no macOS .zip found, skipping latest-mac.yml');
  }

  // Windows: electron-updater reads `latest.yml` and downloads the NSIS .exe
  // installer. Squirrel-made .nupkg is for the legacy Squirrel updater path
  // which electron-updater doesn't use.
  const winExes = findFiles(outMake, (p) => /Setup\.exe$/i.test(p));
  if (winExes.length > 0) {
    const exe = winExes[0];
    const yaml = manifestFor(exe, version, releaseDate);
    const out = path.join(outDir, 'latest.yml');
    fs.writeFileSync(out, yaml);
    console.log(`[generate-update-manifest] ${out} → ${path.basename(exe)}`);
  } else {
    console.log('[generate-update-manifest] no Windows Setup.exe found, skipping latest.yml');
  }

  // Linux: electron-updater on linux reads `latest-linux.yml` (or per-arch).
  // AppImage is the canonical update channel; .deb/.rpm are installer-only.
  // We don't ship AppImage today (forge makers are deb/rpm only) so skip.
  const linuxAppImages = findFiles(outMake, (p) => /\.AppImage$/i.test(p));
  if (linuxAppImages.length > 0) {
    const img = linuxAppImages[0];
    const yaml = manifestFor(img, version, releaseDate);
    const out = path.join(outDir, 'latest-linux.yml');
    fs.writeFileSync(out, yaml);
    console.log(`[generate-update-manifest] ${out} → ${path.basename(img)}`);
  }
}

main();
