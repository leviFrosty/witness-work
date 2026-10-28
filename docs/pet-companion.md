# Pet Companion

An opt-in Home section with a small 8/16-bit pet that lives in a room. The pet stays happy when the
publisher keeps going out in the ministry. Going out also earns gold coins to spend in the Shop on
hats and room items. This doc is the
contract for the feature: product rules, data model, module layout and rendering pipeline. Keep it
current when behavior changes.

The original design board (HTML prototype with the art, timings and choreography this feature was
ported from) lives outside the repo. The TypeScript port in `src/features/pet/art` and
`src/features/pet/motion` is now the source of truth.

## Product rules

### Pets

- Five species at launch: `lion` (Lion cub), `dog` (Pup, a golden retriever), `cat` (Kitten),
  `donkey`, `lamb`.
- Coats: dog `gold | white | liver | black`; cat `orange | grey | black | white | tuxedo | calico | siamese | tortoiseshell`.
  The other species have one coat (`default`).
- One companion per user. "Change Pet" changes the species and coat of the same companion and keeps
  its name, hearts, history, room and keepsakes. Changing the species plays that species' entrance.
- The name is optional, up to 20 characters, user-entered (never translated). With no name the card
  shows the localized species name.
- Pets never speak in words. Each moment has a localized sound (`pet.sound.<species>.<moment>`), where
  moment is `hi | pat | happy | ok | low | nap`.

### Hearts (life model)

Hearts are **replayed day by day from synced records**, from the adoption day to today. Nothing about
hearts is stored, so every device computes the same answer (ADR 0030).

- A pet starts with **3 hearts** on its adoption day. An active day the day before counts as after
  the adoption, so a synced device in an earlier time zone agrees with the adopting one.
- An **active day** is a local day with any of: a time entry (including a 0-minute "shared in
  ministry" checkbox entry, not rollovers), a Visit (conversation, return visit or not-at-home), or a
  Plan/Recurring Plan the user first saved that day (`savedOn`; later edits, including checklist
  ticks in its note and adding a buddy, keep the first day, and automatic buddy updates don't stamp it).
- Each active day: **+1 heart**, max 5. One heart per day however much was done.
- Quiet days: once 10 days have passed since the last active day (or wake), lose **½ heart every 3
  days** (quiet day 10, 13, 16, …). Hearts never drop below ½ by decay; at ½ the pet is **asleep**.
- 60 quiet days: the pet **died** (0 hearts).
- **Waking**: tapping a sleeping pet or one that died records a wake on that day. A wake sets hearts
  to **1** if they were below 1, and restarts the quiet-day count. Nothing else is lost.
- An active day on a pet that died revives it at 1 heart (0 + 1).
- **Monthly pace** (ADR 0031): in a month whose role reports only whether it shared (a Kingdom
  Publisher; its Service Streak counts months, `selectHeartsPace` from Role History), an active day
  fills **all 5 hearts** (a pet that died too) and holds them through the end of the next month;
  quiet days count from then (fading from day 10, dying on day 60). A pet adopted in a month that
  already has an active day starts that way, at 5 held through the next month. Each month uses its own role, so
  switching roles never rewrites the months before. The widget's timeline reaches
  `MONTHLY_HOLD_MAX_DAYS` further for it.
- Head pats and rubs are just for fun. They never add hearts.
- Gold: **365 days in a row at 5 hearts** turns the hearts gold. Gold ends the day hearts drop below 5,
  and the count starts over.

Moods from hearts: `≥4.5 happy`, `≥3.5 content`, `≥2.5 ok`, `≥1.5 low`, `≥1 weak`, `½ nap` (asleep),
died `dead`. Transient moods used by motion: `joy`, `wide`.

From five hearts with nothing logged: happy days 0–12, content 13–18, okay 19–24, misses you 25–30,
weak 31–33, asleep 34–59, died 60+. A weekly publisher stays at five forever.

### Lamp

The lamp follows the hearts (`lib/lamp.ts`, ADR 0035): a level for each whole heart, 0–5, and out
when the pet died. It shows the same whether or not streaks are shown.

### Coins (Shop currency)

Room items and hats are bought in the **Shop** with one currency, gold **coins** (ADR 0035). Like
hearts, they're **replayed from synced records** since the adoption day and never stored; only
purchases are (`lib/currency.ts`).

- **Coins**, since adoption (`petEarned`), a rule a line:
  - **1** for each **day out** (`COINS_PER_DAY`): a local day with a Time Entry (a 0-minute
    "shared" checkbox entry counts, a rollover doesn't) or a Visit the User logged (not one that came
    with a shared Contact). Plans don't count: they're forecast, not service.
  - **1 more** for each **planned day kept** (`COINS_PER_PLAN_KEPT`): a day with a Plan and time
    logged, by the Service Streak's rule (`streakHistory().kept` in `src/lib/serviceStreak.ts`).
  - **10** for each **Service Streak milestone** (`COINS_PER_MILESTONE`, `isStreakMilestone`), only
    while streaks show. `streakHistory().milestones` replays them forward, each as the streak stood
    the day it was reached (the day before can still be kept then), so a later miss doesn't take it
    back; a streak that ends and starts over reaches its milestones again, as it celebrates them.
  - A monthly-pace month (ADR 0031) with a Time Entry pays its days out at least **8**
    (`SHARED_MONTH_COINS`), so a Kingdom Publisher's one "shared" check earns about what a day out
    each week with its Plan does. In the adoption month, a check made before the adoption day counts
    for that.
  - Hearts earn nothing on their own: they already show how the pet is kept.
- **Wallet** = earned − spent (`walletOf`), never below 0. Two devices buying offline can overspend;
  then it reads 0 until earnings catch up. `Earned` keeps what earned it by kind, so a gain can say
  where it came from (`rewardLines`).
- **What a save earns plays where the User is: the reward stack** (`src/stores/rewardStack.ts`,
  `src/components/reward-stack/`). Screens measure around the save with `measureReward(action)`
  (`src/lib/actionRewards.ts`: Add Time, a visit, the "shared" checkbox on Home, the onboarding
  checklist and the widget); the pet registers `petRewardProbe` at launch (`PetRewardChip.tsx`),
  which reads `petEarningsNow()` before and after and, when the wallet really rose, starts the stack
  with one line per kind (`rewardLines`): "+1 Time added" (or Visit added, Month shared), "+1
  Planned day kept", "+10 Streak milestone · 10". Each line
  stomps in above the save's toast (in from 2.9×, overshooting as it hits), with sparks, a shake, a
  haptic (light, medium from 4, heavy for a milestone) and a hit that climbs 1.5 semitones a line;
  gaps shorten as the combo builds (520 → 180 ms), three lines show at once and older ones fold
  away. From the second line a total "= +N" climbs with them, then slams (success haptic) and drops
  into the toast's tally (`RewardTally`: the wallet, dim until it lands), which counts up in rising
  ticks and dings from 3. A single small line only rises, with one soft tick. A milestone the save
  just reached waits (up to 3.2 s) for the streak celebration and stomps onto the stack inside it
  (`claimRewardSlot`); the celebration stays until the total drops back into the toast. Saves made
  while it stomps join the combo. **A tap anywhere skips the whole run** (and the celebration it
  plays in); a single small line lets taps through. With no tally on screen (the toast left, a
  checkbox has none) it lands in a tally of its own. The gain is marked seen
  (`petSeen.markEarnedSeen`), so Home doesn't play it again.
- **Settings → Preferences → Rewards** (`PreferencesRewardsScreen`, shown with a pet):
  `rewardAnimations` (on by default; off, the toast shows a plain "+N" chip) and `rewardSounds`
  (`punch` by default, `retro`, `soft`, `off`; each previews when picked), both synced, and a sample.
  Sounds are CC0 clips in `src/assets/audio/reward/` played by `playRewardSound` (`src/lib/audio.ts`,
  pitch with rate), only while Audio & Haptics allows sounds. A screen reader hears "Earned 12
  coins" instead, and Reduce Motion skips the stack.
- **Changes made elsewhere play when seen** (`usePetReveal`, `stores/petSeen.ts`). Each device keeps
  the hearts and wallet it last showed, and what had earned them (`petSeen`, device-local, never
  synced), and keeps showing them until the Home card's header is fully on screen and clear of
  Home's header and the tab bar, or only the status bar once scrolling has tucked them away
  (`useRevealVisible`), or Decorate Room or the Shop is in front. Then it plays the change and marks
  it seen, so it plays once: each half heart pops in or crumbles (and the pet's mood and lamp follow
  on Home, cheering once full), then on Home the reward stack over the pet's room, dimmed, totalled
  by kind ("+3 Days out", "+2 Planned days kept", "+10 Streak milestone · 15"), dropping into the
  card's coin count. Without what had earned them (seen before the stack), with the stack off, or in
  Decorate Room and the Shop, the coins count to now under a "+N" that rises on a pill of the
  surface's colour, with coins flying from the pet on Home (`revealTier`). Losses
  (spending, deleted records) count down under a muted "−N", with no haptic. While any stack plays,
  every wallet on screen counts along with it. Reduce Motion changes the numbers at once; VoiceOver
  hears "Earned 20 coins". A pet adopted today starts from nothing, so its first coins play in; a pet this device never showed starts from now.
- Never sold for money and never granted by Supporter status. The dev harness can fake what's been
  earned (`override({ wallet })`, never stored); a purchase made with it is real.

### Room

Swappable parts, each a registry of options (`src/features/pet/art/room/`):

| Part   | Options                                                                               | Starter (free)           |
| ------ | ------------------------------------------------------------------------------------- | ------------------------ |
| window | time `live dawn day dusk night` × season `live spring summer autumn winter`           | all                      |
| wall   | color `sand sage sky rose cream` × pattern `plain dots stripes trellis`               | sand, cream; plain, dots |
| floor  | `wood stone brick tile`                                                               | wood                     |
| bed    | `rug hay basket cushion`                                                              | rug                      |
| shelf  | `scrolls books pottery fruit`                                                         | scrolls                  |
| lamp   | `clay lantern candle stand`                                                           | clay                     |
| sign   | `none month year shared plan convos`                                                  | all                      |
| hat    | `none bow cap beanie flowers bucket beret sunhat hardhat fedora cowboy safari tophat` | none                     |

- "Live" window: time of day from the device clock (night < 6, dawn < 9, day < 17, dusk < 20, night),
  season from the date and hemisphere (southern-hemisphere region codes flip the season).
- Prices: every non-starter item and hat but `none` has a Shop price (`ITEM_PRICES` in
  `lib/prices.ts`): 10–30 coins, rising along `UNLOCK_ORDER` and `HAT_UNLOCK_ORDER`, and six rare ones
  at the top of their kind (trellis 22, cushion 22, stand 28, tile 30, safari 32, top hat 36). About
  570 coins buy everything: about two and a half years for someone out once or twice a week who keeps
  their Plans with streaks showing; longer without Plans. A purchase keeps what it cost, so prices can be retuned. Starters are free; secrets are found, never
  sold.
- Hats: the pet wears one (or none). Bought hats are stored with the room items (`hat:bow`, …).

  A hat sits on the head (`art/hats.ts`: a 24 × 20 picture whose brim row 17 lands on the species'
  `HAT_ANCHOR_Y`, following the head's bob, mirrored and greyed with the pet; the first twelve are
  drawn 24 × 14 and moved down into it, the secret ones use its full height). A pet lying down
  (rolling over, or one that died) has no hat. No party, holiday, halo or wizard hats (JW
  sensitivities below).

- Owned = starters ∪ `earnedRoomItems` ∪ `purchases`. `earnedRoomItems` holds found secrets and
  anything opened under the old streak and months rules before the Shop, which stays owned. An owned
  item never locks again.
- **The Shop** (route `PetShop`, `screens/PetShopScreen.tsx`): a washi-paper shop under a noren sign
  in sumi ink, light and dark. Its header holds back, the sign and the wallet (tap: how coins are
  earned). The room on top tries on the picked item; categories (Hat, Wall, Floor, Bed, Shelf,
  Light, `SHOP_TABS`) scroll in a row whose last tab in view is cut about in half (`tabGap`), so the
  row reads as scrollable. Items sit two to four to a row (`ShopItemCard`): picture, name, and the
  price, "Wearing"/"In room", or nothing once owned; a locked secret shows its silhouette and `???`.
  The picked item's button (`ShopBuyPanel`) buys it ("Buy" with the price), says what's missing
  ("Need 3 more", disabled), wears or places an owned item, or says it's in use. Buying wears or
  places it at once. A secret's panel only says it's found along the way.
  - Layout by width: under 760 pt, one scroll view with the header, a strip of the room and the
    categories pinned, the items below and the button in a bar at the bottom, clear of the home
    indicator. From 760 pt (iPad, iPhone Duo open), `FoldSplit`: the counter (header, room, item
    panel) leads, the categories and items trail, meeting at the fold when half-open. Picking a
    category scrolls its items back to the top.
  - Presentation (`petShopOpensAsSheet`): a full-height sheet where the window is compact (iPhone,
    iPhone Duo closed); full screen where it's regular width, including narrower regular windows
    such as iPad mini in portrait (744 pt), which get the narrow layout clear of the status bar; a
    full-screen modal on Android. The paper bleeds under iPhone Duo's vertical bar.
  - The sign sits in the middle of the header, or between back and the wallet where the middle has
    no room for it (a narrow phone, a long translation, a big wallet).
  - Owned items not picked yet on this install say **New** (white on red), until picked in the
    Shop or Decorate Room (MMKV `pet-secrets` `picked:<item>`). Whatever is in the room counts as
    picked, so an item chosen before picks were noted never says "New" once swapped out. Decorate Room's tag is red too, and Home's pet card
    shows a red **New** chip beside the wallet while any owned Shop item says "New"
    (`hasNewShopItem`).
- The pet's details (route `PetRoom`) has a **Shop** button and shows the wallet. Decorate Room dims a
  locked item (a locked secret shows its silhouette instead) and can't pick it. A locked regular
  item's badge is its price beside a coin ("Costs 14 coins in the Shop." to VoiceOver);
  tapping it opens the Shop at that item (`pet_room_locked_tapped`). A locked secret's tooltip says
  only that it's a secret. A note above a tab's options, while any are locked, says to get the rest
  in the Shop.
- Wall sign: a small square sign on the right of the back wall in muted colors. Digits and icons only
  (no words), drawn with the pixel digit font, which also has Eastern Arabic digits for `ar`. Kingdom
  Publishers default to `shared`. Values: hours this month with goal progress, hours this service
  year by month, shared-in-ministry months of the service year, next plan day + duration,
  conversations + return visits this month. A value too wide for its spot drops the decimal, then
  shows a cap (`9999+`, `99+`; the plus on the left in Eastern Arabic).

### Secret items

Every unlockable part also has rarer **secret** options, listed after its regular ones
(`SECRET_*_IDS` in `src/types/pet.ts`, `SECRET_ROOM_ITEMS`): 14 hats, 12 wall colours and 10 each
of wall patterns, floors, beds, shelves and lights. They aren't in `UNLOCK_ORDER` or
`HAT_UNLOCK_ORDER` and never sold; each opens up on its own rule (`SECRET_UNLOCKS` in
`lib/secretUnlocks.ts`):

| Rule        | Opens when                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------- |
| `badge`     | the User has earned that badge (`preferences.earnedBadges`; most secrets, Bronze to Pearl)  |
| `badges`    | the User has earned at least that many badges in all (3, 5, 8, 10, 12, 14, 16, 20)          |
| `keepsakes` | the pet holds at least that many keepsakes (1, 3, 5, 8, 10, 15)                             |
| `gold`      | the hearts are gold (the pineapple hat, the honeycomb pattern)                              |
| `longRun`   | that many calendar months with a day out since adoption (15, 18, 24, 36), whatever the role |

Badges count months, never hours (ADR 0019), so no rule favours a role. No rule needs Buddies
(`together`, `firstBuddy`), so every User can reach every secret, and none can be missed for good.
A badge opens at most two secrets. Earned secrets are stored in `earnedRoomItems` like the rest, so a
badge reset never locks one again. `pet_room_item_unlocked` sends `by: 'secret'`.

**Unlock news** (ADR 0034, `docs/toasts.md`). An item or hat that opens up after the pet's first stored items is news on this device (`stores/petUnlockNews`). The first items are the room the pet starts with.

- **Right after the User's own action, in the foreground:** an unlock toast, one per item, drawn by `PetUnlockArt` in the pet's own room. Tapping it opens `PetUnlockReveal`. Its "Try it on" (or "Decorate Room") opens Decorate Room at the item's tab.
- **Otherwise** (a new month at launch, another device, a toast nobody acted on): only the tray lists it (`usePetUnlockNotifications`).
- Swiping a toast away, dismissing the tray item, closing the reveal, or opening Decorate Room settles it.

Decorate Room never shows how a secret opens or what it looks like until it does:

- A locked secret's thumbnail is its **silhouette** (`art/silhouette.ts`), the option's own pixels
  in one flat shadow (hat, bed, shelf, light) or two shadow tones that keep a pattern's structure
  (wall colour, pattern, floor), over the room in low-contrast grey. All views are by day.
  `silhouetteRooms` (`lib/roomOptions.ts`) picks a few reference rooms to tell the option from the
  rest: for an object, the same item over another wall and floor (so bare wall and floor never
  count), then no hat or up to four regular options; for a wall, the same wall plain and in another
  colour; for a floor, two other floors. `silhouetteOf` ignores changes in lamp light, fills small
  gaps that the room doesn't show through, and drops loose specks.
- Its badge is `?`, its name `???` (VoiceOver: "Secret item, locked"), and its tooltip says only "A
  secret. A surprise, waiting in its own time." The tab's unlock note adds "Some items are secrets.
  They show up along the way." while one is locked.
- A found secret says "New" until it's picked, like any owned item (MMKV `pet-secrets`
  `picked:<item>`; `forgetFoundSecrets` clears it).
- The intro's fully unlocked room uses only `UNLOCK_ORDER` and `HAT_UNLOCK_ORDER`, so it never
  shows a secret.

Hats are folk hats from around the world (`art/hatsWorld.ts`: nón lá, chullo, salakot, La Paz
bowler, Malagasy straw hat, fisherman cap, bush hat, tam) and playful ones (`art/hatsWhimsy.ts`:
rubber duck, teapot, sailboat, pancake stack, camel, pineapple): everyday work, weather and regional
hats only, none tied to a religion, a ceremony, an office or the military.

### Hidden moments (easter eggs)

None of these are listed or explained in the app or the FAQ. The `visitor` moment explains itself only
while it's happening (Visiting Today in the pet's details), and Pet Settings can turn it off.

| Id         | Trigger                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gold`     | 365 days in a row at five hearts. Gold hearts, sparkles around the pet, and a one-line note under the name on the day it turns gold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `rainbow`  | The day hearts reach 5 after the pet was asleep or died. Rainbow in the window (not at night) until midnight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `paradise` | Live window in daytime, 1 in 20 Home visits: a tiny lion and lamb stroll across the hills (Isaiah 11:6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `star`     | Live window at night, 1 in 15 Home visits: a shooting star crosses the window.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `trick`    | 15 taps within 5 seconds (rubs don't count). Species tricks: lion rolls, pup chases its tail, kitten zoomies, donkey dances, lamb bounces.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `twirl`    | A scratch: one drag that keeps rubbing the pet for 2 s, rub steps no more than 0.6 s apart (`SCRUB_TWIRL_MS`, `SCRUB_PAUSE_MS` in `lib/patTricks.ts`). A success haptic, then it crouches, hops with three quick turns in place, lands with a burst of hearts and says its happy sound (`motion/twirl.ts`, every species). Once per drag.                                                                                                                                                                                                                                                                                                         |
| `visitor`  | Anything today with buddies who share a pet (a Plan or Follow-up they're on, or theirs the User joins): every one of their pets visits, sitting behind yours, from either side of it outward (`VISITOR_SPOTS`), so yours stays in front. Once a pat's hearts float off, each says who it came with; a long press outlines that pet, brings it in front of the other visitors, and opens what you do with that buddy today (on iOS, with the pet lifted above the menu). The pet's details sum them up in one Visiting Today row (the first few stacked, "With <buddy> and N others"), which opens all of them in a scrolling sheet (`PetVisits`). |
| `gift`     | After 30 days in a row at five hearts, on deterministic gift days (hash of the pet's `seed` — or its adoption day when it has none — + day, about 1 in 10, at least 7 days apart) the pet leaves a keepsake (`olive fig pebble feather lily`, cycling) on the rug. Tap it (or use the screen reader's Pick up action) to keep it; the newest 5 sit on the window sill.                                                                                                                                                                                                                                                                            |

JW sensitivities: no birthday or anniversary moments, no holiday or Memorial tie-ins, no ghost, halo,
angel or "went to heaven" imagery for a pet that died, and no "magic" wording. Nothing is triggered by
hours.

### Entrances, tricks and reactions

Every species has an entrance (1–3 s) that plays when the pet is adopted, when its species or coat
changes, and when it wakes from having died. Choreography tables live in `src/features/pet/motion/`.

| Species | Entrance                                                               |
| ------- | ---------------------------------------------------------------------- |
| lion    | runs in from the left, crouches, pounces, "RAWR!"                      |
| dog     | dashes in from the right, skids past, comes back, spins, sits, "Woof!" |
| cat     | drops from the top, lands, small bounce, "Mrrp!"                       |
| donkey  | trots in from the left, kicks its heels, "Hee-haw!"                    |
| lamb    | three big hops in from the right, wiggles, "Baa!"                      |

- Tap the pet: head pat (squish, heart particle, pat sound, light haptic). Only a tap on the pet's
  drawn box (padded 3 scene pixels, its hat included; `lib/sceneTouch.ts`) pats it.
- Drag back and forth across it: rub (a heart every ~28 px of travel). The drag has to start on the
  pet (padded 6 scene pixels). Keep scrubbing for 2 s and it twirls (hidden moment `twirl`).
- Hearts that went up since Home last showed them (the "shared" check, a visit, time logged): a
  second after the greeting the pet cheers, happy with a burst of hearts and its happy sound.
- Tap anywhere else on the Home card (its header, the room away from the pet, the card's padding):
  opens the pet's details. The long-press menu stays on the header.
- Asleep: "Zzz" particles. Died: lying flat, eyes closed, greyscale, no particles.
- Wake from died: colour washes back from the feet up, the pet pops up, hearts burst, then the entrance
  is not replayed (the wake is its own animation).
- Reduce Motion: no idle bobbing, entrances, tricks and the twirl are skipped (the pet is shown in
  place; the twirl still bursts hearts), and particles are static.

## Data model

`src/types/pet.ts`, store `src/stores/pet.ts` (zustand + persist, MMKV key `petCompanion`, version 1).
Synced as the optional `petStore` payload slice using the mileage pattern (records with `id` +
`updatedAt`, tombstones with `deletedAt`, `mergeById`). For copies of the same pet (same adoption
day and seed), `wakes`, `keepsakes`, `earnedRoomItems` and `purchases` merge as unions so a
concurrent edit on another device can't drop them (`purchases` keeps one per item, the first
bought: `keptPurchases`); every other field is last-writer-wins.

```ts
type PetSpecies = 'lion' | 'dog' | 'cat' | 'donkey' | 'lamb'
interface PetRecord {
  id: string // 'companion' — one companion per user
  species: PetSpecies
  coat: string // must be a coat of the species; unknown values fall back to the default coat
  name?: string
  adoptedOn: string // YYYY-MM-DD local day key
  seed?: number // random at adoption; picks the gift days
  wakes: string[] // day keys of wake taps; old ones trimmed only past 120 and 400 days (ADR 0030)
  keepsakes: { kind: GiftKind; on: string }[] // collected gifts, newest 20 kept
  earnedRoomItems?: string[] // found secrets, and items opened before the Shop; absent = none
  purchases?: {
    item: string
    price: number // in coins
    on: string
  }[] // Shop buys, one per item; absent = none
  updatedAt: number
}
interface PetRoomRecord {
  id: 'room'
  window: { time: 'live' | TimeOfDay; season: 'live' | Season }
  wallColor: WallColor
  wallPattern: WallPattern
  floor: FloorId
  bed: BedId
  shelf: ShelfId
  lamp: LampId
  sign: SignId
  hat?: HatId // absent on rooms from before hats: none
  updatedAt: number
}
```

- Preferences: Home section key `pet` in `HomeScreenElementKey` (default order after `mileage`,
  default visible), and `petPromptDismissed: boolean` (syncable). The pet section shows the opt-in
  prompt card while no companion exists and the prompt isn't dismissed.
- Buddy Card: optional `pet: { species, coat, name? }` field (schema `.optional().catch(undefined)`),
  shared only when the new `sharing.pet` toggle is on (default on; Buddies Settings → Pet, shown once
  a companion exists). The `visitor` moment reads it through `usePetVisits` (`src/app/pet/`): the
  pets of active buddies the User goes out with today, as the calendar counts it (their Plans and
  Follow-ups, minus declines), each once, earliest first, minus buddies whose pets the User hid.
  `petVisits` (All Buddies, with each buddy's own override, synced in the roster) is that choice:
  Pet Settings (the pet's details → Settings), a buddy's Buddies settings → Your Pet, or Hide on a
  visiting pet's long-press menu. See `docs/buddies-protocol.md`.

## Module layout

Shared tier (pure TS, no React Native):

- `src/lib/pixelArt/` — generic pixel engine: color math, shape rasterizer with shading and
  automatic outlines, paint layers, pixel buffer type and blit/flip/greyscale/lie-down transforms,
  pattern stamps, the digit font, deterministic RNG. Knows nothing about pets.

Feature tier `src/features/pet/`:

- `art/species/` — one file per species (rig + coats + sounds keys), `art/species/index.ts` registry.
- `art/room/` — window, wall, floor, bed, shelf, lamps, sign, keepsakes; `art/room/index.ts`
  registry + `UNLOCK_ORDER`; `art/hats.ts` — the hats and where each species wears them;
  `art/scene.ts` composes a frame from a `SceneState`.
- `art/particles.ts` — hearts, Zzz, sparkles, dust.
- `motion/` — `Pose` type, entrance/trick/twirl/wake tables, `evaluateMotion(table, elapsedMs)`.
- `lib/life.ts` — `simulateLife`, `moodOf`, gold, rainbow day, gift days; `lib/activity.ts` — active
  day keys from stores; `lib/unlocks.ts` (owned items); `lib/currency.ts` (coins, wallet); `lib/prices.ts`
  (`ITEM_PRICES`); `lib/shop.ts` (categories, item states) and `lib/shopEntries.ts` (a category's cards); `lib/lamp.ts`;
  `lib/liveWindow.ts`; `lib/eggs.ts`.
- `render/` — Skia: `skiaImage.ts` (pixel buffer → `SkImage` / PNG), `PetSceneView` (a scene player
  with the frame clock: 10 fps on the JS thread, paused when unfocused, backgrounded, at rest with
  Reduce Motion, or (Home card) scrolled fully off screen; frames reach the canvas through a shared value with nearest sampling; tap, rub and
  gift gestures; the sound bubble), `PetSpriteTile` (one idling sprite for the prompt and picker).
- `components/`, `hooks/`, `screens/` — Home section, prompt card, picker (`PetPicker`, which shows
  the adoption intro `PetIntro` after Adopt: hearts, the Shop with a fully unlocked room from
  `lib/intro.ts`, and tapping the card to decorate; the Home card's header also shows the wallet), the
  pet's details (`PetRoom`: name, hearts, Share and Settings beside its name, the wallet, always
  shown, even at 0, with an info popover saying how coins are earned, Shop / Rename / Change pet,
  buddies' pets visiting today, the room, and icon tabs for its hat and parts; `lib/roomOptions.ts`
  holds its tabs, choices, thumbnail crops and unlock badges; `RoomOptionThumb` draws one crop of a
  still room), the Shop (`PetShop`; its pixel frames, sign and icons are drawn to size in
  `art/shop.ts` and `components/ShopPixels.tsx`), Rename (`PetRename`), and Share… on the card's menu and in the details (`lib/share.ts`: the card's view at 4×, nearest scaling, written as a PNG to the cache folder
  for the share sheet).

App tier: `src/app/pet/` for cross-feature glue (visitors from buddies + Plans + Follow-ups, the
details route that hands them to `PetRoom`, Pet Settings with the buddies' switches, widget images),
`src/app/widgets/petWidget*.ts` for the iOS widget snapshot.

## Rendering pipeline

1. `art/*` builds shape specs (ellipses, polygons, feature pixels) for the current pose.
2. `pixelArt.raster` rasterizes specs to RGBA `PixelBuffer`s; results are memoized by
   `(species, coat, pose key)` so steady-state frames don't rasterize.
3. `art/scene.ts` composes, back to front: the room base (cached per room config + data: wall,
   floor, window with rainbow, shelf, sign, sill, plant, stool, bed back, gift on the rug) → visitors
   (all behind the pet, furthest back first) → lamp and its stool (over the visitors, so they always show, but behind
   the pet, so one running past it stays in front) → pet → bed front →
   lighting over all of it (cached per lamp × level × time of day × breathing phase; the pets'
   pixels, a `PixelMask`, take half the room's darkness so a dark coat reads at night) → window moments (paradise walkers, shooting star) and the gift sparkle →
   particles and dust.
4. `render/PetSceneView` uploads the buffer as an `SkImage` and draws it scaled with
   `FilterMode.Nearest`. The scene is 180×100 logical pixels; views crop it with a viewport.
5. Widgets reuse steps 1–3 and encode PNGs, one per future state, written into the App Group.

## Widgets (iOS only)

Three sizes in one widget kind `PetWidget`: small (pet only), medium (compact row: pet, name, hearts,
the streak's days, one line for the sign value), large (the room with a slim name/hearts/lamp row). The app
renders a timeline of PNGs: every window time change for the next 48 hours, then each future midnight
where hearts or mood change through the day the pet would die (at most 12 entries), and
writes them with `WidgetBridge.writeFile`; the snapshot JSON lists `{ date, small, medium, large }`.
Android has no home-screen widgets today.

## Analytics

See `docs/analytics.md` → "Pet companion".

## Verification

Dev harness: `__WW_DEV__.pet` (`src/app/dev-harness/pet.ts`) adopts a pet, sets species/coat/room,
fakes a life state and forces hidden moments (`override({ hearts, dead, gold, … })`), fakes the
earnings (`override({ wallet: 40 })`, coins, never stored; purchases made with it
are), opens every secret item
(`override({ secrets: true })`, shown but never stored), reads back the stored
and current unlocks and purchases (`state().unlocks`), and plays any motion (`play`, `pat`),
so every animation can be recorded in the app. See `.agents/skills/verify-witnesswork/features/pet.md`.

PNG tools for drawing and reviewing art, skipped in normal test runs and written to `.verify/`
(gitignored): `PET_GALLERY=1 pnpm vitest run src/features/pet/art/gallery` (every sprite, part and
motion), `PET_PREVIEW=<part> pnpm vitest run src/features/pet/art/preview` (one part's options by day
and night, their thumbnails and secret silhouettes; `PET_PREVIEW_IDS=duck,teapot` for some) and
`PET_CATALOG=1 pnpm vitest run src/features/pet/art/secretCatalog` (every secret, opened and locked,
with its unlock rule).
