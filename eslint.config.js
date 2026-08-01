// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // `native/**` is iOS-only source (Swift, an Expo native module, and a
    // config plugin) that imports packages which are NOT installed on a
    // Windows/web checkout. Linting it here would report phantom
    // unresolved-import errors, so it is ignored for the same reason
    // `tsconfig.json` excludes it. Lint it on a Mac after `npm run native:on`.
    ignores: ['dist/*', 'native/**'],
  },
]);
