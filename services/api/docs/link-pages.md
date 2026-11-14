# Link pages and association files

What ww-api serves for app links on each host, and what the web app receives
from its "Continue on the web" links. Decided in witness-work ADR 0042
(WitnessWork moves to `witnesswork.app`). Code: `src/linkHosts.ts`,
`src/contactLink.ts`, `src/buddies/invitePage.ts`,
`src/accounts/handoffPage.ts`.

## Hosts

| Host | Worker | Link paths it serves | AASA lists |
| --- | --- | --- | --- |
| `witnesswork.app` | `ww-proxy`, through exact-path routes; the site Worker serves everything else | `/contacts`, `/buddies/invite`, `/accounts/handoff` | the full-word paths only |
| `beta.witnesswork.app` | `ww-proxy-beta`, likewise; the site's Beta Worker serves everything else | the same | the same |
| `ww-proxy.leviwilkerson.com` | `ww-proxy` | the full-word paths, plus the short `/c`, `/c/<payload>`, `/b`, `/h` | the full-word and short paths |
| `api.witnesswork.app`, `api-beta.witnesswork.app` | `ww-proxy` / `ww-proxy-beta` (the whole API) | the same as the old host | the same as the old host |
| `localhost:8787` and the verify loop's ports | a local `wrangler dev --env dev` (development; nothing is deployed for it) | the same as the old host | the same as the old host |

- **The old host stays for good.** It's never redirected, and its short paths
  and AASA never change: links people already sent use them, and every build
  claims that host. iOS decides from the AASA whether a tapped URL opens the
  app, so a redirect wouldn't do.
- **The apex serves full-word paths only.** `/c`, `/c/*`, `/b` and `/h` aren't
  routed there and belong to the site Worker.
- **Apex routes** (`wrangler.toml`, zone `witnesswork.app`):
  - `/.well-known/apple-app-site-association` and
    `/.well-known/assetlinks.json` are exact patterns.
  - The page patterns end in `*` (`witnesswork.app/contacts*`). Cloudflare
    matches a route against the whole URL, query string included, and a
    pattern without `*` matches no URL with a query. So without the `*`,
    `/contacts?lang=es` or a messenger's `?fbclid=` would miss the page.
  - The `*` also catches `/contacts/…` and `/contactsX`. ww-api forwards
    those to the site Worker (same method, headers and body), so the site
    still owns every path but the five. If the site can't be reached, the
    visitor gets an empty 502.
- **Assets on the apex.** A page's `og:url` uses the host it was served on.
  Its images (`og:image`, icons) come from ww-api's own `public/assets/`: on
  the apex, where the site owns `/assets/…`, from the matching API host
  (`https://api.witnesswork.app/assets/og-image.png`; Beta
  `https://api-beta.witnesswork.app`), and the invite and handoff pages' CSP
  allows that host in `img-src`. Everywhere else, from the page's own host.

## Association files

- **`/.well-known/apple-app-site-association`** answers 200,
  `content-type: application/json`, with no redirect. It lists the prod, Beta
  and dev appIDs (`<APPLE_TEAM_ID>.com.leviwilkerson.jwtime`, `…jwtimebeta`,
  `…jwtimedev`).
  - On the apex, its components are `/contacts` with `#` `?*`, and
    `/buddies/invite` and `/accounts/handoff` with `#` `1?*`.
  - Every other host also lists the short `/c` (`#` `?*`), `/c/*`, and `/b`
    and `/h` (`#` `1?*`).
  - There's no `webcredentials` here; `app.witnesswork.app` serves its own.
- **`/.well-known/assetlinks.json`** is a static file
  (`public/.well-known/assetlinks.json`), the same on every host: the
  production package `com.leviwilkerson.jwtime` with its Play signing
  certificates. Development builds aren't in it on any host, so they don't
  verify App Links. Let an emulator open them with
  `adb shell pm set-app-links-user-selection`, as `../../../docs/build.md`
  (the repo root's) says.

## Fragment formats

Each link's data rides in the fragment, which browsers and link previews
never send to a server. So no server sees it: not ww-api, and not the web
app's host. The formats, as the app parses them:

| Link | Fragment | Contents |
| --- | --- | --- |
| Contact (`/contacts`, short `/c`) | `#<payload>` | Unpadded base64url (`[A-Za-z0-9_-]+`) of the gzip-compressed contact export JSON. The whole link stays under 4,000 bytes. |
| Contact, legacy (`/c/<payload>`, old host only) | none | The same payload, in the path. |
| Buddies invite (`/buddies/invite`, short `/b`) | `#1<secret>` | Link version `1`, then 22 base64url characters: a 16-byte secret. |
| Set Up Another Device (`/accounts/handoff`, short `/h`) | `#1<offer>` | Link version `1`, then 86 base64url characters: `channelId` (16 bytes) ‖ `offerPub` (32) ‖ `secret` (16). Another leading digit is a newer link version (the app asks the User to update); anything else is a damaged link. |

## Continue on the web

When the app isn't installed, the contact and Buddies invite pages offer
"Continue on the web" (the handoff page doesn't). The link goes to the web
app's matching route with the same fragment:

| Page | Web app link |
| --- | --- |
| `/contacts#<payload>`, `/c#<payload>` | `<web>/contacts#<payload>` |
| `/c/<payload>` | `<web>/contacts#<payload>` (path payload moved to the fragment) |
| `/buddies/invite#1<secret>`, `/b#1<secret>` | `<web>/buddies/invite#1<secret>` |

- **`<web>`** is the `WEB_APP_ORIGIN` var: `https://beta.app.witnesswork.app`
  on Beta, and the local web app's `http://localhost:8081` on a local
  development worker. In prod it stays unset until the web app is live; the
  launch runbook sets it to `https://app.witnesswork.app`. If it's unset (or
  not https), the link isn't rendered; only a development worker takes an
  `http://localhost` origin.
- **The browser builds the link** from `location.hash`, since the server
  never sees the fragment. It copies the fragment unchanged and shows the link
  only when the fragment is non-empty base64url characters (version digit
  included). With no fragment, the link stays hidden. The legacy `/c/<payload>`
  page renders it on the server, only for a base64url payload.
- **What the web app receives:** a navigation to `/contacts` or
  `/buddies/invite` with no query string. The data is in `location.hash`,
  in the formats above, and the web app parses it itself.

## Open in WitnessWork on the apex

Builds from before the new domain claim only the old host. On a tap, a link to
a different domain opens the app if the app claims it. So on the apex, each
page's open-in-app action works for those builds too:

- **Buddies invite and handoff:** "Open in WitnessWork" goes to the old host's
  short path with the same fragment (`https://ww-proxy.leviwilkerson.com/b#1…`,
  `…/h#1…`). Every shipped build claims and parses those, and any build that
  claims the apex claims the old host as well.
  - It's built from the fragment by a script whose hash is the only one the
    CSP allows.
  - It's not shown on other hosts, where the link would point at the page's
    own host and open no app.
  - The handoff page runs no script on any other host.
- **Beta:** `beta.witnesswork.app` links to the same old prod host. Beta and
  dev builds claim that host too (its AASA lists their appIDs), and the
  fragment is the same whichever build opens it.
- **Contacts:** the page keeps its `witnesswork://import-contact/<payload>`
  link, which every version opens on any host.
- **Copy invite link:** on every host, the invite page's button copies the
  old host's `https://ww-proxy.leviwilkerson.com/b#1…`, the one form every
  build's Enter Invite Link field reads, whichever address the page was
  opened at.
- **Store buttons:** each page keeps them.
