# The WitnessWork website

`witnesswork.app`: the landing page in every app language, privacy, terms, support, `/get` (the download QR code's target), and the Help Center at `/help`, whose JSON bundles the app downloads. It's [TanStack Start](https://tanstack.com/start) prerendered to static files and served by Workers Static Assets, with no server code. The contract the app and the search Worker rely on is [`docs/help-center.md`](../../docs/help-center.md).

## Writing Help Center answers

Every new user-facing feature ships with Help Center answers in the same pull request ([`agents.md`](../../agents.md), "FAQ for new features").

### Where they live

```
content/help/
  order.json                        category order + question order (by id)
  en-US/categories.json             category titles
  en-US/ui.json                     page strings ("Still need help?", …)
  en-US/<category>/<slug>.mdx       one question
  <locale>/…                        translations, same layout
```

Categories: `time`, `contacts`, `plans`, `notes`, `scribe`, `streaks`, `buddies`, `badges`, `mileage`, `pet`, `map`, `customization`, `backups`, `account`, `supporter`, `general`.

### A question

`content/help/en-US/time/time-rollover.mdx`:

```mdx
---
id: timeRollover
title: Does my time automatically roll over to the next month?
category: time
platforms: [ios] # optional: omit when it applies to both
pinned: true # optional: listed under Top Questions
related: [196] # optional: GitHub issue numbers
minAppVersion: '4.12.0' # optional, quoted: hidden in older app versions
---

Partial hours carry over to the next month. Open **Settings → Time** to …
```

- **`id`** is camelCase and never changes (the app and analytics key on it). The file name is its kebab case: `timeRollover` → `time-rollover.mdx`, `iCloudSync` → `icloud-sync.mdx`.
- Add the `id` to `questions` in `content/help/order.json` where it should appear.
- **The answer** is plain Markdown in the subset the app renders: paragraphs, `#` and `##` headings, bold, italic, `~~strike~~`, links, line breaks, and lists. No images, tables, code, quotes or HTML. Links are `https:`, `mailto:`, or a path on this site (`/privacy`, `/help/time/time-rollover`), which becomes an absolute link.
- Write it to stand on its own: name the screen path (Settings → Sync), say which platforms it applies to, and set `platforms` when it's iOS- or Android-only. Set `minAppVersion` when it describes behavior that isn't released yet: the site deploys on merge, before the app reaches anyone.
- **English only.** A language without a translation shows the English answer, marked as not translated yet. Translations (`content/help/<locale>/<category>/<slug>.mdx`, front matter `id` and `title` only) are done separately in this repo, with the app's [`translate-locales`](../../.agents/skills/translate-locales/SKILL.md) glossary. When an English answer changes meaningfully, update or delete its translations.

More detail, including retiring a question: [`docs/help-center.md`](../../docs/help-center.md#working-on-content).

### Check and preview

From `services/marketing` (after `pnpm install` in `services/`):

```sh
pnpm help:validate   # checks every answer and writes the bundles; fails with the file and the problem
pnpm dev             # the site at http://localhost:3000, Help Center at /help; reloads on content changes
pnpm test            # unit tests, landing translations, and the content check
pnpm build && pnpm preview   # the production build, served the way Cloudflare serves it
```

### How it ships

Merging to `main` deploys the site from CI. A push to a feature branch runs its lint, typecheck, tests and build without deploying; to see a change before it merges, run `pnpm dev`, or `pnpm build` then `pnpm preview`. The staging site at `dev.witnesswork.app` (never indexed) follows the web launch's integration branch until launch, then deploys only when someone runs the Services workflow by hand ([`services/README.md`](../README.md#deploying)). The app downloads the new bundle the next time someone opens its Help Center, and search indexes the change within about 20 minutes. Release prep refreshes the app's offline copy with `pnpm sync:help` at the repo root.

## How the site is built

- **Routes** are in `src/routes`; the pages' components in `src/components/landing` and `src/components/help-center`; the Help Center's content pipeline (load, Markdown → `RichTextDoc`, bundles, search) in `src/lib/help-center`.
- **Static, no hydration.** `pnpm build` prerenders every page (`src/vite/pages.ts`) to `dist/<env>/client/<path>.html`, then `scripts/postbuild.mjs` drops the router's state script and unused chunks, so pages carry no framework JavaScript and no inline scripts. Motion is `public/landing.js`. The Help Center's search box, device filter and Copy Link are small React islands (`src/islands`), hydrated by `/islands.js`.
- **Environments.** `WW_SITE_ENV` picks production (the default) or `dev` (`src/lib/site.ts`): the origin in every absolute URL, the search Worker, and whether search engines may index it. `pnpm build:dev` builds the staging site, `noindex` everywhere.
- **Generated files** (gitignored, written into `public/` by `pnpm help:validate`, `pnpm dev` and `pnpm build`): the bundles, `.md` alternates, `llms.txt`, `sitemap.xml`, `robots.txt`, and `_headers` (security headers, a Content-Security-Policy that allows only this site plus the search Worker, the bundles' CORS and caching).
- **Paths the site must not have:** ww-api serves `/.well-known/*`, `/accounts/handoff`, `/contacts` and `/buddies/invite` on the same hosts; the build fails if a page lands there.
- **Analytics:** none in code, and no cookies. The owner can turn on Cloudflare Web Analytics for the zone without a change here.
- **Landing images** come from `scripts/landing/build-screens.mjs` (ImageMagick); the QR code from `scripts/landing/build-qr.mjs`.
- **Landing translations** are `src/components/landing/i18n/<locale>.ts`; `pnpm check:locales` checks them against English.
- **End-to-end tests:** `pnpm e2e` (Playwright in Chromium, WebKit and Firefox, desktop and phone sizes) against the build served by `wrangler dev`.
