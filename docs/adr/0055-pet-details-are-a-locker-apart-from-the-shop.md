---
status: accepted
---

# The pet's details are a locker, apart from the Shop

## Context

Once items were bought with coins (ADR 0035), two screens showed the same
catalogue. The pet's details (Decorate Room) listed every item, the ones not
owned dimmed with their price, a secret's silhouette, and a note to get the
rest in the Shop; a locked one opened the Shop. The Shop listed every item
too, starters included, and could also wear or place what was owned. Both
screens bought, browsed and equipped, so neither said what it was for, and
the details looked like an app sheet while the Shop looked like a game.

Games keep these apart: Fortnite's Locker and Item Shop, Animal Crossing's
wardrobe and Nook's Cranny, the "Goods" a Neko Atsume yard holds and the shop
that sells them. The locker shows only what's owned and equips with a tap; the
store sells and marks what's owned; the currency sits on top of both; a cog
opens settings.

## Decision

1. **The pet's details are its locker.** Each tab lists only what's owned
   (starters and free choices too). A tap puts an item on at once. A line over
   the cards names what's in use ("Wearing: Cap"). Nothing locked, priced or
   secret shows there; a part the Shop sells more of ends with a More in Shop
   card that opens the Shop at the next item. "New" lives here, with a red dot
   on its tab. It opens the way the Shop does: a sheet on iPhone, full screen
   with the room beside the items on iPad and an open iPhone Duo.
2. **The Shop only sells.** Starters are left out; owned items say "Owned" and
   can't be worn from it. Buying puts the item on at once and says so in a
   toast, so the User doesn't have to go back to see it.
3. **One way in to settings.** The cog in the details opens Pet Settings: the
   pet's name and look (Rename and Change pet left the details' row of
   pills), Show on Home, the reward animations and sounds (also in Settings →
   Rewards), and buddies' pets visiting.
4. **Every pet screen past the Home card has the game look** the Shop
   started: washi paper, hinoki frames and signs, sumi ink, pixel icons and
   controls (`art/gameUi.ts`). The Home card stays in the app's look as the
   door in, and the share card keeps its own, since it leaves the app.

## Consequences

- `pet_room_locked_tapped` is gone; `pet_shop_opened` says `more` for the
  More in Shop card and `menu` for the Home card's new Shop… item.
- A secret not found yet appears only in the Shop, as its silhouette.
- The details and the Shop share their cards, tabs, wallet and buttons, so a
  change to one look changes both.
