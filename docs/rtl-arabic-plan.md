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
- `scripts/sync-widget-shared.mjs:110-156` throws on locales missing from `appleLanguages`/`androidQualifiers`.
- `pnpm check:locales` needs a fully translated file (~3,900 strings).
- `localeCompare` without a locale (`src/lib/contactsSort.ts`, `src/lib/contactsFilters.ts`); no Arabic normalization in Fuse search (`faqSearch.ts`, `contactsSearch.ts`).

### Numbers

- `src/lib/minutes.ts` and ~40 `toLocaleString`/`Intl` calls without a locale print Latin digits.
- Parsers that fail on ٠-٩: `src/lib/mileage/units.ts:136`, `MonthlyMaximumCreditHoursSection.tsx:20`, `serviceHistoryDrafts.ts:23-26`, `MilestoneAdjustSheet.tsx:232`, `PublisherPreferencesSection.tsx:92`, `MonthGoalEditorSheet.tsx:64`, `OnboardingBackfillForm.tsx:225-226`, `PublisherTypeSelector.tsx:164`, `ColorKeyPreferencesSection.tsx:111`.
- Native `String(format: "%.1f")`: `targets/widgets/ReportWidget.swift:35,468`, `targets/watch/MonthProgress.swift:160`.
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
- `targets/watch/PaceBar.swift:52` (and its copy in watch-widgets) uses a physical `.offset(x:)`; the Wear OS pace bar in `Components.kt:120-146` draws in physical coordinates.
- Hard-coded English: `ReportWidget.swift:437,622`, `StopwatchLiveActivity.swift:25,70`, widget gallery descriptions.
- 22 Siri shortcut phrases need Arabic.

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
4. **Native**
   - `ar` in `sync-widget-shared.mjs`; `supportedLocales` through the expo-localization plugin (no RTL flags).
   - Mirror the watch and Wear OS pace bars; localize the hard-coded widget and Live Activity strings; locale-aware number formatting in Swift.
5. **Arabic**
   - `src/locales/ar.json` via `translate-locales`, including plurals and Siri phrases.
   - Register in `locales.ts` (`العربية`), App Store (`ar-SA`) and Play listings, Help Center FAQ on languages, readme language count, translate-locales skill counts.
   - Verify on iOS and Android with screenshots: home, report, contacts, plans, map, progress charts, onboarding, widgets and watch.
