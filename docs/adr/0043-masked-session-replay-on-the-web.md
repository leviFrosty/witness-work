---
status: proposed
---

# Masked session replay on the web

## Context

`docs/analytics.md` has said session replay stays off. Watching how people use
a new web app would help find what confuses them. But the web app (ADR 0037)
shows decrypted householder data, and its origin must run only our own code.

## Decision

- **Where:** the web only, through `posthog-js`. We use its bundled build with
  external script loading turned off, so nothing loads from PostHog's servers.
- **Who:** 10% of web sessions.
  - Replay follows the existing analytics setting, and is never recorded in
    Data Protection Mode.
  - Visitors in the EU and UK are recorded only after they opt in. Their
    country comes from Cloudflare.
- **What's hidden:**
  - All text, except exact interface strings in the active language. So
    names, addresses, notes and any sentence built from them stay masked.
  - Every input.
  - Attribute values that can carry content (`aria-label`, `title`, `alt`,
    `placeholder`) are blanked.
  - Images, the map frame and canvases are blocked.
- **What's never recorded:** canvas drawing, network requests and console
  output.
- **Privacy policy:** it describes the masked recordings, PostHog's US
  hosting, and retention.

## Consequences

- Recordings show layout, interface text and interactions, but never what a
  User typed or stored.
- Some interface text built from User data shows up masked. That's the safe
  default.
- `docs/analytics.md` documents replay and its masking rules.
