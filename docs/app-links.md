# App links

Contact shares, Buddies invites and Set Up Another Device travel as `https` links that open the app (iOS universal links, Android App Links). This page covers their hosts, paths and fragments, which builds claim which host, and how new links move to `witnesswork.app` ([ADR 0042](./adr/0042-witnesswork-app-domain.md) §3).

## Hosts

| Host                         | Serves                                                                                      | Read by             |
| ---------------------------- | ------------------------------------------------------------------------------------------- | ------------------- |
| `ww-proxy.leviwilkerson.com` | ww-api: link pages and association files. The old host, kept forever.                       | every build         |
| `witnesswork.app`            | ww-api on exact-path routes: link pages and association files. The website serves the rest. | release N and later |
| `dev.witnesswork.app`        | the dev ww-api, the same way. The staging website serves the rest.                          | release N and later |

`app.witnesswork.app` is the web app and is never an app-link host.

The hosts and paths live in [`src/constants/appLinks.json`](../src/constants/appLinks.json), and nothing else spells them out. `app.config.ts` builds every claim from it (iOS associated domains, Android intent filters), and [`src/constants/appLinks.ts`](../src/constants/appLinks.ts) reads it for every parser, the link generators, the "own link" check that keeps the app from handing its links back to the system (an Android loop), and the analytics scrubber (`src/lib/shareLinkScrub.ts`), which also covers the web app's host.

## Paths and fragments

The secret or payload is always in the fragment, which browsers and link previews never send to a server.

| Link                  | Old host                                                          | New hosts             | Fragment                                                                                                          |
| --------------------- | ----------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Contact share         | `/c#…`, `/contacts#…`, and `/c/<payload>` from older app versions | `/contacts#…`         | `gzip` + base64url of the contact JSON (`contactShareLink.ts`)                                                    |
| Buddies invite        | `/b#…`, `/buddies/invite#…`                                       | `/buddies/invite#…`   | `1<b64u(secret[16])>` ([buddies-protocol.md](./buddies-protocol.md#invite-link-and-secrets))                      |
| Set Up Another Device | `/h#…`, `/accounts/handoff#…`                                     | `/accounts/handoff#…` | `1<b64u(channelId[16] ‖ offerPub[32] ‖ secret[16])>` ([accounts-protocol.md](./accounts-protocol.md#the-qr-code)) |

- The old host reads its short paths and the full words: ww-api serves both there, and the old host's AASA already lists both, so iOS hands either to the app.
- The new hosts use full words only. The parsers reject `/c`, `/b`, `/h` and `/c/<payload>` there.
- The apex AASA lists exactly those three components, and the Android intent filters match exactly those paths (`path`, not `pathPrefix`; `/c/` is the one prefix, on the old host), so the website's other pages stay in the browser.
- Every build reads `dev.witnesswork.app` links too. Only development builds claim it, but its fragments are as self-contained as the apex's, so pasting or scanning one is harmless.

### How a link is matched

Every parser reads links the same way (`appLinkBasePattern` and `appLinkFragment` in `appLinks.ts`):

- The scheme and host match in any case (`Https://WITNESSWORK.APP/…`; iOS capitalizes pasted text). The path matches exactly, as iOS and Android match it.
- One trailing `/` after the path and a query string before the fragment are ignored.
- The fragment's encoding is exact: base64url, case and all.
- An opened, scanned or typed link must be the whole text, apart from surrounding space. Only pasting into Enter Invite Link (and Android's clipboard read) finds an invite link anywhere in a message. `witnesswork://x?u=https://witnesswork.app/buddies/invite#1…` opens nothing.

The "own link" check (`isOwnAppLink`) reads a URL as the system does, so it covers everything a parser reads and more: anything on the old host, and the claimed paths on the new ones with any port, user name or percent-encoding. It reads the host the way Android does (after the last `@`, before any port, percent-decoded, `ı` read as `i`), and anything on the old host counts before its path is decoded. A link `URL` can't parse (a port out of range) on an app-link host counts too, since Android may still open the app with it. An own link is never handed back to the system, even one no parser reads (a claimed path without its fragment, which Android opens anyway). `src/__tests__/appLinkForms.test.ts` runs every accepted and rejected form through all three.

## What each build claims

| Build            | iOS associated domains                                                                                           | Android `autoVerify` hosts                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| development      | `applinks:ww-proxy.leviwilkerson.com`, `applinks:witnesswork.app`, `applinks:dev.witnesswork.app?mode=developer` | `ww-proxy.leviwilkerson.com`, `witnesswork.app`, `dev.witnesswork.app` |
| beta, production | `applinks:ww-proxy.leviwilkerson.com`, `applinks:witnesswork.app`                                                | `ww-proxy.leviwilkerson.com`, `witnesswork.app`                        |

Each Android host claims the paths it reads from the table above. `?mode=developer` makes a simulator or a device with Associated Domains Development turned on fetch the dev AASA directly instead of through Apple's CDN. Changing a claim is a native change: it needs a new build.

On Android 11 and lower, the app is the default handler only if every `autoVerify` host verifies. A claimed host whose `assetlinks.json` is missing or wrong takes the old host's links out of the app too. Check a device with `adb shell pm get-app-links <package>`; [build.md](./build.md#native-changes) has the emulator commands for development builds.

## Making links: the switch

`CREATE_LINKS_ON_NEW_HOST` in `src/constants/appLinkSwitch.ts` decides where the app makes new links, through `appLinkBase`, which takes no host of its own. Tests flip it by mocking that module with `src/__tests__/helpers/appLinkSwitch.ts`. While it's `false`, the handoff QR code, Buddies invites and contact shares keep making today's old-host links. Set to `true`, they make `https://witnesswork.app/<full-word path>#…` links. It's a constant, not a remote flag: a link made on the apex must only reach builds that read it.

## Rollout

1. The apex association files go live several days before release N, because Apple and Android fetch them on their own schedule.
2. Release N claims and reads both hosts, and still makes old-host links.
3. A later release flips `CREATE_LINKS_ON_NEW_HOST`, once about 95% of active installs run release N or later.

Old links keep working forever: every build keeps claiming and reading the old host, and the old host keeps serving its association files and link pages.

## Without the app

The link pages tell someone without the app to install it. Contact and Buddies pages also offer "Continue on the web", which ww-api's page builds with the same fragment:

- `https://app.witnesswork.app/contacts#…`
- `https://app.witnesswork.app/buddies/invite#…`

The web app's routes read the same fragment the native parsers read. The scrubber redacts fragments on these URLs too, and on every host's links when they're percent-encoded, once or more, inside another URL.
