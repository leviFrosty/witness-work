import enUS from './src/locales/en-US.json'
import otaEnvironments from './config/ota-environments.json'
import nativeLanguages from './scripts/native-languages.json'
import { execSync } from 'child_process'
import { readdirSync } from 'fs'
import path from 'path'
import { ExpoConfig, ConfigContext } from 'expo/config'
import appLinks from './src/constants/appLinks.json'
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
// Inlined into JS for both native and OTA builds. Expo Constants continues to
// describe the native binary after an update, so it cannot identify OTA code.
process.env.EXPO_PUBLIC_COMMIT_HASH = execSync('git rev-parse --short HEAD')
  .toString()
  .trim()
// Picks the API and website hosts (`src/constants/buildVariant.ts`).
process.env.EXPO_PUBLIC_APP_VARIANT = APP_VARIANT
// scripts/perf profiles a Release build of the development app: no OTA update
// may replace the bundle under test, and Android must reach the local API over
// plain HTTP. Without the probe the resolved config is unchanged.
const PERF_PROBE = IS_DEV && process.env.EXPO_PUBLIC_PERF_PROBE === '1'
// `scripts/web.mjs` builds the web app, which has no OTA updates (ADR 0037).
const WEB_BUILD = process.env.WW_WEB_BUILD === '1'

// App Group and iCloud container ids derive from the bundle id; the widget's
// SnapshotLoader relies on `group.<host bundle id>`.
const BUNDLE_ID = {
  development: 'com.leviwilkerson.jwtimedev',
  beta: 'com.leviwilkerson.jwtimebeta',
  production: 'com.leviwilkerson.jwtime',
}[APP_VARIANT]

/**
 * App links (ADR 0042, docs/app-links.md), from the file
 * `src/constants/appLinks.json` that the app's parsers read too. Every build
 * claims the old host: its short paths, the older contact form with the payload
 * in the path, and the full-word paths ww-api serves there too. The apex claims
 * only the full words; only development builds claim the dev apex, in developer
 * mode, which fetches its AASA directly instead of through Apple's CDN.
 */
const APP_LINK_FULL_PATHS = Object.values(appLinks.paths)
const APP_LINK_LEGACY_HOST_DATA = [
  { path: appLinks.legacyPaths.contact },
  { pathPrefix: appLinks.legacyContactPathPrefix },
  { path: appLinks.legacyPaths.buddyInvite },
  { path: appLinks.legacyPaths.handoff },
  ...APP_LINK_FULL_PATHS.map((path) => ({ path })),
]
const APP_LINK_APEX_HOSTS = IS_DEV
  ? [appLinks.host, appLinks.devHost]
  : [appLinks.host]
const APP_LINK_DOMAINS = [
  `applinks:${appLinks.legacyHost}`,
  ...APP_LINK_APEX_HOSTS.map((host) =>
    host === appLinks.devHost
      ? `applinks:${host}?mode=developer`
      : `applinks:${host}`
  ),
]
/**
 * One `autoVerify` filter per host. Paths match exactly (`path`, not
 * `pathPrefix`) so the website's other pages stay in the browser. Fragments
 * (contact payloads, invite and handoff secrets) aren't matched; Android hands
 * them to the app with the rest of the link.
 */
const APP_LINK_INTENT_FILTERS = [
  { host: appLinks.legacyHost, data: APP_LINK_LEGACY_HOST_DATA },
  ...APP_LINK_APEX_HOSTS.map((host) => ({
    host,
    data: APP_LINK_FULL_PATHS.map((path) => ({ path })),
  })),
].map(({ host, data }) => ({
  action: 'VIEW',
  autoVerify: true,
  category: ['BROWSABLE', 'DEFAULT'],
  data: data.map((match) => ({ scheme: 'https', host, ...match })),
}))

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

/**
 * Every language the app has a translation for (a `src/locales` file), as Apple
 * and Android name it, English first. Declared so iOS (Settings > the app >
 * Language) and Android 13+ (Settings > App languages) offer them, and so iOS
 * shows its own controls and alerts in the app in that language. The app's
 * Language stays the one picked in the app, or Device Default; see ADR 0026 for
 * how they fit together.
 */
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
  if (
    !IS_DEV &&
    !WEB_BUILD &&
    !process.env.EXPO_PUBLIC_HOT_UPDATER_API_KEY?.trim()
  )
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
    // Only in web builds, so the config iOS and Android hash for their native
    // fingerprints stays the same.
    ...(WEB_BUILD && {
      web: {
        bundler: 'metro',
        output: 'single',
        favicon: './src/assets/icon.png',
        name: APP_NAME,
        shortName: 'WitnessWork',
        themeColor: '#4BD27C',
      },
    }),
    android: {
      // Avatar selection uses Android's system photo picker. Saving a photo
      // does not need broad access to the user's media library.
      blockedPermissions: [
        // RECORD_AUDIO stays allowed: voice logs record through Android's
        // on-device recognizer (modules/speech-transcription), which asks for
        // the microphone when the user first starts one.
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      ],
      package: IS_DEV
        ? 'com.leviwilkerson.jwtimedev'
        : 'com.leviwilkerson.jwtime',
      // Firebase Cloud Messaging for Buddies pushes (Firebase project
      // `turing-striker-403102`). Lists both the production and dev packages;
      // nothing in it is secret, as every APK carries it.
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        foregroundImage: './src/assets/adaptive-icon.png',
        monochromeImage: './src/assets/adaptive-icon-monochrome.png',
        // Match the standard icon's light surface so the green mark has contrast.
        backgroundColor: '#F8F9FA',
      },
      // App Links (docs/app-links.md). On Android 11 and lower the app is the
      // default handler only if every autoVerify host verifies, so a new
      // host's assetlinks.json must be live before a build claiming it ships.
      intentFilters: [
        ...APP_LINK_INTENT_FILTERS,
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
        // With limited photo access, the app's own picker shows only the
        // photos the User shared and offers Manage, so iOS doesn't need to ask
        // about selecting more on the first library read of each launch.
        PHPhotoLibraryPreventAutomaticLimitedAccessAlert: true,
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
      // Universal Links (docs/app-links.md): contact shares, Buddies invites
      // and Set Up Another Device. ww-api serves each host's AASA file, which
      // lists every bundle id, so each associated domain works across build
      // variants.
      // Passkeys (ADR 0038): the RP ID's host serves `public/.well-known`. Dev
      // builds use the dev RP ID, and `mode=developer` fetches it straight
      // from the host instead of Apple's CDN.
      associatedDomains: [
        ...APP_LINK_DOMAINS,
        IS_DEV
          ? 'webcredentials:app-dev.witnesswork.app?mode=developer'
          : 'webcredentials:app.witnesswork.app',
      ],
      entitlements: {
        'com.apple.security.application-groups': [`group.${BUNDLE_ID}`],
        // App Attest (account sessions — ADR 0007, ADR 0027). The environment
        // must track the build variant: dev builds attest against Apple's
        // development environment, store builds against production. A mismatch
        // makes every attestation fail. TestFlight (beta) always attests
        // against production.
        'com.apple.developer.devicecheck.appattest-environment': IS_DEV
          ? 'development'
          : 'production',
        // The second group is shared with the Notification Service Extension
        // (`targets/notification-service`), which reads the keys that name
        // Buddies alerts there. The app's own group stays first, so it remains
        // where new Keychain items (the Buddies root seed among them) go.
        'keychain-access-groups': [
          `$(AppIdentifierPrefix)${BUNDLE_ID}`,
          `$(AppIdentifierPrefix)${BUNDLE_ID}.buddies-alerts`,
        ],
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
      // The Wear OS app (targets/wear-os) as the `:wear` Gradle module.
      './plugins/with-wear-os',
      ['./plugins/with-android-locale-config', { locales: APP_LANGUAGES }],
      './plugins/with-android-text-input-direction',
      './plugins/with-passkey-domains',
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
      // Buddies pushes carry `content-available`, so iOS wakes the app to pull
      // what they announced before it's opened (buddiesBackgroundSync.ts).
      // Android gets data-only FCM messages, which wake the same task.
      // Android draws a notification's small icon from its alpha alone, so it
      // gets a white-on-transparent brand mark (the launcher icon it falls
      // back to shows as a blank white disc), tinted with the theme's accent
      // (`lightModeColors.accent`). The plugin also makes both Firebase's
      // defaults for FCM messages it displays itself.
      // Otherwise the defaults Expo already applies for this package.
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
      // The app owns layout direction (ADR 0026): no `supportsRTL` or
      // `forcesRTL`. Android's list comes from with-android-locale-config.
      ['expo-localization', { supportedLocales: { ios: APP_LANGUAGES } }],
      [
        'expo-local-authentication',
        { faceIDPermission: enUS.faceIdPermissionPurpose },
      ],
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
          // Camera is used to take profile/contact avatar photos. Give it a
          // specific purpose string instead of the plugin's generic default
          // (better for App Review than "Allow … to access your camera").
          // Shares NSCameraUsageDescription with expo-camera below; keep the
          // two strings identical so plugin order doesn't matter.
          cameraPermission: CAMERA_PERMISSION,
          // We only pick still images, never video; the microphone string is
          // for voice logs. On Android, modules/speech-transcription declares
          // RECORD_AUDIO for them.
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
