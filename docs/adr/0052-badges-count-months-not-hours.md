---
status: accepted
---

# Badges count months, not hours, and are never revoked

## Context

Badges add a light, social reason to go out in service and keep records in the app. They show on the User's profile, on a Badges screen, and on the Buddy Card, and a buddy gets a push when one is earned.

Gamification in this setting can hurt. A Kingdom Publisher reports only whether they shared in a month, and many people can't pioneer because of health, age, family, or work. A badge for hours, for goals met, or for daily streaks would reward circumstance rather than effort, and a buddy getting "Anna earned 100 hours" would invite comparison. `docs/buddies-recommendations.md` §6.4 already set the direction: keepsakes, not targets.

## Decision

1. **Every Badge Collection counts calendar months.** A month counts once, however much was done in it (Year Round counts Service Years with at least 10 shared months; Keeping in Touch counts the most months with one person). No rule reads the Publisher role, entry mode, Hours Logging, goals, minutes, or the Service Streak, and none needs an unbroken run of months. A 0h/0m checkbox entry counts the same as a full day. Both halves of a Time Rollover are ignored.
2. **Earned badges are permanent.** `preferences.earnedBadges` only grows. Deleting records, data protection retention, and buddies leaving never take a badge away. Progress toward the next level for collections whose sources are deleted by design (Visits, buddy replies, the capped `submittedReportMonths`) comes from `preferences.badgeLedger`, which holds only `YYYY-MM` months and a number, never householder data.
3. **History is quiet.** A device's first evaluation, and any badge reached by a month older than last month (imports, Service History, restores), is stored as history: one summary, no one-by-one celebrations, no buddy push. Only badges earned by something just done are celebrated and announced.
4. **Buddies see earned badges only.** The Buddy Card carries each collection's highest level and earned One-time Badges as ids (`{ c, l }`): no counts, dates, progress, or locked badges. First Bible Study stays off the card in data protection mode. Sharing has its own switch.
5. **Buddy pushes are generic and rare.** A `badge.new` event uses one name-free template ("A buddy has a new badge"), because template text is stored by the relay and a per-buddy name would tell it who is who. Each sender alerts a buddy at most once a day; later badges that day arrive quietly in the tray. One-time Badges are never announced.
6. **Earned badges sync** through the preferences map/set merge (`SYNC_MAP_KEYS`, `SYNC_SET_KEYS`) and travel in backup files, so iCloud devices and Android restores agree.

## Considered options

- **Hour or goal thresholds** (100 hours, a goal met): rejected for excluding Kingdom Publishers and anyone who can't pioneer; Achievement Tiers and Milestones already celebrate hours privately.
- **Badges that need an unbroken run of months:** rejected. Illness or a hard season would erase progress. Year Round's two grace months, reset each September, give a "keep it up" goal with nothing to lose. The Service Streak is a separate feature with its own rules; badges never depend on it.
- **Revoking badges when records change:** rejected. It turns a keepsake into a liability and breaks with data protection retention.
- **A separate synced store:** not needed. Preferences already merge per entry; a dedicated store would duplicate the sync, backup, and validation plumbing.
- **Names in push text via per-buddy templates:** rejected for the relay privacy reason above. A Notification Service Extension that decrypts the event could add names later.

## Consequences

- Fast-growing collections are impossible by design; the top level (Pearl) takes years. That's intended.
- A long-time user importing history gets many badges at once, quietly.
- Plans have no creation date, so a backdated Plan can count toward Ready to Go. With no competition, this isn't worth guarding against.
- Android users earn and see badges but, like the rest of Buddies, don't share them or get buddy pushes until Buddies supports Android.
