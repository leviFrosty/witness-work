---
status: accepted
---

# PostHog automatic surveys and Supporter feedback

## Context

WitnessWork needs improvement feedback from current Supporters and reasons for leaving after paid access ends. Turning off renewal can precede expiration by nearly a year; it must not trigger lapse feedback. The implementation should remain small and rely on PostHog rather than introducing a survey engine or backend.

Future general-purpose surveys must be launchable from PostHog without adding survey IDs to the app or shipping another app release. The SDK's automatic popover provider handles this separately from the two subscription-specific invitations.

## Decision

- The app mounts `PostHogSurveyProvider` inside `PostHogProvider`, reusing the existing client with autocapture disabled. After onboarding, the SDK automatically selects and renders eligible popover campaigns. No survey-ID allowlist applies to this flow; the SDK owns targeting, rendering, responses, and dismissal.
- Both Supporter surveys use dismissible Home cards. Tapping Share feedback opens PostHog's React Native `SurveyModal`; these API campaigns never open automatically. The usual Supporter nudge is hidden while a survey invitation is available.
- Current Supporters qualify after 30 days, using the existing entitlement check without special gift handling.
- Lapse feedback qualifies for 30 days after confirmed subscription expiration (including billing grace). Include recent expirations before rollout. Exclude active subscriptions, refunded subscriptions, free-trial expirations, and revoked gifts. Unknown or pre-expiration customer snapshots do not prove a lapse. Resubscribing removes lapse eligibility.
- RevenueCat refreshes when Home is focused and the app returns to the foreground. This is an in-app invitation; no notifications, email, or backend billing observer.
- PostHog owns question content, translations, responses, campaign start/stop, targeting flags, and recurrence configuration. The two API-type survey IDs are bound in `supporterSurvey.ts`; edit these campaigns in place. Replacing them with different IDs requires updating those constants.
- Use PostHog's default once-per-survey behavior, including dismissal of the modal. The earlier proposed 90-day cooldown is superseded: there is no custom cooldown or cross-device database. The adapter uses PostHog's iteration helpers, existing seen-survey storage (20 entries), and dismissal person properties. Server targeting provides best-effort suppression across devices sharing the account identity; simultaneous/offline devices are not an atomic guarantee.
- All app Languages are eligible. Supporter invitations use PostHog translations matching the app Language when available, otherwise the English base survey. Automatic popovers use the SDK's language detection. Other locale files remain human-approved and untouched.
- Lapse feedback offers one optional main reason followed by optional text, allowing choice-only or text-only feedback. PostHog controls validation; no custom branching/form engine is added.

## Implementation tradeoff

The installed React Native SDK has no public controller for opening one named survey from a custom card. Use its exported `SurveyModal` and public `@posthog/core/surveys` helpers instead of copying question rendering or importing private SDK files. A small adapter handles API-survey availability, show/dismiss events, and seen-state persistence. The modal owns response submission. The full appearance defaults are required by the public modal prop type; remote appearance overrides them.

Survey discovery uses the SDK provider's readiness sequence (`ready`, `_onSurveysReady`, `getSurveys`) in pinned SDK 4.68.0. The underscored readiness method is the one compatibility-sensitive seam to check on SDK upgrades. Survey definitions are cached by the SDK: campaign changes need its normal refresh/relaunch cycle, not instant push delivery. Targeting supports person/feature flags; do not configure web URL/selector or event-trigger conditions for these API campaigns.

Closing either invitation or modal marks the campaign seen. Only explicit SDK submission sends feedback text; dismissal omits partial answers. This intentionally keeps unsent text out of analytics while preserving the default dismissal lifecycle.

## PostHog setup

Project 492895 was verified against the app's configured public project token. Created as drafts, with schedule `once`, English base content, and partial responses disabled:

- [Supporter feedback](https://us.posthog.com/project/492895/surveys/01a0ad7e-5095-0000-99f0-c5fdd5692070): “Thanks for being a Supporter. What would you like added or improved in WitnessWork?”
- [Subscription lapse feedback](https://us.posthog.com/project/492895/surveys/01a0ad7e-6441-0000-1968-9330c879dd5f): “Thanks for supporting WitnessWork. What led your subscription to end?” Reasons cover expenses, low usage, unneeded features, things not working, missing features, temporary support, payment trouble, and Other; followed by optional text.

Launch the drafts when the app build is ready. A draft or stopped campaign produces no invitation. Keep presentation as API; use PostHog's person targeting flags for additional audience restrictions. The existing integration keeps development/production event markers and does not enable touch autocapture or session replay.

### Future automatic surveys

1. Create a survey in the same PostHog project with **Popover** presentation.
2. Configure questions, translations, appearance, audience, and recurrence using features supported by the pinned React Native SDK. Use existing person properties, feature flags, or captured events; web URL/CSS selector targeting is unsupported.
3. Disable partial-response collection so dismissing a survey does not submit unfinished answers.
4. Launch the campaign. Eligible users on a build containing this provider can receive it after onboarding through the SDK's normal fetch/cache cycle. Delivery is not an instant push.

New popover campaign IDs and content do not require an app release. New app events/person properties, custom placements, or SDK features absent from the installed version still require code changes and a release. Keep the two Supporter campaigns in API mode: changing them to Popover would bypass the local RevenueCat eligibility checks.

## Validation

Unit tests cover entitlement timing, cancellation with remaining paid access, billing grace, stale snapshots, refunds, resubscription, SDK dismissal persistence, targeting, and recurrence. Native device presentation still needs a smoke test with launched test campaigns before release: verify a new popover ID appears without an app change, onboarding defers it, dismissal/submission work, and Supporter API campaigns remain tap-to-open. Include presentation while native sheets are open and alongside a Supporter invitation.

## References

- https://posthog.com/docs/surveys/installation/react-native
- https://posthog.com/docs/surveys/sdk-feature-support
- https://posthog.com/docs/surveys/implementing-custom-surveys
- `docs/analytics.md`
