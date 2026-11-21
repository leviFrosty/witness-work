---
status: accepted
supersedes: [0035, 0044, 0045, 0057]
---

# Shop prices cut to a third, and the difference given back

## Context

The Shop's prices (ADR 0044, 0045, 0057) assumed someone out in the ministry
most days. Four weeks of analytics after the Pet shipped (November 2026, about
2,000 pet owners with two or more weeks since adopting) showed otherwise:

- The median pet owner earned about 115 coins a month: about ten days out, plus
  streak milestones. At that pace the cheapest uncommon item (620) took about
  five months, and the cheapest rare item (1,200) about ten.
- 0.9% of pet owners could afford any uncommon item after two to four weeks,
  and none could afford a rare one.
- Of 227 purchases, one was uncommon and none were rare. Most cost 100–160.

The uncommon and rare items are the ones with the most work in them, and
almost nobody would see them.

## Decision

1. **Every price is about a third of what it was.** Each price is multiplied
   by 0.3 and rounded to a whole ten, with 30 as the lowest. Common items now
   cost 30–170, uncommon 190–330, and rare 360–960. Each part keeps its order,
   and the tiers don't overlap. At the median pace the cheapest uncommon item
   is about seven weeks away, and the cheapest rare item about three months.
   Prices stay whole tens, so purchases keep storing them ÷10 (ADR 0057).
2. **A purchase costs the lower of what was paid and today's price.**
   `spentOn` charges each stored purchase `min(paid, priceOf(item))`. Anyone
   who paid an old price gets the difference back the next time coins are
   counted, on every device, with no new record. A raised price never charges
   more. An item this build doesn't sell costs what was paid. This replaces
   ADR 0035's "a purchase keeps what it cost": the stored price is now the
   most a purchase can cost.
3. **The people who got coins back hear about it once.** If a device sees
   coins given back that it hasn't told the User about, the notification tray
   shows one item. It has the Pet's name and the amount, and a Go to Shop
   button. It is identified by `PRICE_CUT` (`'2026-11'`). Tapping Go to Shop
   or dismissing the item settles it in a per-device store (`petPriceDrop`),
   because the tray forgets its own dismissals after a year. Someone who
   never paid more than today's price never sees it. A later cut bumps
   `PRICE_CUT`, so the same people hear about that one too.

## Considered options

- **Earn coins faster instead.** That would keep the prices people had seen.
  But ADR 0057 sets earnings so that the ministry stays at the center, and the
  Help Center explains them one line at a time. The prices were the part that
  was wrong.
- **Rewrite stored purchase prices.** Purchases merge as a union by item and
  keep the earliest (ADR 0035). A device that hadn't updated could merge an
  old price back in, and the coins would be taken again.
- **Store a refund record.** This adds synced state and a merge rule for an
  amount that the purchases and the price table already give.

## Consequences

- Builds from before this change still charge the old prices, so they show
  fewer coins until they update. If the coins given back are spent on an
  updated device, an older one may show 0 until it updates. ADR 0057 accepted
  the same thing.
- A future price cut gives everyone who paid more the difference, with no
  extra code. Raising a price only affects new purchases.
- `pet_item_bought`'s `price` reads about three times lower from this release.
  `pet_shop_opened` gains `from: price_drop` for the tray item's button.
