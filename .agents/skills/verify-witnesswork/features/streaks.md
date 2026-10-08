# Service Streaks

A flame and a count show how consistently the User keeps their plans: planned days with any time logged, in a row, or months in service for a publisher. It shows from 3 in Home's header, on the Profile card and in buddies' cards. When yesterday's plan still has no time, the header shows how long is left. Reaching a milestone (3, 5, 10, 15 …) right after the User logs the day plays a full-screen celebration; other kept days, and growth that arrives another way (another device, the Watch, Siri), make the header chip flare (ADR 0021). Schedule opens a short intro on its first visit, and its "?" button opens it again.

## Sub-features

- `streak-chip` shows the count in Home's header, and a countdown once it's about to end. Tapping it opens a short popover: when a day is due, one line naming it with Add Time; always How Streaks Work, which opens the Help Center's Streaks section.
- `streak-celebration` is the milestone overlay, within 15 s of the User logging the day, as a takeover (one at a time; see badges.md).
- `streak-reminder` is the "Your Streak Is About to End" reminder: a tray item, plus a local notification at 6 PM on the last day. Preferences → Plans → Streak Reminders turns it off.
- `streak-profile` is the badge on the Profile card and the overlay's Streak stat ("Plans kept" or "Months in a row").
- `streak-buddies` covers the badge in the Buddies list and on the buddy's detail card, plus Buddies Settings → Streak.
- `schedule-intro` is the 3-page intro (4 where Buddies shows) that ends on Plan a Day.

## How to get to it (user POV)

- Home's header, right of the refresh button, once the streak reaches 3.
- Account menu → Profile.
- Schedule tab, first visit; afterwards, the "?" in Schedule's header.
- Schedule → Buddies, and Buddies → ••• → Buddies Settings.
- Settings → Preferences → Plans.

## Driving it with ww-verify

Preconditions: `wwv seed pioneer`. Its Time Entries are on Tuesdays and Saturdays through yesterday, and it has no past Plans, so it starts with no streak. A seed marks the Schedule intro seen; set `__WW_DEV__.stores.preferences.setState({ scheduleIntroSeen: false })` to see it on the next Schedule visit.

Steps:

- **Build a streak.** Add Day Plans on several past seeded entry days, plus one for yesterday with no time, e.g. `__WW_DEV__.stores.serviceReports.getState().addDayPlan({ id: 'p1', date: new Date(2026, 8, 29, 12), minutes: 120, startTimeInMinutes: 540 })`. Home's header shows the count and, for yesterday's plan, `⏳` and the time left. Its label reads "Streak: N, ends in …".
- **Keep it.** Tap the chip, then Add Time in the popover. Add Time opens prefilled with yesterday and the planned minutes. Submit it. Read back the entry, and see the chip lose its countdown. If N+1 is a milestone, the celebration plays about a second after the save (`analytics` `streak_milestone_reached` has `after_action: true`).
- **Quiet growth.** Grow it without an action, as another device would: add the entry from eval, e.g. `__WW_DEV__.stores.serviceReports.getState().addServiceReport({ id: 'verify-quiet', date: <the due day at noon>, hours: 1, minutes: 0 })`. Even at a milestone, nothing takes over; the chip flares (`__WW_DEV__.stores.streakCelebration.getState().grewAt` updates). Run `__WW_DEV__.noteUserAction()` first and the same write celebrates.
- **Replay the celebration** without new data: `__WW_DEV__.stores.streakCelebration.setState({ celebrating: { count: 10, kind: 'plans' } })`. With no action behind it, it never expires: it waits for its takeover turn (`__WW_DEV__.takeover.state()`), so it plays after any badge card, intro or reveal on screen, and never over the profile overlay, the bell, a sheet or a pushed screen. Record it with `wwv ad record start` / `stop`.
- **Reminder.** Before midnight, with yesterday's plan still unlogged, the bell lists "Your Streak Is About to End" (fired at 6 PM). Logging the day removes it.
- **Intro.** Tap the Schedule tab with `scheduleIntroSeen` false. Swipe or tap Next. Plan a Day opens Plan Day for today and sets `scheduleIntroSeen: true`. On Android, the back button closes it too. It's a takeover: it waits for the update reveal or a celebration on screen, and leaving Schedule before its turn comes takes it back. The "?" in Schedule's header shows it at once.
- **Buddies, for real.** Buddies is iOS-only (its Keychain module), and a worktree gets one iOS device, so the second person is a headless engine. Make it a throwaway vitest file in `src/` that calls `createBuddiesEngine` with `createRelayClient({ baseUrl: <the run's local api url> })`, `getStreak: () => ({ n: 7, until: '2099-12-31' })`, and stores its state in a temp JSON between steps. Create an invite in the app (Buddies → Invite a Buddy → Copy, then `wwv ad clipboard read`). Have the engine `acceptInvite(link)`, then Confirm in the app. Sync and `publishCards()` from the engine. The engine's `buddies[0].streak` is the app's streak, and the app's Buddies list shows 🔥7 after re-entering Buddies. Turning Buddies Settings → Streak off clears the engine's copy on its next sync. Delete the throwaway file.
- **Relay contract.** `BUDDIES_RELAY_URL=<local api url> pnpm exec vitest run relay.interop` includes the streak round trip.

## Gotchas

- The streak is counted per local day. Near midnight, yesterday's plan changes, and a plan two days back with no time breaks the streak. Seed after midnight or plan around it.
- The chip's countdown updates once a minute.
- A celebration only plays once this device has seen the streak before, and only for a day kept yesterday or today. A fresh seed records silently; the next kept day celebrates, if the User logged it (a store write from eval is not an action: call `__WW_DEV__.noteUserAction()` first).
- One celebration per action: when the same save also earns a badge, the streak plays and the badge waits on Home's card (badges.md).
- iPad and Android modals don't expose their accessibility tree to agent-device. Tap the intro's Next and Done, and the popover's buttons, by coordinates from a screenshot.
