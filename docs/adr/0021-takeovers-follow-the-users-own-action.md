---
status: accepted
---

# Takeovers follow the User's own action; buddies' news is quiet and lives in the notification bell

## Context

WitnessWork has several moments that take over the screen without being asked for:

- onboarding;
- the update reveal (the Together Update) and What's New;
- the Schedule intro;
- the badge celebration card, the badge history summary, and the "Your badges are here" welcome;
- the Service Streak celebration.

Until now they were coordinated pair by pair. HomeTabStack's `blocked` flag held badges behind the reveal, badges and the streak waited on each other through a handshake, and everything else checked nothing.

A code audit found real overlaps:

- the streak celebration over the profile overlay, the reveal, pushed screens, and the bell;
- the Schedule intro over the reveal when the first launch after an update comes from a Calendar widget;
- a badge card over the Schedule intro or the bell;
- push taps navigating under the reveal, where Android's Back then closes the hidden reveal.

It also found takeovers set off by data the User didn't just create:

- a Plan's day arriving overnight;
- iCloud Sync or Apple Watch and Siri entries;
- a buddy's reply or confirmation;
- streak growth from another device.

Opening the app into a celebration you didn't cause feels abrupt.

Buddies' social news (`badge.new`, `badge.reaction`) arrives as ordinary alerts: a sound, a banner even inside the app, and a red number on the bell and app icon. That is louder than news about a friend should be. The goals, in order: social moments should be fun, engaging, and should not pull anyone out of their day. The research behind this decision, with sources, is in [`docs/research/buddies-social-ux.md`](../research/buddies-social-ux.md).

## Decision

1. **Every badge, streak, and buddy moment gets one interruption tier.** A moment can drop to a quieter tier but never climb.

   | Tier | Surface                    | Gets it                                                                                                                                                                                                                             |
   | ---- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 1    | Full-screen celebration    | The User's own new badge or streak milestone, caused by something they did this session                                                                                                                                             |
   | 2    | In-place card or animation | The User's own badge that arrived without a tap: a dismissible **New badge** card on Home, which opens the badge view. Streak growth from elsewhere: the Home chip flares. A reaction that arrives while that badge is open pops in |
   | 3    | The notification bell      | A buddy's new badge, and a buddy's reaction to the User's badge                                                                                                                                                                     |
   | 4    | Passive push               | The same two, at most one per buddy per 20 hours each. Logistics (invitations, replies, requests, pairing) stay ordinary alerts                                                                                                     |
   | 5    | Silent                     | A buddy's One-time and history badges, more badges from the same buddy within 20 hours, and a buddy's streak growing, pausing, or ending                                                                                            |

2. **The action rule decides Tier 1.** A full-screen celebration plays only if one of these just happened:
   - the User did something in the foreground in this session moments earlier: Add Time, stopping the timer, the shared checkbox, saving a Plan or visit, sending a report, answering Going, or confirming a buddy;
   - the User opened the app from that moment's own notification.

   Anything else drops to Tier 2. The badge is still saved and marked New. Code marks the User's actions, not background paths, so a path someone forgets to mark ends up quiet rather than interrupting.

   One action gets one celebration. When an action reaches a streak milestone and a badge, the streak plays and the badge waits on the Home card, because a badge left over keeps its card and its New mark while a streak's quiet version is only a chip flare. The window is 15 seconds from the action.

3. **One takeover at a time, through a single coordinator.** A shared arbiter owns every takeover:
   - **Order:** onboarding, then the update reveal, What's New, the Schedule intro, celebrations of the User's own action, and last the welcome or history summary.
   - **One at a time:** a takeover that's showing is never interrupted, and there's a short gap between two.
   - **Holds:** while the profile overlay, the bell, a sheet, or a pushed screen is open, or the app is in the background, nothing new takes over.
   - **Push taps and links** wait for onboarding and for any takeover on screen, then run. Leaving the app for another screen never cuts a takeover short.
   - **Sheets** hold through `@/components/ui/Sheet`; a lint rule stops a direct `Sheet` import from Tamagui.

   A new takeover must go through the arbiter. Pair-by-pair handshakes are removed.

4. **The welcome waits for a quieter launch.** The one-time "Your badges are here" screen doesn't follow the update reveal in the same session; it waits for the next launch that has no reveal.

5. **Buddies' news is quiet.**
   - `badge.new` and `badge.reaction` pushes are passive: no sound, the screen doesn't wake, and no banner while the app is open.
   - Pushes never name anyone until a Notification Service Extension can decrypt names on the device.
   - Tapping a push opens the badge it's about, once the relay sends the event's `seq`.

6. **Buddies' news lives in the notification bell, with everything else.** We're not adding a separate feed or a Buddies tab. In the bell, social items:
   - are grouped under "From your buddies", below items that need an answer;
   - never add to the red number on the bell or the app icon;
   - offer Encourage in one tap, and tapping the coin opens the badge view;
   - are pruned after 30 days, like other bell items.

   With no buddies, with Buddies unavailable, or with Show badges off, nothing new appears. Buddies' moments never appear on Home.

7. **Never shown at any tier:**
   - counts of reactions or badges, rankings, or "most active";
   - a buddy's hours or progress;
   - "streak ended" or "hasn't been out";
   - nudges to encourage someone back;
   - read receipts;
   - activity times finer than Today, This week, or Earlier.

## Considered options

- **Keep pair-by-pair coordination:** rejected. Every new takeover has to remember every other one, and the audit found the gaps that causes.
- **Celebrate every new badge and milestone full screen, whatever caused it:** rejected. It interrupts people who were in the middle of something else, and the same streak celebration plays on every device.
- **A Buddies activity feed or tab:** rejected. It adds a destination to check and invites scrolling and comparison, while the news is small and infrequent.
- **A "Recent" section at the top of the Buddies screen**, reached from a rolled-up bell row (the research's recommendation): not chosen, because notifications should live in one place. It stays the fallback if buddies' news crowds the bell.
- **A daily digest push:** deferred. The 20-hour cap per buddy already keeps volume low.

## Consequences

- Celebrations happen less often but mean more. A badge earned on another device, from the Watch, or overnight shows as a New badge card instead of a takeover.
- Passive pushes and the event's `seq` need a relay change, which lands on ww-api `main` before the app half ships. Until then, the app treats the pushes as it does today and opens the bell on tap.
- Android maps passive to a low-importance notification channel for buddies' news.
- Tests prove that no two takeovers overlap, through a seeded random sequence over the arbiter and a render test of HomeTabStack's hosts.
