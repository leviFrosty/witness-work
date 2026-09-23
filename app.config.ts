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
        backgroundColor: '#4BD27C',
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
          // We only ever play audio, never record. The plugin otherwise adds
          // a generic NSMicrophoneUsageDescription that App Review flags as an
          // unused permission. `false` deletes the key from Info.plist.
          microphonePermission: false,
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
          backgroundColor: '#4BD27C',
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
          photosPermission:
            '$(PRODUCT_NAME) uses your photos only to set a profile picture. Images stay on your device.',
          // Camera is used to take profile/contact avatar photos. Give it a
          // specific purpose string instead of the plugin's generic default
          // (better for App Review than "Allow … to access your camera").
          cameraPermission:
            '$(PRODUCT_NAME) uses your camera to take a profile or contact photo.',
          // We only pick still images, never video, so the microphone usage
          // string the plugin adds by default is unused — App Review flags
          // unused permissions (2.5.4 / 5.1.1). `false` deletes the key.
          microphonePermission: false,
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
