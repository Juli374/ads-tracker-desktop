#!/usr/bin/env node
// Generate macOS .icns (and Windows .ico fallback) from assets/icon.svg.
//
// Standard macOS iconset requires these sizes (per Apple HIG):
//   16, 32, 64, 128, 256, 512, 1024 (1024 = 512@2x)
// We also emit @2x variants (32, 64, 128, 256, 512, 1024) for retina.
//
// Pipeline:
//   1. Read assets/icon.svg (1024×1024 source)
//   2. Use sharp to rasterize to each target size
//   3. Write to assets/icon.iconset/icon_NxN[@2x].png
//   4. Run `iconutil -c icns icon.iconset` (macOS built-in) to produce .icns
//   5. Also write a flat 1024×1024 PNG as assets/icon.png

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SVG = path.join(ROOT, 'assets', 'icon.svg');
const ICONSET = path.join(ROOT, 'assets', 'icon.iconset');
const ICNS = path.join(ROOT, 'assets', 'icon.icns');
const PNG = path.join(ROOT, 'assets', 'icon.png');

// Apple iconset spec — (filename, pixel size)
const SIZES = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

async function main() {
  if (!fs.existsSync(SVG)) {
    console.error(`Source SVG missing: ${SVG}`);
    process.exit(1);
  }
  fs.mkdirSync(ICONSET, { recursive: true });
  const svgBuffer = fs.readFileSync(SVG);

  // Render every required size with high quality.
  for (const [filename, size] of SIZES) {
    const out = path.join(ICONSET, filename);
    await sharp(svgBuffer, { density: 400 })
      .resize(size, size, {
        fit: 'cover',
        kernel: sharp.kernel.lanczos3,
      })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`✓ ${path.relative(ROOT, out)} (${size}×${size})`);
  }

  // Flat top-level icon.png — 1024×1024, used by Forge / Linux fallback.
  await sharp(svgBuffer, { density: 400 })
    .resize(1024, 1024, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile(PNG);
  console.log(`✓ ${path.relative(ROOT, PNG)} (1024×1024)`);

  // Bundle into .icns (macOS).
  if (process.platform === 'darwin') {
    try {
      execSync(`iconutil -c icns -o ${JSON.stringify(ICNS)} ${JSON.stringify(ICONSET)}`, {
        stdio: 'inherit',
      });
      console.log(`✓ ${path.relative(ROOT, ICNS)}`);
    } catch (err) {
      console.error('iconutil failed — .icns not regenerated:', err.message);
      process.exit(1);
    }
  } else {
    console.warn('Not on macOS — skipped iconutil step. Run this script on a Mac to regenerate icon.icns.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
