# WitnessWork Help Center

The Help Center at `https://witnesswork.app/help` is the single source of truth for WitnessWork's FAQ. The website renders it as indexed pages, the app downloads it as JSON bundles and renders them natively (offline-capable), and a Cloudflare Worker powers semantic search for both. This is the contract they rely on ([ADR 0033](./adr/0033-help-center-on-the-website.md), [ADR 0042](./adr/0042-witnesswork-app-domain.md)).

```
services/marketing  content/help/<locale>/<category>/<slug>.mdx  (one file per question per locale)
   │ pnpm build (static files on Workers Static Assets, Worker ww-marketing)
   ├─► /help/…                       pages (19 locales, hreflang, sitemap)
   ├─► /help/bundle/…                JSON bundles → app + search sync
   └─► /llms.txt, /llms-full.txt, <page>.md
services/help-search  Worker ww-help-search (help-search.witnesswork.app,
                      and help-search.leviwilkerson.com for shipped builds)
   ├─ cron: pulls the bundle manifest, embeds changed answers (Workers AI) into
   │        per-locale indexes in KV, next to its own BM25 keyword index
   └─ GET /v1/search → hybrid (vector + BM25) search in memory, retrieval only
App: bundled snapshot → cached bundle → background refresh; Fuse.js offline,
     remote search when online. Website falls back to Fuse.js the same way.
```

Hosts: production is `witnesswork.app` with `help-search.witnesswork.app`; the staging site is `dev.witnesswork.app` (never indexed) with `help-search-dev.witnesswork.app`. The old `leviwilkerson.com/witness-work/…` URLs, including the bundles, 301 to the matching `witnesswork.app` page (ADR 0042 §5), so shipped app versions keep working.

Publishing: answers ship in the same pull request as the app change they describe. `services.yml` deploys the site and the search Worker on merge to `main`, and only checks and builds other branches (the staging site, `dev.witnesswork.app`, follows the web launch's integration branch until launch; see [`services/README.md`](../services/README.md#deploying)); the app picks up the new bundle the next time someone opens the Help Center, and search catches up on its own: the `ww-help-search` Worker pulls the manifest every 15 minutes and re-embeds only changed answers, which are searchable within about 20 minutes of the deploy. No Worker deploy is needed for content changes.

## Contract (v1)

Everything below is consumed by other systems (the app, the search Worker). Changing it is a breaking change: bump `schemaVersion` and keep serving v1 until the app versions that read it are gone.

**Adding `web` to `platforms` did not bump `schemaVersion`; it's additive.** Apps released before it parse each entry with the old `validate.ts`: from the `platforms` array they keep only `ios` and `android`, and read a missing field as both phones. They never reject a bundle over an unknown platform, so nothing breaks, and they filter correctly: an all-platform entry (`["ios","android","web"]`) reaches them as `["ios","android"]` and shows, and a web-only entry (`["web"]`) reaches them as `[]` and is hidden on every phone. An entry for `ios` and `web` reaches them as `["ios"]`. This is why the bundle always writes `platforms` explicitly: a reader that doesn't know `web` can't infer it from an omitted field. A test keeps a frozen copy of the old parser (`src/__tests__/helpers/legacyHelpCenterParser.ts`) and feeds current bundles through it. The same goes for the Worker: `platform=web` is new. An index built before it (no `web` on its entries) reads as web for answers that were for both phones, and the index version went to 2, so the first sync after the deploy rebuilds every index from its stored embeddings.

On the web, `Application.nativeApplicationVersion` is `null`, so the version floor (`minAppVersion`) hides nothing there, and an unknown version shows every answer. The site deploys on merge while web app releases wait for the release cut, so an answer about unreleased behavior can show on the web early; say "From version x.y.z" in such answers. The app's bundled snapshot (`src/assets/help-center/`) holds explicit `["ios","android"]` arrays from before `web` existed, so a web build made from it shows no answers until it downloads a bundle that lists `web`, which it does in the background on first open (offline, it stays empty). Release prep runs `pnpm sync:help`, which fixes the snapshot, and every web build (`pnpm web:build`, which every web deploy runs) runs it first and fails without a connection.

### Locales

The app's locale codes, used verbatim: `en-US` (default), `ar`, `bem-ZM`, `de-DE`, `es-ES`, `fr-FR`, `it-IT`, `ja-JP`, `ko-KR`, `nl-NL`, `pt-BR`, `pt-PT`, `ru-RU`, `rw-RW`, `sw-KE`, `uk-UA`, `vi-VN`, `zh-CN`, `zh-TW`.

### Ids

- `id`: the stable camelCase id the app has always used (`timeRollover`). Never changes; analytics and app code key on it.
- `slug`: kebab-case of `id` (`time-rollover`). Used in URLs.
- Category ids are stable and referenced by app code (`streaks`, `supporter`, …): `time`, `contacts`, `plans`, `notes`, `scribe`, `streaks`, `buddies`, `badges`, `mileage`, `pet`, `map`, `customization`, `backups`, `account`, `supporter`, `general`.

### Front matter (per question, English file)

```yaml
id: timeRollover # required, stable
title: Can partial hours…? # required: the question
category: time # required: a category id
platforms: [ios, android, web] # optional; any non-empty subset; omit = all three
pinned: true # optional; "Top questions"
related: [196, 226] # optional; GitHub issue numbers
minAppVersion: '4.12.0' # optional; applies to app ≥ this version
```

`platforms` is where an answer applies: `ios`, `android` (the phone apps) and `web` (WitnessWork on the web, [ADR 0037](adr/0037-witnesswork-on-the-web.md)). Leave it out for an answer that holds on all three. Set it for one that doesn't apply on the web (widgets, Siri and Shortcuts, notifications, Live Activities, the watch apps, iCloud or Google Drive sync, purchases through the app stores) or that's only for the web. Lists are normalized to the order `ios`, `android`, `web`.

Translations (`content/help/<locale>/…`) set only `id` and `title`; everything else comes from the English file.

### Answer Markdown subset

Answers must convert losslessly to the app's `RichTextDoc` (`src/types/richText.ts`; the site keeps the subset it uses in `services/marketing/src/lib/help-center/types.ts`). Allowed: paragraphs, headings (`#`, `##`), **bold**, _italic_, ~~strike~~, links, hard line breaks, bulleted and numbered lists (nestable). Not allowed: images, tables, code, blockquotes, HTML, MDX components, task lists. The build fails on anything else. Links must be `https:`, `mailto:`, or a site path (`/privacy`, `/help/…`), which the build makes absolute on the site's origin (`https://witnesswork.app`, or the staging origin in a staging build). (The app opens `https:`, `http:`, `mailto:`, and `tel:` links and shows any other as plain text.)

### URLs

- `en-US` (unprefixed): `/help`, `/help/<category>`, `/help/<category>/<slug>`
- Other locales: `/help/<locale>/…` (e.g. `/help/pt-BR/time/time-rollover`)
- Markdown alternate of a question page: the page URL + `.md` (`text/markdown; charset=utf-8`)
- `/llms.txt`, `/llms-full.txt` (English, `text/plain; charset=utf-8`)

### Bundles

`GET /help/bundle/manifest.json`

```ts
type HelpManifest = {
  schemaVersion: 1
  generatedAt: string // ISO
  locales: Record<string, { hash: string; count: number; path: string }>
  // path: "https://witnesswork.app/help/bundle/<locale>.json"
}
```

`path` is an absolute URL on the site's origin. Clients resolve it with `new URL(path, manifestUrl)`, which also accepts the site paths earlier manifests listed. It's absolute because app versions that fetch the old manifest URL follow its 301 here but resolve paths against the URL they asked for.

`GET /help/bundle/<locale>.json`

```ts
type HelpBundle = {
  schemaVersion: 1
  locale: string
  hash: string // first 16 hex of sha256 over categories + entries JSON
  generatedAt: string
  categories: { id: string; title: string }[] // display order
  entries: HelpEntry[] // display order
}

type HelpEntry = {
  id: string
  slug: string
  category: string
  platforms: ('ios' | 'android' | 'web')[] // never empty; the site always writes it, all three when the front matter omits it
  pinned: boolean
  related: number[]
  minAppVersion?: string // "x.y.z"
  question: string
  doc: RichTextDoc // { type: 'doc', content: RichTextBlock[] }
  plainText: string // question-free answer text for search and Copy
  url: string // absolute URL of this entry's page in this locale
  fallback?: true // English text: this locale has no translation yet
}
```

A locale missing a translation gets the English entry with `fallback: true`, so every locale bundle has every entry.

Bundles and the manifest are served with `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=0, must-revalidate`, and an `ETag` (clients revalidate with `If-None-Match`).

### Search engine indexing

Every English article and published translation has a self-referencing canonical
URL and is included in `/sitemap.xml`. The sitemap also includes each locale's
home and category pages, with reciprocal `hreflang` links and English as
`x-default`. The sitemap (the whole site's) is written by
`services/marketing/src/lib/site-files.ts`. The staging site is `noindex`
everywhere (`X-Robots-Tag`, robots meta, and `robots.txt` `Disallow: /`).

Untranslated article URLs remain available to readers and the app, but show
English and canonicalize to the English article. They are deliberately excluded
from the sitemap and from translated articles' `hreflang` links. Search Console's
"Alternate page with proper canonical tag" is expected for those copies; add a
translation to make that locale's article independently indexable.

"Crawled – currently not indexed" means Google fetched the URL but has not
included it in its index. It does not identify a robots or canonical failure.
The aggregate Page indexing report can lag behind URL Inspection. Check the
stored inspection result first: "URL is on Google" and "Page is indexed" confirm
that Google has indexed that URL even if it still appears among the report's
excluded examples. "Test live URL" checks current eligibility, not index status.
After deploying an indexing fix, resubmit `/sitemap.xml` in Search Console and
inspect representative English and translated article URLs with its live URL
test. Request indexing for those canonical URLs and allow time for recrawling;
indexing every eligible page is ultimately Google's decision.

### Search API

`GET https://help-search.witnesswork.app/v1/search?q=<text>&locale=<code>&platform=ios|android|web&appVersion=x.y.z&limit=20`

- `q` required (1–200 chars); `locale` defaults to `en-US`; `platform` optional (omit = no platform filter); `appVersion` optional (omit = no version filter; the web app has no app version and omits it); `limit` 1–50, default 20.
- `200 { results: { slug: string; score: number }[] }`, best first. Clients map `slug` to the entry in their bundle and drop unknown slugs. Scores are relative to the query (the best is often 1); the Worker already drops weak matches, so clients don't filter on them.
- `400` bad params, `429` rate limited, `503` search unavailable. Clients treat any non-200 or a timeout as "use local search".
- Latency is about 130 ms in the Worker (p90 about 210 ms) plus the network, ~30 ms for a cached repeat. Clients show local (Fuse.js) results at once, query the Worker after a ~600 ms typing pause (never per keystroke: the Worker rate-limits each IP to 60 searches a minute), and swap in the remote order if it arrives while the query is unchanged. Both clients wait up to 8 s; the website shows a spinner meanwhile. When the local results are empty, both show "Searching…" instead of "no results" until the Worker answers (offline, "no results" shows at once). An empty or failed remote result keeps the local results.
- Search text is not logged: the Worker keeps error and sync logs only (no request logs).
- CORS `*`, no credentials. Cached at the edge briefly.
- `help-search.leviwilkerson.com` answers the same way, forever, for shipped app versions.

The Worker indexes each answer's `question` and `plainText` (embedding and keywords), `platforms`, and `minAppVersion` (`appVersion` filters out answers whose minimum is higher). How it works and how to tune it: [`services/help-search/README.md`](../services/help-search/README.md).

## Working on content

Content lives in `services/marketing/content/help/` (paths below are relative to `services/marketing`). [`services/marketing/README.md`](../services/marketing/README.md) is the short version for answer writers.

### Layout

```
content/help/
  order.json                        category order + question order (by id)
  <locale>/categories.json          category titles
  <locale>/ui.json                  page strings (search placeholder, "Still need help?", …)
  <locale>/<category>/<slug>.mdx    one question
```

The answer is the Markdown body under the front matter, in the subset above. Pages, bundles, Markdown alternates, and llms.txt are all generated from these files (`services/marketing/src/lib/help-center/`); nothing else holds FAQ text. The site renders answers from the same `RichTextDoc` the app gets, so what you see on the site is what the app shows.

### Add a question

1. Create `content/help/en-US/<category>/<slug>.mdx`, where `slug` is the kebab-case `id` (`timeRollover` → `time-rollover`; a single leading lowercase letter stays attached: `iCloudSync` → `icloud-sync`). `pnpm help:validate` tells you the expected file name.
2. Add the `id` to `questions` in `content/help/order.json` where it should appear. Order is global: categories show their questions in this order, and "Top questions" lists pinned ones in this order.
3. Run `pnpm help:validate`. It fails on unsupported Markdown, unknown categories, duplicate ids or slugs, files in the wrong folder, a missing `order.json` entry, or a malformed `minAppVersion`. `pnpm build` runs the same checks.
4. Write the answer to stand on its own: someone lands on it from a search engine or an AI assistant. Name the screen path (Settings → Sync), say which platforms it applies to, and set `platforms` when it isn't true on all of iOS, Android and the web.

Edit a question by editing its English file. **Never change an `id`**: the app and analytics key on it. To retire a question, delete its files in every locale and remove it from `order.json`.

### Translations

Write answers in English only. A locale without a file for a question shows the English answer, with `fallback: true` in its bundle and a "not translated yet" note on the page (whose canonical URL then points at the English page). Other locales are translated in this repo, separately from the app's release cut and without an app release:

- Add `content/help/<locale>/<category>/<slug>.mdx` with only `id` and `title` in the front matter, and the translated answer as the body.
- When an English answer changes meaningfully, update its translations too, or delete them so the English text shows until they're redone. A stale translation is worse than the English fallback.
- Use Jehovah's Witness terminology as the app does: the [`translate-locales`](../.agents/skills/translate-locales/SKILL.md) skill's glossary applies here too. No "magic" wording or imagery in any language.
- Category titles live in `<locale>/categories.json`, page strings in `<locale>/ui.json`; missing keys fall back to English.

### minAppVersion

Set `minAppVersion: "x.y.z"` (quoted) on a question that only applies from that app version on: a new feature's FAQ can be published before the release, and the app hides it on older versions. The website shows every question regardless. Leave it unset when the answer applies to every supported version. When behavior changes in a version, prefer updating the answer to say "From version x.y.z, …" over duplicating questions.

### Commands

Run from `services/marketing` after `pnpm install` in `services/` ([`services/README.md`](../services/README.md)):

- `pnpm help:validate`: check content and regenerate bundles, `.md` alternates, llms.txt, the sitemap, `robots.txt`, and `_headers` into `public/` (gitignored).
- `pnpm dev`: the site with the Help Center at `/help` on the dev server, regenerated on every content change.
- `pnpm build && pnpm e2e`: production build plus Playwright tests (pages, device filter, languages, search fallback, bundle contract, headers, llms.txt) against the build served by `wrangler dev`. `E2E_BASE_URL=https://dev.witnesswork.app WW_SITE_ENV=dev pnpm e2e` runs them against the deployed staging site.
- In the app: `pnpm sync:help` refreshes its offline snapshot from the published manifest (`--from services/marketing/dist/production/client/help/bundle` reads a local build).
