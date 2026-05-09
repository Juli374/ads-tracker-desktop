import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

// === Public-release scaffold: code signing + protocols ===
//
// Чтобы реально подписать .app для распространения вне Mac App Store, добавь
// в `packagerConfig` секцию `osxSign` и `osxNotarize`. Сертификаты и ключи —
// через env vars, никогда в репо. См. docs/electron-migration/certificates.md.
//
// packagerConfig.osxSign = {
//   identity: process.env.APPLE_DEVELOPER_ID, // 'Developer ID Application: Your Name (TEAMID)'
//   'hardened-runtime': true,
//   entitlements: 'assets/entitlements.plist',
//   'entitlements-inherit': 'assets/entitlements.plist',
//   'gatekeeper-assess': false,
// };
// packagerConfig.osxNotarize = {
//   tool: 'notarytool',
//   appleId: process.env.APPLE_ID,
//   appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD, // app-specific password
//   teamId: process.env.APPLE_TEAM_ID,
// };
//
// Для GitHub Releases auto-update раскомментируй publishers ниже после
// настройки electron-updater (см. src/main/updater.ts).
//
// publishers: [
//   {
//     name: '@electron-forge/publisher-github',
//     config: {
//       repository: { owner: 'Juli374', name: 'ads-tracker-desktop' },
//       prerelease: false,
//       draft: true,
//     },
//   },
// ],

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'assets/icon',
    appBundleId: 'com.juli374.ads-tracker',
    appCategoryType: 'public.app-category.business',
    // Кастомный protocol regstered at install-time (macOS plist).
    protocols: [
      {
        name: 'Ads Tracker',
        schemes: ['ads-tracker-desktop'],
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    // Squirrel: для Windows. При public-release добавить protocols в setupMsi/exe.
    new MakerSquirrel({ name: 'AdsTracker' }, ['win32']),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ icon: 'assets/icon.icns' }, ['darwin']),
    new MakerRpm({}, ['linux']),
    new MakerDeb({}, ['linux']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
