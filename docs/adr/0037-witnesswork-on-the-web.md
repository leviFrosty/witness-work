---
status: proposed
---

# WitnessWork on the web

## Context

WitnessWork runs on iOS and Android. Users want to use it from a computer, and
Android Users may not have the native app yet. The app is Expo and React
Native, and a production web export of this codebase already boots with a
handful of shims.

Cloud Sync (ADR 0030) gives every device of an account the same end-to-end
encrypted data through ww-api, so a browser can be one more device.

Related decisions:

- Signing in, passkeys and web sessions: ADR 0038.
- Changing the account key: ADR 0039.
- Free sync and photos: ADR 0040.
- Web purchases: ADR 0041.
- The domain: ADR 0042.
- Session replay: ADR 0043.

## Decision

### 1. A full client, not a companion

The web app is the same app, built with react-native-web from this codebase.
It has every feature:

- Home, Progress, Time Entries, Plans and the schedule;
- Contacts, Visits and Service Reports;
- Scribe AI, the pet, the Map and Route Planning;
- Buddies, backups, imports and exports;
- Settings, including account management.

Nothing is phone-only. A User can create an account on the web, use it, and
later move to a phone (ADR 0038).

Features with no web equivalent are hidden, not shown broken:

- Home Screen widgets and Live Activities;
- Siri and Shortcuts;
- the watch apps;
- alternate app icons;
- iCloud and Google Drive sync;
- the calendar bridge;
- device notifications.

The notifications tray and toasts work on the web. There are no web push or
OS notifications for now. Plans made on the web still remind the User on
their phones, which rebuild reminders from synced records.

It runs in desktop and phone browsers. On phones it shows an Install App
banner (§7).

### 2. Cloud Sync only

The web stores data through Cloud Sync and nothing else. A browser is a Cloud
Sync device with its own slot (ADR 0030 §1). When the account's other devices
aren't on Cloud Sync, the web asks to turn it on (ADR 0040 §5).

### 3. Hosting and environments

Static files on Cloudflare Workers Static Assets, with no server rendering:

- **`app.witnesswork.app`:** production.
- **`beta.app.witnesswork.app`:** beta, against production ww-api, deployed
  with Beta builds.
- **`app-dev.witnesswork.app`:** development, against the dev ww-api.

The Worker only serves files. Its one piece of logic is a real 404 for
missing hashed chunks, so a stale tab reloads once instead of getting
`index.html`.

### 4. Web deploys are releases

A web deploy ships code that runs with every web User's account key. That's
the same risk as a production OTA update, so:

- **Production:** only through the release scripts and skills, at the cut,
  together with ww-api and the production OTA update. It needs the same
  `SHIP-PROD-X.Y.Z` keyword, and the deploy credential needs the same
  1Password approval as the OTA signing key. Never from CI.
- **Beta:** with Beta builds, approved like beta OTA updates.
- **Compatibility:** the web goes live while a native build may still be in
  review. So each web release must work alongside the previous native
  version on the same account, with the same data formats and sync payloads.

### 5. Hardening the origin

The origin holds decrypted data and the account key, so it runs only our own
bundled code:

- **CSP:** strict, rolled out in report-only mode first, plus Trusted Types.
- **No third-party scripts on `app.witnesswork.app`:**
  - PostHog is bundled (ADR 0043).
  - Purchases use RevenueCat's hosted checkout pages (ADR 0041).
  - Apple MapKit JS runs in a sandboxed frame on its own origin (§8).
- **Headers:** HSTS, `nosniff`, `Referrer-Policy: no-referrer` and COOP.
- **No cross-origin isolation:** nothing in the web build needs
  SharedArrayBuffer. MyTime import reads its file in memory.

### 6. Local data and offline

- **Persistence:** stores persist in IndexedDB behind the synchronous
  interface the app uses today. MMKV's web mode would keep them in
  `localStorage`, which is small, shared with other libraries, and easily
  evicted.
- **Until sign-out:** the account key and the session stay in the browser
  (ADR 0038 §8). Signing out wipes the account key, the session and all local
  data.
- **Offline,** like a document editor:
  - A service worker caches the app.
  - Edits save on the device and sync when the connection returns.
  - A banner says "You're offline. Reconnect to sync your changes. They're
    saved on this device until then."
- **Safari's storage limit:** Safari erases a site's storage after 7 days
  without a visit; Home Screen web apps on iPhone are exempt. A Safari User
  then signs in again with their passkey. Unsynced offline edits from before
  then are lost, and the Help Center says so.

### 7. Install App banner on phones

- **iPhone:** Apple's Smart App Banner for the App Store app.
- **Android:** while the Play app isn't public, the banner installs the web
  app to the home screen. Once it's public, the banner points to Play.

Users can dismiss it, and it stays dismissed. There's no banner on desktop.

### 8. Platform pieces with web versions

- **Maps:**
  - Apple MapKit JS runs in a sandboxed frame on `maps.witnesswork.app`
    (`maps-dev.witnesswork.app` for dev). The frame gets only coordinates and
    pin styles by `postMessage`, never names or notes.
  - ww-api mints MapKit JS tokens.
  - Search and directions go through ww-api's HERE routes, including a new
    point-of-interest search.
- **Scribe AI:** text works as on phones. Voice records in the browser and is
  transcribed through ww-api.
- **Photos and files:** photos are picked from files or the camera. Exports
  and backups download as files.
- **UI primitives:** date and time pickers, menus, popovers and tooltips get
  web versions in `src/components/ui/**`.
- **Live sockets:** they authenticate with the access token as a WebSocket
  subprotocol, since browsers can't send headers on a socket (ADR 0038 §10).
- **Loading on demand:**
  - Locales download from the app's own origin when selected, instead of
    being bundled together.
  - Skia's CanvasKit loads only when a screen needs it.
- **Help Center:** the web opens the website's pages (ADR 0042).

### 9. Analytics

The same events, with `platform: 'web'`. Masked session replay runs on the
web only (ADR 0043).

## Considered options

- **A companion with fewer features.** Users who start on the web, and
  Android Users without the app, would hit gaps, and phone-only features
  double the edge cases.
- **Read-only web.** Reading is the exposure, so it removes little risk and
  most of the value.
- **A server-rendered web app.** It adds nothing for an end-to-end encrypted
  client. Static files are simpler to harden and deploy.
- **MapLibre with our own tiles.** More private, and no third-party script
  anywhere, but it loses Apple's look and satellite imagery. We chose MapKit
  JS isolated on its own origin.
- **Deploying the web app from CI.** Web deploys are releases (§4).

## Consequences

- Every User can use WitnessWork in a browser, including Android Users
  without the app.
- A web deploy reaches every web User at once, with no store review. The
  release keyword and the deploy approval are the gate.
- **Exposure:** a compromised deploy or an injected script could read a web
  User's data while the page is open. The strict CSP and keeping third-party
  scripts off the origin reduce that risk. The Help Center says that using
  the web also means trusting WitnessWork's website.
- **Platform checks:** shared code has about 120 `Platform.OS` checks that
  treat everything that isn't Android as iOS. They need a web branch, and new
  code must not assume that web is iOS.
- **Testing:** releases are checked in Chrome, Safari and Firefox, on desktop
  and phone, as well as on iOS and Android.
