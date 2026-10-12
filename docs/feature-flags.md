# Feature flags

Use `useFeatureFlag('notes-import')` from `@/lib/featureFlags` to control feature
visibility. Add future keys to the `FeatureFlag` string union for type-checked
call sites. The app root mounts `useInitializeFeatureFlags()` once; consumers
read a shared Zustand store without making their own flag requests.

Flags fail closed until a fresh online response explicitly returns boolean
`true`. Offline state, loading, missing configuration, unknown flags, and provider
failures all hide the feature. Foregrounding and reconnecting refresh the flags;
effect cleanup ignores responses from a previous connection. SDK disk caches are
never used as a fallback. Analytics and flags share the configured provider
client, but neither calls the other's API.

Notes Import uses the `notes-import` flag:
https://us.posthog.com/project/492895/feature_flags/892089
It starts active at 100% rollout. Settings, onboarding, navigation, header actions,
and ready badges use the visibility flag. Automatic availability probes, startup
preparation, and startup/foreground import resumption are skipped while hidden.
The import client and manager do not enforce flags. Server-side access control
remains the backend's responsibility; already-running work is not cancelled.

Buddies uses the `buddies` flag (create it in PostHog before rollout; it starts
off). `useBuddiesEnabled()` also requires a binary that ships the
`buddies-keychain` native module, and dev builds can force it on from Tools →
Buddies. The flag gates the Settings row, invite-link handling, calendar
overlays, and the background runtime. The relay enforces its own kill switch
(`buddies:enabled`); see `docs/buddies-protocol.md`.

## Announcements

The `announcement` flag posts a notice to the Home notifications tray without a
release, for news that can't wait (an outage, a correction). While the flag is
on, its JSON payload becomes one tray item, which bumps the bell's unread count:

```json
{
  "id": "android-us-2026-10",
  "tone": "error",
  "title": { "en": "Android isn't available in the US yet" },
  "body": { "en": "Sorry for the confusion. We'll let you know when it is." },
  "platforms": ["ios", "android"],
  "link": { "url": "https://…", "label": { "en": "Learn more" } }
}
```

- `id` and `title` are required. A dismissal is remembered per `id`, so change
  the `id` to show a new announcement to people who dismissed the last one.
- `tone`: `error` (red), `warn` (amber), or `accent` (default).
- Text is a string, or an object keyed by language (`es`) or locale (`pt-br`)
  with `en` as the fallback. Translate it yourself; the app has no strings for
  it.
- `platforms` (`ios`, `android`) limits where it shows; omit it for both.
- `link` adds a button; only `https` URLs are used.
- Target people with the flag's release conditions. Turning the flag off
  removes the item on the next flag refresh (launch, or returning to the app
  after 10 minutes).
- Dev builds: `__WW_DEV__.setFlag('announcement', true)` and
  `__WW_DEV__.setFlagPayload('announcement', {…})` preview one locally.

The payload is parsed by `parseAnnouncement`
(`src/features/notifications/lib/announcement.ts`); a malformed payload shows
nothing.

PostHog SDK reference: https://posthog.com/docs/libraries/react-native#feature-flags
