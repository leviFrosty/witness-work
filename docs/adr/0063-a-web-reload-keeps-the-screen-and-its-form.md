---
status: accepted
---

# A web reload keeps the screen and its form

## Context

On the web, a reload starts the app again from the address bar. React Navigation
turns that address back into screens only through the linking config, and most
screens have no path there. Their addresses (`/Contact%20Form?id=…`) are
written from route names, so they don't parse back: a reload opened Home. Every
param came back as a string, and anything typed into a form was lost.

## Decision

- **The screen.** On every navigation change, the web app saves the navigation
  state (route keys, names and params, not the full state) to an MMKV store,
  `reload-restore`. At launch, if the address is still the one that state
  writes, the app opens that state: the whole stack, Back history and typed
  params. A different address parses as a link, as before.
- **The form.** Form screens keep their draft in `useReloadState(name,
initial)` (`src/lib/reloadRestore`) instead of `useState`. On the web it saves
  the value under the screen's route key and restores it after a reload. It
  forgets the value when the screen closes, and when a saved navigation state
  no longer has the route. On iOS and Android it is `useState`.
- **Scope.** Only fields of a navigation screen take part. A form that also
  shows in a sheet or inline passes `null` as the name there, since the sheet
  doesn't come back after a reload (`TimeEntryForm`'s `restoreOnReload`).
  Photos and files stay out: a draft holds only JSON and dates.
- **Secrets stay out.** While any open route has a `link` param (a Buddies
  invite, a sign-in link), nothing is saved and the saved state is cleared, so
  the secret never reaches storage. A reload there opens by address, as before.
- **Tabs have paths.** Each tab has a lowercase path, with the old capitalized
  route-name address as an alias, so an address typed or bookmarked opens its
  tab. They are web only: on native, `/contacts` on the app-link host is a
  shared Contact.

## Consequences

- A new form screen uses `useReloadState` for each field the User types or
  picks, and keeps transient UI (open menus, loading flags) in `useState`.
- An effect that fills a form when its inputs change skips its first run, or it
  overwrites the restored draft (see `PlanDayForm`).
- Drafts sit in IndexedDB next to the data they edit, and signing out wipes
  them with everything else.
- Scroll position isn't restored.
