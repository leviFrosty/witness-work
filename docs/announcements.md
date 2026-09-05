# Runtime announcements

WitnessWork displays one informational announcement above the Home profile card.
Tapping it opens a dismissible sheet with native Markdown, uploaded images,
HTTPS/email links, and optionally the existing Levi signature art and name.
The announcement's `dismissible` flag controls the banner's dismiss button; the
detail sheet can always be closed. No announcement blocks app features.

## Authoring and publishing

The sibling `ww-api` repository owns the local rich-text editor, publication-time
Codex/Claude translation, private R2 draft, immutable releases/images, and current
JSON feed. Start `pnpm admin:announcements` there (or append `--dev`) after setting
its environment-specific admin credentials. See that repository's
`docs/announcements-admin.md` and `docs/announcements-api.md` for the workflow,
Cloudflare setup, API contract, and cache behavior. No publishing token is
bundled into the app. Existing human-approved app locale files are untouched;
the separately published announcement content carries its own translations.

The feed is `GET /announcements/current.json`, containing `schemaVersion: 1` and
either one announcement or `announcement: null`. All 18 supported translations
fit in one response; the current app locale selects copy, falling back to
English. Uploaded relative image paths resolve against the same Worker origin.
An optional `EXPO_PUBLIC_ANNOUNCEMENTS_BASE_URL` overrides that origin; otherwise
it follows the Notes Import environment URL, then the production Worker.

Use a stable `id` when correcting an existing item: dismissal persists across
revisions. Create a new ID when everyone should see a new message. Dismissals
and the cache remain on this device, separate from iCloud Sync and backups of
field-service records. The last 100 dismissed IDs are retained.

## Launch behavior

Home takes a snapshot of already-cached content before its first layout. The
network never inserts a banner into the current launch, including when Home is
opened later from another tab or a deep link. A newly downloaded announcement
appears on the **next app launch**. This deliberate delay avoids slow-network
layout shifts without leaving an empty banner placeholder in the UI.

After navigation is ready, `deferUntilNotBlocking` waits for registered startup
work: RevenueCat identification (including cached fallback), account/iCloud
reconciliation, Notes Import availability probes, and App Attest preparation.
It waits for a quiet second, two animation frames, then React Native's
`requestIdleCallback` while the app is foregrounded. New startup work pauses
scheduling. If startup never settles within 30 seconds, optional work is
skipped for this launch. iOS inactivity before fetching pauses scheduling;
backgrounding during a fetch aborts it. There is no polling or retry on resume.

There is at most one request per JavaScript launch, and no request when a
successful cache check is less than six hours old. Conditional requests use
ETags. Requests abort after five seconds. Offline errors, invalid responses,
storage failures, and timeouts are silent. The existing cache remains usable
for at most 24 hours after its last successful check. Start/expiration dates
are checked locally, and stale/expired content is removed while the app stays
open. Only user-requested detail sheets load remote images.

The Worker caches the feed for an hour. Combined with device caching and the
next-launch presentation rule, publication and withdrawal are intentionally
eventual. Use Notes Import's existing availability gate for disabling that
feature; announcements only explain an event and are not an emergency control.

## Native build and validation

`react-native-enriched-markdown` 1.0.2 supports the app's React Native 0.86
Fabric renderer. Math and syntax-highlighting native assets are disabled; plain
informational Markdown does not need them. The sheet respects app text sizing,
theme colors, and native accessibility scaling. URL opening permits only HTTPS
and email; link previews and interactive task-list controls are disabled.

This dependency needs a **new iOS binary**. Do not distribute this change as an
OTA update to an existing binary with the same app-version runtime. Apply the
normal release version bump when preparing the binary; this feature PR does
not cut an App Store release. It cannot run in Expo Go.

The client tests exercise next-launch visibility, dismissal across revisions,
cache expiration, ETag revalidation, withdrawal, schema errors, offline/timeout
behavior, environment isolation, Chinese-script fallback, and safe links. The
scheduler tests exercise asynchronous startup barriers, new work between
frames, foregrounding, cancellation, and hung startup.

Sources: [Expo rich-text guidance](https://docs.expo.dev/guides/editing-richtext/),
[React Native idle scheduling](https://reactnative.dev/docs/global-requestIdleCallback),
[Enriched Markdown compatibility and configuration](https://github.com/software-mansion/enriched-markdown/blob/main/packages/react-native-enriched-markdown/README.md).
