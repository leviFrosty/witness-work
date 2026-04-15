# Testing

## Unit Tests

Uses [Vitest](https://vitest.dev/) with `@testing-library/react-native`.

Tests live in `src/__tests__/` following the pattern `*.test.ts(x)`.

```bash
# Run in watch mode
pnpm test

# Run once (CI)
pnpm testFinal
```

### Writing a unit test

```ts
import { describe, it, expect } from 'vitest'

describe('MyModule', () => {
  it('does the thing', () => {
    expect(myFunction()).toBe(true)
  })
})
```

Place test files in `src/__tests__/<name>.test.ts`.

## E2E Tests

Uses [Maestro](https://maestro.mobile.dev/) for iOS simulator tests.

Tests live in `src/__tests__/e2e/`:

```
e2e/
├── config.yaml       # Maestro test-suite config (discovery pattern)
├── subflows/         # reusable building blocks (runFlow targets)
└── flows/            # actual test flows, grouped by feature
    ├── 01-smoke/
    ├── 02-contacts/
    └── ...
```

### Important: build requirement

Maestro tests must run against a **standalone production-simulator build**.
A `pnpm dev` / expo-dev-client install will NOT work — when Maestro launches
the app cold, there is no Metro server for the dev client to connect to, so
the app hangs on the dev launcher screen.

The `production-simulator` eas profile produces a bundled `.app` with JS
embedded, which is what Maestro needs.

### Running locally

```bash
# 1. First time (or after native changes): full build + install + launch
pnpm e2e:install

# 2. After JS-only changes: fast reload (~30s, keeps installed .app)
pnpm e2e:reload

# Run all e2e flows
pnpm e2e

# Run only smoke tests
maestro test -e APP_ID=com.leviwilkerson.jwtime src/__tests__/e2e/flows/01-smoke/

# Check syntax of all flows (no simulator needed)
pnpm e2e:check
```

#### `pnpm e2e:install` (scripts/e2e-build-install.sh)

Full production-simulator build. Use on first setup, and whenever native code
changes (new native packages, app.config.ts Info.plist edits, entitlements):

1. `eas build --profile production-simulator --platform ios --local`
2. Extracts the resulting `.tar.gz`
3. Installs the `.app` on the currently booted simulator
4. Launches it

~5 min on a warm cache.

#### `pnpm e2e:reinstall` (scripts/e2e-reinstall.sh)

Reinstalls the cached `.app` from `.e2e/WitnessWork.app` on the booted
simulator. No build. Use when Maestro's `clearState` was interrupted mid-run
and left the simulator without the app.

#### `pnpm e2e:reload` (scripts/e2e-reload.sh)

Fast JS-only swap. Compiles and bundles all Javascript. Use during flow-writing iteration after testID additions,
component tweaks, or any pure JS/TS edit:

1. `expo export:embed` bundles JS in release mode to a temp dir
2. Locates the installed `.app` on the booted simulator via `simctl get_app_container`
3. Overwrites `main.jsbundle` + copies fresh assets into the `.app`
4. Terminates + relaunches the app

~30s. Does **not** pick up native changes — if you added a package or edited
native config, re-run `pnpm e2e:install`. This never touches production users
and never pushes an EAS Update; the bundle swap is local-only.

A simulator must already be booted (open Simulator.app first).

### Running via CI (EAS Workflows)

EAS Workflows handles everything — build, install, test — on each PR:

```bash
# Manual trigger
npx eas-cli workflow:run .eas/workflows/e2e-test-ios.yml
```

The workflow runs three jobs in sequence:

1. `check_syntax` — validates all flow YAML
2. `build_e2e` — builds the production-simulator profile
3. `e2e_test` — runs Maestro flows against the fresh build

If any job fails, downstream jobs are skipped.

### Writing flows

1. Start with `- runFlow: ../../subflows/launch-fresh.yml` to get a clean onboarded state.
2. Prefer `id:` selectors (matches `testID`) over text selectors. Add `testID` to the component when one doesn't exist — see existing additions in `TabBar`, `Header`, `ContactActionsSheet`, etc.
3. Use `deepLink` to jump past navigation when the app supports it (see `witnesswork://` routes in `src/lib/linking.ts`).
4. Give every step a `label:` so failures read clearly in reports.
5. Keep flows independent — each flow should launch fresh, not rely on prior flow state.

Example:

```yaml
appId: ${APP_ID}
---
- runFlow: ../../subflows/launch-fresh.yml
- tapOn:
    id: 'tab-quick-action'
    label: 'Open quick actions'
- assertVisible:
    text: 'Add Contact'
    label: 'Quick action sheet opens'
```

### Subflows

Extract repeated setup into `subflows/` and reference via `runFlow:`. Existing subflows:

- `launch-fresh.yml` — cold launch + complete onboarding (default starting point for almost every flow)
- `complete-onboarding.yml` — just the onboarding steps
- `seed-contact.yml` — creates a "Test Contact" and logs an initial conversation (lands on Contact Details)
