---
name: app-store-release
description: Submit a WitnessWork build to the App Store via the `asc` CLI — create a version, copy metadata, set "What's New", preflight, and submit. Use when releasing to the App Store / TestFlight, cutting a version, pushing release notes, or running App Store Connect operations (versions, metadata, screenshots, pricing, analytics).
---

# App Store release (`asc`)

The `asc` CLI (from Rork) is installed and authenticated for WitnessWork (default keychain profile). Use it for versions, metadata, screenshots, TestFlight, pricing, analytics/finance, etc. `asc doctor` diagnoses auth; `asc <subcommand> --help` for usage. JSON output by default — pipe to `jq`.

- **App ID** `6469723047`
- **Bundle** `com.leviwilkerson.jwtime`

**Production go-ahead.** Anything that reaches production users needs the user to type `SHIP-PROD-X.Y.Z` for that version first, as described in `../cut-release/SKILL.md#go-ahead-keyword`. That includes submitting for review (`asc review submit`, `asc review submissions-submit`, `asc publish … --submit`), releasing a version that's waiting for developer release, and uploading a production build. Read-only commands, staging, metadata and TestFlight don't need it.

When called by `/cut-release`, use this skill to stage metadata and run ASC
preflight, then return to that workflow for submission. Its Android build/upload
and Play preflight must also pass before either store submission; do not execute
step 4's submit early. The full release shares the exact localized ASC
`whatsNew` text with Google Play, using the locale mapping and 500-character
limit in `docs/build.md`. Standalone ASC operations keep the flow below.

## Submitting a build that's already uploaded (the normal case)

EAS/Xcode has already pushed the build.

1. **Find the build.** `asc builds list --app 6469723047` — `.attributes.version` is the **CFBundleVersion** (e.g. `148`), NOT the marketing version. The marketing version (`1.38.3`) lives on its `preReleaseVersion`: `asc testflight pre-release list --app 6469723047` and match the id.

2. **Stage everything in one shot** (creates version + copies text metadata + attaches build + readiness check, stops before submit). `--copy-metadata-from` takes the previous **version STRING** (`1.38.3`), NOT its version ID — passing an ID fails `apply_metadata` with `source version "<id>" not found`:

   ```
   asc release stage --app 6469723047 --version 1.38.3 --build-id <BUILD_ID> \
     --copy-metadata-from <PREV_VERSION_STRING> --exclude-fields whatsNew --platform IOS --confirm
   ```

   **Plain "bug fixes" release** where the previous version already has the desired "What's New": drop `--exclude-fields whatsNew` so the existing translations copy over, and skip step 3 entirely.

3. **Set "What's New" per locale** (version localizations, `--version` = the **version ID**):
   `asc localizations update --version <VERSION_ID> --locale en-US --whats-new "…"`

   Translate the other locales yourself, following the store-notes rules in
   `../translate-locales/SKILL.md`.

   Under `/cut-release`, read back the finalized text (including copied generic
   maintenance notes) and persist it in `.asc/cut-release/store-notes.json` for
   Play's changelog files. If a translation exceeds Play's limit, shorten and
   update the shared ASC text too, then verify both stores use it. In-app
   announcements remain separate.

4. **Preflight then submit:** `asc review doctor --app 6469723047` (look for `nextAction: No submission blockers`), optionally `asc review submit … --dry-run`, then:
   ```
   asc review submit --app 6469723047 --version 1.38.3 --build-id <BUILD_ID> --platform IOS --confirm
   ```

## Store URLs on witnesswork.app (release N)

ADR 0042 §6 moves every locale's privacy, support and marketing URLs to the new site. This also replaces the third-party privacy page and the dead `leviwilkerson.com/jw-time` URL some locales still show.

- **When:** while staging the first version whose `app.config.ts` claims `applinks:witnesswork.app`, and on any later release where a store URL still isn't on `https://witnesswork.app`:

  ```sh
  asc localizations list --app 6469723047 --type app-info --output json | jq -r '.data[].attributes | [.locale, .privacyPolicyUrl] | @tsv'
  asc localizations list --version "$VERSION_ID" --output json | jq -r '.data[].attributes | [.locale, .supportUrl, .marketingUrl] | @tsv'
  ```

- **First, the site must be live:** `curl -s -o /dev/null -w '%{http_code}\n' https://witnesswork.app/support` prints `200` (it deploys from `services/` on `main`). App Review opens the Support URL.
- **Stage without the old URLs:** in step 2, use `--exclude-fields whatsNew,supportUrl,marketingUrl`. `asc release stage` copies metadata again on every run, including a resumed one, so a re-run would otherwise put the old URLs back. If you re-run it anyway, run the loop below again.
- **Support and Marketing URLs** are version fields; **Privacy Policy URL** is app-level (`--type app-info`), stays set for later versions, and can only change while a version is editable. Later releases copy the new Support and Marketing URLs forward with `--copy-metadata-from`.

Set `VERSION_ID` to the staged version's ID (`asc versions list --app 6469723047`), then run this. Its list is the locale map (ASC locale, then the site path; English has none, and privacy is English only):

```sh
VERSION_ID=…
while read -r locale site; do
  asc localizations update --version "$VERSION_ID" --locale "$locale" \
    --support-url "https://witnesswork.app$site/support" \
    --marketing-url "https://witnesswork.app$site"
  asc localizations update --app 6469723047 --type app-info --locale "$locale" \
    --privacy-policy-url https://witnesswork.app/privacy
done <<'EOF'
en-US
fr-FR /fr-FR
de-DE /de-DE
nl-NL /nl-NL
it /it-IT
pt-BR /pt-BR
es-MX /es-ES
ru /ru-RU
vi /vi-VN
ja /ja-JP
ko /ko-KR
zh-Hans /zh-CN
zh-Hant /zh-TW
ar-SA /ar
EOF
```

Then, right before step 4:

- read them back with the two `asc localizations list` commands above;
- check each URL answers 200: `curl -s -o /dev/null -w '%{http_code} %{url_effective}\n' <url>`;
- run `asc review doctor --app 6469723047`.

**Google Play** keeps one value per app and has no field in this skill's tools. The owner sets them in Play Console any time after the site is live (no release needed):

- **App content → Privacy policy:** `https://witnesswork.app/privacy`.
- **Store settings → Contact details:** website `https://witnesswork.app`. Optionally the email `support@witnesswork.app`, once its Email Routing forward is verified (replies still come from the old address).
- These changes go through review, and wait for an explicit publish when managed publishing is on.

## Gotchas (learned the hard way)

- **ASC release-note locales ≠ app i18n codes.** The 14 ASC locales: `en-US fr-FR de-DE nl-NL it pt-BR es-MX ru vi ja ko zh-Hans zh-Hant ar-SA`. Do NOT use the app's `it-IT/ko-KR/ja-JP/ru-RU/vi-VN/zh-CN/zh-TW/es-ES/ar`. `asc localizations supported-locales --version <ID>` if unsure.
- **`releaseNotes.ts` / `src/locales/*` are the in-app "What's New" — unrelated** to ASC store release notes. Don't confuse them.
- **Screenshots auto-carry** from the previous version; **text metadata does not** (hence `--copy-metadata-from`; copyable fields: `description,keywords,marketingUrl,promotionalText,supportUrl,whatsNew`).
- **A failed `release stage` step leaves a stale checkpoint** under `.asc/release/checkpoints/stage_<app>_<version>_<build>_<platform>.json`. Re-running with corrected args then errors `checkpoint does not match current run arguments`. The version itself is already created (the `ensure_version` step ran) — just `rm` the checkpoint file and re-run `stage`; it reuses the existing version and resumes.
- **No `-o` shorthand** — invalid flags make `asc` silently dump `--help` instead of erroring. Use `--output`.
- **`asc versions view --version-id <ID>`** returns a FLATTENED object (`id/versionString/state/buildId/buildVersion`), not JSON:API `.data.attributes`. For `releaseType`/`appStoreState` use `asc versions list`.
- **Release type** defaults to `AFTER_APPROVAL` (auto-release after approval) — matches all prior releases.
- **Export compliance** is auto-satisfied when the build sets `usesNonExemptEncryption=false` (it does) — no manual prompt.
- **Always-present benign warnings** (non-blocking, ignore): `subscriptions.images.recommended` (~31, optional promo image per subscription price point) and `privacy.publish_state.unverified` (API can't read App Privacy state; it's published).
- **`asc review doctor` may time out** fetching IAPs — retry with `ASC_TIMEOUT=120s`.

## Reusable "Bug fixes and performance improvements" set (all 14 ASC locales)

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
ar-SA  إصلاحات للأخطاء وتحسينات في الأداء.
```
