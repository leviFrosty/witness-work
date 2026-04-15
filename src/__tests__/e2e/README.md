# E2E Tests (Maestro)

## Layout

```
e2e/
├── config.yml           # shared appId config
├── subflows/            # reusable building blocks (runFlow targets)
└── flows/               # actual test flows, grouped by feature
    ├── 01-smoke/        # core launch + nav tests (must pass)
    ├── 02-contacts/
    ├── 03-conversations/
    ├── 04-time-reports/
    ├── 05-planning/
    ├── 06-map/
    ├── 07-import-export/
    ├── 08-deep-links/
    └── 09-settings/
```

## Running locally

Tests require a **standalone production-simulator build** to be installed — a
`pnpm dev` / expo-dev-client build will not work (Maestro launches the app cold
without a Metro connection, so the dev client shell has nothing to load).

```bash
# First time / after native changes: full build + install + launch (~5 min)
pnpm e2e:install

# After JS-only changes: swap bundle in installed .app (~30s)
pnpm e2e:reload

# Run all flows against the installed app
pnpm e2e

# Run a single flow or subdirectory
maestro test -e APP_ID=com.leviwilkerson.jwtime src/__tests__/e2e/flows/01-smoke/
maestro test -e APP_ID=com.leviwilkerson.jwtime src/__tests__/e2e/flows/01-smoke/app_loads.yml

# Check syntax without running
pnpm e2e:check
```

Rule of thumb: run `pnpm e2e:reload` between flow iterations; only run
`pnpm e2e:install` when you've added a package, changed native config, or
the simulator has no build installed.

## Writing new flows

1. Start with `runFlow: ../../subflows/launch-fresh.yml` for a clean onboarded state.
2. Use text-based selectors first; add `testID` / `accessibilityLabel` to the component when text is ambiguous.
3. Prefer `deepLink` over multi-tap navigation when the target supports it (see `witnesswork://` routes in `src/lib/linking.ts`).
4. Label every step (`label: '...'`) so failures are readable.
5. Keep flows independent — each flow should launch fresh, not rely on prior flow state.

## Subflows

- `launch-fresh.yml` — cold launch + complete onboarding (default starting point)
- `complete-onboarding.yml` — just the onboarding steps (use when combining with custom launch options)
