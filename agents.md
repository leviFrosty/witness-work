# AGENTS.md

Guide for AI coding agents working in WitnessWork. iOS only application.

## Project Overview

**WitnessWork** — mobile app for Jehovah's Witnesses to manage field service activities, via Expo.

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
nvm use                    # match node version

# Build (local EAS)
pnpm run build
pnpm run build-production
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
```

## Conventions

### ⚠️ Rendering time

**Always** use `src/lib/minutes.ts` to render time. Don't manually parse hours/minutes. Use existing helpers.

### After large changes

**Always** run:

```bash
pnpm run testFinal && pnpm run lint && pnpm run typecheck
```

### Translations

Source of truth = `src/locales/en-US.json`. Add new keys there first. Run `pnpm run translate` to propagate.

### Styling

Tamagui + RN StyleSheet. Theme via `ThemeProvider`. Prefer theme tokens over hardcoded colors.

### React Compiler

Enabled (beta). Avoid manual `useMemo`/`useCallback` unless benchmarked need. ESLint rule `react-compiler` active.

### Imports

TypeScript path aliases per `tsconfig.json`. Check existing files for convention before adding new imports.

## Git

- Main dev branch: `development`
- Husky pre-commit hooks active — don't skip with `--no-verify` unless explicitly told
- Version bumps via `pnpm run version:bump`

## Quirks / Gotchas

- iOS — use `pnpm run ios` for diff build + run (fastest)
- `clean` script nukes `ios/`, `.expo/`, `.tamagui/`, `.cache/`, `node_modules/` — destructive
- App version bumps land in their own commits (see recent: `chore: bump version to X`)
- Some features US-restricted due to trademark — check constants before assuming availability
- React Compiler beta — watch for compiler-related lint warnings
