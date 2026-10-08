# Buddies social moments: UX research and recommendation

**Status:** research, 2026-10-08. **Decided in [ADR 0021](../adr/0021-takeovers-follow-the-users-own-action.md)**, which adopts the tiers and the action rule but puts buddies' news in the notification bell instead of a Recent section on the Buddies screen. Statements about today's behavior describe the code at the time of writing.
**Question:** how should WitnessWork surface buddies' new badges, Service Streak milestones, Encourage reactions, and possibly plan events, so they are (1) fun, (2) engaging, and (3) don't pull anyone out of their day?

## TL;DR

1. **The full-screen problem is real, but it comes from the User's own badges and streak, not from buddy events.** In today's code, buddy events never open a full-screen view. Several of the User's own takeovers, though, are set off by something they didn't just do: a Plan's day arriving overnight (Ready to Go, Two by Two), a buddy's confirmation or Going reply, time pulled in from the Watch, and, most noticeably, **streak milestones that arrive from Siri or another device**. The streak overlay isn't gated by the "nothing on screen" check that badges use. Buddy news is also noisier than the earlier research recommended: it plays a sound, shows a banner even while the app is open, and adds to the red number on the bell and app icon.
2. **The policy has five tiers:**
   - full-screen celebration
   - in-context card or animation
   - Recent and the bell
   - passive push
   - silent

   One rule decides Tier 1: **a takeover only follows something the User just did in this session.** That means a foreground save or tap moments earlier, or opening the app from that moment's own notification. Everything else drops to a quiet in-place card, and the badge view's full flourish stays one tap away.

3. **Not a feed: a bounded "Recent" section at the top of the Buddies screen** (Schedule → Buddies).
   - It holds the last 30 days, newest first, and ends with "You're all caught up".
   - Encourage is one tap, right in the list, and tapping the coin opens the full badge view.
   - A soft green dot on Schedule's Buddies button and one rolled-up "From your buddies" row in the bell lead there.
   - Neither adds to the red count. No new tab and no Home section.
4. **First slice (about a week, plus half a day in ww-api):**
   - gate own takeovers on a session action, with a Home "New badge" card and a streak chip flare as fallbacks;
   - make `badge.new` and `badge.reaction` pushes passive, with no in-app banner;
   - stop social items from counting toward the red number;
   - make badge pushes and bell rows open the badge itself, with a "New" pill.

   Recent, inline Encourage, and the earner's "Ben and Grace will see it" line come in slice 2. Streak milestones and naming buddies on the lock screen come later.

---

## 0. What happens today (verified in code)

The brief's description is mostly right. Corrections are in bold.

| #   | Claim in the brief                                                                                                                  | What the code does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Where                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | A buddy earning a level sends `badge.new`, and the recipient gets a generic push at most once per buddy per 20 h, plus a tray entry | Correct. **The push is also an _active_ alert with `sound: "default"`, and no `interruption-level` is set.** The earlier research recommended Passive (05-feature-ux §4.1). **While the app is open, it drops a system banner** (and plays sound if in-app audio is on). The tray entry is unread, so **it adds to the bell's red number and to the app icon badge.** It arrives already read only when Badge Alerts is off, the event is a day old, or it's the device's first sync. The earlier research said the app icon count would never include encouragements. | ww-api `src/buddies/push.ts` (`buildBuddiesPayload`); `src/app/initializeApp.ts` (`shouldShowBanner: true`); `src/features/notifications/lib/tray.ts` (`unreadCount`); `src/app/buddies/BuddiesRuntime.tsx` (only already-read entries are `markSeen`) |
| 2   | Tapping the push opens that buddy's page                                                                                            | **Not as built.** The relay sends `ww: { kind }` without `seq` (also true on ww-api `origin/main`), so `openBadgePush(undefined)` returns null and the tap falls back to **opening the bell tray**. Only tapping the tray row opens the buddy's page. The FAQ already says "tap it, or open the notification bell". The same applies to reaction pushes.                                                                                                                                                                                                               | `src/app/notifications/NotificationResponseListener.tsx`; `useBuddyNotifications.tsx` (`openBadgePush`, `openBadgeReactionPush`); `docs/buddies-protocol.md` → Push delivery                                                                           |
| 3   | The buddy's page shows a badge grid under the profile card                                                                          | Correct. **Nothing marks which badge is new.** The new one is first because cards list newest first, but it isn't highlighted, so the arrival has no context.                                                                                                                                                                                                                                                                                                                                                                                                          | `BuddyBadgesSection.tsx`, `sharedBadges.ts` (`withNewBadges`)                                                                                                                                                                                          |
| 4   | Tapping a coin opens the full-screen view with "Encourage <name>" and 6 emoji                                                       | Correct. One reaction per badge; picking another replaces it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `BadgeViewRouteScreen.tsx` → `BadgeReactionBar.tsx`                                                                                                                                                                                                    |
| 5   | Reactions to my badges arrive as a tray entry and a generic push, and show on my badge's view                                       | Correct (same tap caveat as #2). The tray row opens my badge full screen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `useBuddyNotifications.tsx`, `BadgeReactionsReceived.tsx`                                                                                                                                                                                              |
| 6   | Buddy events never open a full-screen view by themselves                                                                            | **Correct.** `BadgeCelebrationOverlay` shows only the User's own evaluation results (`useBadgeSession.celebrations`). Buddy events only add queue entries. The interruption that does reach someone mid-task is the **system banner** from #1.                                                                                                                                                                                                                                                                                                                         | `BadgeCelebrationOverlay.tsx`, `runBadgeEvaluation.ts`                                                                                                                                                                                                 |
| 7a  | My own celebration appears when a buddy accepts my invite (First Buddy)                                                             | **Backwards.** Accepting creates a request that **the inviter confirms with a tap** (`confirmClaim` is only called from `BuddyRequestRow` and `BuddyNotificationRow`), so the inviter's First Buddy follows their own action. The person whose First Buddy comes from someone else is **the invitee**: their buddy turns active when the inviter's `pair.confirmed` arrives (`hasActiveBuddy`, month = current, so it counts as live), possibly hours later, on their next foreground.                                                                                 | `engine.ts` (`confirmClaim`, `applyConfirmation`); `src/lib/badges/evaluate.ts` (`firstBuddy`)                                                                                                                                                         |
| 7b  | …when a buddy answers "Going" (Two by Two)                                                                                          | **Only sometimes.** `buddyTogetherMonths` counts a month only once the Plan's day is today or earlier. A buddy's Going on a **future** Plan earns nothing until **that day arrives**, and then the badge celebrates on the first launch that day. It fires right away (live socket or next foreground) only when the Plan is today or earlier.                                                                                                                                                                                                                         | `src/features/buddies/lib/badgeEvidence.ts`                                                                                                                                                                                                            |
| 7c  | …after an iCloud sync                                                                                                               | **Rarely.** `earnedBadges` syncs in the same payload (`SYNC_MAP_KEYS`). The other device evaluates about 1.5 s after an edit and uploads after 5 s, so its badges usually arrive already recorded and nothing celebrates. A sync celebrates only when the synced records reach a badge that isn't in the payload yet, for example because the other device runs a build without badges or uploaded before it evaluated.                                                                                                                                                | `src/lib/syncPreferencePolicy.ts`; `src/app/sync/iCloudSync.ts` (`PUSH_DEBOUNCE_MS = 5000`); `BadgesRuntime.tsx` (`EVALUATE_DEBOUNCE_MS = 1500`)                                                                                                       |
| 7d  | …overnight (a Plan's day arriving)                                                                                                  | **Correct.** Ready to Go counts "once its day arrives", and `BadgesRuntime` re-evaluates on the first foreground of a new day, so the takeover greets the User on launch.                                                                                                                                                                                                                                                                                                                                                                                              | `badge_prepared_how`; `BadgesRuntime.tsx` (AppState listener)                                                                                                                                                                                          |
| —   | _Not in the brief:_ Watch, Siri, and Shortcuts entries                                                                              | Time logged on the Watch is drained into the phone's store when the app next runs, and its badge celebrates on that launch.                                                                                                                                                                                                                                                                                                                                                                                                                                            | `src/app/watch/watchSync.ts` (`drainInbox`)                                                                                                                                                                                                            |
| —   | _Not in the brief:_ **Service Streak milestones**                                                                                   | `StreakCelebration` explicitly counts growth "from any path (Add Time, the timer, the checkbox, Siri, another device)". It renders through `FullWindowOverlay` **outside** `BadgeCelebrationHost`'s `canShow` gate (tabs focused, no sheet, reveal, or profile overlay), so it can **appear over a sheet or pushed screen** about 0.9 s after synced data lands. `seen` is per device, so a User with an iPad gets it twice. Kingdom Publishers get one every month from 3. This is the takeover that most clearly "comes upon" someone.                               | `src/features/profile/components/StreakCelebration.tsx`; `src/app/navigation/HomeTabStack.tsx`; `src/lib/serviceStreak.ts` (`isStreakMilestone`)                                                                                                       |
| —   | _Not in the brief:_ a buddy's streak milestones                                                                                     | **Not surfaced at all.** The streak only travels as a number on the Buddy Card (`streak: { n, until }`). It shows on the buddy's row and header and disappears after `until`. There's no event, no tray entry, and nothing to react to.                                                                                                                                                                                                                                                                                                                                | `docs/buddies-protocol.md` → Buddy Card plaintext; `BuddyRow.tsx`, `BuddyProfileHeader.tsx`                                                                                                                                                            |

Good guards already exist and should stay:

- A device's first evaluation, imports, and restores are filed as history with one summary.
- More than 4 new badges at once is treated as a bulk change (`MAX_LIVE_AT_ONCE`).
- Badge celebrations wait for `canShow` plus a 700 ms beat.
- One-time Badges are never announced to buddies.
- Badge alerts are limited to one per buddy per 20 h.

---

## 1. Findings: what comparable apps do

Each app ends with what to **borrow** and what to **avoid**. Claims marked _(secondary)_ rest on fan sites or press coverage, not the vendor.

### Strava (feed, Kudos)

- **What it does:**
  - Kudos are a one-tap thumbs-up with no reply possible and can't be taken back. The feed shows the count, and tapping it lists who gave kudos ([Strava](https://support.strava.com/hc/en-us/articles/216918397-What-are-Kudos-Web-)).
  - Kudos, comments, and uploads each have their own push toggle ([Strava](https://support.strava.com/hc/en-us/articles/216918367-Strava-Notifications)).
  - **Mute Activity** keeps a workout off friends' feeds ([DC Rainmaker](https://dcrainmaker.com/2021/09/strava-activity-muting.html)). **Mute athlete** hides someone without telling them ([Strava](https://support.strava.com/hc/en-us/articles/115000173484-Following-Athletes-on-Strava)). **Quick Edit** (2024) lets people hide details right after logging ([Escape Collective](https://escapecollective.com/at-last-stravas-quick-edit-feature-lets-you-tweak-individual-posts/)).
- **What backfired:**
  - The 2017 algorithmic feed drew a sustained #bringbackchronological backlash, and chronological "Latest" returned in 2020 ([DC Rainmaker](https://dcrainmaker.com/2020/03/chronological-ordering-favoriting.html)).
  - Kudos became a reflex: "Kudo All" extensions give kudos to everything in one click ([BikeRadar](https://www.bikeradar.com/news/strava-kudo-all)).
  - In a study of 329 club runners, _seeing_ friends' activity mattered more than receiving kudos in 4 of 5 clubs, and runners drifted toward "kudos-worthy" activities ([Canadian Running](https://runningmagazine.ca/?p=91520)).
  - Competitive runners "felt exposed" when they ran slowly or took downtime ([Marathon Handbook on Russell et al. 2026](https://marathonhandbook.com/does-strava-promote-unhealthy-training-habits/)).
  - The global heatmap exposed military bases and homes ([Help Net Security](https://www.helpnetsecurity.com/2018/01/29/strava-user-heatmap-reveals-patterns-of-life-in-western-military-bases/), [BleepingComputer](https://www.bleepingcomputer.com/news/security/strava-heatmap-feature-can-be-abused-to-find-home-addresses/)).
- **Borrow:** one-tap acknowledgment with no reply needed, chronological order, per-type alert toggles, and silent mute.
- **Avoid:** visible counts (they invite performing for applause), any ranking, and anything that reveals when or where someone was.

### Duolingo (friends feed, Congratulate, Friend Streaks, Friends Quests, nudges)

- **What it does:**
  - The feed lives behind the **bell**. Friends "high-five" or **Congratulate** milestones in one tap ([Duolingo](https://blog.duolingo.com/friends-social-features/)).
  - Friends Quests pair you with a friend for a 5-day shared goal, with prewritten nudges ([Duolingo](https://blog.duolingo.com/friends-quests/)).
  - Friend Streaks (2024) are capped at 5 friends. Users with one are 22% more likely to do their daily lesson ([Duolingo](https://blog.duolingo.com/friend-streak/), [product lessons](https://blog.duolingo.com/product-lessons-friend-streak/)).
  - Badges were redesigned in 2023 because they had been "buried in the profile" ([Duolingo](https://blog.duolingo.com/achievement-badges)).
- **What backfired:**
  - Nudge copy like _"A real friend honors their Friend Streak!"_ puts the lapse on the friendship.
  - Duolingo itself admits people swipe its reminders away "and probably felt a bit guilty" ([Duolingo](https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/)).
  - In August 2026, users reported feeds flooded with strangers' activity ("I block like 10 people a day") ([Explosion](https://www.explosion.com/206325/duolingo-users-are-drowning-in-strangers-activity-feeds/)).
- **Borrow:** Congratulate as one tap on a friend's milestone, prewritten words, mutual pairing, and a cap of 5 (WitnessWork already matches the last two).
- **Avoid:** guilt nudges, shared streaks that break because of the other person, and any feed that grows beyond the people you chose.

### Apple Fitness and Activity Sharing

- **What it does:**
  - Friends get _ordinary, mutable notifications_ when someone closes rings, finishes a workout, or earns an award. Each friend has **Mute Notifications**, **Hide my Activity**, and **Remove Friend** ([Apple](https://support.apple.com/en-sg/guide/watch/apd68a69f5c7)).
  - Replies come from presets, including "smack talk" ([iPhone Life](https://iphonelife.com/content/how-to-compete-friends-apple-watch)).
  - Seven-day competitions send ahead/behind alerts ([Apple](https://support.apple.com/guide/watch/share-activity-apd68a69f5c7/watchos)).
  - The award fireworks play for _you_, on your wrist, when you close a ring. Users report the animation is skipped if you don't look within seconds (anecdotal: [Apple Community](https://discussions.apple.com/thread/252009834)).
- **What backfired:**
  - Ring and streak guilt, for example "The Apple Watch will only ever push you harder" ([Ash Furrow](https://ashfurrow.com/blog/2021-my-year-of-closed-rings/)). Apple answered in watchOS 11 with pausing rings without losing award streaks ([BGR](https://bgr.com/tech/with-watchos-11-pausing-my-activity-rings-wont-make-me-feel-bad-about-myself-anymore/)).
  - Competitions are "a perfect way to fall out with friends" ([Cult of Mac](https://www.cultofmac.com/?p=606710)).
  - In 2025, a "share with friends" prompt interrupted the start of workouts ([Apple Community](https://discussions.apple.com/thread/256066561)).
- **Counter-evidence:** in a 790-person trial, peer _comparison_ raised attendance, while _support-only_ teams did worse than the control group ([Zhang/Centola 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5008041/)). Competition works on average, at a cost this audience rejects. Section 4 covers why that's the right trade.
- **Borrow:** the friend's moment as a plain, mutable notification; celebration on your own device at the moment you finish; per-friend silent mute; warm presets; pausing without loss.
- **Avoid:** competitions, ahead/behind alerts, "smack talk", and sharing prompts that get in the way of the main task.

### Peloton (high fives)

- **What it does:**
  - In class, a high five appears as a **small pop-up at the side of the screen** and doesn't stop the ride ([Peloton](https://www.onepeloton.com/blog/peloton-community-features)).
  - Out of class, high fives collect in a **bell inbox, not pushes**, and Feed Privacy can be "just me" ([Pelobuddy](https://www.pelobuddy.com/?p=18403)).
  - In April 2026 the feed switched to milestones and badges only, and members missed the full chronological feed ([Pelobuddy](https://www.pelobuddy.com/feed-removed-from-web)).
  - In August 2026 Peloton started _pushing_ prompts to high-five a friend's streak _(secondary: [The Clip Out](https://theclipout.com/peloton-out-of-class-high-fives/))_.
- **Borrow:** small in-context acknowledgment and an inbox you check yourself.
- **Avoid:** pushes that ask you to congratulate someone, and milestone-only feeds that make quieter friends invisible.

### Nike Run Club

- **What it does:** cheers are **opt-in** audio that plays _during your own run_ ([9to5Mac](https://9to5mac.com/2018/05/10/custom-audio-cheers-nike/)). Profiles can be set to "Only Me" ([Kaspersky](https://www.kaspersky.com/blog/running-apps-privacy-settings-part3-nike-run-club/52442/)).
- **What backfired:** the 2016 redesign removed trophies and friend challenges, and the app's rating fell from 4.5 to 1.5 ([The Drum](https://www.thedrum.com/news/nikes-redesign-its-popular-running-app-angers-users)).
- **Borrow:** encouragement delivered inside the activity it's about. Treat earned history as untouchable (ADR 0019 already does).
- **Avoid:** live "X just started" broadcasts, which are both a privacy risk and an interruption.

### Snapchat streaks

- **What it does:** 🔥 plus a day count, an ⌛ warning before expiry, paid restores, and a streak freeze in the paid tier ([Snap](https://help.snapchat.com/hc/en-us/articles/7012394193684-What-are-Streaks-and-how-do-I-keep-them), [Social Media Today](https://www.socialmediatoday.com/news/snapchat-will-now-enable-users-to-restore-snap-streaks/644032/)).
- **What backfired:**
  - Research links streaks to problematic phone use ([Van Essen & Van Ouytsel 2023](https://doaj.org/article/7e7e45c958c74b29ba203607b6f4a840)).
  - In a 2026 survey, 51% feel bad when a friend breaks a streak, 25% have paid to restore one, and 42% would remove streaks if they could ([Bits of Freedom](https://www.bitsoffreedom.nl/en/2026/03/10/the-influence-of-snapchats-gamification-features-on-young-people/)).
  - Pennsylvania sued in August 2026 because streaks put "a tangible value on friendships" ([WHYY](https://whyy.org/articles/snapchat-sued-pennsylvania-attorney-general/)).
- **Borrow:** nothing.
- **Avoid:** streaks shared between friends, countdown warnings, loss framing, and paid recovery. The proposal never announces a streak ending.

### BeReal

- **What it does:** one random-time daily alert with a 2-minute window, posts labeled "late", friends' posts locked until you post, and RealMoji reactions ([PetaPixel](https://petapixel.com/bereal-guide/)).
- **What backfired:** the daily ping became a chore, and daily users fell from about 15M to under 6M in five months ([Platformer](https://platformer.news/how-bereal-missed-its-moment)).
- **Borrow:** personal reactions in place of counts, and at most one predictable prompt.
- **Avoid:** urgency windows, "late" labels, and gating what you see on what you contributed.

### GitHub achievements

- **What it does:** launched in 2022 **with an opt-out from day one** ("Show Achievements on my profile"), and later added per-badge hiding ([GitHub](https://github.blog/changelog/2022-06-09-achievements-public-beta/), [docs](https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/manage-visibility-settings-for-private-contributions-and-achievements)).
- **What backfired:** reaction was "mixed… without a clear purpose", people compared it to Candy Crush, and 17–23% hid their badges within six months ([Calefato et al.](https://arxiv.org/html/2303.14702v3)). Badge farming led GitHub to disable earning in its forum ([GitHub](https://github.com/orgs/community/discussions/112973)).
- **Borrow:** opt-out sharing (WitnessWork already has Buddies Settings → Badges).
- **Avoid:** badges that reward volume, which months-based badges already avoid.

### Finch (friends, good vibes)

- **What it does:**
  - Friends pair by code and accept each other.
  - They send **prewritten "good vibes"** with **no chat** and **no visibility into goals or reflections**.
  - People who send vibes can "hang out" with your bird: quiet presence, nothing to do ([bearblog](https://chiltonm.bearblog.dev/everyone-i-know-is-addicted-to-the-bird-app/); _(secondary)_ [FlashGet](https://parental-control.flashget.com/finch-app-is-this-digital-pet-and-productivity-app-worth-it)).
  - Missed days carry no penalty; the bird "stays home" _(secondary)_.
- **Borrow:** small preset warmth, quiet presence, and no penalties.
- **Avoid:** charging for more ways to encourage.

### YouVersion Bible App (faith-based, most relevant)

- **What it does:**
  - Friendships are mutual. **Plans with Friends** has everyone read the same plan and talk it over each day ([APKMirror 8.1.0](https://www.apkmirror.com/apk/life-church/bible/bible-8-1-0-release/)).
  - Streaks, **Perfect Weeks** (consistency from Sunday to Sunday), badges, and "mini-celebrations" at milestones ([Outreach](https://outreachmagazine.com/?p=39061), [Life.Church](https://openblog.life.church/3-best-features-in-the-bible-app-for-pastors-to-know-about/)).
  - **Catch Me Up** resets a plan "rather than constantly being told you are behind" ([The Sweet Setup](https://thesweetsetup.com/?p=10461)).
  - Prayer is private by default and can be shared with friends ([bible.com](https://bible.com/prayer)).
- **Watch out:** a plan group can see **who has or hasn't** completed the day's reading, presented as accountability ([Outreach](https://outreachmagazine.com/?p=39061)).
- **Borrow:** togetherness built around a shared plan, forgiving framing (Catch Me Up, Perfect Weeks), and private-by-default sharing.
- **Avoid:** any roster showing who _hasn't_ done something.

### Hallow (Catholic prayer)

- **What it does:**
  - Sharing toggles per kind of item, with **sensitive collections (grief, infertility, addiction) off by default** ([Hallow](https://help.hallow.com/en/articles/12663633-how-to-manage-sharing-and-activity-settings)).
  - Streaks can be **repaired by honor-system manual entry** ([Hallow](https://help.hallow.com/en/articles/5761398-streaks-prayer-activity-faq)).
  - Prayer intentions expire after 7 days.
- **What backfired:** even a positive 1,000-day account recalls "close calls", including the day his child was born ([NCRegister](https://www.ncregister.com/commentaries/what-i-learned-about-prayer-and-myself-after-1-000-days)).
- **Borrow:** sharing choices per type, sensitive items kept home (as First Bible Study already is in data protection mode), and expiring items.
- **Avoid:** streaks so precious they press on life's big days.

### Headspace buddies

- **What it did:** buddies showed minutes, streaks, and a **success rate**, with "Nudge" and "Congratulate" buttons _(secondary: [Healthline](https://www.healthline.com/health/mental-health/headspace-review))_. Headspace now says buddies "are currently being revisited", and its help center lists no Buddies articles ([Headspace](https://help.headspace.com/hc/en-us/articles/6096184071323-Updated-Profile)).
- **Borrow:** the split between Congratulate and Nudge (keep only Congratulate).
- **Avoid:** comparative stats, and social features added on as an extra and later quietly dropped.

### Habitica parties

- **What it does:** missed dailies damage **the whole party**, even members resting in the Inn ([Habitica wiki](https://habitica.fandom.com/wiki/Rest_in_the_Inn)).
- **What backfired:** in a 2019 study, all 45 users experienced counterproductive effects ([Diefenbach & Müssig](https://epub.ub.uni-muenchen.de/77668)). Public spaces were shut down in 2023 while small parties "flourished" ([Habitica wiki](https://habitica.fandom.com/wiki/Tavern_and_Guild_Shutdown_FAQ)).
- **Borrow:** small private groups.
- **Avoid:** any mechanic where one person's lapse costs a friend.

### Interruption design: principles and evidence

- **Calm technology.**
  - "Technology should require the smallest possible amount of attention." Also: "Communicate information without taking the user out of their environment or task" ([Case](https://calmtech.com/)).
  - Weiser & Brown: calm technology moves "from the periphery of our attention, to the center, and back" ([paper](https://calmtech.com/papers/coming-age-calm-technology.html)).
- **Apple HIG.**
  - Passive is "information people can view at their leisure". Apps should "build trust by accurately representing the urgency of each notification" ([Managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications)).
  - When the app is open, show updates "discoverable but not distracting… such as incrementing a badge or subtly inserting new data into the current view" ([Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications)).
  - "Present content modally only when there's a clear benefit" ([Modality](https://developer.apple.com/design/human-interface-guidelines/modality)).
  - "Match the significance of the information to the way it's delivered" ([Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)).
  - Game Center announces achievements with a **banner**, not a takeover ([GameKit](https://developer.apple.com/documentation/gamekit/rewarding-players-with-achievements)).
  - Only Time Sensitive and Critical break through Focus and Scheduled Summary, so a passive alert waits for the summary.
- **Material Design.** "Dialogs are purposefully interruptive, so they should be used sparingly." Snackbars "shouldn't interrupt the user experience" ([M3 Dialog](https://github.com/material-components/material-components-android/blob/master/docs/components/Dialog.md), [Snackbar](https://github.com/material-components/material-components-android/blob/master/docs/components/Snackbar.md)).
- **Notification fatigue and batching.**
  - Batching notifications three times a day left people "more attentive, productive, in a better mood". Getting _none_ raised anxiety and fear of missing out ([Fitz et al. 2019](https://scholars.duke.edu/publication/1402953)).
  - Without notifications people felt less distracted but "less connected with one's social group" ([Pielot & Rello 2017](https://arxiv.org/abs/1612.02314)).
  - Alerts cost about 10 minutes, plus 10–15 minutes before people returned to their task ([Iqbal & Horvitz 2007](https://www.erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf)). Delivering at task breakpoints reduces that cost ([Iqbal & Bailey 2010](https://www.interruptions.net/literature/Iqbal-TOCHI10.pdf)).
  - At 2–5 pushes a week, 37% would disable notifications _(secondary, self-reported: Localytics 2017)_.
  - Instagram cut digest pushes "substantially… and also saw no decline in user engagement" ([Meta Engineering](https://engineering.fb.com/2022/10/31/ml-applications/instagram-notification-management-machine-learning/)). It also added "You're All Caught Up" as a clear end point ([Instagram](https://about.instagram.com/blog/announcements/introducing-youre-all-caught-up-in-feed)).
- **Motivation and comparison.**
  - Expected, tangible rewards undermine intrinsic motivation, while **positive feedback enhances it** (d = +0.33) ([Deci, Koestner & Ryan 1999](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)).
  - Badges plus a leaderboard lowered motivation over a semester ([Hanus & Fox 2015](https://doi.org/10.1016/j.compedu.2014.08.019)).
  - Highlighting a broken streak lowers further engagement ([Silverman & Barasch 2023](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions)).
  - Upward comparison mediates the self-esteem cost of social feeds ([Vogel et al. 2014](https://doi.org/10.1037/ppm0000047)).
  - Leaderboards ranking recognition _received_ reduced helping ([Gies, The Accounting Review 2026](https://giesbusiness.illinois.edu/news/2026/03/26/peer-to-peer-recognition-leaderboards-givers-vs-receivers)).
  - Platforms should replace variable rewards with "predictable times during the day or week" ([Harris](https://courses.cs.washington.edu/courses/cse481p/23sp/readings/W3S1/how-technology-hijacks-peoples-minds-TristanHarris.pdf)).
- **Delight (NN/g).** Celebrate the _end_ of a process ([peak-end](https://www.nngroup.com/articles/peak-end-rule/)). Delight works only after function ([theory of delight](https://www.nngroup.com/articles/theory-user-delight/)). "Nice the first time, but now it's getting annoying" ([animation](https://www.nngroup.com/articles/animation-usability/)). "Do not use modal dialogs for nonessential information that is not related to the current user flow" ([modals](https://www.nngroup.com/articles/modal-nonmodal-dialog/)).

### What this means for WitnessWork

| Pattern                                                          | Evidence                                                            | Decision                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Celebrate your own moment at the moment you finish               | Apple rings, peak-end rule, Iqbal breakpoints                       | Tier 1 only right after the User's own action                                              |
| A friend's moment is a quiet, mutable notification plus an inbox | Apple Activity Sharing, Peloton bell, Duolingo feed behind the bell | Passive push plus Recent                                                                   |
| One-tap, prewritten encouragement                                | Duolingo Congratulate, Finch good vibes, Peloton high fives         | Keep the six presets, and allow them inline in Recent                                      |
| No counts and no rankings                                        | Strava kudos reflex, Gies 2026, Hanus & Fox                         | Avatars only, never "3 reactions"                                                          |
| A feed that grows or ranks backfires                             | Strava 2017, Duolingo 2026, Peloton 2026                            | Bounded, chronological, 30 days, ends with "caught up"                                     |
| Loss and lapse framing hurts                                     | Snapchat, Silverman & Barasch, Habitica, YouVersion's "who hasn't"  | Never announce a streak ending or inactivity                                               |
| Batch rather than drip, but not zero                             | Fitz 2019, Pielot & Rello                                           | Passive alerts use iOS Scheduled Summary as the digest, with at most one per buddy per day |
| Opt out of sharing and mute silently                             | GitHub, Apple, Strava                                               | Keep the existing switches; add per-buddy "mute badge news" later                          |

---

## 2. Interruption policy

### The rule

> **A full-screen takeover only follows something the User just did in this session.**

"Just did" means one of these:

- **A foreground action** that saves or answers, made moments before the evaluation (about 10 s; tune it). This covers:
  - Add Time, the timer, the shared checkbox;
  - saving a Plan or visit;
  - sending or marking a report;
  - answering Going;
  - tapping Confirm on a buddy request;
  - finishing an Import or a restore (for the history summary).
- **Opening the app from that moment's own notification.** For example, tapping "You're buddies now" and then seeing First Buddy.

Everything else is **arrival**, not action:

- a Plan's day coming;
- data from the Watch, Siri, or iCloud Sync;
- a buddy's reply or confirmation;
- a launch on a new day.

Arrivals take Tier 2 at most. If a code path forgets to mark a user action, the moment still shows as a quiet card. It is never lost and never turns into a surprise takeover.

### Tiers

| Tier                           | What                                                        | Delivery rules                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Full-screen celebration** | `BadgeCelebration` / `StreakCelebrationOverlay`             | Own moments only. Must pass the rule above **and** the existing `canShow` gate (tabs focused, nothing above them, app active). The streak overlay moves behind the same gate. Shown once per moment, on the device where the action happened. |
| **2. In-context, non-modal**   | A card, chip flare, or live animation on the current screen | Dismissible, with no countdown. Shown only on a surface related to the moment (Home for your own badge, the open badge view for a reaction, Buddies for buddy news). No toasts over unrelated screens.                                        |
| **3. Recent and the bell**     | Buddies → Recent section, plus one rolled-up bell row       | 30 days, chronological, ends with "caught up". Social items **never count toward the bell's red number or the app icon badge**; they show a soft accent dot instead.                                                                          |
| **4. Passive push**            | APNs `interruption-level: passive`, no sound                | At most one per buddy per 20 h per kind (as today). No banner while the app is open. Generic text until a Notification Service Extension can decrypt names. Eligible for Scheduled Summary.                                                   |
| **5. Silent**                  | Data only                                                   | Shows wherever the User looks next.                                                                                                                                                                                                           |

### Moment → tier

**The User's own moments**

| Moment                                                                | Tier                                                             | Notes                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| New badge level caused by a session action (one, or up to 4 together) | **1**                                                            | As today. In slice 2, add "Ben and Grace will see it" when badge sharing is on and there's at least one active buddy. |
| First Buddy, as the inviter, after tapping Confirm                    | **1**                                                            | It's their tap. Shows once they're back on the tabs.                                                                  |
| First Buddy, as the invitee, when the confirmation arrives            | **2**, or **1** if they opened the app from "You're buddies now" | Today it's a takeover on whatever launch follows.                                                                     |
| Ready to Go or Two by Two counted because a Plan's day arrived        | **2**                                                            | Home "New badge" card. Today: takeover on launch.                                                                     |
| Two by Two because a buddy answered Going to today's Plan             | **2**                                                            | Today it can pop up mid-session over Home.                                                                            |
| Badges from Watch, Siri, Shortcuts, or iCloud Sync data               | **2**                                                            |                                                                                                                       |
| History found by an Import or restore run this session                | **1** (one summary, as today)                                    | The summary follows the User's own import.                                                                            |
| A device's first evaluation ("Your badges are here")                  | **1** once per device, as today                                  | It's the feature introduction, gated like a Reveal.                                                                   |
| Streak milestone from a session action                                | **1**                                                            | Move behind `canShow` so it never covers a sheet.                                                                     |
| Streak growth from Siri, another device, or the Watch                 | **2**                                                            | The Home chip flares (the existing `grewAt` path). No overlay, and no second playback on an iPad.                     |
| Streak grew between milestones                                        | **2**                                                            | Chip flare, as today.                                                                                                 |
| A buddy reacted to my badge (first per buddy in 20 h)                 | **4 + 3**                                                        | **2** if that badge is open: the reaction pops in.                                                                    |
| More reactions from the same buddy within 20 h                        | **3**                                                            | As today (`push: false`).                                                                                             |
| "Sent to Anna" after I react                                          | **2**                                                            | Inline confirmation in the badge view or Recent row.                                                                  |

**Buddies' moments**

| Moment                                                                           | Tier              | Notes                                                     |
| -------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| A buddy's new Badge Collection level, earned live (first per buddy in 20 h)      | **4 + 3**         | **2** if the Buddies screen or that buddy's page is open. |
| More badge news from the same buddy within 20 h                                  | **3**             | As today.                                                 |
| A buddy's One-time Badge (First Bible Study, First Buddy)                        | **5**             | Card only. Never announced (unchanged).                   |
| Badges found in a buddy's history (import or restore)                            | **5**             | Card only (unchanged).                                    |
| A buddy's Service Streak reaches 10, 25, 50, 100… (plans) or 6, 12, 24… (months) | **3** _(slice 3)_ | Derived from Buddy Card diffs. Never pushed.              |
| A buddy's streak grows otherwise                                                 | **5**             | The number on their row updates.                          |
| A buddy's streak ends, they pause sharing, turn badges off, or leave             | **5**             | Never announced.                                          |

**Plan events**

| Moment                                                                    | Tier                           | Notes                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Invitation, change, cancellation, reply, request to join, pairing         | Active push + bell "Needs you" | **Unchanged.** These are logistics, not social moments. Ideally only items still awaiting an answer count toward the app icon (§6.5 of the recommendations). |
| Both planning the same day                                                | **5** (calendar markers)       | As today. No push.                                                                                                                                           |
| "Saturday with Anna": a shared Plan's day passed and the User logged time | **3** _(slice 3, opt-in)_      | Says only what the User did. Never claims the buddy went.                                                                                                    |

**Never, at any tier:**

- counts (reactions, badges);
- rankings or "most active";
- hours or progress on a buddy's badge;
- "streak ended", "hasn't been out", or "fell behind";
- nudges to encourage back;
- read receipts for reactions;
- timestamps finer than "Today / Yesterday / This week / Earlier".

### Volume budget

- Most months the badge ladder moves a collection at most one step. After a new user's first burst of Bronzes (sent as one event), a buddy produces roughly 6–10 news events a year.
- With 3 buddies plus reactions, that's about one passive alert a week. That sits below the 2–5 a week where opt-outs climb, and passive alerts don't make a sound.
- Streak milestones would multiply volume (Plan streaks reach 3, 5, 10 within weeks), which is why they never push.

---

## 3. Recommended UX flow

### 3.1 Where buddy news lives: feed, section, digest, or tray?

| Option                                     | Fun | Engaging | Calm | Fit                                                                                                                                                                                                      | Verdict                                             |
| ------------------------------------------ | --- | -------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **New "Buddies" tab with a feed**          | ✓   | ✓✓       | ✗    | Breaks "no new tab" and "no feeds" (recommendations §1, §6.6). Reads as social media. Mostly empty given the volume above.                                                                               | No                                                  |
| **Section on Home**                        | ✓   | ✓✓       | ✗    | Home is where people log time and send reports; the brief's concern is exactly this. Clutters the Home of the many Users with zero buddies.                                                              | No                                                  |
| **Folded into the bell, as today**         | –   | ✓        | ~    | The bell is a to-do list (report due, backups, invitations). Celebrations there read as chores and raise the red number.                                                                                 | Keep as an _entry point_ only                       |
| **Daily or weekly digest push**            | –   | ✓        | ✓    | The relay can't time pushes to the User's time zone without learning more, and the app can't reliably run in the background. iOS Scheduled Summary already batches passive alerts for people who use it. | Use the OS. A local weekly recap card later, maybe. |
| **"Recent" section on the Buddies screen** | ✓✓  | ✓        | ✓✓   | Lives where buddies already are (Schedule → Buddies), bounded and chronological, ends with "caught up", stays local and E2E.                                                                             | **Yes**                                             |

**Name it "Recent", not "feed" or "activity".** "Feed" is on the anti-feature list. "Activity" is reserved for the planned opt-in _Activity sharing_ (§6.4).

### 3.2 The buddy who earns it (Anna)

```text
Anna logs Saturday's time (Add Time → Save)
  │  session action ✓  → evaluation finds Year Round, Gold (live)
  ▼
┌──────────────────────────────┐   Tier 1, as today, after Add Time closes
│        ( gold medallion )    │
│          NEW BADGE           │
│       Year Round, Gold       │
│ Shared in at least 10 months │
│      of 5 service years      │
│  (B)(G) Ben and Grace will   │   ← new (slice 2), only with badge sharing on
│          see it              │      and at least one active buddy
│          [ Done ]            │
│        See all badges        │
└──────────────────────────────┘
  │  behind the scenes: one badge.new event per buddy (unchanged)
  ▼
Hours later, Ben reacts 👏
  • Lock screen: passive "A buddy reacted to your badge" (no sound)
  • Bell: "From your buddies · Ben reacted 👏 to your badge · Year Round, Gold"
    (soft dot, no red count) → opens Recent
  • Recent row → Anna's own badge view → "From your buddies" (B👏)(G🎉)
  • If Anna has that badge open when it arrives, Ben's avatar pops in (Tier 2)
  • Slice 2: a tiny emoji bubble on that coin in her profile until she looks
```

What the earner never sees: how many buddies looked, who didn't react, or any "thank them back" prompt.

### 3.3 The friend who sees it (Ben)

**Entry points**, from most to least common:

1. **Passive push** (if Badge Alerts is on): "A buddy has a new badge". Tapping it opens **that badge's view** once the relay sends `seq`, and **Buddies → Recent** until then. It no longer opens the bell.
2. **Schedule → Buddies button**, with a soft green dot while Recent has unseen items. The red dot stays reserved for requests to confirm.
3. **Bell**: one rolled-up row, "From your buddies", showing the newest item plus "and N more". It opens Recent and adds nothing to the red count.
4. **The buddy's page** (from the Buddies list): badges announced since Ben last looked wear a thin **New** ring.

**Recent** sits at the top of the Buddies screen above the buddies list. It shows only when there's something from the last 30 days, and is hidden with zero buddies or with badges off:

```text
‹ Schedule            Buddies                 (⋯) (+)
RECENT                                    Last 30 days
┌────────────────────────────────────────────────────┐
│•(A) Anna has a new badge                   (gold)  │
│     Year Round, Gold · Today                       │
│     [🎉][🎊][🔥][👏][👍][🙌]   ← Encourage inline  │
├────────────────────────────────────────────────────┤
│•(G) Grace reacted 🙌 to your badge        (silver) │
│     Kind Words, Silver · Yesterday                 │
├────────────────────────────────────────────────────┤
│ (T) Tomás has 2 new badges                (silver) │
│     Ready to Go, Silver and 1 more · This week     │
│     ✓ You sent 🎉                                  │
├────────────────────────────────────────────────────┤
│            You're all caught up                    │
│       Older news clears after 30 days.             │
└────────────────────────────────────────────────────┘
BUDDIES                                         3 of 5
 (A) Anna · Regular pioneer since 2019         🔥14  ›
 ...
```

- **Order:** chronological only, never by buddy or by "how notable". Show 3 rows, then "Show all (N)" for the rest of the 30 days.
- **Rows are built from the existing notification queue** (`badge` and `badgeReaction` entries, already kept 30 days and holding references only), so slice 2 needs no new storage.
- **Inline Encourage** applies to the row's lead badge. Choosing again replaces it, as in the badge view. A batched "2 new badges" row encourages the lead badge; the others are a tap away.
- **Tapping the medallion or row** opens the full-screen badge view, with the coin flipping out of the row's medallion (`origin`), as it already does from the buddy page.
- **Live:** an item that arrives while Buddies is open slides in (Tier 2).

**Badge view arrival context** (a buddy's badge):

- A small **New** pill above the coin while the badge is unseen. No dates and no "earned this week": the card deliberately carries no dates.
- The existing "Anna's badge" chip, title, level, description, and **Encourage Anna** row.
- Never the User's own progress on the same collection, and no "you have this too".
- After a tap: the chip pops (as today), a brief "Sent to Anna" pill appears, and the selection stays highlighted.

**Encourage, in one sentence:** a one-tap preset in Recent or the badge view, at most one per badge, visible only to the owner. It's never counted and never asked for.

### 3.4 Own badges that weren't caused by a session action

```text
Good morning, Ben                         🔥10 (flaring)  🔔·
┌────────────────────────────────────────────────────────┐
│ (silver)  NEW BADGE                       [ View ]  ✕  │
│           Ready to Go, Silver                          │
└────────────────────────────────────────────────────────┘
TODAY  Plan · 9:00 – 11:30 with Anna
...
```

- Show **one card at most** (several become "Ready to Go, Silver and 1 more"). It sits at the top of Home's content and is dismissible.
- It uses the existing `badgesSeenAt` / `isNewBadge` "new" marking, so dismissing it or opening the badge marks it seen.
- **View** opens the badge full screen with its flip and light sweep, so the delight is still there, but by the User's choice. Optionally add the small confetti burst there, since the User asked for it.
- For the streak, the Home chip flares with a light haptic (the existing `grewAt` path). The milestone number is already on the chip.

### 3.5 Zero buddies, Android, badges off

- **Zero buddies:** no Recent, no bell row, no dots. The celebration leaves out the "will see it" line. **Never** prompt "invite buddies to see this" on a celebration or on Home. Many Users keep the app private.
- **Android:** Buddies isn't there yet. Own celebrations follow the same rule, including the streak gate.
- **Show badges off:** no badge news anywhere (as today). **Buddies Settings → Badges off:** the earner's line disappears and nothing is announced (as today).

### 3.6 Proposed copy (en-US; other locales at the release cut)

| Key idea               | Text                                                                           |
| ---------------------- | ------------------------------------------------------------------------------ |
| Recent header          | Recent                                                                         |
| Recent footer          | Older news clears after 30 days.                                               |
| Empty end              | You're all caught up _(reuse `notifications_emptyTitle`)_                      |
| Buddy badge row        | {{name}} has a new badge _(reuse `buddies_notifBadge`)_ · {{badge}} · {{when}} |
| Reaction row           | {{name}} reacted {{emoji}} to your badge                                       |
| Sent state             | You sent {{emoji}}                                                             |
| Toast                  | Sent to {{name}}                                                               |
| New pill               | New                                                                            |
| Earner line            | {{names}} will see it / Your buddies will see it (3 or more)                   |
| Bell roll-up           | From your buddies                                                              |
| Quiet card             | New badge · {{badge}} · View                                                   |
| Streak row _(slice 3)_ | {{name}}'s streak reached {{count}}                                            |

Avoid "achievement", "award", "trophy", "unlocked", "level up", "rank", and "feed". Never use the sparkle emoji (it means AI here) or the red heart (Donor). Keep the six shipped reactions; don't add 🙏 (a religious gesture) or a heart.

---

## 4. What not to do, and the risks

- **Comparison.**
  - Never total, count, or rank: no "Anna has 14 badges", "3 reactions", or "most encouraging buddy".
  - Never show a buddy's progress or locked badges (ADR 0019 already forbids it).
  - Never sort Recent by importance or put a "highlight" first. Gold or Pearl news must look like any other row.
  - Don't show "you have this too" or "you're 2 months away" on a buddy's badge view.
  - Months-based badges keep non-pioneers equal, and the presentation must too.
- **Guilt.**
  - No nudges (Duolingo, Headspace), no "encourage back" prompts, no "you haven't encouraged Anna".
  - Never mention a lapsed streak, a buddy who's gone quiet, or a Plan nobody joined (recommendations §4.6).
  - No streaks of encouraging.
  - Don't tell the sender whether their reaction was seen.
- **Spam.**
  - Keep the 1-per-buddy-per-20 h alert rule and passive delivery.
  - Social items must never raise the red number.
  - Don't push streak milestones.
  - Peloton-style "high-five your friend" pushes are out.
  - Don't use the daily evaluation as a reason to notify.
- **Takeovers.**
  - No full-screen view on launch for something that happened while the app was closed.
  - None from another device, and none over a sheet.
  - Repeated celebrations get shorter. Plan-streak milestones are already sparse, so keep the ladder sparse.
- **Privacy: what Recent reveals.**
  - Recent shows only what the Buddy Card and badge events already carry. But a list _with timing_ tells Ben roughly when Anna was active. A badge arriving Sunday at 9 pm says she logged time Sunday evening.
  - So use coarse buckets ("Today / This week / Earlier") and no clock times.
  - Prune at 30 days, matching the relay's event retention and the tray.
  - Store references only, as the queue does today. Keep it out of iCloud Sync.
  - Removing a buddy purges their rows (the existing queue cleanup).
  - Streak milestone rows (slice 3) only for buddies with streak sharing on, and never "ended".
  - First Bible Study stays home in data protection mode (unchanged).
- **E2E and relay limits.**
  - The relay stores push templates, so **lock-screen text can't name the buddy** without a Notification Service Extension that decrypts the event. Generic wording stays until then.
  - The relay drops (doesn't defer) alerts inside the 60 s spacing and over 10 per slot per day. The client must keep social alerts rare and spaced, as `badge.new` and `badge.reaction` already do.
  - The relay can't time a digest to the User's time zone without learning that zone. Leave batching to iOS Scheduled Summary.
  - The relay currently sends no `seq`, so taps can't target an event.
  - The template set is limited to 32 per device, and up to 16 are used today.
- **Cultural.**
  - Keep the tone upbuilding: "Encourage", not "like".
  - No "magic" wording or imagery.
  - The 🔥 reaction and the flame streak icon share a symbol. That's fine, but don't add fire-themed streak copy for buddies.
- **A tension to name.** Research shows competition and comparison raise activity more than support does ([Zhang/Centola 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5008041/)). The product chooses encouragement anyway (Gal. 6:4; Heb. 10:24, 25). Success should be measured by encouragement and retention, not hours.

---

## 5. Phased build plan

Effort is in rough developer-days for someone who knows the codebase, including tests and i18n. Ship ww-api first for anything touching the relay (release rule).

### Slice 1: fix the abruptness and the noise (about 5 days app, 0.5 day ww-api)

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Where                                                                                                                                     | Effort     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | **Session-action clock.** A tiny store with `markUserAction()` and `lastUserActionAt`. Call it from the save and answer paths: Add Time, timer, checkbox, Plan save, visit save, report sent or marked, share answer, `confirmClaim`, import and restore finish. Also mark when the app opens from a moment's own push (`pair.confirmed`).                                                                                                                                                                                                                                        | `src/stores/` (shared), call sites in features                                                                                            | 1          |
| 2   | **Gate badge takeovers.** `runBadgeEvaluation` tags live badges `full` when `lastUserActionAt` is within about 10 s and the app has been active since. Otherwise it records them as new without queuing a celebration. A Home **`BadgeArrivalCard`** shows unseen live badges that weren't celebrated (one card, "and N more", View or ✕), using `badgesSeenAt`.                                                                                                                                                                                                                  | `src/app/badges/runBadgeEvaluation.ts`, `src/stores/badgeSession.ts`, new `features/badges/components/BadgeArrivalCard.tsx`, Home section | 1.5        |
| 3   | **Gate the streak overlay.** Play the milestone overlay only with a recent session action **and** the same `canShow` gate as badges (move the mount behind `BadgeCelebrationHost`'s conditions). Otherwise take the existing chip-flare path (`grewAt`).                                                                                                                                                                                                                                                                                                                          | `StreakCelebration.tsx`, `HomeTabStack.tsx`                                                                                               | 0.5        |
| 4   | **Passive social pushes.** In ww-api, accept an optional per-template `passive: true` in `device/register` and send `interruption-level: passive` with no `sound`. Optionally use `thread-id: buddies-social` so social alerts stack apart from logistics. The app registers `badge.new` and `badge.reaction` with `passive: true`. This is backward compatible: today's relay copies only `title` and `body`, so the extra field is ignored until deployed. _(Alternative: a kind → level map in the relay, which needs no protocol change but hard-codes app semantics there.)_ | ww-api `src/buddies/contracts.ts`, `push.ts`, inbox DO template storage; app `pushRegistration.ts`; `docs/buddies-protocol.md`            | 0.5 + 0.5  |
| 5   | **No in-app banner for social kinds.** `setNotificationHandler` returns `shouldShowBanner: false` and `shouldPlaySound: false` when `ww.kind` is `badge.new` or `badge.reaction`. The live socket already refreshes the bell.                                                                                                                                                                                                                                                                                                                                                     | `src/app/initializeApp.ts`                                                                                                                | 0.25       |
| 6   | **Social items don't count.** Add `counts?: boolean` (or `social: true`) to `NotificationItem`. `unreadCount` and the app icon badge skip it, and the bell shows a soft accent dot when only social items are unread.                                                                                                                                                                                                                                                                                                                                                             | `src/types/notifications.ts`, `features/notifications/lib/tray.ts`, `NotificationsTray.tsx`, `useBuddyNotifications.tsx`                  | 0.5        |
| 7   | **Taps land on the badge.** ww-api sends `ww.seq` (already in the contract, not built). The app routes a `badge.new` push to that badge's view (owner = buddy), and a reaction push to the User's own badge (already coded behind `seq`). Until the relay ships `seq`, route these kinds to Buddies instead of the tray. The **tray row** for a buddy's badge opens the badge view directly with a **New** pill (new `BadgeView` param `arrival: 'news'`).                                                                                                                        | ww-api `push.ts`; `NotificationResponseListener.tsx`; `useBuddyNotifications.tsx`; `BadgeViewScreen.tsx`                                  | 0.5 + 0.25 |
| 8   | **FAQ and docs.** Update `faq_badgesBuddies_a` (quiet alerts and where they open), `faq_badgesOverview_a` (celebrations follow what you do; otherwise a New badge card), `faq_streaks_a` (growth from other devices flares the chip), `docs/analytics.md`, and `docs/buddies-protocol.md` (template `passive`, `seq`).                                                                                                                                                                                                                                                            | `src/locales/en-US.json`, `faqs.ts`, docs                                                                                                 | 0.5        |

**Analytics (slice 1), proportional and with no PII:**

- `badge_earned`: add `presentation: 'full' | 'quiet'`. Answers how often the gate downgrades.
- `badge_arrival_card_closed` (`action: 'view' | 'dismiss'`): once per card. Answers whether quiet arrivals still get seen.
- `streak_milestone_reached`: add `presentation: 'full' | 'chip'`.
- `notification_opened`: add a bounded `push_kind: 'badge_new' | 'badge_reaction' | 'logistics'`. Today every Buddies push is `kind: 'buddies'`, so social open rates can't be told apart.

### Slice 2: Recent, inline Encourage, and the earner's loop (about 6–8 days app)

| #   | Change                                                                                                                                                                                                                                                                              | Effort |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Recent** section on `BuddiesScreen`, built from the queue's `badge` and `badgeReaction` entries: coarse buckets, 3 rows plus "Show all", ends with "caught up", hidden with no buddies or badges off. Opening the screen marks items seen, which clears the dot and the bell row. | 2.5    |
| 2   | **Inline Encourage** in Recent rows, reusing `BadgeReactionBar`'s logic (smaller chips, "You sent 👏" state).                                                                                                                                                                       | 1      |
| 3   | **Soft dot** on Schedule's Buddies button for unseen Recent items (accent color; the red dot stays for requests).                                                                                                                                                                   | 0.5    |
| 4   | **Bell roll-up**: social entries collapse into one "From your buddies" row that opens Recent. Logistics rows are unchanged.                                                                                                                                                         | 1      |
| 5   | **New ring** on a buddy's page for badges announced since the User last viewed that buddy (per-buddy "seen" stamp).                                                                                                                                                                 | 0.5    |
| 6   | **Earner line** on `BadgeCelebration`: "Ben and Grace will see it" (avatars, names as the User sees them, only with sharing on and active buddies).                                                                                                                                 | 0.5    |
| 7   | Own profile coins get a tiny emoji bubble for unseen reactions; a reaction arriving while the badge view is open pops in.                                                                                                                                                           | 1      |
| 8   | New FAQ entry `buddiesRecent` (what Recent shows, 30 days, what buddies see, how to stop alerts, Android availability); update `faq_buddiesOverview_a`.                                                                                                                             | 0.5    |

**Analytics (slice 2):**

- `badge_reaction_sent`: add `source: 'recent' | 'badge_view'`. Answers whether inline Encourage increases encouragement.
- `buddies_opened`: add sources `push`, `bell`, and `has_news: boolean`. Answers whether news brings people into Buddies.
- No per-row view events: they'd be noisy and wouldn't answer a product question.

No protocol or relay change.

### Slice 3: richer and opt-in, after slices 1–2 prove themselves (multi-week)

| Idea                                                                    | Protocol and relay                                                                                                                                                                                                                                                                              | Effort | Notes                                                                                                                         |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Buddy streak milestones in Recent**                                   | None. Derived on the receiver from Buddy Card diffs (`streak.n` crossing 10, 25, 50, 100… from a known previous value, not from "absent" to a number).                                                                                                                                          | 2      | Never pushed and never "ended". Copy works for both plans and months ("streak reached 10"), since the card doesn't say which. |
| **Encourage on streak milestones**                                      | New event kind, e.g. `streak.reaction` `{ v, n, e, rev }`. No relay change (kinds are free-form). No alert, or a passive one with one more template (up to 16 of 32 used today).                                                                                                                | 3      | The owner sees reactions on their streak chip or profile. Decide where (open question).                                       |
| **Named lock-screen alerts** ("Anna has a new badge: Year Round, Gold") | Notification Service Extension. The relay must include the encrypted event blob inline with `mutable-content: 1` (planned in the recommendations, not built).                                                                                                                                   | 8–12   | Big lift: keychain access group, App Group roster snapshot, strings generated from locales.                                   |
| **Per-buddy "Mute badge news"**                                         | No relay change. Client-only version: list that buddy's news already read (no dot), though their alert still fires. True silence: per-buddy badge kinds derived from the slot, like Ask to Join's `join.request.<tag>`, registered only for unmuted buddies (5 more templates, up to 21 of 32). | 1–2    | Apple Fitness pattern.                                                                                                        |
| **"Saturday with Anna" memories** with a thank-you reaction             | New kind, e.g. `share.thanks` referencing the share id.                                                                                                                                                                                                                                         | 3      | Opt-in. Says only what the User did. Never claims the buddy went.                                                             |
| **Weekly local recap** on the Buddies screen                            | None                                                                                                                                                                                                                                                                                            | 1–2    | Only if Recent proves too easy to miss. Never a push.                                                                         |

---

## 6. Open questions for the product owner

1. **Badge Alerts default:** keep them on but passive (recommended), or turn them off by default and rely on Recent?
2. **Reactions to my badges:** a passive push (recommended), or Recent and the bell only?
3. **Recent's placement:** the top of the Buddies screen (recommended), or a "Recent" row that opens its own screen?
4. **Bell:** roll social items into one "From your buddies" row (recommended), or keep individual rows?
5. **App icon count:** should non-waiting buddy logistics (replies, changes) also stop counting, matching recommendations §6.5?
6. **Quiet "New badge" card on Home:** acceptable, given it's the User's own badge? The earlier research kept celebrations off Home.
7. **Buddies' streak milestones (slice 3):** show them at all? If so, opt-in by the sharer or on whenever streak sharing is on?
8. **Notification Service Extension:** worth investing in now, so alerts can name buddies?

---

## Appendix: files referenced

- **App:**
  - `src/app/badges/{BadgesRuntime,runBadgeEvaluation,BadgeCelebrationHost,BadgeViewRouteScreen}.tsx`
  - `src/features/badges/components/{BadgeCelebration,BadgeCelebrationOverlay}.tsx`
  - `src/features/badges/screens/BadgeViewScreen.tsx`
  - `src/features/profile/components/{StreakCelebration,StreakCelebrationOverlay}.tsx`
  - `src/lib/badges/{evaluate,catalog,display}.ts`
  - `src/lib/serviceStreak.ts`
  - `src/features/buddies/{hooks/useBuddyNotifications.tsx,components/BuddyNotificationRow.tsx,components/BuddyBadgesSection.tsx,components/BadgeReactionBar.tsx,components/BuddiesHeaderButton.tsx,screens/BuddiesScreen.tsx,screens/BuddyDetailScreen.tsx,lib/badgeEvidence.ts,lib/sharedBadges.ts,lib/engine.ts}`
  - `src/app/notifications/{NotificationsBell,NotificationResponseListener}.tsx`
  - `src/features/notifications/lib/tray.ts`
  - `src/app/initializeApp.ts`
  - `src/app/watch/watchSync.ts`
  - `src/lib/syncPreferencePolicy.ts`
- **Relay:** ww-api `src/buddies/{push,contracts}.ts`
- **Docs:** `CONTEXT.md`, `docs/adr/0019-badges-count-months-not-hours.md`, `docs/buddies-recommendations.md`, `docs/buddies-protocol.md`, `docs/research/buddies/05-feature-ux.md`, `docs/analytics.md`
