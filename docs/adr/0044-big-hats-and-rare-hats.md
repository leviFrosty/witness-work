---
status: accepted
---

# Big hats, and rare hats that change the room

## Context

The Shop sold 12 hats, the dearest at 360 coins, and the regular hats drew less
interest than the playful secret ones: in the Shop's first ten days the rubber
duck was picked by 467 people and the cap by 83, though secrets opening early
inflates that. Hats were one still picture on a 24 × 20 canvas, so nothing could
rise far above the head or move, and there was nothing to save for past the top
hat. A pet that visits a buddy also went bareheaded, so a hat was only ever seen
by its owner.

## Decision

1. **27 more hats, cheapest first.** Six cheap ones in the gaps of the old ladder
   (110–380), five silly ones that don't move (400–560), eleven with one moving
   part (620–1,100) and five rare ones (1,200–3,200). `ITEM_PRICES` holds them
   like any other item, in whole tens, so `storedPrice` stays exact.
2. **Rare hats have a blue frame on their item card**, in the Shop and the
   details, and nothing extra in the room: the effect is the point there. The
   eleven with one moving part are `uncommon` in the code, with a green frame.
3. **A rare hat moves, changes the room, and answers you**, with its own
   reaction to a pat and to new coins. Selecting any hat that reacts plays its
   pat reaction, and buttons under its card play each one, since nobody saves
   for what they can't see. The lighthouse and planetarium dim the room for 2 seconds on new
   coins by day, or their flash and shooting stars wouldn't show.
4. **Hats never read the hearts or the streak.** They look the same for a pet
   that's doing well and one that isn't, and a hidden streak changes nothing. The
   Mailbox and the fig tree read days out instead, and the lamp keeps following
   the hearts (ADR 0035): the lighthouse and planetarium dim the room with an
   overlay over the lit scene, not by turning the lamp down.
5. **The night shows also run by day after a pat**, for 14 seconds. Otherwise
   most people, who look at the app by day, would never see what they saved for.
6. **The fig tree can't be bought grown.** It grows with days out since its
   purchase, replayed from records like hearts and coins (`figGrowth`), so it costs
   coins once and then rewards going out. Stages are at 0, 3, 8, 16, 30 and 50 days.
7. **Everything a hat does is a pure function of the scene clock**, the room and
   `HatLife`. Pats and coins are timestamps the player passes in. No hat holds
   state, so synced devices agree, and the widget, the share card and Reduce Motion
   just draw a frame.
8. **The Buddy Card carries the hat** (`pet.hat`, and `pet.hatGrowth` for the fig
   tree), without bumping `v`. A visitor's hat moves but doesn't change the room,
   which belongs to whoever's phone it is. A list row keeps its small portrait.

The art keeps to the rules in `docs/pet-companion.md`: no crowns, uniforms,
helmets of office, halos or holiday items. Specifically, the propeller has two
blades because four read as a cross at some frames, and the planetarium projects
plain stars, not constellations or signs.

## Consequences

- The regular catalogue grows from 7,200 to 30,630 coins. Nobody is meant to own
  it all soon. Someone out weekly who keeps their Plans (about 2,500 coins a year)
  reaches the first rare hat in about 6 months and the last in about 15 if they
  buy nothing else; every Routine habit makes that 2 and 6; without Plans (about
  720 a year) it's 20 months and over 4 years. Prices can be retuned in a release.
- A device on an older build keeps a hat it doesn't know as owned, takes its price
  off, and shows the pet bareheaded. A buddy on an older build ignores `pet.hat`.
- The bare 10 fps redraw already ran all the time, so moving hats don't change when
  the frame clock runs. The room shows add a full-scene pass while they play.
- The fig tree's stage on the Buddy Card tells a buddy a rough count of days out
  since it was bought. A buddy already sees the streak and the tree itself.
- The tallest hats are cut off in the smallest widget, which crops close to the pet.
