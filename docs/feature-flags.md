# Feature flags

Use `useFeatureFlag('buddies')` from `@/lib/featureFlags` to control feature
visibility. Add future keys to the `FeatureFlag` string union for type-checked
call sites. The app root mounts `useInitializeFeatureFlags()` once; consumers
read a shared Zustand store without making their own flag requests.

Flags fail closed until a fresh online response explicitly returns boolean
`true`. Offline state, loading, missing configuration, unknown flags, and provider
failures all hide the feature. Foregrounding and reconnecting refresh the flags;
effect cleanup ignores responses from a previous connection. SDK disk caches are
never used as a fallback. Analytics and flags share the configured provider
client, but neither calls the other's API.

**Default-on flags** (`DEFAULT_ON_FLAGS` in `src/lib/featureFlags.ts`) invert
that: `useFeatureFlag` returns `true` unless a loaded response for the current
identity returns `false`. Idle, offline, loading, failed loads, a missing flag
and an identity whose values haven't loaded all leave the feature on. Use them
for shipped features where the flag is an off switch for a rollback, not a
gate. Turning one off reaches only devices that load flags, so the backend
keeps its own kill switch. `useFeatureFlagValue` is unchanged (it still returns
`undefined` until values load).

Scribe AI uses the `scribe-ai` flag, default on (create it in PostHog only to
turn Scribe AI off for some or all users; set it to `false`). `useScribeEnabled()`
(`@/hooks/useScribeEnabled`) reads it. It gates every entry point, the Supporter
benefits' Scribe AI perk, the startup status check, attestation preparation and
the Tools section's probes. ww-api's `scribe:enabled` is the
real kill switch: `GET /scribe/v1/status` returning `enabled: false` hides
Scribe AI even with the flag on (`docs/scribe-ai-protocol.md`). Dev builds:
`__WW_DEV__.setFlag('scribe-ai', false)`.

Scribe AI replaced Notes Import, so the app no longer reads the `notes-import`
and `notes-import-android` flags; archive them in PostHog once no supported app
version reads them.

Buddies uses the `buddies` flag (create it in PostHog before rollout; it starts
off). `useBuddiesEnabled()` also requires a binary that ships the
`buddies-keychain` native module, and dev builds can force it on from Tools →
Buddies. The flag gates the Settings row, invite-link handling, calendar
overlays, and the background runtime. The relay enforces its own kill switch
(`buddies:enabled`); see `docs/buddies-protocol.md`.

Shared Cars uses the `shared-cars` flag (create it in PostHog before rollout;
it starts off). It gates the background runtime (`SharedCarsRuntime`), which
also waits for Buddies to be running, since Shared Cars builds on the Buddies
root seed and inbox, and syncs only while an account session exists. The
server's own kill switch is `spaces:enabled`; while it's off every op but
`leave`, `member/remove` and `delete` answers `disabled`, and the app backs off
(see `docs/shared-cars-protocol.md`). Dev builds:
`__WW_DEV__.setFlag('shared-cars', true)`.

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
