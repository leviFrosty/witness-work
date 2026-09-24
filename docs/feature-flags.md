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

PostHog SDK reference: https://posthog.com/docs/libraries/react-native#feature-flags
