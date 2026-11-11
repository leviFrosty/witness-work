---
status: accepted
---

# Uncommon and rare room items

## Context

ADR 0044 gave hats three tiers: common, uncommon (one moving part, a green
frame) and rare (moves, changes the room, answers a pat and new coins, a blue
frame). The rest of the Shop stayed short and flat: three or four items a room
part, none over 360 coins, all still pictures. Someone who had bought a floor
had two left to choose from, and nothing in the room was worth saving for
except a hat.

## Decision

1. **Every room part the Shop sells gets two uncommon and two rare items**: wall
   pattern, floor, bed, shelf, light and the Study corner, 24 in all. Wall colors
   stay flat, since a color has nothing to move.
2. **The tiers mean what they mean for hats.** An uncommon item has one moving
   part and no reactions. A rare one moves, changes the room around it (light,
   steam, sparks, butterflies, a dimmed room for a show), and has its own
   reaction to a pat and to new coins, previewed from the same buttons under its
   card.
3. **They cost what hats of their tier cost**, dearer the more an item does:
   uncommon 620–1,000 coins, rare 1,300–2,800. The fig tree stays the dearest
   thing in the Shop.
4. **They draw in a live layer over the cached room base.** Each is a pure
   function of the scene clock, the room's time of day and season, the wall
   color, and the pat and new-coins timestamps hats already use. Nothing holds
   state, so synced devices agree, and a thumbnail, the share card, the widget
   and Reduce Motion draw one still frame.
5. **Room items never read the hearts or the streak, except lights**, which
   follow the hearts through the lamp level as every light does (ADR 0035). A
   rare light's effects go out with it at level 0.
6. **The night shows also run by day after a pat**, for 14 seconds, like the
   planetarium (ADR 0044). The room dims by the greater of what the hat and the
   room items ask for, never both.
7. **The adoption intro's fully unlocked room keeps to common items**, so it
   doesn't promise a room most people won't have for years.

The art keeps to the rules in `docs/pet-companion.md`. Specifically, the
forest's fireflies gather beside the pet on new coins, since a ring above its
head read as a halo; the falling leaves are a wallpaper print, since a branch
along the top of the wall read as a garland; and the mountain mural shows plain
stars, not constellations.

## Consequences

- The regular catalogue grows from 30,630 to 64,490 coins. Nobody is meant to
  own it all: at about 2,500 coins a year for someone out weekly who keeps their
  Plans, one rare room item is six months to a year of saving. Prices can be
  retuned in a release, and a purchase keeps what it cost.
- A device on an older build keeps a room item it doesn't know as owned, takes
  its price off, and shows that part's default (`readRoom`). Buddies see nothing
  new: a visiting pet brings its hat, not its room.
- The live layer adds per-frame work on top of the copy and lighting passes that
  already run at 10 fps: well under a tenth of a millisecond for most items in
  Node, three to four times a plain frame for the Northern lights, which paint
  the whole wall. A room with none of these items does no extra work.
- A still of the hourglass, the rocking chair or the volcano needs the live
  layer: `drawRoomBase` alone draws only what doesn't move. Everything on screen
  goes through `composeScene`, which draws both.
- `pet_hat_preview_played` became `pet_item_preview_played` with `item` and
  `part`, before the first reached a release.
