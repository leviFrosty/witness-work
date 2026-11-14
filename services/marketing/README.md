# The WitnessWork website

`witnesswork.app`: the landing page in every app language, privacy, terms, support, `/get` (the download QR code's target), and the Help Center at `/help`, whose JSON bundles the app downloads. It's [TanStack Start](https://tanstack.com/start) prerendered to static files and served by Workers Static Assets, with no server code. The contract the app and the search Worker rely on is [`docs/help-center.md`](../../docs/help-center.md).

## Writing Help Center answers

Every user-facing feature ships with Help Center answers in the same pull request. This section is the style guide; the contract the app and search rely on is [`docs/help-center.md`](../../docs/help-center.md).

### Who reads them

Publishers of every age, many in their 60s, 70s and 80s, and many who aren't comfortable with technology. They read an answer on a phone, often in the middle of a task, to find out **what to tap**. Write for them:

- **Lead with the answer.** The first sentence answers the question on its own.
- **Show the way, step by step.** Number the steps, one action per step, and name the exact button or screen in **bold**, spelled as the app shows it (`src/locales/en-US.json` has every label).
- **Use plain, everyday words.** Short sentences. "Your phone" rather than "the device", "turn on" rather than "enable". Explain any term the app shows the first time you use it.
- **Say what people see and do, not how it works inside.** Leave out encryption, servers, sync engines, tokens and attestation. When privacy matters, say it plainly ("Only you can read it").
- **Describe the app as it is today.** No version history ("before version 1.47.0"), no features that were removed or renamed. If something needs a newer app, say "Update WitnessWork if you don't see **X**."
- **Keep it short.** Most answers fit on one phone screen. If an answer covers two tasks, split it into two questions.
- **Warm and calm.** No blame, no jargon, no exclamation marks. No "magic" wording, in any language.

### The template

```mdx
One or two sentences that answer the question.

## Steps ← name it for the task: "Send your report", "Turn it off"

1. Open **Settings → Profile**.
2. Tap **Submission method**.
3. Choose how you send your report.

![Profile settings with Submission method](submit-report.webp)

## Good to know

- Short facts people need: limits, who can see it, which devices.

## If something goes wrong

- **What the person sees:** what to do about it.
```

Use only the sections the answer needs. A yes/no question may be one or two short paragraphs. Section headings are `##`. Keep paragraphs to two or three sentences, and lists to about six items.

**Worked example.** Before, a single 330-word paragraph. After:

```mdx
---
id: submitReport
title: Does the app submit my service report for me?
category: time
pinned: true
---

No. WitnessWork prepares your report, and you choose how to send it.

## Send your report

1. On **Home**, tap **Submit** on the **Service Report** card. Or open the month's **Field Service Report**.
2. In the menu above the **Submit** button, choose how you send it: copy it, share it, or open it in Hourglass or NW Publisher.
3. Tap **Submit**.

The report then shows **Sent** with the date.

## Good to know

- Hourglass and NW Publisher open with your hours, credit and Bible studies filled in. Check them and send from there.
- NW Publisher only accepts last month's report.
- WitnessWork remembers your choice. To change it, open **Settings → Profile → Submission method**.
- Already reported another way? Touch and hold the **Submit** row on Home and choose **Already Submitted**.

## If something goes wrong

- **Marked as sent by mistake:** tap **Undo** below the **Submit** button.
- **Shared it on Android:** the app can't tell whether you sent it. Tap **Mark as Sent** below the **Submit** button.
- **Your phone was offline:** when you're back online, WitnessWork asks whether the report arrived. Choose **Mark as Sent** if it did.
```

### Add or update a feature's answers

You only need the answers your feature touches. Don't read the whole Help Center.

1. **Find them.** Answers live in `content/help/en-US/<category>/<slug>.mdx`, one file per question, grouped by feature folder (`time`, `contacts`, `territories`, `plans`, `routine`, `notes`, `scribe`, `streaks`, `buddies`, `badges`, `mileage`, `pet`, `map`, `customization`, `backups`, `account`, `supporter`, `general`). List the folder, or search for the feature's name or a button label: `rg -l "Submission method" content/help/en-US`.
2. **Edit or add.** To change behavior, edit the answer in place. For a new question, create `content/help/en-US/<category>/<slug>.mdx` (front matter below) and add its `id` to `questions` in `content/help/order.json` where it should appear.
3. **Write English only.** Other languages are translated separately. When you change an English answer's meaning, delete that question's translations (`content/help/<locale>/<category>/<slug>.mdx`) so readers see the current English until it's translated again. A small wording fix can leave them.
4. **Check it:** `pnpm help:validate` from `services/marketing`.

Front matter:

```yaml
id: submitReport # camelCase, never changes (the app and analytics key on it)
title: Does the app submit my service report for me? # the question, as a reader would ask it
category: time # the folder it lives in
platforms: [ios, android] # optional: omit when it applies to iPhone, Android and the web
pinned: true # optional: shown under Top questions
related: [243] # optional: GitHub issue numbers
minAppVersion: '4.12.0' # optional, quoted: hides it in older app versions
redirectFrom: [time/hourglass-setup] # optional: old answer pages that now land here
```

- **The file name** is the kebab case of `id`: `submitReport` → `submit-report.mdx`, `iCloudSync` → `icloud-sync.mdx`. `pnpm help:validate` tells you if it's wrong.
- **`platforms`**: set it when an answer doesn't apply everywhere, for example widgets, Siri and Shortcuts, notifications, Live Activities, the watch apps, iCloud or Google Drive sync, and App Store or Google Play purchases aren't on the web. Inside the answer, a line such as "On Android, …" covers small differences.
- **`minAppVersion`**: set it when the answer describes something not released yet. The site publishes on merge, before the app release reaches anyone.
- **Merge rather than repeat.** If two questions give the same answer, keep one, delete the other's file in every locale and its `order.json` entry, and add the deleted page's `<category>/<slug>` to the survivor's `redirectFrom`, so its old links still work.

### Formatting you can use

Paragraphs, `##` headings, **bold**, _italic_, links, numbered and bulleted lists (one level of nesting at most), and one screenshot per answer. No tables, code, quotes or HTML; the check fails on them. Links are `https:`, `mailto:`, or a path on this site (`/help/time/submit-report`). To point at another answer, link it by its path rather than quoting its title.

Screen paths use arrows and bold: **Settings → Sync**. Buttons and switches are bold, exactly as the app labels them.

### Screenshots

Add one when pointing at a specific screen or button makes the steps easier to follow, typically a screen that's hard to find or a button that's easy to miss. Most answers don't need one. The text must still make sense without it: older app versions and screen readers don't show it.

1. Capture the screen on the iPhone simulator with the [`verify-witnesswork`](../../.agents/skills/verify-witnesswork/SKILL.md) skill (`wwv shot <name>`), in light appearance, with made-up names and data and the dev Tools button turned off. A cheap subagent can do the driving.
2. From `services/marketing`, run `pnpm help:image <slug> <screenshot.png>`. It resizes the capture, saves it as `content/help/images/<slug>.webp`, and prints the Markdown line. Add `--crop WxH+X+Y` (ImageMagick geometry, in the capture's pixels) to keep only part of the screen.
3. Paste the line on its own, under the step it shows: `![Field Service Report with the Submit button](submit-report.webp)`. The text in brackets describes the screen for screen readers; write it as a short caption.

To update a screenshot, run the same command again; the file name stays the same. Images are committed with the answer. The site serves them under `/help/images/`, the app keeps each one it has shown for offline use, and release prep bundles them all into the app with the rest of the Help Center.

### Check and preview

From `services/marketing` (after `pnpm install` in `services/`):

```sh
pnpm help:validate   # checks every answer and writes the bundles; fails with the file and the problem
pnpm dev             # the site at http://localhost:3000, Help Center at /help; reloads on content changes
pnpm test            # unit tests, landing translations, and the content check
pnpm build && pnpm preview   # the production build, served the way Cloudflare serves it
```

### How it ships

Merging to `main` deploys the site from CI. A push to a feature branch runs its lint, typecheck, tests and build without deploying; to see a change before it merges, run `pnpm dev`, or `pnpm build` then `pnpm preview`. The staging site at `dev.witnesswork.app` (never indexed) deploys only when someone runs the Services workflow by hand ([`services/README.md`](../README.md#deploying)). The app downloads the new answers the next time someone opens its Help Center, and search indexes the change within about 20 minutes. Release prep refreshes the app's offline copy with `pnpm sync:help` at the repo root.

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
