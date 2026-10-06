import enUS from './src/locales/en-US.json'
import { execSync } from 'child_process'
import { ExpoConfig, ConfigContext } from 'expo/config'
/**
 * Passed in from `env` property in profile `./eas.json` to eas build.
 *
 * - `development`: dev client for the simulator (Metro, dev App Attest).
 * - `beta`: internal TestFlight app built from any branch by `/beta-build`. Its
 *   own bundle id keeps WIP builds away from real service records.
 * - `production`: the App Store app.
 */
type AppVariant = 'development' | 'beta' | 'production'
const APP_VARIANT: AppVariant =
  process.env.APP_VARIANT === 'development' ||
  process.env.APP_VARIANT === 'beta'
    ? process.env.APP_VARIANT
    : 'production'
const IS_DEV = APP_VARIANT === 'development'
const IS_BETA = APP_VARIANT === 'beta'

// App Group and iCloud container ids derive from the bundle id; the widget's
// SnapshotLoader relies on `group.<host bundle id>`.
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
// expo-camera, expo-image-picker, and expo-audio each write these keys (or
// delete them when passed `false`), so every plugin gets the same string and
// plugin order doesn't matter.
const CAMERA_PERMISSION = enUS.cameraPermissionPurpose
// Scribe AI voice logs (ADR 0018). Audio is transcribed on-device only.
const MICROPHONE_PERMISSION = enUS.microphonePermissionPurpose

export default ({ config }: ConfigContext): ExpoConfig => {
  const expoConfig: ExpoConfig = {
    ...config,
    name: APP_NAME,
    developmentClient: {},
    slug: 'jw-time',
    version: '1.43.0',
    owner: 'levi_frosty',
    scheme: 'witnesswork',
    orientation: 'portrait',
    icon: IS_BETA ? './src/assets/icon-beta.png' : './src/assets/icon.png',
    userInterfaceStyle: 'automatic',
    assetBundlePatterns: ['**/*'],
    android: {
      // Avatar selection uses Android's system photo picker. Saving a photo
      // does not need broad access to the user's media library.
      blockedPermissions: [
        // Voice logs are iOS-only for now; keep the microphone off on Android
        // even though expo-audio and expo-image-picker would request it.
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      ],
      package: IS_DEV
        ? 'com.leviwilkerson.jwtimedev'
        : 'com.leviwilkerson.jwtime',
      adaptiveIcon: {
        foregroundImage: './src/assets/adaptive-icon.png',
        monochromeImage: './src/assets/adaptive-icon-monochrome.png',
        // Match the standard icon's light surface so the green mark has contrast.
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
        // Only requested before iOS 26, where on-device voice-log transcription
        // runs through SFSpeechRecognizer (ADR 0018).
        NSSpeechRecognitionUsageDescription:
          enUS.speechRecognitionPermissionPurpose,
        LSSupportsOpeningDocumentsInPlace: true,
        // expo-background-fetch requires this permitted task identifier
        // to register the snapshot refresh task.
        BGTaskSchedulerPermittedIdentifiers: [
          'com.leviwilkerson.jwtime.widget.refresh',
        ],
        // Register the .witnesswork contact-export file type so iMessage,
        // Files, etc. open WitnessWork when the user taps the attachment.
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
      // Universal Links for shared contact URLs
      // (https://ww-proxy.leviwilkerson.com/c#<payload>, plus the legacy
      // /c/<payload> form). The ww-proxy worker serves
      // the AASA file that lists both dev and prod bundle IDs, so a single
      // associated domain works across both build variants.
      associatedDomains: ['applinks:ww-proxy.leviwilkerson.com'],
      entitlements: {
        'com.apple.security.application-groups': [`group.${BUNDLE_ID}`],
        // App Attest (Notes Import request auth — ADR 0007). The environment
        // must track the build variant: dev builds attest against Apple's
        // development environment, store builds against production. A mismatch
        // makes every attestation fail. TestFlight (beta) always attests
        // against production.
        'com.apple.developer.devicecheck.appattest-environment': IS_DEV
          ? 'development'
          : 'production',
        // iCloud entitlements are populated at prebuild time by
        // `plugins/with-icloud-container.js` so the container identifier
        // stays in lockstep with the plugin's Info.plist edits.
      },
      appStoreUrl: 'https://apps.apple.com/us/app/jw-time/id6469723047',
    },
    extra: {
      appVariant: APP_VARIANT,
      commitHash: execSync('git rev-parse --short HEAD').toString().trim(),
      posthogProjectToken: process.env.POSTHOG_PROJECT_TOKEN,
      posthogHost: process.env.POSTHOG_HOST,
      eas: {
        projectId: 'a67257dc-2fb8-4942-97f2-e9364b80d318',
      },
    },
    updates: {
      url: 'https://u.expo.dev/a67257dc-2fb8-4942-97f2-e9364b80d318',
      // Beta OTA updates should land on the next cold launch instead of the
      // one after, so wait briefly for a newer update before using the cache.
      ...(IS_BETA && { fallbackToCacheTimeout: 10000 }),
    },
    // MUST stay top-level. `@expo/config-plugins` reads this key to write
    // EXUpdatesRuntimeVersion into Expo.plist at prebuild; the expo-updates
    // plugin accepts no props, so moving it into the plugin entry silently
    // drops the key and expo-updates disables itself at launch (no OTA,
    // "checkForUpdatesAsync() is not supported" in Settings > Updates).
    // That regression shipped in every 1.38.2 store build (Apr–May 2026).
    //
    // Beta builds keep the same marketing version across native changes, so
    // they use the native fingerprint instead; an OTA update only reaches beta
    // builds with identical native code. See `fingerprint.config.js`.
    runtimeVersion: { policy: IS_BETA ? 'fingerprint' : 'appVersion' },
    plugins: [
      // Xcode 27 requires the scene lifecycle; SDK 57 opts in explicitly.
      ['expo-build-properties', { ios: { enableSceneSupport: true } }],
      './plugins/with-android-build-memory',
      './plugins/with-android-menu-icons',
      './plugins/with-force-load-local-modules',
      [
        './plugins/with-icloud-container',
        {
          containerIdentifier: `iCloud.${BUNDLE_ID}`,
          containerDisplayName: 'WitnessWork',
        },
      ],
      '@bacons/apple-targets',
      './plugins/with-posthog-symbols-last',
      '@react-native-community/datetimepicker',
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
      'expo-sqlite',
      'expo-font',
      'expo-image',
      [
        'expo-audio',
        {
          // The only audio we play is a short foreground "success" chime on
          // the confetti celebration (see AnimationViewProvider) — never in
          // the background. The plugin defaults `enableBackgroundPlayback` to
          // true, which adds the `audio` UIBackgroundMode to Info.plist. App
          // Review rejects that under guideline 2.5.4 without a persistent
          // background-audio feature, so keep it off. The chime respects the
          // ring/silent switch (default ambient session category — see #365).
          enableBackgroundPlayback: false,
          // The microphone is used only by Scribe AI voice logs, in the
          // foreground, through the SpeechTranscription module.
          microphonePermission: MICROPHONE_PERMISSION,
        },
      ],
      'expo-localization',
      // SDK 57 removed the top-level `splash` config key; the splash screen
      // is now configured exclusively through this plugin.
      [
        'expo-splash-screen',
        {
          image: './src/assets/splash.png',
          resizeMode: 'contain',
          // Keep in sync with SPLASH_BACKGROUND_COLOR (src/constants/brandMark.ts),
          // which the in-app splash replica and onboarding welcome draw.
          backgroundColor: '#4BD27C',
          android: {
            // A 160dp mark on Android's 288dp canvas, inside its 192dp safe circle.
            drawable: { icon: './src/assets/splash-android.xml' },
          },
          // The checked-in asset is a full-device splash composition. Without
          // this, SDK 57 constrains it to the plugin default 100px image width.
          ios: {
            enableFullScreenImage_legacy: true,
          },
        },
      ],
      'expo-status-bar',
      'expo-sharing',
      // No props: the plugin ignores them (see runtimeVersion note above).
      'expo-updates',
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
          // Camera is used to take profile/contact avatar photos. Give it a
          // specific purpose string instead of the plugin's generic default
          // (better for App Review than "Allow … to access your camera").
          // Shares NSCameraUsageDescription with expo-camera below; keep the
          // two strings identical so plugin order doesn't matter.
          cameraPermission: CAMERA_PERMISSION,
          // We only pick still images, never video; the microphone string is
          // for voice logs. Android's RECORD_AUDIO stays blocked above.
          microphonePermission: MICROPHONE_PERMISSION,
        },
      ],
      [
        'expo-camera',
        {
          // Scans Buddies invite QR codes. Photos only; never records video.
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

  // Dev clients use Metro; simulator builds can explicitly skip uploads.
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
