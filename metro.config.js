// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

const config = getSentryExpoConfig(__dirname)
// Temporary i18n-js workaround: https://stackoverflow.com/questions/75876705/i18n-js-unable-to-resolve-make-plural-from-pluralization-js
// Adds support for `mjs` files
config.resolver.sourceExts.push('mjs')

module.exports = config
