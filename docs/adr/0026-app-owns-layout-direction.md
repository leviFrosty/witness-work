---
status: accepted
---

# The app owns layout direction

## Context

Arabic is the first right-to-left Language (see [`docs/rtl-arabic-plan.md`](../rtl-arabic-plan.md)). Users pick a Language in Settings, or Device Default, and the app runs in that Language whatever the phone is set to. Layout direction has to follow the same choice: Arabic should be mirrored, and English on a phone set to Arabic should not.

React Native decides the direction once, when the JS loads. `I18nManager.isRTL` is a constant from that moment, and the native root view (`RCTFabricSurface` on iOS, `ReactSurfaceImpl` on Android) reads the same flags when it starts. `I18nManager.allowRTL` and `forceRTL` only save flags (iOS `NSUserDefaults`, Android `SharedPreferences`) for the next load.

Without help, the device decides. On iOS, `isRTL` follows the app bundle's localization (`[NSParagraphStyle defaultWritingDirectionForLanguage:nil]`), and the bundle has no Arabic localization. On Android, React Native 0.86 checks `Locale.getAvailableLocales()[0]` rather than the device's language.

What we saw on main, with the app on Device Default and the phone set to Arabic:

- **iOS 27 simulator, `AppleLanguages (ar)`:** the app showed **Japanese**, laid out left to right. `handleLangFallback` cut the region-less tag `ar` to `a`, which matched `ja-jp`. A tag with a region (`ar-SA`) fell back to English.
- **Android 16 emulator, `persist.sys.locale ar-SA`:** English, left to right. The system bars were mirrored; the app wasn't.

So neither platform mirrored the app on its own, and the plan's guess that Arabic phones already get a mirrored English UI didn't hold on these builds. It could on other OS versions or after a future React Native fix, which is one more reason to set the flags explicitly.

A new JS load applies the flags, whether it comes from an in-process reload or a process restart. The app reloads through `reloadApp()` in `src/lib/hotUpdater.ts`: `DevSettings.reload()` in dev builds; in release, Hot Updater's `reload()`, which is an in-process React Native reload on iOS and a process restart on Android (`setReloadBehavior('processRestart')`, so Android's launch verifier sees a fresh process). In dev builds on both platforms, `DevSettings.reload()` flipped the whole app between LTR and RTL. The one limit: a reload while the bundle is still evaluating fails on iOS with "AppRegistryBinding::startSurface failed. Global was not installed."

Hot Updater verifies a freshly applied update on its first launch. On Android it waits for React Native's first-content signal and, if the process dies before that, counts the launch as a crash and rolls the update back (`BundleFileStorageService.kt`, `recordFailedLaunch`). Until then the SDK reports the launch as pending (`notifyAppReady`, polled a frame at a time in `appReady.ts`). A launch reload that restarts the process too early would discard a good update.

expo-localization can manage the flags too (`supportsRTL`/`forcesRTL` in its config plugin), but on every launch on iOS it sets them from the device's first language (`LocalizationModule.swift`, `OnCreate`). That would override the Language picker: English on an Arabic phone would mirror, and Arabic picked on an English phone wouldn't.

## Decision

**The app sets the direction from the active Language. expo-localization's RTL flags stay off.**

- `src/lib/rtl.ts` holds the logic. `isRtlLocale(locale)` reads the language subtag (Arabic, Hebrew, Persian, Urdu and other RTL languages) or an RTL script subtag (`-Arab`, `-Hebr`, …). `syncLayoutDirection(locale)` sets both `allowRTL` and `forceRTL` to the Language's direction every time, and returns `{ rtl, needsReload }`, where `needsReload` compares that with `I18nManager.isRTL`. `forceRTL(true)` makes Arabic mirror though iOS reports the app as LTR; `allowRTL(false)` keeps English unmirrored on an RTL phone.
- **At launch**, `src/app/launch/layoutDirection.ts` runs `applyLayoutDirectionAtLaunch` right after `src/lib/locales.ts` has picked the Language. On a mismatch, `App` keeps the launch splash up and reloads from its first effect, after the root view exists. If the reload fails, the app shows as it is.
- **After Hot Updater has read the launch.** The launch reload waits for `launchRead` in `src/lib/hotUpdater.ts`, which settles from `HotUpdater.init`'s `onNotifyAppReady` once the launch is no longer pending verification. On an ordinary launch that's a frame after the splash draws; on an update's first launch it's after native has verified it.
- **No update download on that launch.** While the reload is due, `initializeApp` skips `downloadUpdateOnLaunch()`, so the reload doesn't race a download that stages a new bundle. The reloaded launch downloads as usual.
- **Only in the foreground.** iOS can launch the app in the background (background fetch, a push, a location update), and Expo's `AppDelegate` builds the root view then too, so `App` mounts. A reload then would cut off that work, so the launch reload waits until `AppState` is `active`. The app's flags are already saved, so if the system ends the background launch first, the next cold launch comes up in the right direction with no reload.
- **The splash can't wait forever.** If the reload hasn't run after 5 seconds outside the background (active, inactive, or an `AppState` that never reported), the app gives up and shows as it is, in the direction it launched with. That covers a missed `active` event and a launch read that never ends. Showing the app is the safer fallback: a reload then could restart the process before an update is verified, or interrupt background work, while the saved flags already put the next cold launch in the right direction.
- **No reload loop.** Before reloading, launch saves the direction it reloads for (`layoutDirection.reloadedFor` in MMKV). If the next launch still has the wrong direction, it logs a warning and carries on instead of reloading again. A launch in the right direction clears the guard.
- **Changing Language** in Settings calls `syncLayoutDirection` for the new Language before the reload it already does, so that reload lands in the right direction and launch has nothing to fix.
- **Dev switch.** Tools → Layout Direction → Force Right to Left (dev builds only) saves `layoutDirection.devForceRtl` in MMKV, syncs and reloads. While it's on, `syncLayoutDirection` treats every Language as RTL, so screens can be laid out in English before Arabic strings exist. Release builds ignore the flag.
- `reloadApp()` in `src/lib/hotUpdater.ts` is how the app reloads to apply a setting: `DevSettings.reload()` in dev, Hot Updater's reload in release (in-process on iOS, a process restart on Android). The `forceRTL` and `allowRTL` flags are saved natively, so the next bundle comes up in the new direction either way.
- **Widgets and watch apps follow the app too.** The iOS widgets, the timer Live Activity, the Apple Watch app and its complications, and the Wear OS app render natively, where the system would follow the device's language or the extension bundle's. Their text already arrives translated in the app's Language with the snapshots JS writes; the snapshots now also carry `rtl` (`isRtlLayoutFor` in `src/lib/rtl.ts`, so the dev switch mirrors them too) and `numberLocale` (`src/lib/nativeLocale.ts`: the Language, plus `-u-nu-arab` for Arabic's Arabic-Indic digits (`digitSystemFor` in `src/lib/digits.ts`), which Apple's plain `ar` doesn't use). `AppLanguage` (`targets/watch/AppLanguage.swift`, copied into both widget extensions, and `AppLanguage.kt` on Wear OS) sets the layout direction and, for a Language whose digits aren't Latin, the locale SwiftUI formats numbers with, and writes the numbers native code formats itself. Languages with Latin digits keep writing `12.5` as JS does. A snapshot from an older app has neither field, and the system's choice stands. Text the system shows before any snapshot (widget gallery names and descriptions, complication and tile picker names) comes from catalogs generated from `src/locales`, in the device's language.
- **Declared languages.** `app.config.ts` lists one language per `src/locales` file (`scripts/native-languages.json` names each for Apple and Android). iOS gets them as `CFBundleLocalizations` through expo-localization's `supportedLocales`, still without its RTL flags. Android gets `locales_config.xml` from `plugins/with-android-locale-config.js`.
- **System per-app language.** With languages declared, iOS (Settings → WitnessWork → Language) and Android 13+ (Settings → App languages) let people pick one for the app. Under Device Default the app follows it, since `getLocales()` puts it first; iOS relaunches the app, and Android applies it the next time the app starts, because the activity handles locale changes itself. A Language picked in the app wins for the app's text, layout, widgets and watch. The system's pick still decides what iOS and Android draw: alerts' buttons, share sheets, pickers, permission prompts and the widget gallery.

## Considered options

- **expo-localization `supportsRTL`/`forcesRTL`.** Rejected: on iOS they follow the device's language on every launch, not the app's.
- **Always restart the native process.** Not needed for direction: a JS reload rebuilds the root view and re-reads the flags. Android restarts the process anyway because Hot Updater's reload behavior does, for its own launch verification.
- **Reload as soon as the app mounts.** Rejected: on Android that restart can come before Hot Updater has verified a freshly applied update, which then rolls back as a crash.
- **Reload while the bundle loads.** Rejected: it crashes the surface on iOS. Reloading after the first mount, behind the splash, costs one extra bundle load on the rare launch that needs it.
- **Run the launch check inside `src/lib/locales.ts`.** Rejected: `locales.ts` is imported by much of the test suite under Node, where `react-native` and the update module can't load. The launch module sits in the app tier and runs at the same point.
- **A launch reload with no guard.** Rejected: if a platform ever ignored the flags, every launch would reload forever.
- **Native surfaces read the device's or bundle's language.** Rejected: English chosen in the app on an Arabic phone would get mirrored widgets and a mirrored watch, and Arabic on an English phone wouldn't.
- **expo-localization's `supportedLocales` for Android.** Rejected: it also sets `resourceConfigurations`, which strips every other locale's resources from the APK, libraries' included. Libraries' Chinese is `zh-rCN` and `zh-rTW`, which `b+zh+Hans` doesn't keep, so Chinese users would lose Android and Google UI translations they have today.

## Consequences

- Existing users don't see a change: every shipped Language is LTR and none of them mirrored before. A launch whose saved flags disagree with its Language reloads once, behind the splash. That happens after the dev switch, when the Language changed without the picker (iCloud sync of the preference, or a new device language under Device Default), or on a React Native that honors an RTL device.
- Native UI outside React Native (system sheets and alerts) still follows the phone's language, or the system's per-app language; the app's own layout follows the app's Language.
- Declaring the languages lets iOS show its own controls inside the app (alert buttons, context menus, pickers) in the phone's language when we have a translation for it, where before the app's English-only bundle kept them in English. Once `ar` is declared, an Arabic phone gives the bundle an RTL direction, which `allowRTL(false)` keeps out of React Native's layout when English is picked in the app. Text and fields left unaligned still follow the bundle on iOS, though, so `MyText` and the search fields align to the reading start explicitly (`alignText`, `alignInput`).
- iOS permission prompts stay in English: their text comes from `Info.plist`, and localized `InfoPlist.strings` are a follow-up.
- Wear OS complications and the tile are laid out by the watch face and the tile renderer in the watch's own direction; their numbers still use the app's digits.
- Later RTL steps lay screens out with the dev switch, and step 5 ships Arabic with no direction code beyond adding `ar` as a translated Language.
- On the launch that reloads, the update download moves to the reloaded launch, and the splash stays up one frame longer (more on an update's first launch) while Hot Updater reads the launch.
- If the wait gives up, that session runs in the old direction and skips its update download; the next cold launch fixes both.
- Release-build reloads through Hot Updater weren't exercised; dev builds proved the reload path on both platforms.
