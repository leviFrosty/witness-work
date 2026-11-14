# Universal link pages

Shared contacts (`/contacts#<payload>`), buddy invites (`/buddies/invite#1<secret>`), and Set Up Another Device codes (`/accounts/handoff#1…`) are universal links. Older app versions shared the short `/c`, `/b`, and `/h`, which serve the same pages for good. On iOS, the AASA file routes them into the app. Without the app, the worker serves localized fallback pages that build the "Open app" link client-side, so the payload never reaches the server or link previews.

## Sub-features

- `aasa` returns JSON with three app ids (`<team>.com.leviwilkerson.jwtime`, `…jwtimebeta`, `…jwtimedev`) and seven components: `/contacts#?*`, `/buddies/invite#1?*`, `/accounts/handoff#1?*`, then the short `/c#?*`, `/c/*`, `/b#1?*`, `/h#1?*`.
- `contact-page` serves the `/contacts` (and `/c`) HTML with a hidden `#open-app` link, the `witnesswork://import-contact/` script, and `og:url` set to the path it was served on.
- `contact-locale` localizes `/contacts?lang=es` and `Accept-Language` (`Content-Language` header, `<html lang>`).
- `contact-legacy` makes `/c/<payload>` render an `href="witnesswork://import-contact/<payload>"` that never appears in a meta tag, and escapes non-base64url payloads.
- `invite-page` serves `/buddies/invite` (and `/b`) with a strict CSP (`default-src 'none'`), `X-Robots-Tag: noindex, nofollow`, and `Referrer-Policy: no-referrer`.
- `continue-web` puts a hidden `#continue-web` link (`data-base` = `WEB_APP_ORIGIN` + `/contacts` or `/buddies/invite`) on the contact and invite pages.
- `apex` serves the website apex (`witnesswork.app`, `dev.witnesswork.app`): an AASA with only the three full-word components, and `#open-app` links to the old host's `/b` and `/h` on the invite and handoff pages. Contract: `docs/link-pages.md`.

## How to get to it (user POV)

- Someone taps a shared contact link in Messages. With the app installed, iOS opens it. Without the app, the browser shows the `/contacts` page (`/c` for older links).
- A buddy invite link opens the app, or the `/buddies/invite` page (`/b` for older links) in a browser.
- iOS downloads `/.well-known/apple-app-site-association` when the app is installed or updated.

## Driving it with verify-ww-api

Preconditions:

- `doctor` passes and `URL` is exported.

- **AASA.** Run `curl -si $URL/.well-known/apple-app-site-association`. You get 200 with `content-type: application/json`, the app ids prefixed `VERIFY0000.` (or the real team id when passed), and the seven components.
- **Contact page.** Run `curl -s $URL/contacts | grep -c 'id="open-app"'`, then the same for `$URL/c`. Each prints `1`.
- **Locale.** Run `curl -si "$URL/contacts?lang=es" | grep -i content-language`. The header starts with `es`.
- **Legacy link.** Run `curl -s $URL/c/abc_DEF-123 | grep -o 'witnesswork://import-contact/abc_DEF-123'`. The deep link is printed.
- **Hostile payload.** Run `curl -s "$URL/c/%22%3E%3Cscript%3Ex%3C%2Fscript%3E" | grep -c '<script>x</script>'`. It prints `0`.
- **Invite page.** Run `curl -si $URL/buddies/invite` (and `$URL/b`). You get 200 with a `content-security-policy` that starts `default-src 'none'` and the title `A WitnessWork buddy invite`.
- **Proof.** Run `pnpm test:e2e src/e2e/public.e2e.test.ts -t "universal links"`. All tests pass, with the transcript in `.verify/artifacts/e2e-public-*.json`.

## Gotchas

- Fragments (`#…`) never reach the server, so curl can't exercise the in-page script. Prove the script path with a browser (or the app's verify loop), not curl.
- Without a real `APPLE_TEAM_ID`, the AASA uses the synthetic `VERIFY0000`. It proves shape, not that Apple will accept it.
- Static assets under `public/` (`/assets/*`) are served by the assets binding and bypass the worker.
- `[env.dev]` has no routes, so the local worker takes its host from the request: `$URL/contacts` reports `og:url` `http://127.0.0.1:<port>/contacts` and serves what the old host does (seven AASA components). To see the apex variant over HTTP, send the Beta website's host: `curl -s -H 'Host: beta.witnesswork.app' $URL/.well-known/apple-app-site-association` lists only the three full-word paths, and `curl -s -H 'Host: beta.witnesswork.app' $URL/contacts` reports `og:url` `https://beta.witnesswork.app/contacts` with its images on `https://api-beta.witnesswork.app`. Stay on the five link paths with that header: any other path is forwarded to the real Beta website. The `universal links` e2e covers this, and unit tests in `src/linkHosts.test.ts` cover every host.
- "Continue on the web" points at the local web app (`http://localhost:8081`, `WEB_APP_ORIGIN` in `[env.dev.vars]`): `curl -s $URL/contacts | grep -o 'id="continue-web" data-base="[^"]*"'` prints `http://localhost:8081/contacts`. Only a development worker takes an `http://localhost` origin; Beta's is `https://beta.app.witnesswork.app`, and production's stays unset until the web app is live.
