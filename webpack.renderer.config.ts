import type { Configuration } from 'webpack';

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

// Explicit mode prevents future regressions. NODE_ENV выставляется Forge,
// но если кто-то соберёт без env (raw webpack-cli) — дефолт mode='production'
// гарантирует минификацию вместо eval-source-map (perf-finding #5).
const mode: 'production' | 'development' =
  process.env.NODE_ENV === 'development' ? 'development' : 'production';

export const rendererConfig: Configuration = {
  mode,
  module: {
    rules,
  },
  plugins,
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
