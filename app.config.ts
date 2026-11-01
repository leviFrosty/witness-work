import enUS from './src/locales/en-US.json'
import otaEnvironments from './config/ota-environments.json'
import nativeLanguages from './scripts/native-languages.json'
import { execSync } from 'child_process'
import { readdirSync } from 'fs'
import path from 'path'
import { ExpoConfig, ConfigContext } from 'expo/config'

type AppVariant = 'development' | 'beta' | 'production'
const APP_VARIANT: AppVariant =
  process.env.APP_VARIANT === 'development' ||
  process.env.APP_VARIANT === 'beta'
    ? process.env.APP_VARIANT
    : 'production'
const IS_DEV = APP_VARIANT === 'development'
const IS_BETA = APP_VARIANT === 'beta'

process.env.EXPO_PUBLIC_COMMIT_HASH = execSync('git rev-parse --short HEAD')
  .toString()
  .trim()

const PERF_PROBE = IS_DEV && process.env.EXPO_PUBLIC_PERF_PROBE === '1'

const BUNDLE_ID = {
  development: 'com.leviwilkerson.jwtimedev',
  beta: 'com.leviwilkerson.jwtimebeta',
  production: 'com.leviwilkerson.jwtime',
}[APP_VARIANT]

const APP_NAME = {
  development: 'WitnessWork Dev',
  beta: 'WitnessWork Beta',
  production: 'WitnessWork',
}[APP_VARIANT]

const CAMERA_PERMISSION = enUS.cameraPermissionPurpose

const MICROPHONE_PERMISSION = enUS.microphonePermissionPurpose

const APP_LANGUAGES = readdirSync(path.join(__dirname, 'src', 'locales'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => {
    const name = file.slice(0, -'.json'.length) as keyof typeof nativeLanguages
    const language = nativeLanguages[name]
    if (typeof language !== 'object') {
      throw new Error(`Add ${name} to scripts/native-languages.json`)
    }
    return language.apple
  })
  .sort((a, b) => Number(b === 'en') - Number(a === 'en') || a.localeCompare(b))

export default ({ config }: ConfigContext): ExpoConfig => {
  if (!IS_DEV && !process.env.EXPO_PUBLIC_HOT_UPDATER_API_KEY?.trim())
    throw new Error(
      'EXPO_PUBLIC_HOT_UPDATER_API_KEY is required for this build'
    )

  const expoConfig: ExpoConfig = {
    ...config,
    name: APP_NAME,
    developmentClient: {},
    slug: 'jw-time',
    version: '1.46.0',
    owner: 'levi_frosty',
    scheme: 'witnesswork',
    orientation: 'portrait',
    icon: IS_BETA ? './src/assets/icon-beta.png' : './src/assets/icon.png',
    userInterfaceStyle: 'automatic',
    assetBundlePatterns: ['**/*'],
    android: {
      blockedPermissions: [
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      ],
      package: IS_DEV
        ? 'com.leviwilkerson.jwtimedev'
        : 'com.leviwilkerson.jwtime',

      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        foregroundImage: './src/assets/adaptive-icon.png',
        monochromeImage: './src/assets/adaptive-icon-monochrome.png',

        backgroundColor: '#F8F9FA',
      },
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            {
              scheme: 'https',
              host: 'ww-proxy.leviwilkerson.com',
              path: '/c',
            },
            {
              scheme: 'https',
              host: 'ww-proxy.leviwilkerson.com',
              pathPrefix: '/c/',
            },

            {
              scheme: 'https',
              host: 'ww-proxy.leviwilkerson.com',
              path: '/b',
            },

            {
              scheme: 'https',
              host: 'ww-proxy.leviwilkerson.com',
              path: '/h',
            },
          ],
        },
        {
          action: 'VIEW',
          category: ['BROWSABLE', 'DEFAULT'],
          data: [
            { scheme: 'content', mimeType: 'application/witnesswork+json' },
            { scheme: 'file', mimeType: 'application/witnesswork+json' },
          ],
        },
      ],
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: BUNDLE_ID,
      appleTeamId: 'Y3KE7B7AHJ',
      infoPlist: {
        RCTAsyncStorageExcludeFromBackup: false,
        ITSAppUsesNonExemptEncryption: false,
        NSSupportsLiveActivities: true,
        NSCalendarsUsageDescription: enUS.calendarPermissionUsage,
        NSCalendarsFullAccessUsageDescription: enUS.calendarPermissionUsage,
        NSMicrophoneUsageDescription: MICROPHONE_PERMISSION,

        NSSpeechRecognitionUsageDescription:
          enUS.speechRecognitionPermissionPurpose,
        LSSupportsOpeningDocumentsInPlace: true,

        PHPhotoLibraryPreventAutomaticLimitedAccessAlert: true,

        BGTaskSchedulerPermittedIdentifiers: [
          'com.leviwilkerson.jwtime.widget.refresh',
        ],

        UTExportedTypeDeclarations: [
          {
            UTTypeIdentifier: 'com.leviwilkerson.witnesswork.contact',
            UTTypeDescription: 'WitnessWork Contact',
            UTTypeConformsTo: ['public.json'],
            UTTypeTagSpecification: {
              'public.filename-extension': ['witnesswork'],
              'public.mime-type': ['application/witnesswork+json'],
            },
          },
        ],
        CFBundleDocumentTypes: [
          {
            CFBundleTypeName: 'WitnessWork Contact',
            CFBundleTypeRole: 'Editor',
            LSHandlerRank: 'Owner',
            LSItemContentTypes: ['com.leviwilkerson.witnesswork.contact'],
          },
        ],
      },

      associatedDomains: ['applinks:ww-proxy.leviwilkerson.com'],
      entitlements: {
        'com.apple.security.application-groups': [`group.${BUNDLE_ID}`],

        'com.apple.developer.devicecheck.appattest-environment': IS_DEV
          ? 'development'
          : 'production',

        'keychain-access-groups': [
          `$(AppIdentifierPrefix)${BUNDLE_ID}`,
          `$(AppIdentifierPrefix)${BUNDLE_ID}.buddies-alerts`,
        ],
      },
      appStoreUrl: 'https://apps.apple.com/us/app/jw-time/id6469723047',
    },
    extra: {
      appVariant: APP_VARIANT,
      commitHash: execSync('git rev-parse --short HEAD').toString().trim(),
      posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
      posthogHost: process.env.POSTHOG_HOST,
      hotUpdater: {
        baseURL: otaEnvironments[APP_VARIANT].baseURL,
        apiKey: process.env.EXPO_PUBLIC_HOT_UPDATER_API_KEY,
      },
      eas: {
        projectId: 'a67257dc-2fb8-4942-97f2-e9364b80d318',
      },
    },
    plugins: [
      [
        'expo-build-properties',
        {
          ...(PERF_PROBE && { android: { usesCleartextTraffic: true } }),
        },
      ],
      './plugins/with-android-build-memory',
      './plugins/with-force-load-local-modules',
      [
        './plugins/with-icloud-container',
        {
          containerIdentifier: `iCloud.${BUNDLE_ID}`,
          containerDisplayName: 'WitnessWork',
        },
      ],
      '@bacons/apple-targets',

      './plugins/with-wear-os',
      ['./plugins/with-android-locale-config', { locales: APP_LANGUAGES }],
      './plugins/with-android-text-input-direction',
      './plugins/with-posthog-symbols-last',
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey:
            process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
            'YOUR_GOOGLE_MAPS_ANDROID_API_KEY',
        },
      ],
      [
        'expo-alternate-app-icons',
        [
          { name: 'Gold', ios: './src/assets/icons/Gold.png' },
          { name: 'Dark', ios: './src/assets/icons/Dark.png' },
          { name: 'Minimalist', ios: './src/assets/icons/Minimalist.png' },
          { name: 'Mono', ios: './src/assets/icons/Mono.png' },
          {
            name: 'SeasonalSpring',
            ios: './src/assets/icons/SeasonalSpring.png',
          },
          {
            name: 'SeasonalSummer',
            ios: './src/assets/icons/SeasonalSummer.png',
          },
          { name: 'SeasonalFall', ios: './src/assets/icons/SeasonalFall.png' },
          {
            name: 'SeasonalWinter',
            ios: './src/assets/icons/SeasonalWinter.png',
          },
        ],
      ],
      'expo-asset',
      'expo-background-task',

      [
        'expo-notifications',
        {
          enableBackgroundRemoteNotifications: true,
          icon: './src/assets/notification-icon.png',
          color: '#08cc50',
        },
      ],
      'expo-sqlite',
      'expo-font',
      'expo-image',
      [
        'expo-audio',
        {
          enableBackgroundPlayback: false,

          microphonePermission: MICROPHONE_PERMISSION,
        },
      ],

      ['expo-localization', { supportedLocales: { ios: APP_LANGUAGES } }],
      [
        'expo-local-authentication',
        { faceIDPermission: enUS.faceIdPermissionPurpose },
      ],

      [
        'expo-splash-screen',
        {
          image: './src/assets/splash.png',
          resizeMode: 'contain',

          backgroundColor: '#4BD27C',
          android: {
            drawable: { icon: './src/assets/splash-android.xml' },
          },

          ios: {
            enableFullScreenImage_legacy: true,
          },
        },
      ],
      'expo-status-bar',
      'expo-sharing',
      [
        '@hot-updater/expo',
        {
          channel: otaEnvironments[APP_VARIANT].channel,
          publicKeyPath: `./config/ota-keys/${otaEnvironments[APP_VARIANT].channel}.pub`,
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
      [
        'expo-image-picker',
        {
          photosPermission: enUS.photoLibraryPurpose,

          cameraPermission: CAMERA_PERMISSION,

          microphonePermission: MICROPHONE_PERMISSION,
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission: CAMERA_PERMISSION,
          microphonePermission: MICROPHONE_PERMISSION,
          recordAudioAndroid: false,
        },
      ],
    ],
    experiments: {
      reactCompiler: true,
    },
  }

  if (!IS_DEV && process.env.POSTHOG_DISABLE_UPLOAD !== 'true') {
    expoConfig.plugins?.unshift([
      'posthog-react-native/expo',
      {
        dotenvFile: '.env.production',
        uploadNativeSymbols: { includeSource: true },
      },
    ])
  }

  return expoConfig
}
