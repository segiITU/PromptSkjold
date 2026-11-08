// Standalone bundle for the Test-tab visual harness (does not touch the main build, crate/ or dist/).
//   npx webpack --config e2e/live/test-tab-harness/webpack.config.js --env out=<dir>
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const sveltePreprocess = require('svelte-preprocess');

module.exports = (env = {}) => ({
  mode: 'development',
  devtool: false,
  entry: { harness: path.resolve(__dirname, 'entry.ts') },
  output: { path: path.resolve(env.out), filename: '[name].js' },
  resolve: {
    extensions: ['.svelte', '.ts', '.js'],
    conditionNames: ['svelte', 'browser', 'import', 'module', 'default'],
    mainFields: ['svelte', 'browser', 'module', 'main'],
  },
  module: {
    rules: [
      {
        test: /\.svelte$/,
        use: { loader: 'svelte-loader', options: { emitCss: true, compilerOptions: { runes: true }, preprocess: sveltePreprocess({ typescript: true }) } },
      },
      {
        test: /\.ts$/,
        use: { loader: 'ts-loader', options: { transpileOnly: true, configFile: path.resolve(__dirname, '../../../tsconfig.json'), compilerOptions: { rootDir: path.resolve(__dirname, '../../..'), declaration: false, declarationMap: false } } },
        exclude: /node_modules/,
      },
      // the overlay stylesheet is injected as a raw string into its shadow root (same rule as the main build)
      { test: /overlay-styles\.css$/, use: [{ loader: 'css-loader', options: { url: false, exportType: 'string' } }] },
      { test: /\.css$/, exclude: /overlay-styles\.css$/, use: [MiniCssExtractPlugin.loader, { loader: 'css-loader', options: { url: false } }] },
    ],
  },
  plugins: [new MiniCssExtractPlugin({ filename: '[name].css' })],
  performance: { hints: false },
});
