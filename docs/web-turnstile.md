# The web's Turnstile frame

Cloudflare Turnstile checks that a person is behind web sign-up and recovery-key
sign-in (ADR 0038, [`passkeys-protocol.md`](./passkeys-protocol.md#web-sign-up)).
The app's origin holds decrypted data and the account key, so it runs only our
own bundled code (ADR 0037 §5). Turnstile therefore runs in a sandboxed frame on
an origin of its own, the way the map does ([`web-maps.md`](./web-maps.md#reusing-the-pattern)):
Cloudflare's script never loads in the app's realm, and the frame passes back
only the token.

## Hosts

| Frame env    | Worker           | Host                          | App origins that may frame it                                                  |
| ------------ | ---------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| `beta`       | `ww-verify-beta` | `verify-beta.witnesswork.app` | `https://beta.app.witnesswork.app`, `http://localhost:*`, `http://127.0.0.1:*` |
| `production` | `ww-verify`      | `verify.witnesswork.app`      | `https://app.witnesswork.app`                                                  |

Each web profile names its frame in `config/web-environments.json`
(`verifyOrigin`): `local` and `beta` frame `verify-beta`, `production`
frames `verify`. The app's CSP `frame-src` allows that origin and the maps frame,
nothing else; `script-src` names no host but its own.

The Turnstile widget's hostnames list only the frame's host. ww-api checks that
Siteverify answers it (`TURNSTILE_HOSTNAMES`, `services/api/AGENTS.md`), so a token
solved anywhere else fails with `hostname-mismatch`.

## How it works

- **The URL** carries the widget's site key and the action (`web-signup` or
  `web-recovery`), which are public; nothing else
  (`frameUrl` in `src/lib/turnstileFrame/protocol.ts`).
- **The iframe** (`src/app/web-sign-in/components/Turnstile.tsx`) gets
  `sandbox="allow-scripts allow-same-origin"`, where the frame's origin is its
  own, never the app's, plus `referrerpolicy="no-referrer"` and `allow=""`. A
  reset (`resetKey`) draws a new frame, so the old one is never heard again.
- **No popups, on purpose.** The sandbox leaves out `allow-popups`, so the
  widget's Privacy, Help and Troubleshoot links do nothing; the check itself
  doesn't need them, and a failed check gets the app's own error and Try Again
  (below). If popups are ever needed, add only
  `allow-popups allow-popups-to-escape-sandbox`, never a flag that lets the
  frame navigate the app (`allow-top-navigation…`).
- **The app's bridge** (`src/lib/turnstileFrame/bridge.ts`) sends `init` to
  the frame's exact origin each time it loads. It accepts a message only when
  `event.origin` is the frame's origin, `event.source` is the iframe's own
  window, and the message has the protocol's shape: `{ protocol: 'ww-turnstile',
version: 1, action, type, … }` with exactly the fields its type allows. The
  action must be the one it asked for, and a token must be printable ASCII of
  at most 2,048 characters. It drops everything else.
- **Waiting:** the frame has 15 s from mount to send its first message. Its
  page's `load` doesn't count, since a browser's own error page fires it too.
  Without one, the bridge reports `script`.
- **On screen** (`SecurityCheck`, shared by recovery-key sign-in and sign-up;
  its states in `src/app/web-sign-in/securityCheckState.ts`): "Loading the
  security check…" until the frame's first `ready` or token. A failed or timed
  out check shows "The security check couldn't finish." and one that never
  came up "The security check couldn't load.", each with Try Again, which
  draws a new frame. An expired token draws a new check too. ww-api being
  unreachable (no site key) keeps the screens' own offline or unreachable
  message.
- **The frame** (`web/verify-frame/src`) does nothing as a top window or
  without valid parameters. It takes `init` only from `window.parent` at one of
  its environment's app origins, locks onto that origin, and posts only there,
  never to `*`. Events from before the `init` wait, the latest eight at most.
- **Events:** `ready` once `render` returns a widget id; `token`; `expired`
  (the app clears the token); `timeout` and `error` with `reason: 'check'` (the
  app clears the token and calls `onError('check')`); and `error` with
  `reason: 'script'` when `api.js` didn't load or `render` drew nothing
  (`onError('script')`).

## Headers

`web/verify-frame/src/headers.ts`, written into the frame's `_headers`:
`default-src 'none'`; `script-src 'self' https://challenges.cloudflare.com`;
`style-src 'self'`; `frame-src https://challenges.cloudflare.com`;
`frame-ancestors` set to the app origins above; `base-uri`, `form-action` and
`object-src` set to `'none'`; `Referrer-Policy: no-referrer`; CORP
`same-origin`; every powerful feature off; and no cookies, since it serves
static files only.

## Build and deploy

```bash
pnpm web:build:verify beta                 # web/verify-frame/dist
pnpm web:serve:verify beta --port 8791     # wrangler dev over that build
pnpm web:deploy:verify:beta --dry-run      # the plan, with anything that refuses it
pnpm web:deploy:verify:beta
```

`beta` deploys a clean checkout whose `HEAD` is pushed, so a branch's app half
can be checked against its frame before it lands; the Beta ship deploys it
from `main` (`scripts/build-beta.sh`). It uses wrangler's own login.
`production` needs the typed `SHIP-PROD-<version>` (dry runs too), the tagged
release commit on `origin/main`, and the `WitnessWork web deploy (production)`
token read through the 1Password app. Never `wrangler deploy` by hand.

### Before any production web deploy: prove a real widget on Beta

Cloudflare's test key renders anywhere and ww-api skips the host check for it,
so a local ww-api on the test key proves the plumbing, not the settings below.
The Beta API has no widget yet, so web sign-up and recovery answer `disabled`
there until step 2. Before the first production web deploy that frames a
`verify` host, the owner:

1. **Creates a real Beta widget**: managed mode, hostname
   `verify-beta.witnesswork.app` only. Keep its keys in 1Password.
2. **Sets its keys on the Beta API**: `TURNSTILE_SITE_KEY` in `[env.beta.vars]`
   (with `TURNSTILE_HOSTNAMES = "verify-beta.witnesswork.app"`) and the
   `TURNSTILE_SECRET_KEY` secret (`wrangler secret put … --env beta`), in
   `services/api`.
3. **Passes a check end to end through the frame**: recovery-key sign-in on
   `beta.app.witnesswork.app` in Chromium, Safari and Firefox, with the token
   accepted by ww-api's Siteverify (host and action checked). The frame has no
   report endpoint, so record its CSP violations in the frame itself: in the
   devtools console with the `verify-beta` frame selected, run
   `addEventListener('securitypolicyviolation', (e) => console.log(e.effectiveDirective, e.blockedURI))`
   before the widget loads (or reload the frame), and keep what it logs.
   Cloudflare's Web Analytics beacon (`static.cloudflareinsights.com`), which
   the zone injects, is expected and harmless; anything from
   `challenges.cloudflare.com` isn't.
4. **Checks the settings only a real widget proves**, and changes them if one
   breaks the check:
   - `Referrer-Policy: no-referrer` on the frame and `referrerpolicy` on the
     iframe: a real widget may check the embedding page. If it fails with a
     domain error, set both to `strict-origin` (the origin only, never a path).
   - The sandbox flags reaching Cloudflare's inner frame: a nested frame
     inherits `allow-scripts allow-same-origin` and nothing more. If the
     challenge can't run, find the missing flag in the console; add it only if
     it isn't a popup or top-navigation flag (see "No popups" above).
   - The frame's `Permissions-Policy`, which turns every powerful feature off
     for Cloudflare's frame too. If the console names a blocked feature the
     challenge needs, allow just that one for `https://challenges.cloudflare.com`.

### Production runbook (verify.witnesswork.app)

The owner runs this at the cut of the first release whose web build frames
`verify.witnesswork.app`. Agents never run it.
A build that frames a missing host, or a ww-api that refuses the frame's
tokens, fails web sign-up and recovery-key sign-in. In this order:

1. **The production frame.**
   - Check that `verify.witnesswork.app` has no DNS record of its own; the
     deploy's Workers Custom Domain creates it.
   - Dry run, then deploy, from the tagged release commit:
     `WW_RELEASE_CONFIRM=SHIP-PROD-X.Y.Z pnpm web:deploy:verify:production`.
   - Check: `curl -sI https://verify.witnesswork.app/` shows the CSP with
     `frame-ancestors https://app.witnesswork.app`
     and `Referrer-Policy: no-referrer` (or `strict-origin`, if the Beta check
     above needed it).
2. **ww-api.** Create the production widget (managed mode, the single hostname
   `verify.witnesswork.app`), then set production's `TURNSTILE_SITE_KEY`,
   `TURNSTILE_HOSTNAMES = "verify.witnesswork.app"`, and the
   `TURNSTILE_SECRET_KEY` secret (`services/api/AGENTS.md`). Without the hostnames,
   ww-api keeps web sign-up and recovery off.
3. **The production web deploy.** Then sign in with a recovery key on
   `app.witnesswork.app`.

**Roll back** the frame by deploying the previous release's tag the same way.

## Testing

- Unit tests: the protocol and the app's bridge
  (`src/lib/turnstileFrame/*.test.ts`), the frame's controller, widget and
  headers (`web/verify-frame/src/*.test.ts`), the app's CSP
  (`web/host/src/worker.test.ts`) and the deploy gates
  (`scripts/tests/web-verify.node.mjs`).
- Cloudflare's always-passing test key (`1x00000000000000000000AA`) renders on
  any host and skips ww-api's host check, so it can't show the hostname check
  or the settings above. That needs a real widget (see "Before any production
  web deploy").

## Follow-ups

- `scripts/web-verify.mjs` and `web/verify-frame/src/headers.ts` repeat parts
  of the maps frame's (`scripts/web-maps.mjs`, `web/maps-frame/src/headers.ts`):
  the build, the production gates and the denied-features list. Fold them into
  one shared frame module once both frames have shipped.
