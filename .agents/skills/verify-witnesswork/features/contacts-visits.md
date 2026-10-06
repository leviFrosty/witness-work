# Contacts and visits

Users keep the people they meet as contacts, log each conversation as a visit, mark Bible studies, and set follow-ups that surface on Home when they're due or overdue.

## Sub-features

- `contacts-list` shows the Contacts tab with search and the All / Stale / This month / This week chips, plus a List/Map toggle.
- `contacts-chips-reorder` reorders the last-visit chips and Saved View chips: touch a chip, pause briefly, then drag it. A quick swipe scrolls the row, and holding a Saved View chip still opens its menu (Rename…, Delete View). All stays first.
- `contacts-map-filters` applies the list's filters, chips and Saved Views to the Map, whose floating header shows the same chips once the map has pins.
- `contacts-create` lets the user create a contact from "Add Contact" (Name is required). Saving offers to log the first visit, with Skip.
- `contacts-details` shows Contact Details: identity, address actions (Call, Text, Navigate) and Conversation History.
- `visits-create` logs a conversation from Contact Details ("+ Add" in Conversation History) or Quick Action.
- `visits-follow-up` sets a follow-up date, which shows on Home as approaching or overdue.
- `contacts-deep-link` opens `witnesswork://contact/<id>` and `witnesswork://contact/<id>/<visitId>` (highlighted visit).

## How to get to it (user POV)

- The Contacts tab → "Add Contact" (top-right).
- Contacts tab → a contact row → Contact Details.
- Quick Action → "Add Contact".
- The share link `https://ww-proxy.leviwilkerson.com/c#…` or `witnesswork://import-contact/<payload>` imports a shared contact.

## Driving it with ww-verify

Preconditions:

- Create: `wwv seed onboarded` (empty list, "No contacts yet").
- Details and visits: `wwv seed pioneer`. It has eight contacts, including `verify-contact-0` "Ada Reyes", `verify-contact-1` "Bruno Okafor" (overdue follow-up) and `verify-contact-2` "Chen Wei" (upcoming follow-up).

Steps:

- **Create.** Run these in order:
  - `wwv ad press 'label="Contacts"' --settle`
  - `wwv ad press 'label="Add Contact"' --settle`
  - `wwv ad press 'label="Name"' --settle`
  - `wwv ad type "Maestro Verify"`
  - `wwv ad press 'label="Save"' --settle`
  - `wwv ad press 'label="Skip"' --settle`

  The list shows "Maestro Verify".

- **Read back.** Run `wwv eval '__WW_DEV__.stores.contacts.getState().contacts.map(c => c.name)'`. It includes "Maestro Verify".
- **Details by deep link.** Run `wwv link 'witnesswork://contact/verify-contact-0'`. The route is `Contact Details` and "Ada Reyes" is visible, with Conversation History showing 2.
- **Log a visit.** On Contact Details, press "+ Add" next to Conversation History. Fill the visit, then save. Read back with `wwv eval '__WW_DEV__.stores.conversations.getState().conversations.filter(v => v.contact.id === "verify-contact-0").length'`, which returns 3.
- **Follow-ups on Home.** Run `wwv ad press 'label="Home"' --settle`. Home lists Bruno Okafor as overdue and Chen Wei as upcoming.
- **Reorder chips.** On the list, run `wwv ad gesture drag 'label="This month, 6"' 'label="All, 8"' 350 800 400` (hold 350 ms, move, hold). Read back with `wwv eval '__WW_DEV__.stores.preferences.getState().stalenessChipOrder'`, which now starts with `week`. Saved View chips need `__WW_DEV__.setSupporter(true)` and views in `savedContactViews`; their order is each view's `order`. `wwv ad longpress 'label="<view name>"' 1200` opens the menu instead.
- **Filters on the map.** Set `hasCompletedMapOnboarding: true` through `__WW_DEV__.stores.preferences`, press "Map", then press "This week, 2" in the header. The cards and pins show only Ada Reyes and Bruno Okafor; "All, 8" brings back every pin.
- **Proof.** Run `wwv shot contact-details` and `wwv errors`.
- **Scripted.** Run `wwv flow e2e/maestro/add-contact.yaml`.

## Gotchas

- "Navigate", "Call" and "Text" leave the app, opening Maps, the phone or Messages. Avoid them unless they're under test, then run `wwv up` to come back cleanly.
- The iOS keyboard often has no dismiss key, so `keyboard dismiss` may refuse. Press the next control instead.
- Map pins need coordinates. Scenario contacts are placed around the simulator's default San Francisco location.
- `busy` seeds 160 contacts for list and map performance checks. Expect slower snapshots there.
- A drag has to start on the visible part of a chip. Chips cut off at the row's edge, or scrolled away by an earlier swipe, take the gesture nowhere; scroll the row back first.
- A Saved View drag must start moving within about half a second of the touch; a longer still hold opens the chip's menu by design.
- Panning the map or stowing its cards compacts the header and tucks the chips away. Press the Contacts title to bring them back.
