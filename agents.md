# AGENTS.md

Guide for AI coding agents working in WitnessWork.

## Project Overview

**WitnessWork** — mobile app for Jehovah's Witnesses to manage field service activities. iOS + Android via Expo. Some US restrictions (legacy trademark).

## Tech Stack

- **Framework**: React Native 0.76.9 + Expo SDK 52
- **Language**: TypeScript (~5.3.3)
- **UI**: Tamagui, FontAwesome, `@shopify/flash-list`
- **Navigation**: React Navigation v6 (native-stack + bottom-tabs + drawer)
- **State**: Zustand w/ persistence
- **Storage**: MMKV (migrated from AsyncStorage)
- **Maps**: `react-native-maps` + Google Maps
- **i18n**: `i18n-js` + Crowdin (16+ languages)
- **Testing**: Vitest + `@testing-library/react-native`
- **Payments**: `react-native-purchases` (RevenueCat)
- **Errors**: Sentry
- **Build**: EAS
- **Compiler**: React Compiler enabled (beta)

## Key Commands

```bash
# Dev
pnpm install
pnpm run dev               # expo start --ios (APP_VARIANT=development)
pnpm run ios               # expo run:ios (diff build + run, most common)
pnpm run android           # expo run:android
nvm use                    # match node version

# Build (local EAS)
pnpm run build:ios
pnpm run build:ios-production
pnpm run build:android
pnpm run prebuild          # expo prebuild --clean

# Quality (MUST run after large changes)
pnpm run testFinal && pnpm run lint
pnpm run typecheck         # tsc
pnpm run format            # prettier
pnpm run deps              # madge circular deps check

# Translation
pnpm run translate         # bun run src/scripts/translate.ts

# Install built artifact
eas build:run -p ios --path [path].tar.gz
eas build:run -p android --path [path].apk
```

## Core App Flow

```
App.tsx → RootStack → HomeTabStack → DrawerNavigator → HomeScreen
```

1. **`App.tsx`** — providers + init
2. **`src/stacks/RootStack.tsx`** — main nav, handles onboarding conditional
3. **`src/stacks/HomeTabStack.tsx`** — bottom tabs: Home, Tools, Month, Year, Map
4. **`src/screens/DrawerNavigator.tsx`** — sidebar, settings entry
5. **`src/screens/HomeScreen.tsx`** — dashboard + widgets

## Directory Structure

### `/src/components/` (60+ files)

- **Layout**: `layout/Header.tsx`, `layout/Wrapper.tsx`, `layout/XView.tsx`
- **Inputs**: `inputs/CheckboxWithLabel.tsx`, `inputs/TextInputRow.tsx`, `inputs/InputRowSelect.tsx`, etc.
- **Onboarding**: `onboarding/steps/` (One–Four, DefaultNav)
- **Swipeables**: `swipeableActions/` (Archive, Delete, Edit)
- **Tutorial** (newer): `tutorial/Spotlight.tsx`, `tutorial/TutorialOverlay.tsx`, `tutorial/TutorialPromptSheet.tsx`, `tutorial/TutorialTarget.tsx`
- **Business**: Contact rows, service reports, calendar, maps, exports

### `/src/screens/` (20+)

- **Core**: `HomeScreen`, `MapScreen`, `ContactDetailsScreen`, `HelpScreen`
- **Forms**: `ContactFormScreen`, `ConversationFormScreen`, `AddTimeScreen`, `PlanDayScreen`, `PlanScheduleScreen`
- **Time**: `MonthScreen/`, `YearScreen`, `TimeReportsDashboard`
- **Settings**: `settings/SettingsScreen`, `settings/preferences/`, `settings/sections/` (App, Contact, Language, Misc, Help, Preferences, Support)
- **Utility**: `ToolsScreen`, `ImportAndExportScreen`, `PaywallScreen`, `DismissedContactsScreen`, `RecoverContactsScreen`, `WhatsNewScreen`, `UpdateScreen`

### `/src/stores/` — Zustand

- **`contactsStore.ts`** — contacts CRUD + soft delete
- **`conversationStore.ts`** — follow-ups + notes
- **`serviceReport.ts`** — time tracking, day plans, recurring plans
- **`preferences.ts`** — user settings + app config
- **`tutorial.ts`** — tutorial progress state
- **`timeCache.ts`** — cached time computations
- **`mmkv.ts`** — MMKV adapter + migration from AsyncStorage

### `/src/lib/` — business logic + utils

- **Domain**: `contacts.ts`, `conversations.ts`, `serviceReport.ts`, `address.ts`, `contactImport.ts`, `dismissedContacts.ts`
- **Utils**: `minutes.ts` ⚠️ (see conventions), `phone.ts`, `locales.ts`, `objects.ts`, `links.ts`
- **Platform**: `notifications.ts`, `haptics.ts`, `logger.ts`, `storeReview.ts`, `updates.ts`

### `/src/hooks/`

`useAnimation`, `useCustomer`, `useDevice`, `useLocale`, `useLocation`, `useMarkerColors`, `usePublisher`, `useStopWatch`, `notifications.ts`

### `/src/providers/` + `/src/contexts/`

- **`ThemeProvider`** — dark/light mode
- **`CustomerProvider`** — RevenueCat IAP
- **`AnimationViewProvider`** — Lottie state
- **`TutorialProvider`** (newer) — tutorial orchestration

### `/src/types/`

- **Models**: `contact.ts`, `conversation.ts`, `serviceReport.ts`, `tutorial.ts`
- **Nav**: `rootStack.ts`, `homeStack.ts`

### `/src/constants/`

- APIs, themes, publisher settings, release notes
- **`tutorials/`** (newer): `core.contacts.ts`, `core.conversations.ts`, `core.planning.ts`, `core.reports.ts`, `core.time.ts`, `index.ts`

### `/src/locales/`

16+ languages via Crowdin. `en-US.json` is source of truth. Auto-translated via `pnpm run translate`.

### `/src/assets/`

`audio/` (UI chimes), `lottie/` (checkMark, confetti, doggie, error, floatingHearts, loading)

### `/src/__tests__/`

Vitest + RNTL. `__tests__/__data__/` holds fixtures.

### `/src/scripts/`

`translate.ts` (Google Cloud translation), `bump-version.js`

## Key Data Models

### Contact (`src/types/contact.ts`)

- Core: name, phone, email, address
- Geo: coords + user override
- Extensible: `customFields`
- Lifecycle: soft delete + recovery

### Service Report (`src/types/serviceReport.ts`)

- Time tracking + stopwatch
- Year/month hierarchy
- Day plans + recurring schedules
- Legacy data migration system

### Conversation (`src/types/conversation.ts`)

- Linked to contacts
- Scheduled follow-up notifications
- Topic + notes

## Core Features

1. Contact management (CRUD + geo mapping)
2. Time tracking (stopwatch + reports)
3. Territory mapping (Google Maps)
4. Schedule planning (day + recurring)
5. i18n (16+ languages)
6. Data export (time sheets, reports)
7. Backup + migration reminders
8. Onboarding flow
9. Tutorial system (interactive overlays)

## State Architecture

- Zustand stores w/ persistence
- MMKV-backed (migrated from AsyncStorage)
- Atomic updates, optimistic UI
- Background state for stopwatch

## Navigation Hierarchy

```
RootStack (onboarding conditional)
├── HomeTabStack
│   ├── Home (DrawerNavigator → HomeScreen)
│   ├── Tools
│   ├── Month
│   ├── Year
│   └── Map
└── Modal screens (forms, preferences, paywall, help, etc.)
```

## Conventions

### ⚠️ Rendering time

**Always** use `src/lib/minutes.ts` to render time. Don't manually parse hours/minutes. Use existing helpers.

### After large changes

**Always** run:

```bash
pnpm run testFinal && pnpm run lint
```

### Typecheck separately if needed

```bash
pnpm run typecheck
```

### Translations

Source of truth = `src/locales/en-US.json`. Add new keys there first. Run `pnpm run translate` to propagate.

### Styling

Tamagui + RN StyleSheet. Theme via `ThemeProvider`. Prefer theme tokens over hardcoded colors.

### State

Prefer Zustand stores over prop drilling or Context for global state. Context reserved for providers (Theme, Customer, Animation, Tutorial).

### React Compiler

Enabled (beta). Avoid manual `useMemo`/`useCallback` unless benchmarked need. ESLint rule `react-compiler` active.

### Imports

TypeScript path aliases per `tsconfig.json`. Check existing files for convention before adding new imports.

### Testing

Vitest (not Jest despite `jest` config remnant). Tests live in `src/__tests__/`. Match pattern `*.test.ts(x)`.

## Git

- Main dev branch: `development`
- Husky pre-commit hooks active — don't skip with `--no-verify` unless explicitly told
- Version bumps via `pnpm run version:bump`

## Quirks / Gotchas

- iOS + Android simulators — use `pnpm run ios` for diff build + run (fastest)
- `clean` script nukes `ios/`, `android/`, `.expo/`, `.tamagui/`, `.cache/`, `node_modules/` — destructive
- App version bumps land in their own commits (see recent: `chore: bump version to X`)
- Some features US-restricted due to trademark — check constants before assuming availability
- React Compiler beta — watch for compiler-related lint warnings
