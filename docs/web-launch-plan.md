# WitnessWork on the web: launch plan

This plan delivers ADRs 0037–0043. It covers:

- WitnessWork on the web;
- passkeys and web accounts;
- changing the account key;
- free sync with Cloud Sync photos;
- web purchases;
- the `witnesswork.app` domain;
- masked session replay.

Decisions live in the ADRs. This file says who builds what, in which order,
and how it's verified.

## Branches

| Repo         | Integration branch          | Lands in                          |
| ------------ | --------------------------- | --------------------------------- |
| witness-work | `feat/web-device-sign-in`   | `main`, one commit per workstream |
| ww-api       | `web-launch`                | `main`, before any app release    |
| portfolio-v2 | `witnesswork-app-redirects` | `main`, at the website cutover    |

- **Workstream branches** have bare names, are based on the integration
  branch, and open PRs into it. A workstream lands as a series of small PRs,
  each one commit, amended and rebased, never merged. Each part that unblocks
  others lands first.
- **Merging:** when a PR passes the gates below, its workstream rebase-merges
  it into the integration branch, never into `main`. Later PRs rebase onto the
  result. `main` merges are the owner's.

## Workstreams

### W1 Domain and website (`witnesswork-domain`)

- **Cloudflare:** DNS and custom domains for every host in ADR 0042 (dev hosts
  live now, production hosts ready), the `www` redirect, Email Routing for
  `support@`, and the Search Console property.
- **`services/` workspace:** its own pnpm workspace and lockfile.
  - **`services/marketing`:** TanStack Start, porting every WitnessWork page
    from portfolio-v2 with all locales:
    - landing, privacy, terms and support;
    - the Help Center, with its content, library, `llms.txt`, and a bundle
      JSON whose manifest lists absolute URLs;
    - the OG images.
  - **`services/help-search`:** the search Worker, moved here.
  - **CI:** deploys both services on merge to `main`, and a staging copy for
    branches. CI never deploys the app.
- **ww-api:**
  - `api.witnesswork.app` and `api-dev.witnesswork.app`;
  - exact-path apex routes for the association files and the link pages,
    using full-word paths;
  - link pages that follow the request host;
  - "Continue on the web" on contact and Buddies link pages.
- **App:**
  - claim and read both hosts, while still creating old-host links, with one
    switch for later;
  - API base `api.witnesswork.app`, and site links on `witnesswork.app`;
  - `pnpm sync:help` reads the new manifest;
  - the link scrubber knows both hosts;
  - Android intent filters for the new host.
- **Docs:**
  - `docs/help-center.md`, the contract moved from portfolio-v2;
  - AGENTS.md and CLAUDE.md, where FAQ work now happens;
  - the app-store-release skill's steps for the store URL fields;
  - the architecture diagram.
- **CI:** `tests.yml` also runs on `workflow_dispatch`, so the integration
  branch can run CI on demand.
- **portfolio-v2:** a PR with the ADR 0042 §5 redirects as 301s, left
  unmerged until the cutover.

### W2 Web app (`web-app`)

- **Build plumbing:** react-native-web, pinned; the `web` block in
  `app.config.ts`; env profiles for dev, beta and production.
- **Platform shims:**
  - shims for every import that breaks the web build;
  - a web branch for each `Platform.OS` check that treats everything that
    isn't Android as iOS;
  - one helper that hides features with no web equivalent (ADR 0037 §1).
- **Persistence:** IndexedDB behind the synchronous store interface.
- **UI on web:** pickers, menus, popovers, tooltips and sheets; keyboard and
  pointer support.
- **Files:** photos and files come from file inputs; exports download as
  files; MyTime import works in memory.
- **Maps:** the MapKit JS frame on `maps(-dev).witnesswork.app` and its
  ww-api token route; HERE search, place search and directions through
  ww-api.
- **Scribe AI voice:** recorded in the browser, transcribed by ww-api.
- **Loading on demand:** CanvasKit when a screen needs it; locales from the
  app's origin.
- **Offline and install:**
  - a Workbox service worker, with the offline banner and an update prompt;
  - the Install App banner, the web manifest and icons.
- **Security:** headers, CSP (report-only first) and Trusted Types.
- **Session replay** (ADR 0043).
- **Deploy scripts** for dev, beta and production, wired into the release and
  beta-build skills. Production deploys are gated.

### W3 Accounts and passkeys (`passkeys`)

- **ww-api, first and small:** CORS, and access tokens as a WebSocket
  subprotocol. Then:
  - passkey registration and sign-in, PRF wraps, and tickets for passkeys and
    device approvals;
  - web sessions: sliding 180 days, 3 per account;
  - Turnstile, caps and the kill switch;
  - app version on sessions, and activity log entries;
  - the legacy sign-in method off.

  Documented in `docs/passkeys-protocol.md`.

- **`modules/passkeys`:** iOS with PRF, and Android Credential Manager.
  `webcredentials` and asset links for `app.witnesswork.app`.
- **App, on the web and on phones:**
  - sign-in screens: passkey, then phone, then recovery key;
  - the onboarding passkey step;
  - Settings → Account → Passkeys;
  - web sign-up with the recovery key gate;
  - approving a browser from a phone;
  - on the web, the key and session kept at rest, and App Lock;
  - the shared check before sensitive actions;
  - browsers in the signed-in devices list, and tray notices for new
    sign-ins;
  - live-socket auth on the web.

### W4 Free sync and photos (`free-sync`)

- **ww-api:**
  - photo blobs per account in R2, with a 2 GB limit, a usage count and a
    30-day purge;
  - `sync:entitlement` set to `everyone`;
  - the account's "turn on Cloud Sync" flag.

  Documented in `docs/cloud-sync-photos.md`.

- **App:**
  - sync gates removed, and Cloud Sync on by default for new installs;
  - tray alerts for existing installs, with Supporter and non-Supporter copy;
  - photos over Cloud Sync for the profile, Contacts and notes, with storage
    usage and the storage-full state in Settings → Account;
  - the RevenueCat id inside the sync data, adopted by other devices;
  - `useIsSupporter` falls back to ww-api;
  - phones switch when the account flag is set;
  - paywall and settings copy updated.

### W5 Change account key (`change-account-key`)

Starts once W3's ww-api work is in `web-launch`. Delivers ADR 0039 end to end:

- ww-api's rekey operation, retired keys, the key epoch, and the key history;
- the resumable device flow;
- re-encrypting slots;
- resetting Buddies with reconnect invites;
- unlinking the Supporter customer;
- web parity.

Documented in `docs/account-key-change.md`.

### W6 Web purchases (`web-purchases`)

Starts once W2 boots, W3's web sign-in works, and W4's RevenueCat id is in.

- **RevenueCat Billing setup:** the web app, Stripe, products and
  entitlements, and Web Purchase Links.
- **Web paywall:** hosted checkout for subscriptions and Tips, and a return
  page that strips the customer id.
- **No EU or UK sales:** a country check on the web, plus a Stripe rule.
- **Supporter status** on the web.

### W7 Help Center, docs and copy (`web-launch-docs`)

Starts once W1's site is in.

- **Help Center:** answers for every feature above, and updates to answers
  that become obsolete.
- **`docs/analytics.md`** for every workstream's events.
- **Privacy policy:** passkeys, the web app, replay, and the checkout email.
- **Release text:** the store "What's New" and the Updates note, following
  the ADR 0040 §4 messaging.

### W8 Integration and verification

The orchestrator:

1. Merges workstreams.
2. Deploys `web-launch` to the dev Worker, the web app to
   `app-dev.witnesswork.app`, and the site to staging.
3. Runs end-to-end checks on Chrome, Safari and Firefox (desktop and phone),
   with a PRF-capable virtual authenticator, plus the iOS simulator and the
   Android emulator.
4. Brings in black-box reviewers who know only the ADRs and the dev URLs.
5. Runs CI.

### W9 Production readiness

- Production infrastructure: hosts, keys, Turnstile, MapKit JS, RevenueCat and
  Stripe.
- The prepared, unflipped switches.
- The store metadata.
- The launch runbook below.

## Order

1. **Phase 1, in parallel:** W1, W2, W3, W4. W3's CORS and socket PR lands
   first, because every browser call needs it.
2. **Phase 2:** W5 once W3's server work is in, W6 once its inputs are in, W7
   once W1's site is in.
3. **Phase 3:** W8, with fixes going back to the owning workstream.
4. **Phase 4:** W9, then PRs ready to merge and the runbook.

## Working rules for every workstream

- **Backends:**
  - Test against your own local ww-api (`verify-ww-api`) and a local web
    build.
  - The shared dev hosts (`api-dev.`, `app-dev.witnesswork.app`) serve only
    the integration branches' latest commit. Deploy there only from a clean
    checkout of that commit, after applying dev D1 migrations, and never from
    a workstream branch.
  - Nobody deploys anything to production.
- **No production actions:**
  - no ww-api production deploys, production web deploys or OTA updates;
  - no store submissions, Play publishing, production KV switches, or merging
    the portfolio redirects.

  These steps are in the runbook.

- **D1 migrations:** generate them only right after rebasing on the latest
  `web-launch`, and regenerate them on conflict.
- **Shared files:**
  - Add `en-US.json` keys next to related keys.
  - Prefer a new protocol doc per topic over editing `docs/accounts-protocol.md`.
  - Regenerate `pnpm-lock.yaml` on rebase rather than merging it by hand.
- **Devices:** one iOS simulator and one Android emulator per workstream at a
  time; release them when done.
- **Secrets:** come from the 1Password Agents vault through `op`. Never print
  or commit them.
- **Missing access:** stub that piece, write it down, and keep going.
- **Before a PR is ready:**
  - tests, typecheck and lint pass;
  - backend routes are proven with `verify-ww-api`;
  - the change is driven on iOS, and on Android for anything in AGENTS.md's
    platform list;
  - web flows are driven in browsers;
  - Standards and Spec reviews (`code-review`) and a black-box reviewer run on
    fresh agents;
  - before-and-after screenshots for UI.

## Launch runbook (production)

Done by the owner, or by the orchestrator with explicit go-ahead where the
release rules require it.

1. **Production hosts:** custom domains and the association files for
   `witnesswork.app` go live, at least several days before release N.
2. **ww-api:** merge `web-launch` → `main`, apply D1 migrations, and deploy
   production.
3. **Switches and keys:**
   - `sync:entitlement=everyone`;
   - the legacy sign-in method off;
   - production Turnstile and MapKit JS keys;
   - CORS origins checked.
4. **RevenueCat and Stripe** production web billing, with the EU and UK rule.
5. **Release N:**
   - App Store and Play builds that claim both hosts, with the store URL
     fields updated;
   - the web deployed to `app.witnesswork.app` at the cut, with
     `SHIP-PROD-X.Y.Z`.
6. **Website cutover:** services CI deploys `witnesswork.app`. Then merge the
   portfolio-v2 redirects and update Search Console.
7. **Later releases:**
   - start creating new-host links once about 95% of active installs run
     release N or later;
   - raise `minAppVersion` one release after changing the account key ships.
