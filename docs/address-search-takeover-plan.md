# Contact Form Address Search Takeover Plan

## Problem

On the Contact Form, address autocomplete suggestions render as an absolutely-positioned dropdown anchored under the search input (`src/features/contacts/components/AddressAutocomplete.tsx:359`). The input sits mid-form inside a `KeyboardAwareScrollView` (`src/features/contacts/screens/ContactFormScreen.tsx:541`), so when the keyboard rises the dropdown lands in the lower half of the viewport — suggestions are clipped or hidden entirely behind the keyboard.

The dropdown pattern is structurally fragile, not just cramped:

- Max **3 visible rows × 44pt** while the API returns up to 5 suggestions.
- A `nestedScrollEnabled` ScrollView inside the outer KeyboardAwareScrollView (known-janky nesting).
- z-index layering (10/20) to float over the fields below.
- `onBlur` clears suggestions — a tap-race trap.
- A forced `textAlign: 'left'` workaround for an iOS RN space-buffering bug.

A phone keyboard eats ~40% of the screen; an anchored dropdown mid-form can never win that fight. Scrolling the input to the top (the "minimum fix") buys ~2 more visible rows but keeps every structural problem above.

## Decision

Replace the inline dropdown with a **full takeover search sheet**, matching the platform convention (Apple Contacts/Maps, Uber, Airbnb): search bar pinned top, auto-focused, full-height results between bar and keyboard.

### Presentation: RN `Modal` with `presentationStyle='pageSheet'`, hosted in-tree

The sheet is an RN `Modal` rendered inside `AddressSection`, following the `ColorPickerSheet` / `SupporterInfoSheet` presentation pattern. Decisive argument: the search has exactly one consumer and its result is a callback (`onSelect(address)`) that already exists in `AddressSection.tsx:155`. In-tree hosting keeps that callback in scope — zero store/route plumbing. `pageSheet` gives the native iOS card sheet with swipe-to-dismiss.

**Rejected alternatives:**

- **Scroll-to-top inline fix** — band-aid on a wrong-shaped pattern; retains nested-scroll, blur-race, and z-index fragility; still caps visible results.
- **Navigation route sheet** (the `Contacts Sort And Filter` pattern, `src/app/navigation/RootStack.tsx:105`) — react-navigation can't pass the `onSelect` callback as a param (non-serializable), forcing an ephemeral zustand store round-trip for a single consumer.
- **Tamagui Sheet** (the `PinLocation` pattern) — the codebase already moved gesture-heavy content off Tamagui sheets (see the comment at `RootStack.tsx:105`: drag-to-dismiss + inner ScrollView gestures were mishandled). A sheet containing a keyboard plus a scrolling list is a worse case.

If a second consumer ever appears, promoting the sheet to a route is a mechanical refactor.

## Inline UI: dissolve the search/manual toggle

Once search happens in a sheet, the inline "search mode" collapses to a row that merely _displays_ the result — the segmented toggle (`AddressSection.tsx:207`) would switch between two read-views of the same data. It is removed.

New `AddressSection` layout:

```
── ADDRESS ─────────────────────
┌──────────────────────────────┐
│ 🔍 Search address          › │  → opens takeover sheet
├──────────────────────────────┤
│ Street     123 Main St       │  ← structured fields,
│ Line 2     Apt 4B            │    filled by selection,
│ City       Akron             │    editable in place
│ State      OH                │
│ ZIP        44301             │
│ Country    United States     │
└──────────────────────────────┘
📌 Pin location                    (unchanged)
🗑 Remove address                  (only when populated)
```

- **Fields revealed** when any address data exists OR the user tapped an "Enter manually" link (sticky local flag for the form session). Empty state shows only the search row + a small "Enter manually" link.
- **Why fields-below matters:** HERE autocomplete never returns unit numbers. Apartment corrections (`line2`) are _the_ common case in door-to-door ministry, not an edge case. Today that fix requires discovering the toggle; in the new layout it's zero extra taps — the sheet dismisses directly onto an editable, visibly-empty Line 2.
- **Prefill-from-last-contact** counts as data → fields show; the notice and its existing key-wise clear (`clearPrefill`, `AddressSection.tsx:142`) are unchanged.

## Takeover sheet design

```
┌──────────────────────────────┐
│ Cancel        Search Address │
│ ┌──────────────────────────┐ │
│ │ 🔍 123 main st_          │ │  empty on open, focused
│ └──────────────────────────┘ │
│ 📍 Using your location       │  LocationStatusPill
│ ──────────────────────────── │
│ 123 Main St, Akron OH        │  full-height results,
│ 123 Main St, Dayton OH       │  highlight matching,
│ …                            │  skeleton rows on load
│ ──────────────────────────── │
│ ✎ Can't find it? Enter       │  escape hatch → dismiss,
│   manually                   │  reveal + focus fields
│ ┌──────────────────────────┐ │
│ │         keyboard         │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

Behaviors:

1. **Search opens empty** — not seeded with the current address (today `query` is seeded via `addressToString`). Fresh search is the common case; pre-seeding costs a clear-tap every time to protect the rare typo-fix, which autocomplete re-converges on in ~5 keystrokes.
2. **Auto-focus via the Modal's `onShow`**, not `autoFocus` — focusing mid-animation on iOS clips the keyboard transition.
3. **Select → fill fields → dismiss immediately.** No confirm step; the now-visible fields are the confirmation surface.
4. **Results list** is a plain full-height list with `keyboardShouldPersistTaps='handled'`. No blur-clearing, no row cap, no nested scroll, no z-index layering. The `textAlign` iOS hack dies with the old layout.
5. **`LocationStatusPill` moves into the sheet** under the search bar — it's search context, not form context.
6. **Suggestion limit bumps 5 → ~8** — the 5-cap existed because only 3 rows were visible. _Verify the proxy (`apis.autocomplete`) honors a higher `limit` before relying on it._
7. **No Liquid Glass inside the sheet** — inputs are on the "does not belong" list (CLAUDE.md), and the native pageSheet supplies its own material.
8. **Dismissal**: Cancel button + native swipe-down. Cancel/swipe discards nothing — the form's address state is only touched by an explicit selection.
9. Existing fetch mechanics carry over unchanged: 300 ms debounce, min 3 chars, location bias, HERE highlight rendering, skeleton loading rows.

## Semantics

### Selection = full replace

Selecting a result overwrites the **entire** `address` object (current behavior, `handleAddressSelect`, `AddressSection.tsx:155`), including clearing `line2`. Stale unit numbers attached to a possibly-different building are actively wrong data — worse than missing in a door-knocking context. The visible fields convert the failure mode from silent data loss to a visibly-empty Line 2 at the moment of attention.

Rejected: preserving `line2` (silent wrong data when a contact moves buildings) and smart merge on street+city match (fails the typo-fix case it exists for — the corrected string no longer matches).

### Removing an address

Today clearing the search query clears the address (`AddressAutocomplete.tsx:331–343`); that path dies with the toggle. Replacement: a **"Remove address"** destructive-tinted text action, shown only when address data exists, near the Pin Location row. One tap sets `address: undefined` and collapses the fields back to the empty state. **No confirmation** — it only mutates form state; nothing persists until Save.

### Save-path normalization

Hand-emptied fields leave `address: { line1: '', city: '', … }`. The save path must normalize all-empty → `address: undefined` so map markers, geocoding, and "has address" checks never see a phantom address.

### Untouched

- **Geocode-on-save flow** — recently stabilized (`d5c167a5`, `63660e11`); this redesign does not touch coordinate handling.
- **`PinLocation`** sheet — unchanged.
- **`onSubmitEditing` focus chaining** across the manual fields — unchanged.

## Implementation notes

| Surface                                                    | Change                                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/contacts/components/AddressSection.tsx`      | Remove `ModeSegment` toggle + `mode` state; new layout (search row → fields → remove link); reveal flag; `removeAddress`                       |
| `src/features/contacts/components/AddressAutocomplete.tsx` | Becomes the sheet: RN `Modal` `pageSheet`, search bar, pill, results list, escape hatch. Dropdown/z-index/blur/`textAlign` workarounds deleted |
| `src/features/contacts/screens/ContactFormScreen.tsx`      | Save-path empty-address normalization; possibly slimmer props (query/isResult lifting may no longer be needed)                                 |
| `src/locales/en-US.json`                                   | New keys: remove-address, can't-find-it escape hatch; reuse `searchAddress`, `enterManually`                                                   |

- Document the presentation choice with a short comment on the `Modal`, mirroring `ColorPickerSheet`'s pattern comment. No ADR — the choice is reversible.
- No CONTEXT.md change — no new domain term; the glossary stays implementation-free.
- After the file/import changes, run `pnpm run lint` (boundaries plugin) per CLAUDE.md.

## Risks

- **User-visible behavior change** on a core flow (contact creation at the door). The toggle's removal changes muscle memory; mitigated by the search row keeping its position, icon, and label.
- **`pageSheet` + keyboard interplay** — focus on `onShow` and test that result rows remain tappable while the keyboard is up (first tap selects, not dismisses keyboard).
- **Proxy `limit` parameter** — confirm `ww-proxy.leviwilkerson.com/autocomplete` honors limits above 5.
- Manual QA: search → select → apt edit; rural "can't find it" → manual entry; prefill notice + clear; Remove address → empty state; swipe-dismiss mid-search leaves form state untouched.
