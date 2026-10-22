# RTL support, starting with Arabic

Goal: ship Arabic as WitnessWork's first right-to-left language on iOS and Android, with the layout, numbers, dates and native surfaces behaving the way Arabic speakers expect.

## Decisions

| Question                       | Decision                                                                                       | Why                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Digits                         | Arabic-Indic (٠١٢٣٤٥٦٧٨٩) everywhere Arabic text appears                                       | jw.org/ar and wol.jw.org/ar use them throughout: dates, years, scripture citations (`مت ١٦:٢٣`)                                                                    |
| Month names                    | JW style: `تشرين الأول (أكتوبر)` for full names; the Levantine name alone where space is tight | jw.org/ar writes every month this way, e.g. `١٢-١٨ تشرين الأول (أكتوبر)`. moment's `ar` locale uses the Egyptian names only                                        |
| Direction of progress and time | Mirror: progress bars, sliders, month swipes, carousels and chart x-axes run right to left     | Apple HIG and Material bidirectionality guidance. Clocks, play icons, trend arrows (↗), checkmarks and Latin text such as phone numbers and emails stay unflipped |
| Translation                    | Agentic translation with `translate-locales`; users report problems                            | No separate review step                                                                                                                                            |
| Locale code                    | `ar` (file `src/locales/ar.json`, moment `ar`, Apple `ar`, Android `values-ar`)                | JW publishes one Arabic for every country. Date and number conventions already follow the Format Region (ADR 0006). App Store Connect lists it as `ar-SA`          |

## Gaps found

### Direction control

- No `I18nManager` usage. React Native allows RTL by default (`RCTI18nUtil.m:48-54`), and Expo's Android manifest declares `supportsRtl`. A phone set to Arabic may already show a mirrored layout with English strings. Reproduce this first. (Reproduced in [ADR 0026](./adr/0026-app-owns-layout-direction.md): neither platform mirrored, and iOS showed Japanese.)
- Don't use expo-localization's `supportsRTL`: on iOS it re-derives direction from the device language on every launch (`LocalizationModule.swift:24-30`), which would override the in-app language picker.
- Changing language already reloads the app (`reloadApp()` in `LanguageSelector.tsx`). Confirm that the reload applies a new `forceRTL` on both platforms: `DevSettings.reload()` in dev; in release, Hot Updater's reload, in-process on iOS and a process restart on Android. (It does; see ADR 0026, which also covers waiting for Hot Updater to verify an update before the launch reload.)
- React Navigation 7 reads `I18nManager.isRTL` (`NavigationContainer.tsx:72`) and react-native-screens flips the push animation and back-swipe edge (`RNSScreenStack.mm:824-830`). The custom back chevrons don't flip.

### Plurals

- No plural rules are registered with i18n-js, so every locale uses English `one`/`other`. Russian and Ukrainian are already wrong on all 58 plural keys.
- Arabic needs `zero/one/two/few/many/other`. `.agents/skills/translate-locales/locales.mjs:18-20,143-152` rejects `two/few/many`.

### Locale plumbing

- `handleLangFallback` (`src/lib/locales.ts:112`): a tag without a region, like `ar`, slices to `a` and matches `ja-jp`.
- `src/lib/momentLocales.ts` has no `ar` entry; `src/lib/dates.ts:30-62` has no Arabic Format Region.
- `scripts/sync-widget-shared.mjs:110-156` throws on locales missing from `appleLanguages`/`androidQualifiers`. (Now `scripts/native-languages.json`, which has `ar`.)
- `pnpm check:locales` needs a fully translated file (~3,900 strings).
- `localeCompare` without a locale (`src/lib/contactsSort.ts`, `src/lib/contactsFilters.ts`); no Arabic normalization in Fuse search (`faqSearch.ts`, `contactsSearch.ts`).

### Numbers

- `src/lib/minutes.ts` and ~40 `toLocaleString`/`Intl` calls without a locale print Latin digits.
- Parsers that fail on ٠-٩: `src/lib/mileage/units.ts:136`, `MonthlyMaximumCreditHoursSection.tsx:20`, `serviceHistoryDrafts.ts:23-26`, `MilestoneAdjustSheet.tsx:232`, `PublisherPreferencesSection.tsx:92`, `MonthGoalEditorSheet.tsx:64`, `OnboardingBackfillForm.tsx:225-226`, `PublisherTypeSelector.tsx:164`, `ColorKeyPreferencesSection.tsx:111`.
- Native `String(format: "%.1f")`: `targets/widgets/ReportWidget.swift:35,468`, `targets/watch/MonthProgress.swift:160`. (Step 4: `AppLanguage` writes them in the app Language's digits.)
- Mixed-direction runs such as `١٢-١٨` and times need bidi marks (jw.org inserts U+200F).

### Layout

React Native swaps `left/right`, margins, paddings and `row` under RTL. These don't flip:

- Gestures: `PlanRow`, `ContactRow`, `VisitTimelineCard`, `TripRow` (Swipeable), `SwipeMonthNavigator`, `PlanDaySlider`, `SortableChipRow`, `SidebarResizeHandle`, `MapScreen.tsx:1070-1077`.
- Carousels: `RevealTour`, `ScheduleIntroOverlay`, `ApproachingConversations` (`scrollTo({x})`, `contentOffset.x`), `MonthlyRoutine` (`initialScrollIndex`).
- Charts: `ServiceYearPaceChart`, `MileagePeriodChart` draw with Skia, while `ChartXLabels` labels are mirrored views.
- About 114 directional icon references; back chevrons at `Header.tsx:89` and `OnboardingNav.tsx:126`; `FormRowChevron` exists but most rows import `ChevronRightIcon` directly.
- About 64 explicit `textAlign: 'left'|'right'`; `TextInput` defaults to `'right'`.
- `letterSpacing` breaks Arabic letter joining (`SectionTitle.tsx`, `ProgressYearTab.tsx`, `PaywallBenefits.tsx`, `ScheduleInsights.tsx` and others).
- Corner badges move to the opposite corner (`RootHeader`, `HeaderPillButton`, `TabBar`, `BadgeButton`, `CalendarDay`).

### Sentences glued together

About 40 template literals join translated fragments (`${goalHours} ${hours_lowercase}`, `${actual} ${of} ${goal}`). Worst offenders: `DayHistoryHeader.tsx:101`, `GoalProgressStats.tsx:118,135`, `MonthReport.tsx:494-537`, `ToolsScreen.tsx:845`, `monthReportData.ts:132-155`.

### Native

- No `CFBundleLocalizations` for any language.
- `targets/watch/PaceBar.swift:52` (and its copy in watch-widgets) uses `.offset(x:)`; the Wear OS pace bar in `Components.kt:120-146` draws in physical coordinates. (SwiftUI mirrors `offset(x:)` under RTL, so only the Wear OS bar was wrong.)
- Widgets, the Live Activity and both watch apps render natively and would follow the device's language, not the app's, for direction and digits.
- Hard-coded English: `ReportWidget.swift:437,622`, `StopwatchLiveActivity.swift:25,70`, widget gallery descriptions.
- 22 Siri shortcut phrases need Arabic.
- iOS permission prompts come from `Info.plist` in English; localized `InfoPlist.strings` are a follow-up.

## Execution

Each step is one PR on `main`. Steps 1-4 change nothing visible for existing languages; step 5 ships Arabic.

1. **Foundations**
   - `src/lib/rtl.ts`: `isRtlLocale()` and `syncLayoutDirection(locale)`, which calls `allowRTL`/`forceRTL` and reports whether a reload is needed.
   - Call it at launch (`src/app/launch/layoutDirection.ts`: one guarded reload on mismatch, once the app is in the foreground) and in `LanguageSelector` before the reload.
   - Fix `handleLangFallback` to match on `split('-')[0]`.
   - Register make-plural rules (pinned) for every locale; make the `translate-locales` lint check each locale's own categories. Re-translate Russian and Ukrainian `few`/`many`. A plural key a Language hasn't translated yet falls back to English's forms and picks among them by English's rule.
   - Dev "Force RTL" switch in Tools for laying out screens before translations exist.
   - ADR: the app owns layout direction; expo-localization's RTL flags stay off ([ADR 0026](./adr/0026-app-owns-layout-direction.md)).
2. **Layout sweep** (exercised with the dev switch)
   - Shared pieces first: `DirectionalIcon` (mirrors via `scaleX: -1` under RTL), header and onboarding back chevrons, `FormRowChevron` everywhere, `TextInput` alignment.
   - Then the gesture, carousel and chart files listed above, one at a time.
   - Drop `letterSpacing` for Arabic; decide each corner badge.
   - Lint rule against `textAlign: 'left'|'right'` and unwrapped directional icons.
3. **Numbers, dates and copy**
   - `localizeDigits()`/`toAsciiDigits()` in `src/lib`; every parser normalizes input; `minutes.ts` and number formatting pass the app language.
   - moment `ar` with JW month names; Arabic Format Region (Saturday week start, from moment `ar`).
   - Rewrite glued sentences as single interpolated strings.
   - Arabic search normalization; `localeCompare` with the app language.
   - As built:
     - `src/lib/digits.ts` holds the pure digit and parsing helpers. `src/lib/numbers.ts` formats in the app Language: Arabic-Indic digits with `٫`/`٬` for Arabic, swapped in by hand rather than through Hermes' `numberingSystem`. Latin-digit separators follow the Format Region; at Auto they follow the app Language with the device's region (`en-DE`). `applyFormatRegion` sets both. Numbers passed to `i18n.t` placeholders and bare numbers rendered by `MyText` are localized automatically; strings are never touched, so names and phone numbers keep their digits.
     - The Format Region list gains `ar` (moment's generic Arabic: Saturday-first, `D/M/YYYY`, 24-hour). At Auto, Arabic follows the device like every other Language. An Arabic numeric date keeps right-to-left marks after its separators under any Region's order; a left-to-right Language drops them.
     - JW month names are written into moment's `ar` itself (not `updateLocale`, which `applyFormatRegion` resets).
     - **Keys stay ASCII; digits are localized on display.** `moment.format` writes ASCII digits in every Language: `src/lib/momentLocales.ts` drops the `postformat` of every moment locale it loads (moment's `ar` would turn `YYYY-MM-DD` into `٢٠٢٦-١٠-١٤` and corrupt store keys, notification ids, buddy payloads and widget dates), keeping `preparse` so parsing accepts both digit sets. Display goes through `src/lib/dates.ts`: the intent helpers (`formatDate`, `formatTime`, `formatRelative`, …), `formatDisplay(m, pattern)` for other patterns such as `MMMM YYYY`, and `localizeDisplayDate(text)` for a string already built with `format`. A missed display site shows Latin digits in Arabic; it can't break data. `src/__tests__/arabicDateKeys.test.ts` checks every loadable moment locale and the main keys.
     - The glued sentences, and the remaining `1 day`/`N days` and `_plural` key pairs, are single plural keys, translated into every shipped Language.
4. **Native**
   - `ar` in `scripts/native-languages.json`, which the sync script and `app.config.ts` read; `supportedLocales` through the expo-localization plugin for iOS (no RTL flags), and `plugins/with-android-locale-config.js` for Android ([ADR 0026](./adr/0026-app-owns-layout-direction.md) has why).
   - Widget and watch snapshots carry the app's direction and number locale (`src/lib/nativeLocale.ts`); `AppLanguage` in Swift and Kotlin applies them. Mirror the Wear OS pace bar and the Directions arrow; localize the hard-coded widget and Live Activity strings; write native numbers in the app Language's digits.
5. **Arabic**
   - `src/locales/ar.json` via `translate-locales`, including plurals and Siri phrases.
   - Register in `locales.ts` (`العربية`), App Store (`ar-SA`) and Play listings, Help Center FAQ on languages, readme language count, translate-locales skill counts.
   - Verify on iOS and Android with screenshots: home, report, contacts, plans, map, progress charts, onboarding, widgets and watch.
   - As built:
     - `ar` is the only region-less key in `translationLoaders`. `handleLangFallback` matches every Arabic tag (`ar-SA`, `ar-EG`) to it and doesn't count that as a fallback, so the Language row shows no "fallen back" note on Arabic phones.
     - Arabic writes 1 and 2 with the singular and dual noun in prose («ساعة واحدة», «قبل يومين»), without the numeral. The `translate-locales` lint allows Arabic `one` and `two` to leave the count's placeholder out. Compact labels where the digit matters (`hoursShort`, counters, progress like `{{done}} من {{count}}`) keep the number, with the singular after it.
     - The printed-style Service Report view downloads Aref Ruqaa, a Ruqʿah handwriting face (about 0.1 MB), for Arabic, the way it already does for Chinese, Japanese and Korean.
     - The Help Center's languages answer lists all 19 languages and the system per-app language settings. A new `arabic` entry covers right-to-left layout, digits, month names and typing either digit set.
     - Declaring `ar` gives iOS an Arabic app bundle on an Arabic phone, and iOS aligns unaligned text and fields by the bundle's language: English picked in the app sat on the right, and Arabic picked on an English phone left its search fields on the left. `MyText` now hugs the reading start on iOS in both directions, and the raw search fields set `alignInput('start')`.
     - An Android text field with no letters took the layout's right-to-left direction, so a typed "415 555 0134" showed as "0134 555 415". `plugins/with-android-text-input-direction.js` gives every field its first letter's direction, else left to right (`firstStrongLtr`). iOS already reads a field with no letters left to right.
     - ww-api's shared-contact page has Arabic, rendered with `dir="rtl"` (ww-api PR #40).
