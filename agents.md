# AGENTS.md

Guide for AI coding agents working in WitnessWork. This is an iOS project only, this app is not made to support Android.

## NEVER REVERT OR DESTROY UNSTAGED WORK DESTRUCTIVELY, UNDER ANY CIRCUMSTANCES

`git checkout <path>`, `git restore <path>`, `git reset --hard`, and `git clean` discard working-tree changes with **no recoverable trace** — not in reflog, not in fsck, not in stash. If files show `M` in `git status` and you need to undo your own modifications, the only safe sequence is:

1. `git stash push -- <paths>` first (captures both your changes and the user's into a recoverable stash)
2. Then make your fix
3. Then `git stash pop` if you need any of it back, or `git stash drop` if not

Before running any destructive git path-level command, **always** check `git status` and `git diff <path>` first. If the working tree is dirty with changes you didn't make this session, treat that file as off-limits to destructive operations — re-edit instead. Reverting paths with foreign unstaged changes is the same as `rm` on that work.

This rule has no exceptions, including "I just made this mess and need to undo it." Your own bad edit is recoverable via Edit; the user's hours of unstaged work are not.

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

### iOS 26 Liquid Glass — use `expo-glass-effect`, never fake it

The app targets iOS 26's Liquid Glass material. `expo-glass-effect` is **already installed** — use `GlassView` from it for any nav/control/modal-layer surface that needs the material.

```tsx
import { GlassView } from 'expo-glass-effect'
;<GlassView glassEffectStyle='regular' style={shape}>
  {children}
</GlassView>
```

- **Auto-fallback**: `GlassView` renders as a plain `View` on iOS < 26 — no manual `isLiquidGlassAvailable()` gating needed for render. For free-floating elements that would visually disappear without the material (tab bar, chips, full-screen loaders), keep a `BlurView` underneath unconditionally as the visible-surface fallback.
- **`GlassContainer`** merges adjacent glass surfaces — use when grouping pills/toolbar items.
- **Do not hand-build glass** with `BlurView` + opacity overlays + custom borders. That replicas the system effect badly and conflicts with the real material when it activates. The legacy `GlassCard.tsx` is a known example slated for deletion.
- **Where glass belongs** (Apple HIG): nav bars, tab bars, sheets/popovers/modals, primary CTAs, search bars, floating overlays. **Where it doesn't**: content cards, list rows, badges, form inputs, static visualizations.
- Full inventory & rollout plan: `docs/liquid-glass-adoption-plan.md`. Reference impl: `src/components/TabBar.tsx`.

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

## Components

Reuse existing components where available instead of creating new ones @src/components/\*\*

- Never create one-off badges

## Agent skills

### Issue tracker

GitHub issues at [`leviFrosty/witness-work`](https://github.com/leviFrosty/witness-work) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
