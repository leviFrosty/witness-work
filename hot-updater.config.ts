import { d1Database, r2Storage } from '@hot-updater/cloudflare'
import { expo } from '@hot-updater/expo'
import { defineConfig } from 'hot-updater'
import { apiKeys, insights, remoteConfig } from 'hot-updater/plugins'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isConfirmed, refusal } from './scripts/release-confirm.mjs'
import { getConfig } from 'expo/config'
import environments from './config/ota-environments.json'

const variant = process.env.APP_VARIANT
if (variant !== 'development' && variant !== 'beta' && variant !== 'production')
  throw new Error('Set APP_VARIANT explicitly before using Hot Updater')
const target = environments[variant]

const deploying = process.env.WW_OTA_DEPLOY === '1'
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
if (
  variant === 'production' &&
  deploying &&
  !isConfirmed(version, process.env.WW_RELEASE_CONFIRM)
)
  throw new Error(refusal(version))

const { exp } = getConfig(process.cwd())
const plugins = (exp.plugins ?? []).filter((entry) => {
  const name = Array.isArray(entry) ? entry[0] : entry
  return (
    name !== 'posthog-react-native/expo' &&
    name !== './plugins/with-posthog-symbols-last'
  )
})
mkdirSync('.verify', { recursive: true })
const nativeSources = { ios: '', android: '' }
for (const platform of ['ios', 'android'] as const) {
  const nativeConfig = JSON.parse(
    JSON.stringify({
      ...exp,
      extra: undefined,
      version: undefined,
      runtimeVersion: undefined,
      _internal: undefined,
      ios: platform === 'ios' ? exp.ios : undefined,
      android: platform === 'android' ? exp.android : undefined,
      plugins,
    })
  )
  for (const entry of nativeConfig.plugins) {
    if (!Array.isArray(entry) || entry[0] !== 'react-native-maps') continue
    const key = entry[1]?.androidGoogleMapsApiKey
    if (platform === 'ios') delete entry[1]?.androidGoogleMapsApiKey
    else if (key)
      entry[1].androidGoogleMapsApiKey = createHash('sha256')
        .update(key)
        .digest('hex')
  }
  nativeSources[platform] =
    `.verify/ota-native-config.${variant}.${platform}.json`
  writeFileSync(nativeSources[platform], JSON.stringify(nativeConfig))
}
const sharedSources = [
  'modules',
  'modules/*/package.json',
  'modules/*/expo-module.config.json',
  'plugins/**/*.js',
  'plugins/**/*.ts',
  'patches/**/*.patch',
  'node_modules/expo-sqlite/vendor/**/*',
  'targets',
  'targets/*/expo-target.config.js',
  'targets/**/*.plist',
  'targets/**/*.entitlements',
  'targets/**/*.xcstrings',
  'src/assets/icons/**/*',
  'src/assets/icon.png',
  'src/assets/icon-beta.png',
  'src/assets/splash.png',
]

export default defineConfig((options) => {
  if (options && !deploying)
    throw new Error(
      'Publish through scripts/ota.mjs; native prebuild needs no provider credentials'
    )
  if (options && options.channel !== target.channel)
    throw new Error(`Channel must be ${target.channel} for ${variant}`)

  return {
    build: expo({ outDir: 'dist/hot-updater-build', sourcemap: true }),
    updateStrategy: 'fingerprint',
    fingerprint: {
      extraSources: {
        ios: [nativeSources.ios, ...sharedSources],
        android: [
          nativeSources.android,
          ...sharedSources,
          'google-services.json',
          'modules/*/android/src/main/AndroidManifest.xml',
          'modules/*/android/src/main/res/**/*',
        ],
      },
      ignorePaths: [
        'targets/*/generated.entitlements',
        'targets/*/Assets.xcassets/**',
        'targets/wear-os/**',
        'src/locales/en-US.json',

        '**/build/**',
        '**/.build/**',
        '**/.gradle/**',
        '**/.cxx/**',

        '!**/react-native/ReactAndroid/src/**',
        '**/react-native-maps/ios/AirMaps/RNMapsDefines.h',

        '**/expo-sqlite/ios/sqlite3.c',
        '**/expo-sqlite/ios/sqlite3.h',
      ],
    },
    storage: r2Storage({
      bucketName: target.bucketName,
      accountId: 'f73da039376f712ea9a5637a58baca09',
      credentials: {
        accessKeyId: deploying
          ? (process.env.HOT_UPDATER_R2_ACCESS_KEY_ID ?? '')
          : '',
        secretAccessKey: deploying
          ? (process.env.HOT_UPDATER_R2_SECRET_ACCESS_KEY ?? '')
          : '',
      },
    }),
    database: d1Database({
      databaseId: target.databaseId,
      accountId: 'f73da039376f712ea9a5637a58baca09',
      cloudflareApiToken: deploying
        ? (process.env.HOT_UPDATER_CLOUDFLARE_API_TOKEN ?? '')
        : '',
    }),
    plugins: [insights(), apiKeys(), remoteConfig()],
    signing: deploying
      ? {
          enabled: true,
          privateKeyPath: process.env.HOT_UPDATER_SIGNING_KEY_PATH!,
        }
      : undefined,
  }
})
