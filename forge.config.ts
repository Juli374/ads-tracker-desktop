import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
// Phase M.4 — sharp packaging fix. @electron-forge/plugin-webpack only ships
// the webpack output into the asar; native modules like sharp need their full
// node_modules tree (including transitive deps: detect-libc, color, semver,
// @img/sharp-<platform>, @img/sharp-libvips-<platform>) copied alongside.
// Cherry-picking deps in a hook is fragile — this plugin walks the dep graph
// of every "external" listed and copies the whole subtree. Pair with
// `externals: { sharp: 'commonjs sharp' }` in webpack.main.config.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForgeExternalsPlugin = require('@timfish/forge-externals-plugin');

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

// === Code signing + auto-update wiring (Phase I.3) ===
//
// Все секреты подаются через env-vars; ничего захардкожено в репо нет.
// Если env-var отсутствует — соответствующий блок опускается, и сборка
// продолжается без подписи (для dev / unsigned package).
//
// Источник правды по env-var'ам — docs/electron-migration/release-env.md
// (создаётся в Lane F вместе с CI workflow). Кратко:
//
//   APPLE_DEVELOPER_ID            — "Developer ID Application: Name (TEAMID)"
//   APPLE_ID                      — Apple ID для notarytool
//   APPLE_APP_SPECIFIC_PASSWORD   — app-specific password из appleid.apple.com
//   APPLE_TEAM_ID                 — 10-символьный team id из developer.apple.com
//   WIN_CSC_LINK                  — путь / URL к .pfx code-signing cert (Windows)
//   WIN_CSC_KEY_PASSWORD          — пароль к .pfx
//   GH_TOKEN                      — GitHub PAT с repo:write для публикации релизов
//
// См. electron-knowledge-base/atlas/core/05-packaging-and-signing.md и
//     electron-knowledge-base/atlas/core/07-auto-update.md.

const hasMacSign =
  Boolean(process.env.APPLE_DEVELOPER_ID) &&
  Boolean(process.env.APPLE_ID) &&
  Boolean(process.env.APPLE_APP_SPECIFIC_PASSWORD) &&
  Boolean(process.env.APPLE_TEAM_ID);

const hasWinSign =
  Boolean(process.env.WIN_CSC_LINK) && Boolean(process.env.WIN_CSC_KEY_PASSWORD);

// macOS code-sign config — только если все 4 env-var'а на месте. Иначе
// `osxSign`/`osxNotarize` не выставляются и Forge собирает unsigned bundle
// (полезно для local `npm run package` без сертов).
const osxSign = hasMacSign
  ? {
      identity: process.env.APPLE_DEVELOPER_ID,
      'hardened-runtime': true,
      entitlements: 'assets/entitlements.plist',
      'entitlements-inherit': 'assets/entitlements.plist',
      'gatekeeper-assess': false,
    }
  : undefined;

const osxNotarize = hasMacSign
  ? {
      tool: 'notarytool' as const,
      // hasMacSign гарантирует, что все три env-var'а определены, но TS этого
      // не понимает (Boolean() narrowing работает только в локальном scope).
      // Падаем на пустую строку, которая никогда не используется — guard сверху.
      appleId: process.env.APPLE_ID ?? '',
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD ?? '',
      teamId: process.env.APPLE_TEAM_ID ?? '',
    }
  : undefined;

// Windows: MakerSquirrel — оставляем всегда (для Forge — это default-maker).
// Если есть cert — добавляем cert config; нет — Squirrel генерит unsigned
// installer (SmartScreen заблокирует на пользовательских машинах, но для
// dev/CI feature-branch builds — ОК).
const squirrelOptions: ConstructorParameters<typeof MakerSquirrel>[0] = {
  name: 'AdsTracker',
  ...(hasWinSign
    ? {
        certificateFile: process.env.WIN_CSC_LINK,
        certificatePassword: process.env.WIN_CSC_KEY_PASSWORD,
      }
    : {}),
};

const config: ForgeConfig = {
  packagerConfig: {
    // AutoUnpackNativesPlugin handles `.node` files automatically, but sharp's
    // libvips ships as a separate package (`@img/sharp-libvips-darwin-arm64`)
    // whose payload is `.dylib` (not `.node`), so the auto-unpack logic leaves
    // it INSIDE app.asar. dlopen() can't follow @rpath into an asar bundle,
    // and v3.2.5 booted with "Library not loaded: @rpath/libvips-cpp.8.17.3.dylib"
    // on every fresh install.
    //
    // Force-unpack the whole `@img` subtree from node_modules so all libvips
    // shared libs land on disk where dlopen can find them. The pattern also
    // keeps `.node` files unpacked (redundant with AutoUnpackNativesPlugin —
    // belt + suspenders so a single forge-plugin removal doesn't silently
    // re-break this).
    asar: {
      unpack: '**/{*.node,**/node_modules/@img/**/*}',
    },
    icon: 'assets/icon',
    appBundleId: 'com.juli374.ads-tracker',
    appCategoryType: 'public.app-category.business',
    // electron-installer-debian (MakerDeb) hard-codes a lookup for the binary
    // at <out>/<appName>-<platform>-<arch>/<executableName>. Without this,
    // executableName falls back to package.json `name` (ads-tracker-desktop)
    // while the binary actually ships as the productName ("Ads Tracker") —
    // Linux build fails with "could not find the Electron app binary".
    // Setting both productName and executableName explicitly here keeps the
    // app brand readable in app menus while making Linux packaging happy.
    executableName: 'ads-tracker',
    // Кастомный protocol regstered at install-time (macOS plist).
    protocols: [
      {
        name: 'Ads Tracker',
        schemes: ['ads-tracker-desktop'],
      },
    ],
    // macOS sign + notarize — env-driven. См. блок выше.
    ...(osxSign ? { osxSign } : {}),
    ...(osxNotarize ? { osxNotarize } : {}),
  },
  rebuildConfig: {},
  makers: [
    // Squirrel installer (Windows) — даёт чистый Setup.exe с auto-update support.
    // На macOS host'е требует Wine + Mono. Если они есть — оставляем; иначе
    // сборка win32 идёт через MakerZIP (portable). Для public release лучше
    // запускать на Windows runner'е (GitHub Actions matrix).
    new MakerSquirrel(squirrelOptions, ['win32']),
    // MakerZIP для win32 — portable .zip, не требует Wine на macOS host'е.
    // Юзер распаковывает архив и запускает Ads Tracker.exe внутри.
    new MakerZIP({}, ['darwin', 'win32']),
    new MakerDMG({ icon: 'assets/icon.icns' }, ['darwin']),
    new MakerRpm({}, ['linux']),
    new MakerDeb({}, ['linux']),
  ],
  publishers: [
    // GitHub Releases — наш канал auto-update. electron-updater сам читает
    // latest.yml / latest-mac.yml из последнего опубликованного релиза.
    // GH_TOKEN передаётся через env (из CI / .env.local). Без него `npm run
    // publish` упадёт, но `package` / `make` продолжают работать в dev.
    new PublisherGithub({
      repository: { owner: 'Juli374', name: 'ads-tracker-desktop' },
      prerelease: false,
      // Auto-publish releases immediately (was `true`, which created a Draft
      // that required a manual click on github.com/.../releases to push live).
      // electron-updater only sees PUBLISHED releases, so a draft-gated flow
      // breaks "install-once, self-update forever" — the user has to do an
      // out-of-band publish click before every update can reach existing
      // installs. For a personal/owner build the lint+package+make in CI is
      // enough of a gate. If a public release later wants a smoke-test gate
      // back, flip this to `true` AND add a `gh release edit --draft=false`
      // step that runs after manual approval.
      draft: false,
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      // В dev две webpack-compilations (renderer + preload) каждая поднимает
      // свой webpack-dev-server HMR клиент. Дефолт client.overlay показывает
      // и ошибки, и **warnings** в полноэкранном оверлее — у нас на каждый
      // compilation выходит по оверлею, итого «два окна» поверх UI.
      // Оставляем оверлей для реальных ошибок (errors / runtime), глушим
      // warnings и deprecations: в dev перформанс-варнинги (bundle size) — шум.
      // Production (electron-forge package/make) не использует dev-server,
      // эти настройки на него не влияют.
      devServer: {
        client: {
          overlay: {
            errors: true,
            warnings: false,
            runtimeErrors: true,
          },
        },
      },
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
    // Phase M.4 — copy `sharp` (+ all transitive deps: detect-libc, color,
    // semver, @img/sharp-<platform>, @img/sharp-libvips-<platform>) into the
    // packaged app. MUST come AFTER WebpackPlugin per upstream docs — it
    // walks the staged app's node_modules tree. Externals listed here MUST
    // also be marked as commonjs externals in webpack.main.config.ts;
    // otherwise webpack inlines them and the plugin has nothing to copy.
    //
    // Cast: the plugin's `.d.ts` lags its CommonJS export shape — TS sees it
    // as a non-newable namespace, but the runtime export IS a class.
    new (ForgeExternalsPlugin as unknown as new (opts: { externals: string[]; includeDeps: boolean }) => unknown)({
      externals: ['sharp'],
      includeDeps: true,
    }) as unknown as InstanceType<typeof AutoUnpackNativesPlugin>,
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
