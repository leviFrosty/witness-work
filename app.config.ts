import { ExpoConfig, ConfigContext } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'JW Time',
  slug: 'jw-time',
  version: '1.7.0',
  owner: 'levi_frosty',
  orientation: 'portrait',
  icon: './src/assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './src/assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#4BD27C',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.leviwilkerson.jwtime',
    infoPlist: {
      RCTAsyncStorageExcludeFromBackup: false,
    },
    appStoreUrl: 'https://apps.apple.com/us/app/jw-time/id6469723047',
  },
  android: {
    allowBackup: true,
    adaptiveIcon: {
      foregroundImage: './src/assets/adaptive-icon.png',
      monochromeImage: './src/assets/adaptive-icon-monochrome.png',
      backgroundColor: '#ffffff',
    },
    package: 'com.leviwilkerson.jwtime',
  },
  web: {
    favicon: './src/assets/favicon.png',
  },
  extra: {
    eas: {
      projectId: 'a67257dc-2fb8-4942-97f2-e9364b80d318',
    },
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: 'https://u.expo.dev/a67257dc-2fb8-4942-97f2-e9364b80d318',
  },
  plugins: [
    'sentry-expo',
    'expo-localization',
    ['expo-updates', { username: 'levi_frosty' }],
    [
      'expo-localization',
      {
        locationWhenInUsePermission:
          'Allow $(PRODUCT_NAME) to use your location.',
      },
    ],
  ],
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {
          organization: 'levi-wilkerson',
          project: 'jw-time',
        },
      },
    ],
  },
})
