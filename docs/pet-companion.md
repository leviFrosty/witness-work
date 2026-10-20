# Pet Companion

An opt-in Home section with a small 8/16-bit pet that lives in a room. The pet stays happy when the
publisher keeps going out in the ministry. The lamp in the room is the Service Streak. This doc is the
contract for the feature: product rules, data model, module layout and rendering pipeline. Keep it
current when behavior changes.

The original design board (HTML prototype with the art, timings and choreography this feature was
ported from) lives outside the repo. The TypeScript port in `src/features/pet/art` and
`src/features/pet/motion` is now the source of truth.

## Product rules

### Pets

- Five species at launch: `lion` (Lion cub), `dog` (Golden pup), `cat` (Kitten), `donkey`, `lamb`.
- Coats: dog `gold | white | liver | black`; cat `orange | grey | black | white | tuxedo | calico | siamese`.
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

- A pet starts with **3 hearts** on its adoption day.
- An **active day** is a local day with any of: a time entry (including a 0-minute "shared in
  ministry" checkbox entry, not rollovers), a Visit (conversation, return visit or not-at-home), or a
  Plan/Recurring Plan the user saved that day (`savedOn`, which also covers adding a buddy to a plan;
  automatic buddy updates don't stamp it).
- Each active day: **+1 heart**, max 5. One heart per day however much was done.
- Quiet days: once 10 days have passed since the last active day (or wake), lose **½ heart every 3
  days** (quiet day 10, 13, 16, …). Hearts never drop below ½ by decay; at ½ the pet is **asleep**.
- 60 quiet days: the pet **died** (0 hearts).
- **Waking**: tapping a sleeping pet or one that died records a wake on that day. A wake sets hearts
  to **1** if they were below 1, and restarts the quiet-day count. Nothing else is lost.
- An active day on a pet that died revives it at 1 heart (0 + 1).
- Head pats and rubs are just for fun. They never add hearts.
- Gold: **365 days in a row at 5 hearts** turns the hearts gold. Gold ends the day hearts drop below 5,
  and the count starts over.

Moods from hearts: `≥4.5 happy`, `≥3.5 content`, `≥2.5 ok`, `≥1.5 low`, `≥1 weak`, `½ nap` (asleep),
died `dead`. Transient moods used by motion: `joy`, `wide`.

From five hearts with nothing logged: happy days 0–12, content 13–18, okay 19–24, misses you 25–30,
weak 31–33, asleep 34–59, died 60+. A weekly publisher stays at five forever.

### Lamp (Service Streak)

The lamp's brightness is the existing Service Streak (`useServiceStreak`, ADR 0003), using the raw
count, not the `STREAK_MIN` display gate. Levels 0–5:

| Level | `plans` streak (days) | `months` streak (Kingdom Publishers) |
| ----- | --------------------- | ------------------------------------ |
| 0     | 0                     | 0                                    |
| 1     | 1–2                   | 1                                    |
| 2     | 3–6                   | 2                                    |
| 3     | 7–13                  | 3–5                                  |
| 4     | 14–29                 | 6–11                                 |
| 5     | 30+                   | 12+                                  |

When `showStreaks` is off the lamp still burns at level 3 and nothing shows a streak number.

### Room

Swappable parts, each a registry of options (`src/features/pet/art/room/`):

| Part   | Options                                                                     | Starter (free)           |
| ------ | --------------------------------------------------------------------------- | ------------------------ |
| window | time `live dawn day dusk night` × season `live spring summer autumn winter` | all                      |
| wall   | color `sand sage sky rose cream` × pattern `plain dots stripes trellis`     | sand, cream; plain, dots |
| floor  | `wood stone brick tile`                                                     | wood                     |
| bed    | `rug cushion basket hay`                                                    | rug                      |
| shelf  | `scrolls books pottery fruit`                                               | scrolls                  |
| lamp   | `clay lantern candle stand`                                                 | clay                     |
| sign   | `none month year shared plan convos`                                        | all                      |

- "Live" window: time of day from the device clock (night < 6, dawn < 9, day < 17, dusk < 20, night),
  season from the date and hemisphere (southern-hemisphere region codes flip the season).
- Unlocks: every non-starter item has a place in `UNLOCK_ORDER` and a Service Streak number
  (`STREAK_THRESHOLDS` in `lib/unlocks.ts`). It unlocks the first time the raw streak count (not the
  `STREAK_MIN` display gate) reaches its number, and stays unlocked after the streak ends:

  | Kind                          | Numbers, in `UNLOCK_ORDER`                                      |
  | ----------------------------- | --------------------------------------------------------------- |
  | `plans` (planned days kept)   | 1, 2, 3, 5, 7, 10, 14, 20, 25, 30, 40, 50, 60, 75, 90, 105, 120 |
  | `months` (Kingdom Publishers) | 1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12, 12           |

  With no streak to grow (`showStreaks` off, or a `plans` streak and no Plans or Recurring Plans at
  all), items unlock in months mode instead: one item of `UNLOCK_ORDER` per **active month** since
  adoption (a calendar month with at least one active day), as before. Months, not hours, so every
  role unlocks at the same pace (same reasoning as ADR 0019 for badges). `unlockMode` picks the mode.

- Earned items are stored on the pet (`earnedRoomItems`, written by `earnRoomItems` from an effect in
  `usePetLife` when the current mode earns one that isn't stored), so nothing locks again when the
  mode changes or a streak ends. Unlocked = starters ∪ stored ∪ earned now. A pet adopted on a long
  streak gets its items at once.
- Decorate Room dims a locked item and can't pick it. Its badge says what opens it: in streak mode a
  flame and the number ("At a streak of 7" to VoiceOver); in months mode the earliest month ("This
  month" while this month has no active day yet and it's next, "Next month", "In N months"). The note
  under a tab with locked items says how they open up, by mode and streak kind.
- Wall sign: a small square sign on the right of the back wall in muted colors. Digits and icons only
  (no words), drawn with the pixel digit font, which also has Eastern Arabic digits for `ar`. Kingdom
  Publishers default to `shared`. Values: hours this month with goal progress, hours this service
  year by month, shared-in-ministry months of the service year, next plan day + duration,
  conversations + return visits this month. A value too wide for its spot drops the decimal, then
  shows a cap (`9999+`, `99+`; the plus on the left in Eastern Arabic).

### Hidden moments (easter eggs)

None of these are listed or explained in the app or the FAQ.

| Id         | Trigger                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gold`     | 365 days in a row at five hearts. Gold hearts, sparkles around the pet, and a one-line note under the name on the day it turns gold.                                                                                                                                                                                                                                   |
| `rainbow`  | The day hearts reach 5 after the pet was asleep or died. Rainbow in the window (not at night) until midnight.                                                                                                                                                                                                                                                          |
| `paradise` | Live window in daytime, 1 in 20 Home visits: a tiny lion and lamb stroll across the hills (Isaiah 11:6).                                                                                                                                                                                                                                                               |
| `star`     | Live window at night, 1 in 15 Home visits: a shooting star crosses the window.                                                                                                                                                                                                                                                                                         |
| `trick`    | 15 pats within 5 seconds. Species tricks: lion rolls, pup chases its tail, kitten zoomies, donkey dances, lamb bounces.                                                                                                                                                                                                                                                |
| `visitor`  | A plan today with a buddy who shares a pet: their pet sits beside yours.                                                                                                                                                                                                                                                                                               |
| `gift`     | After 30 days in a row at five hearts, on deterministic gift days (hash of the pet's `seed` — or its adoption day when it has none — + day, about 1 in 10, at least 7 days apart) the pet leaves a keepsake (`olive fig pebble feather lily`, cycling) on the rug. Tap it (or use the screen reader's Pick up action) to keep it; the newest 5 sit on the window sill. |

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

- Tap the pet: head pat (squish, heart particle, pat sound, light haptic).
- Drag back and forth across it: rub (a heart every ~28 px of travel).
- Asleep: "Zzz" particles. Died: lying flat, eyes closed, greyscale, no particles.
- Wake from died: colour washes back from the feet up, the pet pops up, hearts burst, then the entrance
  is not replayed (the wake is its own animation).
- Reduce Motion: no idle bobbing, entrances and tricks are skipped (the pet is shown in place), and
  particles are static.

## Data model

`src/types/pet.ts`, store `src/stores/pet.ts` (zustand + persist, MMKV key `petCompanion`, version 1).
Synced as the optional `petStore` payload slice using the mileage pattern (records with `id` +
`updatedAt`, tombstones with `deletedAt`, `mergeById`). For copies of the same pet (same adoption
day and seed), `wakes`, `keepsakes` and `earnedRoomItems` merge as unions so a concurrent edit on
another device can't drop them; every other field is last-writer-wins.

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
  earnedRoomItems?: string[] // room items earned, in UNLOCK_ORDER order (newer ids kept); absent = none
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
  updatedAt: number
}
```

- Preferences: Home section key `pet` in `HomeScreenElementKey` (default order after `mileage`,
  default visible), and `petPromptDismissed: boolean` (syncable). The pet section shows the opt-in
  prompt card while no companion exists and the prompt isn't dismissed.
- Buddy Card: optional `pet: { species, coat, name? }` field (schema `.optional().catch(undefined)`),
  shared only when the new `sharing.pet` toggle is on (default on; Buddies Settings → Pet, shown once
  a companion exists). The `visitor` moment reads it through `usePetVisitor` (`src/app/pet/`): the
  pet of an active buddy on one of today's Plans who didn't decline it, earliest Plan first. See
  `docs/buddies-protocol.md`.

## Module layout

Shared tier (pure TS, no React Native):

- `src/lib/pixelArt/` — generic pixel engine: color math, shape rasterizer with shading and
  automatic outlines, paint layers, pixel buffer type and blit/flip/greyscale/lie-down transforms,
  pattern stamps, the digit font, deterministic RNG. Knows nothing about pets.

Feature tier `src/features/pet/`:

- `art/species/` — one file per species (rig + coats + sounds keys), `art/species/index.ts` registry.
- `art/room/` — window, wall, floor, bed, shelf, lamps, sign, keepsakes; `art/room/index.ts`
  registry + `UNLOCK_ORDER`; `art/scene.ts` composes a frame from a `SceneState`.
- `art/particles.ts` — hearts, Zzz, sparkles, dust.
- `motion/` — `Pose` type, entrance/trick/wake tables, `evaluateMotion(table, elapsedMs)`.
- `lib/life.ts` — `simulateLife`, `moodOf`, gold, rainbow day, gift days; `lib/activity.ts` — active
  day keys from stores; `lib/unlocks.ts` (unlock mode, streak numbers, earned items); `lib/lamp.ts`;
  `lib/liveWindow.ts`; `lib/eggs.ts`.
- `render/` — Skia: `skiaImage.ts` (pixel buffer → `SkImage` / PNG), `PetSceneView` (a scene player
  with the frame clock: 10 fps on the JS thread, paused when unfocused, backgrounded, at rest with
  Reduce Motion, or (Home card) scrolled fully off screen; frames reach the canvas through a shared value with nearest sampling; tap, rub and
  gift gestures; the sound bubble), `PetSpriteTile` (one idling sprite for the prompt and picker).
- `components/`, `hooks/`, `screens/` — Home section, prompt card, picker (`PetPicker`), Decorate Room
  (`PetRoom`: `lib/roomOptions.ts` holds its tabs, choices, thumbnail crops and unlock badges;
  `RoomOptionThumb` draws one crop of a still room), Rename (`PetRename`), and Share… on the card's
  menu (`lib/share.ts`: the card's view at 4×, nearest scaling, written as a PNG to the cache folder
  for the share sheet).

App tier: `src/app/pet/` for cross-feature glue (visitor from buddies + plans, widget images),
`src/app/widgets/petWidget*.ts` for the iOS widget snapshot.

## Rendering pipeline

1. `art/*` builds shape specs (ellipses, polygons, feature pixels) for the current pose.
2. `pixelArt.raster` rasterizes specs to RGBA `PixelBuffer`s; results are memoized by
   `(species, coat, pose key)` so steady-state frames don't rasterize.
3. `art/scene.ts` composes, back to front: the room base (cached per room config + data: wall,
   floor, window with rainbow, shelf, sign, sill, plant, stool, bed back, gift on the rug) → lamp
   (behind the pets, so one running past it stays in front) → visitor pet → pet → bed front →
   lighting over all of it (cached per lamp × level × time of day × breathing phase; the pets'
   pixels, a `PixelMask`, take half the room's darkness so a dark coat reads at night) → window moments (paradise walkers, shooting star) and the gift sparkle →
   particles and dust.
4. `render/PetSceneView` uploads the buffer as an `SkImage` and draws it scaled with
   `FilterMode.Nearest`. The scene is 180×100 logical pixels; views crop it with a viewport.
5. Widgets reuse steps 1–3 and encode PNGs, one per future state, written into the App Group.

## Widgets (iOS only)

Three sizes in one widget kind `PetWidget`: small (pet only), medium (compact row: pet, name, hearts,
lamp days, one line for the sign value), large (the room with a slim name/hearts/lamp row). The app
renders a timeline of PNGs: every window time change for the next 48 hours, then each future midnight
where hearts or mood change through the day the pet would die (at most 12 entries), and
writes them with `WidgetBridge.writeFile`; the snapshot JSON lists `{ date, small, medium, large }`.
Android has no home-screen widgets today.

## Analytics

See `docs/analytics.md` → "Pet companion".

## Verification

Dev harness: `__WW_DEV__.pet` (`src/app/dev-harness/pet.ts`) adopts a pet, sets species/coat/room,
fakes a life state and forces hidden moments (`override({ hearts, dead, gold, … })`), fakes the
streak room unlocks read (`override({ streak: 12 })`, shown but never stored), reads back the stored
and current unlocks (`state().unlocks`), and plays any motion (`play`, `pat`),
so every animation can be recorded in the app. See `.agents/skills/verify-witnesswork/features/pet.md`.
