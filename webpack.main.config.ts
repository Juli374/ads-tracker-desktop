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
};
