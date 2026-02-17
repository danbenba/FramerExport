const path = require('path');

module.exports = {
  entry: './main.js',
  output: {
    filename: 'framer-export.bundle.cjs',
    path: path.resolve(__dirname, 'dist'),
  },
  target: 'node',
  mode: 'production',
  externals: {
    puppeteer: 'commonjs puppeteer',
    prettier: 'commonjs prettier',
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: true,
        },
      },
    ],
  },
  experiments: {
    outputModule: false,
  },
};
