---
status: proposed
---

# WitnessWork moves to witnesswork.app

## Context

Today WitnessWork is spread across hosts that aren't its own:

- The website, privacy policy, terms and Help Center live on
  `leviwilkerson.com`, built from the portfolio repo.
- The API and the link pages live on `ww-proxy.leviwilkerson.com`.

The web app needs its own origin, and passkeys need a domain that never
changes (ADR 0038). Links people share should carry the app's name. We now own
`witnesswork.app`, on Cloudflare.

## Decision

### 1. Hosts

| Host                          | What                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `witnesswork.app`             | The website: marketing, privacy, terms, support and the Help Center (`/help`). Also the app-link pages and association files, served by ww-api (§3). |
| `www.witnesswork.app`         | 301 to the apex.                                                                                                                                     |
| `app.witnesswork.app`         | The web app (ADR 0037), and the passkey RP ID. Never an app-link domain.                                                                             |
| `beta.app.witnesswork.app`    | The web app's beta.                                                                                                                                  |
| `app-dev.witnesswork.app`     | The web app against the dev API.                                                                                                                     |
| `api.witnesswork.app`         | ww-api: the same Worker as `ww-proxy.leviwilkerson.com`.                                                                                             |
| `api-dev.witnesswork.app`     | The dev ww-api Worker.                                                                                                                               |
| `help-search.witnesswork.app` | Help Center search: the same Worker as `help-search.leviwilkerson.com`.                                                                              |
| `maps.witnesswork.app`        | The MapKit JS frame, with `maps-dev.witnesswork.app` for dev.                                                                                        |
| `support@witnesswork.app`     | Cloudflare Email Routing to the existing inbox. Replies still come from the old address until a mail host is added.                                  |

### 2. Old hosts keep working forever

- **API and search:** `ww-proxy.leviwilkerson.com` and
  `help-search.leviwilkerson.com` keep serving the same Workers and are never
  redirected. Shipped builds call them, and WebSockets don't follow redirects.
- **Left alone for now:** the PostHog proxy, the RevenueCat webhook and the
  OTA update Workers keep their current hosts.
- **The old website** redirects to the matching `witnesswork.app` page with
  301s (§5). That includes the Help Center bundle. The new bundle manifest
  lists absolute URLs, so old app versions resolve it correctly.

### 3. App links

- **Paths:** new links use the apex with readable, full-word paths, never
  abbreviations:
  - `witnesswork.app/accounts/handoff#…`
  - `witnesswork.app/contacts#…`
  - `witnesswork.app/buddies/invite#…`
- **Serving:** ww-api serves these pages and the association files on the
  apex, through exact-path Workers routes. The website Worker serves
  everything else.
- **Old links keep opening the app.** Every build keeps claiming the old host,
  and the old host keeps serving its association files.
- **Rollout:**
  1. The new domain's association files go live several days before release
     N, because Apple and Android fetch them on their own schedule.
  2. Release N claims and reads both hosts, but still creates old-host links.
  3. A later release starts creating new-host links, once about 95% of active
     installs run release N or later.
- **Without the app:** contact and Buddies link pages offer "Continue on the
  web".

### 4. The website moves into this repo

- **`services/`** holds non-app services, with its own pnpm workspace and
  lockfile:
  - **`services/marketing`:** TanStack Start (React). It has the marketing
    pages, privacy, terms, support, the Help Center content, and the bundle
    JSON the app downloads.
  - **`services/help-search`:** the search Worker.
  - ww-api may move in later.
- **The Help Center contract** moves to `docs/help-center.md`. FAQ work now
  happens in this repo.
- **Deploys:** services deploy from CI on merge to `main`. The web app doesn't
  (ADR 0037 §4).

### 5. URL map (301s)

| Old (`leviwilkerson.com`)                      | New (`witnesswork.app`)                                       |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `/witness-work`, `/witness-work/<locale>`      | `/`, `/<locale>`                                              |
| `/witness-work/privacy`, `/witness-work/terms` | `/privacy`, `/terms`                                          |
| `/witness-work/get`                            | `/get` (kept forever, because a printed QR code points to it) |
| `/witness-work/help-center/…`                  | `/help/…`                                                     |
| `/witness-work/help-center/bundle/…`           | `/help/bundle/…`                                              |
| `/witness-work/llms.txt`, `llms-full.txt`      | `/llms.txt`, `/llms-full.txt`                                 |
| `/witness-work/…` (anything else)              | `/…`                                                          |
| `/jw-time`, `www…/witness-work#support`        | `/`, `/support`                                               |

### 6. Store listings

- **App Store:** in release N, every App Store locale's privacy, support and
  marketing URLs point at `witnesswork.app`. This also fixes locales that
  pointed at a third-party policy page, or at a page that no longer exists.
- **Google Play:** the privacy policy and the contact website are updated in
  Play Console.

## Consequences

- One branded home for the app, its website, its links and its passkeys.
- **Two hosts per API forever:** the old one serves shipped builds, and new
  builds use the new one.
- Help Center changes ship from this repo through CI, which supersedes where
  ADR 0033 put the website.
- **The passkey domain is fixed.** Moving the web app later would mean asking
  every User for a new passkey.
