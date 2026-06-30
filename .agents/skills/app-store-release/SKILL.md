---
name: app-store-release
description: Submit a WitnessWork build to the App Store via the `asc` CLI — create a version, copy metadata, set "What's New", preflight, and submit. Use when releasing to the App Store / TestFlight, cutting a version, pushing release notes, or running App Store Connect operations (versions, metadata, screenshots, pricing, analytics).
---

# App Store release (`asc`)

The `asc` CLI (from Rork) is installed and authenticated for WitnessWork (default keychain profile). Use it for versions, metadata, screenshots, TestFlight, pricing, analytics/finance, etc. `asc doctor` diagnoses auth; `asc <subcommand> --help` for usage. JSON output by default — pipe to `jq`.

- **App ID** `6469723047`
- **Bundle** `com.leviwilkerson.jwtime`

## Submitting a build that's already uploaded (the normal case)

EAS/Xcode has already pushed the build.

1. **Find the build.** `asc builds list --app 6469723047` — `.attributes.version` is the **CFBundleVersion** (e.g. `148`), NOT the marketing version. The marketing version (`1.38.3`) lives on its `preReleaseVersion`: `asc testflight pre-release list --app 6469723047` and match the id.

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

## Gotchas (learned the hard way)

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

## Reusable "Bug fixes and performance improvements" set (all 13 ASC locales)

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
