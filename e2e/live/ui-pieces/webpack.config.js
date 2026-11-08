// Builds the visual-test bundle for the in-page UI pieces. Usage:
//   npx webpack --config e2e/live/ui-pieces/webpack.config.js --env out=<dir>
const path = require('path');

module.exports = (env = {}) => ({
  mode: 'development',
  devtool: false,
  entry: path.resolve(__dirname, 'entry.ts'),
  output: { path: path.resolve(env.out || path.join(__dirname, 'out')), filename: 'pieces.js' },
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: { loader: 'ts-loader', options: { transpileOnly: true, configFile: path.resolve(__dirname, '../../../tsconfig.json'), compilerOptions: { rootDir: path.resolve(__dirname, '../../..'), declaration: false, declarationMap: false } } },
        exclude: /node_modules/,
      },
    ],
  },
  performance: { hints: false },
});
