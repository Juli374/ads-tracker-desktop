import { execSync } from 'child_process';
import webpack, { type Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

/**
 * Build-time read of the current short git SHA. Inlined into both bundles via
 * DefinePlugin so the runtime can render it in Settings → About without ever
 * shelling out at runtime (sandboxed renderer can't anyway).
 *
 * Falls back to `'unknown'` for shallow clones, source-only checkouts, or any
 * environment where `git` is unavailable / fails.
 */
function gitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/index.ts',
  // Put your normal webpack config below here
  module: {
    rules,
  },
  plugins: [
    ...plugins,
    new webpack.DefinePlugin({
      'process.env.GIT_COMMIT': JSON.stringify(gitCommitHash()),
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  // Phase M.4 fix — `sharp` is a native module (libvips bindings) whose
  // platform-specific binary lives under `@img/sharp-<platform>-<arch>/lib/*.node`.
  // If webpack bundles sharp's JS into the asar, the runtime require resolves
  // a different path and can't find the .node binary, raising "Could not load
  // the sharp module using the darwin-arm64 runtime" at boot. Marking sharp
  // (and its native sub-packages) as commonjs externals keeps the original
  // node_modules layout — AutoUnpackNativesPlugin then handles unpacking the
  // .node files out of the asar so dlopen() can find them.
  externals: ({ request }, callback) => {
    if (
      request === 'sharp' ||
      request?.startsWith('@img/sharp-') ||
      request?.startsWith('@img/sharp-libvips-')
    ) {
      return callback(null, `commonjs ${request}`);
    }
    callback();
  },
};
