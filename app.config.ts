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
    version: '1.40.0',
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
      // (https://ww-proxy.leviwilkerson.com/c/*). The ww-proxy worker serves
      // the AASA file that lists both dev and prod bundle IDs, so a single
      // associated domain works across both build variants.
      associatedDomains: ['applinks:ww-proxy.leviwilkerson.com'],
      entitlements: {
        'com.apple.security.application-groups': [
          IS_DEV
            ? 'group.com.leviwilkerson.jwtimedev'
            : 'group.com.leviwilkerson.jwtime',
        ],
        // iCloud entitlements are populated at prebuild time by
        // `plugins/with-icloud-container.js` so the container identifier
        // stays in lockstep with the plugin's Info.plist edits.
      },
      appStoreUrl: 'https://apps.apple.com/us/app/jw-time/id6469723047',
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
    // MUST stay top-level. `@expo/config-plugins` reads this key to write
    // EXUpdatesRuntimeVersion into Expo.plist at prebuild; the expo-updates
    // plugin accepts no props, so moving it into the plugin entry silently
    // drops the key and expo-updates disables itself at launch (no OTA,
    // "checkForUpdatesAsync() is not supported" in Settings > Updates).
    // That regression shipped in every 1.38.2 store build (Apr–May 2026).
    runtimeVersion: { policy: 'appVersion' },
    plugins: [
      './plugins/with-force-load-local-modules',
      [
        './plugins/with-icloud-container',
        {
          containerIdentifier: IS_DEV
            ? 'iCloud.com.leviwilkerson.jwtimedev'
            : 'iCloud.com.leviwilkerson.jwtime',
          containerDisplayName: 'WitnessWork',
        },
      ],
      '@bacons/apple-targets',
      '@react-native-community/datetimepicker',
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

  return withSentry(expoConfig, {
    organization: 'levi-wilkerson',
    project: 'jw-time',
  })
}
