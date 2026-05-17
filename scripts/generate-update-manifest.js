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
//   node scripts/generate-update-manifest.js
//     (default — hash local out/make/*.zip and out/make/*.Setup.exe)
//
//   node scripts/generate-update-manifest.js --remote v3.3.0
//     (download artefacts from the named GitHub Release and hash THOSE.
//      Required when PublisherGithub re-archives files between local make
//      and upload, which produces a stable but DIFFERENT sha than the
//      local out/make/ file. See release.yml comment for context.)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');

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

function manifestFor(targetFile, urlName, version, releaseDate) {
  const stat = fs.statSync(targetFile);
  const sha = sha512Base64(targetFile);
  const url = urlName || path.basename(targetFile);
  return toYaml({
    version,
    files: [{ url, sha512: sha, size: stat.size }],
    path: url,
    sha512: sha,
    releaseDate,
  });
}

// Download a single release asset to a temp dir and return the local path.
function downloadAsset(tag, assetName, downloadsDir) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  const outPath = path.join(downloadsDir, assetName);
  console.log(`[generate-update-manifest] downloading ${assetName} from release ${tag}`);
  // NB: use execFileSync with array args — execSync's shell-string form mangles
  // single quotes on Windows Git Bash (gh receives literal quote chars and
  // pattern matching fails with "no assets match"). Array args bypass the
  // shell entirely, working identically on Unix and Windows.
  execFileSync(
    'gh',
    ['release', 'download', tag, '--pattern', assetName, '--output', outPath, '--clobber'],
    { stdio: 'inherit' },
  );
  return outPath;
}

function listReleaseAssetNames(tag) {
  // NB: do NOT use `--jq` here — Windows Git Bash mangles the single-quoted
  // expression `'.assets[].name'` and gh CLI receives literal quote chars,
  // failing with "unexpected token". Parse the full JSON in Node instead.
  const json = execSync(`gh release view ${tag} --json assets`, { encoding: 'utf8' });
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed.assets)) return [];
  return parsed.assets.map((a) => a.name).filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  let remoteTag = null;
  const remoteIdx = args.indexOf('--remote');
  if (remoteIdx !== -1) {
    remoteTag = args[remoteIdx + 1];
    if (!remoteTag) {
      console.error('[generate-update-manifest] --remote requires a tag argument');
      process.exit(1);
    }
  }

  const outDir = path.join(process.cwd(), 'out', 'manifests');
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const version = pkg.version;
  const releaseDate = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });

  if (remoteTag) {
    // Remote mode — hash the actually-published assets so the manifest
    // sha512 matches what electron-updater will download.
    const downloadsDir = path.join(process.cwd(), 'out', 'release-downloads');
    fs.mkdirSync(downloadsDir, { recursive: true });
    const assetNames = listReleaseAssetNames(remoteTag);

    // macOS — find darwin .zip (electron-updater downloads the .zip, not the .dmg)
    const macZipName = assetNames.find((n) => /darwin.*arm64.*\.zip$/i.test(n))
      || assetNames.find((n) => /darwin.*\.zip$/i.test(n));
    if (macZipName) {
      const localPath = downloadAsset(remoteTag, macZipName, downloadsDir);
      const yaml = manifestFor(localPath, macZipName, version, releaseDate);
      const out = path.join(outDir, 'latest-mac.yml');
      fs.writeFileSync(out, yaml);
      console.log(`[generate-update-manifest] ${out} → ${macZipName}`);
    } else {
      console.log('[generate-update-manifest] no darwin .zip on release, skipping latest-mac.yml');
    }

    // Windows — Setup.exe
    const winExeName = assetNames.find((n) => /Setup\.exe$/i.test(n));
    if (winExeName) {
      const localPath = downloadAsset(remoteTag, winExeName, downloadsDir);
      const yaml = manifestFor(localPath, winExeName, version, releaseDate);
      const out = path.join(outDir, 'latest.yml');
      fs.writeFileSync(out, yaml);
      console.log(`[generate-update-manifest] ${out} → ${winExeName}`);
    } else {
      console.log('[generate-update-manifest] no Setup.exe on release, skipping latest.yml');
    }

    // Linux — AppImage
    const linuxAppImageName = assetNames.find((n) => /\.AppImage$/i.test(n));
    if (linuxAppImageName) {
      const localPath = downloadAsset(remoteTag, linuxAppImageName, downloadsDir);
      const yaml = manifestFor(localPath, linuxAppImageName, version, releaseDate);
      const out = path.join(outDir, 'latest-linux.yml');
      fs.writeFileSync(out, yaml);
      console.log(`[generate-update-manifest] ${out} → ${linuxAppImageName}`);
    }
    return;
  }

  // Local mode (legacy / dry-run) — hash files in out/make/
  const outMake = args[0] || path.join(process.cwd(), 'out', 'make');
  if (!fs.existsSync(outMake)) {
    console.error(`[generate-update-manifest] out/make dir not found: ${outMake}`);
    process.exit(1);
  }

  const macZips = findFiles(outMake, (p) => /-darwin-.+\.zip$/i.test(p));
  if (macZips.length > 0) {
    const zip = macZips.find((p) => /arm64/i.test(p)) || macZips[0];
    const yaml = manifestFor(zip, null, version, releaseDate);
    const out = path.join(outDir, 'latest-mac.yml');
    fs.writeFileSync(out, yaml);
    console.log(`[generate-update-manifest] ${out} → ${path.basename(zip)}`);
  }

  const winExes = findFiles(outMake, (p) => /Setup\.exe$/i.test(p));
  if (winExes.length > 0) {
    const exe = winExes[0];
    const yaml = manifestFor(exe, null, version, releaseDate);
    const out = path.join(outDir, 'latest.yml');
    fs.writeFileSync(out, yaml);
    console.log(`[generate-update-manifest] ${out} → ${path.basename(exe)}`);
  }

  const linuxAppImages = findFiles(outMake, (p) => /\.AppImage$/i.test(p));
  if (linuxAppImages.length > 0) {
    const img = linuxAppImages[0];
    const yaml = manifestFor(img, null, version, releaseDate);
    const out = path.join(outDir, 'latest-linux.yml');
    fs.writeFileSync(out, yaml);
    console.log(`[generate-update-manifest] ${out} → ${path.basename(img)}`);
  }
}

main();
