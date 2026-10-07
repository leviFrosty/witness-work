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
- `contacts-import` imports a shared contact from a share link or a `.witnesswork` file after an "Import Contact?" prompt. A contact that already exists offers Keep Existing or Replace. A malformed share shows "Invalid Link" or "Invalid File" and writes nothing.

## How to get to it (user POV)

- The Contacts tab → "Add Contact" (top-right).
- Contacts tab → a contact row → Contact Details.
- Quick Action → "Add Contact".
- The share link `https://ww-proxy.leviwilkerson.com/c#…` or `witnesswork://import-contact/<payload>` imports a shared contact.
- A `.witnesswork` file opened from Files, Messages or AirDrop, or picked in Settings → More → Import Contact, imports one too.
- Contact Details → More actions → "Share…" shares a contact; "Share as File" appears only when the contact is too large for a link.

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
- **Import.** Build inputs with the real builders, never by hand: in a scratch vitest file, call `buildContactShareLink` and `buildContactShareFile` (`src/features/contacts/lib/`), write the `witnesswork://import-contact/<payload>` form of the link and the file to `/tmp`, then delete the scratch file. Open the link, check "Import Contact?", press "Import", and read back `__WW_DEV__.stores.contacts` and the visits whose `contact.id` is the imported id. For a refusal, open a payload with a wrong-typed field and check "Invalid Link" plus unchanged store counts.
- **Opened file on iOS.** Copy the file into the simulator's "On My iPhone" folder (the `group.com.apple.FileProvider.LocalStorage` app group's `File Provider Storage`) and open its URL-encoded `file://` path with `xcrun simctl openurl <udid> '<url>'`. The app receives it like a file tapped in Files.
- **Files on Android.** `adb -s <serial> push` the file to `/sdcard/Download/`, press "Import Contact" in Settings → More, then drive the system picker with `adb -s <serial> shell input tap <x> <y>` from screenshots (menu → Downloads → the file). For the opened-file path, copy it into the app's cache with `adb shell run-as com.leviwilkerson.jwtimedev cp /data/local/tmp/<file> cache/` and send `adb shell am start -a android.intent.action.VIEW -t application/witnesswork+json -d file:///data/user/0/com.leviwilkerson.jwtimedev/cache/<file> com.leviwilkerson.jwtimedev`.
- **File export.** Make a contact too large for a link (for example a 7,000-character random custom field value through `__WW_DEV__.stores.contacts.getState().updateContact`), then "Share…" → "Share as File". The app writes the file to its `Library/Caches` (find it under `xcrun simctl get_app_container <udid> com.leviwilkerson.jwtimedev data`) before the share sheet opens; inspect that file.
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
- `wwv link` accepts the first alert it finds, which can be the app's own import prompt or refusal. To screenshot those, open the link with `xcrun simctl openurl <udid> '<url>'` on iOS (the udid is in `wwv status`).
- Don't open the `https://ww-proxy.leviwilkerson.com/c…` form on a simulator, and don't drive the link share sheet: both reach the production ww-proxy (the share sheet fetches a link preview). Use the `witnesswork://import-contact/` form.
- The system document picker (Settings → More → Import Contact) and the share sheet run outside the app; agent-device can't tap inside them on iOS. On Android, agent-device refocuses the app and closes the picker, so use `adb shell input tap` there (`uiautomator dump` fails while agent-device is attached).
- On Android, a `content://media/…` URI (or another app's file provider) is refused as "Invalid File": the file module only reads `file://` and Storage Access Framework URIs.
