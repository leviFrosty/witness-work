# AGENTS.md

WitnessWork = iOS-only field-service tracker for Jehovah's Witnesses. Expo + RN. Domain glossary in `CONTEXT.md` — read before discussing Publisher, Service Report, Plan, Assistant, Supporter, Tenure, etc.

## ww-proxy / backend API

ww-proxy is the backend api providing functionality to this app. Find the code at ~/dev/witness-work.
It's a project deployed to Cloudflare workers. Read the documentation within that repository for up to date information before making assumptions. There are two environments: dev and production.

## NEVER destroy unstaged work

`git checkout <path>`, `git restore <path>`, `git reset --hard`, `git clean` discard working-tree changes with **no recoverable trace**. Before any destructive path-level git op: `git status` + `git diff <path>` first. If working tree dirty with changes not made this session, file off-limits — re-edit instead. To undo own mods: `git stash push -- <paths>` → fix → `stash pop` or `stash drop`. No exceptions.

## JW sensitivities

No "magic" word or magic-wand iconography in i18n/copy.

## Comitting & Merging

Do not merge commit. Use rebase. Amend commits where reasonable instead of adding fix: commits.

## Key commands

```bash
pnpm run ios               # diff build + run (fastest dev loop)
pnpm run testFinal && pnpm run lint && pnpm run typecheck   # after large changes
pnpm run lint              # after ANY import / file-tree change (see below)
pnpm run translate         # bun run src/scripts/translate.ts
```

`clean` script nukes `ios/ .expo/ .tamagui/ .cache/ node_modules/` — destructive.

## Conventions

- **Render time** → `src/lib/minutes.ts` helpers only. No manual hours/minutes parse.
  - User-facing time displays MUST go through `useFormattedMinutes(minutes)` (hook) or `formatMinutes(minutes, format)` (pure) — never hand-roll `_.round(minutes / 60, 1)`, never hardcode an `h`/`hrs` suffix in JSX or string templates, never pass a raw hour count into `i18n.t('…', { count })` for display. Reads must respect the user's `timeDisplayFormat` preference (`'decimal'` → `1.5h`, `'short'` → `1h 30m`).
  - i18n templates that wrap a time value should accept a pre-formatted `{{value}}` (no inline `hrs`/`h`) and the caller supplies `formatMinutes(...).formatted`. Goal counts that the user explicitly entered in hours can stay as `${goalHours} ${i18n.t('hours')}`; only measured/computed time needs the formatter.
  - Tight UI (calendar squares, contribution-graph tooltips, widgets) uses `formatMinutesCompact` / `useCompactFormattedMinutes` / `formatHoursCompact` instead — those are the only sanctioned bypass.
- **Translations** → source of truth `src/locales/en-US.json`. Other locales human-approved only.
- **Imports** → `@/*` alias (= `src/*`). Prefer `@/features/...` over relative.
- **React Compiler enabled (beta)** → no manual `useMemo`/`useCallback` unless benchmarked. `react-compiler` ESLint rule active.
- **Styling** → Tamagui + RN StyleSheet, theme via `ThemeProvider`, prefer tokens over hardcoded colors.
- **Components** → reuse from `@/components/**`. No one-off badges.

### iOS 26 Liquid Glass — use `expo-glass-effect`, never fake it

```tsx
import { GlassView } from 'expo-glass-effect'
;<GlassView glassEffectStyle='regular' style={shape}>
  {children}
</GlassView>
```

Auto-falls-back to plain `View` on iOS < 26. For elements visually disappearing without material (tab bar, chips, full-screen loaders), keep `BlurView` underneath as unconditional fallback. `GlassContainer` merges adjacent surfaces. **No hand-built glass** (BlurView + opacity + borders) — conflicts with real material. Belongs on: nav, tabs, sheets, primary CTAs, search, floating overlays. Does NOT belong on: content cards, list rows, badges, inputs, static viz. Plan + inventory: `docs/liquid-glass-adoption-plan.md`. Reference: `src/components/TabBar.tsx`.

### Import / file-tree changes — run `pnpm run lint`

`eslint-plugin-boundaries` enforces tier rules. **TypeScript won't catch boundary violations — only ESLint will.** Run lint after: adding/moving file, changing any `import` line, renaming folder under `src/features/`, `src/app/`, `src/components/`.

## Project structure

Three tiers, lint-enforced:

- **`src/app/`** — entry, navigation, widgets, iCloud sync, deep links. Imports from any tier.
- **`src/features/<domain>/`** — domain folders (`contacts`, `service-reports`, `map`, `plans`, etc.). Holds whatever subset of `screens/ components/ hooks/ lib/ stores/ types/ constants/` needed. Imports from shared + self only.
- **Shared** — `src/components/` (`ui/` primitives + root composed), `src/lib/`, `src/hooks/`, `src/stores/`, `src/types/`, `src/constants/`, `src/providers/`, `src/contexts/`, `src/assets/`, `src/locales/`, `src/shaders/`, `src/vendor/`. Imports from shared only.

Page-level orchestrators (`home`, `settings`, `progress`, `plans`, `updates`, `onboarding`) classified as `app` so they compose across domains. `home` = pure orchestrator (no own components/hooks/lib).

Details: `docs/project-structure.md`, `docs/architecture-features.md`.

## Publisher (core domain)

Publisher role drives entry mode, goals, credit cap, milestone ladder, tenure display, which sections render. See `CONTEXT.md` for role semantics. This section = code-level rules.

### Defaults table

| Role               | Monthly (h) | Entry    | Annual goal | Credit cap | Tracks start | Milestone ladder        |
| ------------------ | ----------- | -------- | ----------- | ---------- | ------------ | ----------------------- |
| `publisher`        | 0           | checkbox | no          | 55h        | no           | —                       |
| `regularAuxiliary` | 30          | hours    | no          | 55h        | yes          | —                       |
| `regularPioneer`   | 50          | hours    | yes         | 55h        | yes          | 30, 50, 100, 200, 350   |
| `circuitOverseer`  | 50          | hours    | yes         | unlimited  | yes          | 100, 200, 300, 400, 500 |
| `specialPioneer`   | 100         | hours    | no          | unlimited  | yes          | —                       |
| `custom`           | user (50)   | hours    | yes         | 55h        | no           | —                       |

Sources: `src/constants/publisher.ts`, `src/stores/preferences.ts`, `src/lib/publisherCapabilities.ts`, `src/lib/milestones.ts`.

### Single seam: `derivePublisherCapabilities`

`src/lib/publisherCapabilities.ts` = **only** place role behavior encoded. React code reads via `usePublisher()` hook; pure callers use `derivePublisherCapabilities` or helpers (`getEntryMode`, `isInFullTimeService`, `getTenureType`, `tracksTenure`, `effectiveHasAnnualGoal`, `creditCapMinutesFor`).

### Rules

1. **Never branch on publisher string.** `if (publisher === 'specialPioneer')` wrong — add/use capability flag (`entryMode`, `hasAnnualGoal`, `isInFullTimeService`, `tenureType`, `tracksTenure`, `showsTimer`, `showsYearTabs`, `creditCapMinutes`, `hasUnlimitedCreditDefault`).
2. **Capabilities fold in user overrides** (`userSpecifiedHasAnnualGoal`, `overrideCreditLimit`, `milestoneOverrides`). Read resolved value; don't re-derive.
3. **Gate UI on capabilities, not role.** E.g. timer on `showsTimer`, year tab on `showsYearTabs`, tenure row on `tracksTenure`, entry mode on `entryMode`.
4. **`publisher` role = checkbox mode** — anything assuming hours breaks. Check `entryMode` / `hasAnnualGoal` / `showsTimer` first.
5. **Credit cap** → `creditCapMinutesFor()`. Never inline 55h (`monthCreditMaxMinutes`).
6. **Milestone final rung** (annual goal) appended at read time by `getEffectiveMilestones`, never stored.
7. **`tenureStartDate` field** stores the **Tenure Start Date** for any role where `tracksTenure === true` (= `tenureType !== null`). Reset semantics live in `setRole` — flipping to a different Tenure Type (including any move to/from a no-Tenure-Type role like Regular Publisher or Custom) clears the field. Labels via `getStartDateLabels`.
8. **Adding a role** = touch tuple in `src/constants/publisher.ts`, defaults in `src/stores/preferences.ts`, `baseCreditCapMinutes` + `roleDefaultHasAnnualGoal` + `getTenureType` switch in `src/lib/publisherCapabilities.ts`, `DEFAULT_MILESTONES_BY_PUBLISHER` in `src/lib/milestones.ts`, selector in `src/components/PublisherTypeSelector.tsx`, `getStartDateLabels` if tenure, i18n in `en-US.json`. TS exhaustiveness catches most.

## Git

- Main dev branch: `development`
- Branch names: `[feature-name]` — no `[agent]/` or `[feature]/` prefix
- Husky pre-commit hooks active — never `--no-verify` unless told
- Version bumps via `pnpm run version:bump`, land in own commits

## Pull request descriptions

Size to diff. Goal = fast review, not effort demo. One-line PR with one-line body = a feature.

- **Title** — Conventional Commits prefix (`feat:`/`fix:`/`chore:`/`refactor:`/`docs:`), imperative, no period, ~70 char max.
- **Trivial diff** (rename, typo, dep bump) → title alone fine.
- **Small non-obvious** → lead with **Why** + rejected alternatives.
- **Large / multi-file** → 1–3 highest-impact files first with `path:line` refs, then bullets.

**Required sections:**

- **Why** — unless title self-evident.
- **Risks** — for migrations, MMKV/persisted-Zustand shape changes, shared infra, publisher capability changes, widget snapshot changes, any user-visible behavior.
- **Tests required** — only HITL items (manual QA, sandbox, App Store steps, flag flips, translation review). Never list CI-verified things (typecheck/lint/tests).

**Anti-patterns:** paraphrasing diff line-by-line, green-checkmark CI lists, empty placeholder sections, "this PR..." in every bullet.

## Agent skills

- **Issues** → `gh` CLI on `leviFrosty/witness-work`. See `docs/agents/issue-tracker.md`.
- **Triage labels** → `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.
- **Domain docs** → `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
- **App Store Connect** → `asc` CLI (from Rork) is installed and authenticated for WitnessWork (default keychain profile). Use it for versions, metadata, screenshots, TestFlight, pricing, analytics/finance, etc. `asc doctor` diagnoses auth; `asc <subcommand> --help` for usage. JSON output by default — pipe to `jq`.

### App Store version submission (`asc`)

App ID `6469723047`, bundle `com.leviwilkerson.jwtime`. **Submitting a build that's already uploaded** (the normal case — EAS/Xcode already pushed it):

1. **Find the build.** `asc builds list --app 6469723047` — `.attributes.version` is the **CFBundleVersion** (e.g. `148`), NOT the marketing version. Marketing version (`1.38.3`) lives on its `preReleaseVersion`: `asc testflight pre-release list --app 6469723047` and match the id.
2. **Stage everything in one shot** (creates version + copies text metadata + attaches build + readiness check, stops before submit). `--copy-metadata-from` takes the previous **version STRING** (`1.38.3`), NOT its version ID — passing an ID fails `apply_metadata` with `source version "<id>" not found`:
   ```
   asc release stage --app 6469723047 --version 1.38.3 --build <BUILD_ID> \
     --copy-metadata-from <PREV_VERSION_STRING> --exclude-fields whatsNew --platform IOS --confirm
   ```
   **Plain "bug fixes" release** where the previous version already has the desired "What's New": drop `--exclude-fields whatsNew` so the existing translations copy over, and skip step 3 entirely.
3. **Set "What's New" per locale** (version localizations, `--version` = the **version ID**):
   `asc localizations update --version <VERSION_ID> --locale en-US --whats-new "…"`
4. **Preflight then submit:** `asc review doctor --app 6469723047` (look for `nextAction: No submission blockers`), optionally `asc review submit … --dry-run`, then:
   ```
   asc review submit --app 6469723047 --version 1.38.3 --build <BUILD_ID> --platform IOS --confirm
   ```

**Gotchas (learned the hard way):**

- **ASC release-note locales ≠ app i18n codes.** The 13 ASC locales: `en-US fr-FR de-DE nl-NL it pt-BR es-MX ru vi ja ko zh-Hans zh-Hant`. Do NOT use the app's `it-IT/ko-KR/ja-JP/ru-RU/vi-VN/zh-CN/zh-TW/es-ES`. `asc localizations supported-locales --version <ID>` if unsure.
- **`releaseNotes.ts` / `src/locales/*` are the in-app "What's New" — unrelated** to ASC store release notes. Don't confuse them.
- **Screenshots auto-carry** from the previous version; **text metadata does not** (hence `--copy-metadata-from`; copyable fields: `description,keywords,marketingUrl,promotionalText,supportUrl,whatsNew`).
- **A failed `release stage` step leaves a stale checkpoint** under `.asc/release/checkpoints/stage_<app>_<version>_<build>_<platform>.json`. Re-running with corrected args then errors `checkpoint does not match current run arguments`. The version itself is already created (the `ensure_version` step ran) — just `rm` the checkpoint file and re-run `stage`; it reuses the existing version and resumes.
- **No `-o` shorthand** — invalid flags make `asc` silently dump `--help` instead of erroring. Use `--output`.
- **`asc versions view --version-id <ID>`** returns a FLATTENED object (`id/versionString/state/buildId/buildVersion`), not JSON:API `.data.attributes`. For `releaseType`/`appStoreState` use `asc versions list`.
- **Release type** defaults to `AFTER_APPROVAL` (auto-release after approval) — matches all prior releases.
- **Export compliance** is auto-satisfied when the build sets `usesNonExemptEncryption=false` (it does) — no manual prompt.
- **Always-present benign warnings** (non-blocking, ignore): `subscriptions.images.recommended` (~31, optional promo image per subscription price point) and `privacy.publish_state.unverified` (API can't read App Privacy state; it's published).
- **`asc review doctor` may time out** fetching IAPs — retry with `ASC_TIMEOUT=120s`.

Reusable generic "Bug fixes and performance improvements" set (all 13 ASC locales):

```
en-US  Bug fixes and performance improvements.
fr-FR  Corrections de bugs et améliorations des performances.
de-DE  Fehlerbehebungen und Leistungsverbesserungen.
nl-NL  Bugfixes en prestatieverbeteringen.
it     Correzioni di bug e miglioramenti delle prestazioni.
pt-BR  Correções de bugs e melhorias de desempenho.
es-MX  Corrección de errores y mejoras de rendimiento.
ru     Исправление ошибок и улучшение производительности.
vi     Sửa lỗi và cải thiện hiệu suất.
ja     バグ修正とパフォーマンスの改善。
ko     버그 수정 및 성능 개선.
zh-Hans 错误修复和性能改进。
zh-Hant 錯誤修復與效能改進。
```
