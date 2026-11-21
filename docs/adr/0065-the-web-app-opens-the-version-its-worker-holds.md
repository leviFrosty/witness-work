---
status: accepted
---

# The web app opens the version its service worker holds

## Context

The web app's service worker answered navigations network first, with a 4 s
timeout (ADR 0037 §6 only asked that a service worker cache the app). After a
deploy, the network's `index.html` named the new version's chunks, which the
running worker hadn't cached, so the page downloaded the new app chunk (about
5 MB) before it could draw. At the same moment the browser installed the new
worker, and Workbox precached the whole new version (about 16 MB) over the same
connection. On a slow connection, the first launch after a deploy sat on the
splash for many seconds, and every launch waited up to 4 s for the network.

## Decision

- **Navigations open the precached shell, at once.** The active worker answers
  every navigation with its own `index.html`, and every chunk that page loads is
  in the same precache. The network is used only when the shell isn't cached.
- **A new version downloads in the background, after launch.** A new worker's
  install holds its precache until the page sends `START_PRECACHE`, 10 s after
  launch, or until 60 s pass with no page to send it.
- **It takes over only through Reload or a fresh start.** The downloaded worker
  waits, and the **Update available** toast offers Reload. Closing every tab of
  the app also lets it take over for the next launch.
- **Reloads that need the new version take it first.** Update Required's
  **Reload WitnessWork** and the stale-chunk reload have the newest worker take
  over (`SKIP_WAITING`) before they reload.

## Considered options

- **Keep network first with a shorter timeout.** It still waits on every launch,
  and a fast enough response after a deploy still downloads the new version
  before the first draw.
- **Stale while revalidate for the shell.** It opens fast, but the next launch
  would load a new `index.html` whose chunks the old worker doesn't have, which
  is the same download in the way of the launch.
- **Lower fetch priority for the precache, without a gate.** The app's own
  requests go to ww-api on another origin, over another connection, so a
  priority hint barely helps them.

## Consequences

- A reload, or opening the app again while a tab is still open, shows the same
  version. The new one arrives through the toast or once every tab is closed.
- A deploy reaches a User at least 10 s after launch plus the download.
- A broken shell can't be fixed by the network alone: it's fixed by deploying
  a new worker, which downloads in the background as usual. `sw.js` is never
  cached, so that always works.
- Version skew between the web app and ww-api lasts until the User reloads.
  ww-api already stays backward compatible for older store builds, and
  Update Required covers versions it no longer serves.
