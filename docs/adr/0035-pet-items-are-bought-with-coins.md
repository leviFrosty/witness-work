---
status: accepted
---

# Pet items are bought with coins

## Context

Room items and hats opened up two ways (ADR 0030): at Service Streak counts
while streaks showed, or one per active month with streaks hidden. Each way
read differently, and the streak only grows by keeping Plans, so a User who
never plans never opened anything in streak mode. Early analytics agreed,
though thinly (17 pet owners over two days): 9 of the 13 who logged time had
never created a Plan, and 6 had opened nothing beyond the starters. Across all
Users who log time, 84% create no Plans. The two modes, the lamp's own streak
scale and the months count were three things to explain for one room.

## Decision

1. **One currency, coins, earned from records and never stored.** Like
   hearts, they're replayed from synced records since the adoption day, so
   every device agrees. Gold coins, in rules short enough to say a line each:
   - 1 for each day out: a local day with a Time Entry (the 0-minute "shared"
     check included, Time Rollovers not) or a Visit the User logged. Plans
     don't count as service: they're forecast (ADR 0003).
   - 1 more for each planned day kept, by the Service Streak's rule: a day with
     a Plan and time logged on it.
   - 10 for each Service Streak milestone (`isStreakMilestone`: 3, 5, 10, 15,
     20, 25, 30, 40, 50, then every 25 kept Plans; every month from the third),
     only while streaks show. Each is replayed as the streak stood the day it
     was reached, so a later miss doesn't take it back, and a streak that ends
     and starts over reaches its milestones again, as it celebrates them again.
   - In a month at the `monthly` hearts pace (ADR 0031), a month with a Time
     Entry pays its days out at least 8, about what a day out each week with
     its Plan kept does: the one check is the month's whole report. In the
     adoption month, an entry made before the adoption day counts for that,
     since the check can't be made twice.

   Keeping a Plan adds one, not more, so planning pays without outweighing
   going out; the streak's milestones pay the most, so streaks stay the center
   of it, and a User who hides streaks earns from days out and Plans alone.
   Coins don't read minutes, hours or goals, so no role or circumstance earns
   faster per day out. They're never sold or given by Supporter status.

   One currency is one thing to explain. An earlier draft also had thread, the
   common currency, with coins as a rare one for weeks at five hearts; two
   counts that grew by different rules read as confusing, so coins replaced
   thread, and hearts earn nothing on their own: they already show how the pet
   is kept.

2. **Items are bought in the Shop.** Each regular room item and hat has a
   fixed price in coins (`ITEM_PRICES`): 10 to 30, rising along the old unlock
   order, and six rare ones at the top of their kind, up to 36 for the Top hat.
   About 570 coins buy everything: about two and a half years for someone out
   once or twice a week who keeps their Plans with streaks showing (about 250
   coins in the first year, 100 of it from milestones), and longer without
   Plans or for a monthly reporter.
3. **Purchases are stored on the pet** (`PetRecord.purchases`, item, price and
   day) and merged as a union by item, like earned items, keeping the
   earliest. A purchase from a newer build (a field this one doesn't know) is
   kept and owned, and its price comes off. The balance is
   what's been earned minus what's been spent. Two devices buying different
   items offline can overspend; the balance then shows 0 until earnings catch
   up.
4. **Starters stay free, secrets stay found.** Secret items still open on
   their own milestones and are never sold. The long-run secrets that read the
   streak or active months now read calendar months with a day out since
   adoption (15, 18, 24 and 36), so every role reaches them at the same pace,
   as with badges (ADR 0019).
5. **The streak opens nothing directly, and months mode is gone.** Items,
   hats and the lamp don't read the Service Streak; its milestones pay coins
   instead (1).
6. **The lamp follows the hearts**: its level is the whole hearts, 0–5.
7. **What a save earns plays where the User is.** Saving time, a visit or the
   "shared" check plays the reward stack right there, on any screen: one line
   for each thing it earned, named ("+1 Time added", "+1 Planned day kept",
   "+10 Streak milestone · 10"), stomping in one after another with a hit, a
   running total that slams, and the total dropping into a tally on the
   save's toast that counts the wallet up. A milestone the save reached plays
   its line inside the streak celebration, which lifts as the total drops back.
   Saves made while it plays join the same combo. A tap anywhere skips all of
   it. Settings → Rewards turns it off (the toast then shows "+N") and picks its
   sounds: Punch (the default), Retro, Soft or Off, under Audio & Haptics.
8. **Changes made elsewhere play when they're seen.** Hearts and coins also
   change while nobody's looking (days pass; Siri, the Watch or another
   device logs time), so each device shows them as it last did until they're
   on screen (the Home card's header, Decorate Room, the Shop), then plays what
   changed once: each half heart, then on Home the reward stack over the pet's
   room, totalled by kind ("+3 Days out", "+2 Planned days kept"), and elsewhere
   a "+N" over the count as it counts up. Losses count down quietly. A save's
   own stack marks its gain seen, so Home doesn't play it twice.
9. **Items already earned stay earned.** Every item a pet opened under the old
   rules stays in `earnedRoomItems`. Owned items the User hasn't picked yet on
   this device say "New" until they do.

## Consequences

- Supersedes ADR 0030's streak and months unlocks and its streak-lit lamp.
  Hearts are unchanged.
- Keeping Plans and showing streaks earns most: someone out once or twice a
  week earns about 13 coins a month from days out and Plans kept, plus 10 at
  each milestone. Without Plans the same User earns about 6 a month, so the
  Shop fills several times slower; the info popover says how to earn more.
  Kingdom Publishers earn at least 8 for each month they share, and 10 more
  each month their streak reaches, about what a weekly publisher with Plans
  does.
- Each device plays a change once, when it shows it: a User with two devices
  sees it on both. What a device last showed is local and never synced.
- The balance can't be edited directly; backdating records changes it the same
  way it changes hearts.
- Prices live in one table, so pacing can be retuned in a release without a
  migration: purchases keep the price paid.
- A synced device still on a build from before the Shop keeps opening items
  by streak or month into `earnedRoomItems`, and this build owns them. That's
  accepted rather than forcing an update: it lasts only until that device
  updates, and those items were free under the rules it runs.
