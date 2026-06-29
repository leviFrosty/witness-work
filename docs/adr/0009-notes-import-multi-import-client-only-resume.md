# Multi-import history and resume are client-only, on a device-side ledger

## Context

Notes Import is moving from one-import-at-a-time to **N concurrent imports with
history** (see CONTEXT.md for the Working/Ready/Done vocabulary). The streaming
backend already survives app death — a `NotesImportRun` Durable Object runs the
model and holds the result for a retention window, and a `NotesImportIndex` DO
tracks _active_ runs for the concurrency cap. The gap is durability + UI on the
client: today the app forgets an import the moment the screen unmounts.

Two pulls are in tension. ADR 0008 keeps note content and model output off the
server (ZDR, account-less per-install identity via ADR 0007). But a good
"resume after crash" and "refine an old import" experience needs that content
_somewhere_. And the obvious server feature — a cross-device history list — has
no coherent meaning without an account model, which we deliberately don't have.

## Decision

**History lives only on the device.** The MMKV ledger (keyed by `contentHash`)
is the source of truth for the import list; the server retains only _active_
runs and releases them on any terminal state. One history row = one notes batch
(`contentHash`); a Refinement folds into that same row. `importId` stays an
internal run handle, persisted only while an import is **Working** so the client
can reconnect.

**The on-device ledger persists the original notesText**, alongside the result
and the undo (commit) record. This extends ADR 0008's "parsed result cached
client-side only" to the source text. It is what makes two features possible:
refine-from-history (a Refinement re-reads the original notes) and robust resume.

**Resume reuses existing endpoints, with re-kickoff as the robust fallback.** On
launch/focus, for each Working row the client first reconnects to the live SSE
stream via the persisted subscribe token (no attestation); if that token/result
window has lapsed (~1h), it re-runs the attested `/kickoff` from the persisted
notesText. Re-kickoff is **credit-free** because the credit meter is idempotent
per `contentHash`, and it lands on the same run if alive or replays the cached
result — so it is safe as a universal resume primitive. **No new backend
endpoints** are added; the only backend change is a `summary` field on the parse
result. Backgrounded-completion is surfaced **in-app** (a "ready to review"
badge on return), not via push.

## Consequences

- History is per-device and lost on reinstall — accepted, consistent with ADR 0008. A re-import after loss re-runs the model but is not re-charged.
- The device now stores source notes + results for every retained import. We
  bound this: rows persist until manually deleted ("Clear completed" + per-row
  delete), with an auto-prune of anything older than a year. Delete forgets the
  import (and its undo ability); it does not touch already-committed data.
- A capped client-side **queue** (notesText persisted) lets a user submit more
  imports than the concurrency cap and have them auto-start as slots free,
  surviving restart.
- No cross-device sync. If accounts ever arrive, this is the decision to revisit.
