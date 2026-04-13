import { execSync } from 'child_process'
import { ExpoConfig, ConfigContext } from 'expo/config'
import { withSentry } from '@sentry/react-native/expo'
/** Passed in from `env` property in profile `./eas.json` to eas build */
const IS_DEV = process.env.APP_VARIANT === 'development'

export default ({ config }: ConfigContext): ExpoConfig => {
  const expoConfig: ExpoConfig = {
    ...config,
    name: IS_DEV ? 'WitnessWork Dev' : 'WitnessWork',
    developmentClient: {},
    slug: 'jw-time',
    version: '1.38.2',
    owner: 'levi_frosty',
    scheme: 'witnesswork',
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
      supportsTablet: true,
      bundleIdentifier: IS_DEV
        ? 'com.leviwilkerson.jwtimedev'
        : 'com.leviwilkerson.jwtime',
      // Required for App Group entitlements (widget <-> app shared container).
      // Set via env in CI/EAS or hardcode here once known.
      appleTeamId: process.env.APPLE_TEAM_ID,
      infoPlist: {
        RCTAsyncStorageExcludeFromBackup: false,
        ITSAppUsesNonExemptEncryption: false,
        // expo-background-fetch requires this permitted task identifier
        // to register the snapshot refresh task.
        BGTaskSchedulerPermittedIdentifiers: [
          'com.leviwilkerson.jwtime.widget.refresh',
        ],
      },
      entitlements: {
        'com.apple.security.application-groups': [
          IS_DEV
            ? 'group.com.leviwilkerson.jwtimedev'
            : 'group.com.leviwilkerson.jwtime',
        ],
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
      playStoreUrl:
        'https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime',
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_ANDROID_SDK_API_KEY,
        },
      },
    },
    extra: {
      commitHash: execSync('git rev-parse --short HEAD').toString().trim(),
      eas: {
        projectId: 'a67257dc-2fb8-4942-97f2-e9364b80d318',
      },
    },
    updates: {
      url: 'https://u.expo.dev/a67257dc-2fb8-4942-97f2-e9364b80d318',
    },
    plugins: [
      '@bacons/apple-targets',
      '@react-native-community/datetimepicker',
      'expo-asset',
      'expo-font',
      'expo-localization',
      'expo-sharing',
      [
        'expo-updates',
        {
          username: 'levi_frosty',
          // Resolved into Info.plist at prebuild time so the bare workflow
          // (post-prebuild) doesn't reject the policy. Was previously a
          // top-level `runtimeVersion: { policy: 'appVersion' }`.
          runtimeVersion: { policy: 'appVersion' },
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            '$(PRODUCT_NAME) will use your location to display where you are on the map, useful for finding nearby contacts.',
        },
      ],
      [
        'expo-document-picker',
        {
          iCloudContainerEnvironment: IS_DEV ? 'Development' : 'Production',
        },
      ],
    ],
    experiments: {
      reactCompiler: true,
    },
  }

  return withSentry(expoConfig, {
    organization: 'levi-wilkerson',
    project: 'jw-time',
  })
}
