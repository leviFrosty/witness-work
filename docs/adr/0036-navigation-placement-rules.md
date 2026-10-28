---
status: accepted
---

# Navigation placement rules

## Context

Between September 11 and October 26, 2026, navigation changed more than 20
times. Buddies moved four times, the default tab order changed twice, and the
"+" menu's first row flipped and flipped back. Map left the tab bar for a
switch in the Contacts header (#550) without the test with Map users that its
own proposal asked for, and the events meant to measure it never reached
production.

The headers grew the same way. Contacts carried four trailing controls (List |
Map, Sort & Filter, More, Add), so its title rendered at about 72% size on an
iPhone 18 Pro, and Sort & Filter's target was 30pt. Home's header held a streak
that counted something different from the greeting under it. Progress used the
four-squares icon for Edit Cards while Schedule used it for the Year view, and
Home had no visible way to edit at all. Settings sat only behind the avatar.

What the data said when this was written:

- After Map moved into Contacts, its weekly reach fell from 20–27% of active
  users to about 6%. Visits logged (20.5% → 20.7% of active users) and
  contacts created (13.5% → 13.6%) held. About 6% is roughly the share who
  used the Map on two or more days a week before the move.
- 3.2% of active users have paired a buddy; the Buddies screen reaches 6–10%
  of users weekly.
- Settings reaches 4–8% of users weekly.
- 12 of about 700 Progress visitors customized their cards in the first four
  days; 10 of them started from the header button.

## Decision

Navigation changes follow these rules, and each one ships with what the last
rule asks for.

1. **Tabs are places with a weekly job for a large share of Users.** Five at
   most, one-word labels always shown, never added or moved by a feature flag.
   A new tab needs a written case with data.
2. **One global action, Add,** sits beside the tabs and does the same thing on
   every tab.
3. **A root header holds the avatar, the title, and at most two trailing
   controls.** One of them is the screen's primary action if it has one.
   Everything else goes in "…" or below the title. A control never appears
   only when it fits, and "…" never disappears.
4. **Controls sit just above the content they affect:** search, chips,
   segments, List | Map, date navigation.
5. **App-wide controls live on Home** (the bell, Settings). Personal stats live
   with the User: the greeting, the Profile card, the iPad sidebar's account.
   Neither floats in another screen's header.
6. **Customizing starts from an "Edit …" button after the content it edits,**
   with long press as the shortcut, never from a header icon.
7. **One icon, one meaning** across the app, and one meaning for each "+" on a
   screen.
8. **Every navigation change ships with a metric, a review date and a named
   fallback,** in one release with one Help Center note.

Applied in this release:

- Contacts keeps Map. List | Map is a labeled switch under the title, after
  search and as tall as it, in the same place on both views. The header keeps
  "…" (which always has Sort & Filter) and Add Contact, each with a full-size
  target. A Filters chip starts the chip row and counts the filters set in Sort
  & Filter. The iPad detail pane's "+ Add" reads "Add Visit".
- Home's header has a Settings gear beside the bell; the avatar's menu keeps
  Settings too. The iPhone Duo rail has Settings at its foot. On iPad, the
  sidebar's foot holds the account (avatar, name, streak) above Settings, and
  root headers drop the avatar while the sidebar shows.
- One streak: the Service Streak's badge ends Home's greeting, which no longer
  counts days in a row of its own. The streak reminder in the tray stays the
  timely nudge to keep it.
- Edit Cards leaves Progress's header. "Edit Cards" and "Edit Home Screen" are
  labeled buttons after the cards and sections. "Show all days" is the Days
  list's first row, where the days it adds appear.

### Map: when to bring the tab back

Restore the Map tab if weekly Map reach (Users with a `Map` screen view, of
weekly active Users) falls below about 4% for four weeks, or visits logged per
active User drop.

### Buddies: when it becomes a tab

Buddies gets entry points where its work already is (Home, Schedule, Profile,
the bell, the iPad sidebar) and becomes the fifth tab only when the Buddies
screen reaches 20% of weekly active Users, and 10% of weekly active Users have
an active buddy, for four weeks in a row. The default tab order is reviewed
then; Schedule is the most-visited tab after Home.

### Review

Review on January 15, 2027, against: weekly Map reach; Sort & Filter reach
(`Contacts Sort And Filter` screen views); Settings reach (`SettingsMenu` and
`Settings` screen views); `progress_cards_customized` and
`home_screen_customized` by `source`. The fallback for each change is the
layout it replaced.

## Consequences

- Headers stop gaining controls one feature at a time; a feature that wants
  one names which rule allows it.
- Map users switch with one labeled tap from either view, at the cost of a row
  under the Map's title.
- Settings has two visible paths on Home and one on every other tab.
- Customizing is one tap further from the top of Progress, and visible on Home
  for the first time.
