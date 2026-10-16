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

## Considered options

- **expo-localization `supportsRTL`/`forcesRTL`.** Rejected: on iOS they follow the device's language on every launch, not the app's.
- **Always restart the native process.** Not needed for direction: a JS reload rebuilds the root view and re-reads the flags. Android restarts the process anyway because Hot Updater's reload behavior does, for its own launch verification.
- **Reload as soon as the app mounts.** Rejected: on Android that restart can come before Hot Updater has verified a freshly applied update, which then rolls back as a crash.
- **Reload while the bundle loads.** Rejected: it crashes the surface on iOS. Reloading after the first mount, behind the splash, costs one extra bundle load on the rare launch that needs it.
- **Run the launch check inside `src/lib/locales.ts`.** Rejected: `locales.ts` is imported by much of the test suite under Node, where `react-native` and the update module can't load. The launch module sits in the app tier and runs at the same point.
- **A launch reload with no guard.** Rejected: if a platform ever ignored the flags, every launch would reload forever.

## Consequences

- Existing users don't see a change: every shipped Language is LTR and none of them mirrored before. A launch whose saved flags disagree with its Language reloads once, behind the splash. That happens after the dev switch, when the Language changed without the picker (iCloud sync of the preference, or a new device language under Device Default), or on a React Native that honors an RTL device.
- Native UI outside React Native (system sheets and alerts) still follows the phone's language; the app's own layout follows the app's Language.
- Later RTL steps lay screens out with the dev switch, and step 5 ships Arabic with no direction code beyond adding `ar` as a translated Language.
- On the launch that reloads, the update download moves to the reloaded launch, and the splash stays up one frame longer (more on an update's first launch) while Hot Updater reads the launch.
- If the wait gives up, that session runs in the old direction and skips its update download; the next cold launch fixes both.
- Release-build reloads through Hot Updater weren't exercised; dev builds proved the reload path on both platforms.
