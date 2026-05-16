import { execSync } from 'child_process';
import webpack, { type Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

rules.push({
  test: /\.css$/,
  use: [
    { loader: 'style-loader' },
    { loader: 'css-loader' },
    { loader: 'postcss-loader' },
  ],
});

/**
 * Mirror of `gitCommitHash` from webpack.main.config.ts. Duplicated (not
 * imported) so each webpack config stays self-contained — Forge resolves the
 * configs independently and a shared module would couple their evaluation.
 *
 * Returns the short SHA when `git rev-parse` succeeds; otherwise `'unknown'`
 * (shallow clones, source-only checkouts, missing git binary).
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

// Explicit mode prevents future regressions. NODE_ENV выставляется Forge,
// но если кто-то соберёт без env (raw webpack-cli) — дефолт mode='production'
// гарантирует минификацию вместо eval-source-map (perf-finding #5).
const mode: 'production' | 'development' =
  process.env.NODE_ENV === 'development' ? 'development' : 'production';

export const rendererConfig: Configuration = {
  mode,
  // Dev: webpack's default devtool ('eval' / 'eval-source-map') runs source
  // through `new Function(...)` / `eval()` which trips the production CSP
  // (`script-src 'self'`) and leaves the renderer with a blank window in
  // `npm start`. `cheap-module-source-map` keeps line-accurate stack traces
  // without using eval, so source mapping still works in DevTools while the
  // strict CSP stays untouched.
  // Production: undefined → webpack's default for mode='production' is `false`
  // (no source maps shipped to users).
  devtool: mode === 'development' ? 'cheap-module-source-map' : false,
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
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
  // NOTE: React.lazy в MainLayout на ~11 страниц написан корректно, но
  // Electron Forge's WebpackPlugin с target='electron-renderer' инлайнит
  // dynamic imports в основной bundle. Чтобы реально получить chunks нужно:
  //   1. либо переопределить target на 'web'
  //   2. либо настроить output.publicPath='./' + optimization.splitChunks
  //      и проверить chunkLoading
  // Без этого React.lazy всё ещё даёт benefit: deferred render evaluation
  // (компонент не рендерится до первого визита). Bundle size — без изменений.
};
