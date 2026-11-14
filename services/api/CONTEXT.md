# ww-proxy — Scribe AI and Notes Import

This folder (`services/api`) is a Cloudflare Workers proxy hosting several unrelated features (HERE
API, iOS universal links, Scribe AI, Notes Import). The ones with rich domain
language are **Scribe AI** — the in-app assistant that proposes changes to the
User's records ([Scribe AI](#scribe-ai) below) — and **Notes Import**, the
feature it replaced, which turns a user's free-text field-service notes into
structured WitnessWork records. This glossary governs both across the backend
(`ww-proxy`, here) and the client (the app, at the repo root). The app's own
glossary is [`../../CONTEXT.md`](../../CONTEXT.md).

## Language

### Core nouns

**Import**:
One submission of a user's free-text notes for parsing into structured records.
Its identity is the **content** (a hash of the notes) — resubmitting the same
text, or refining it, is the **same Import** and the same history row. One row in
the history list = one Import.
_Avoid_: job, session, request.

**Run handle** (`importId`):
The backend's internal handle for a single background model execution of an
Import. NOT the Import's identity — a Refinement is a new Run handle for the same
Import. The client only holds the *current* Run handle while an Import is
**Working** (to reconnect to it); it is meaningless once the Import is Ready/Done.
_Avoid_: treating importId as "the import" in user-facing terms.

**Refinement**:
A follow-up natural-language instruction that re-parses the **same** source notes
of an existing Import. A Refinement is a distinct parse but concerns the same
source text.
_Avoid_: edit, correction, retry (retry means re-running after a failure).

**Summary**:
A short (≤5 word) model-generated label for an Import, returned as a field on the
parse result (same model call) and used as its row title once the Import is
**Ready**. While **Working** (and after a cold-start resume), the row shows a
**provisional title** instead — a persisted first-line snippet of the notes. A
deterministic counts line ("3 contacts · 5 visits") is shown as a subtitle in any
state once a result exists.
_Avoid_: title (when ambiguous), name, description.

**Supporter**:
A user who gets the Supporter allowances (unlimited by default). Who counts is
defined once, in witness-work ADR 0014
(`docs/adr/0014-supporter-status-rule.md`): an active subscription (including
a promotional grant) or a `Lifetime Supporter` grant, never a one-time Tip.
`isSupporter()` in `src/revenuecat.ts` implements it for the server and must
agree with the app's `supporterSinceDate`.
_Avoid_: keying Supporter status on one RevenueCat entitlement name.

### Lifecycle states

An Import is always in exactly one of these. This is the canonical user-facing
vocabulary; the UI renders these, not the finer-grained backend run statuses.

**Working**:
The model is still parsing the Import; no result yet. A failed run is shown as an
error **within** the Working state (retry in place), not as a separate top-level
state. Two sub-states of Working are surfaced as labels (never as their own
top-level state): **Queued** (submitted but waiting client-side for a concurrency
slot, not yet kicked off) and **Running** (a model run is live).
_Avoid_: in-progress, running [as a top-level state], loading, pending.

**Ready**:
Parsing finished and a result exists, but the user has not yet reviewed and
accepted it. The user must act.
_Avoid_: done (this collides with the backend status — see ambiguities), parsed,
complete, awaiting.

**Done**:
The user **accepted** a Ready Import — its records were committed into the user's
local data. Rendered as checked-off.
_Avoid_: accepted (that is the *action*, below), completed, imported, finished.

**Accept**:
The user action that turns a **Ready** Import into a **Done** one by committing
its parsed records. (**Undo** reverses an Accept, returning the Import to Ready.)

**Reconcile**:
The matching, performed at **Accept** time, of an Import's *new* contacts and
categories against the user's *current* local data — so a person/category already
created by an earlier Import is reused rather than duplicated. Exact name matches
attach automatically; ambiguous ones surface as a warning for the user to resolve.
Necessary because each Import's model-side dedup is frozen at its kickoff and is
blind to Imports accepted later.
_Avoid_: merge (that's the user resolving an ambiguous Reconcile), dedupe (the
model does a different, kickoff-time dedup against `existingContacts`).

## Relationships

- An **Import** moves **Working → Ready → Done**.
- While **Working**, an Import may error and be retried in place (still Working).
- A **Refinement** concerns an existing Import and produces a new parse of the
  same source notes; only **Ready** Imports can be refined.
- **Accept** transitions **Ready → Done**; **Undo** transitions **Done → Ready**.
- A **Summary** labels an Import in the history list regardless of state.

## Example dialogue

> **Dev:** "The user has three Imports in the list — two spinning, one checked
> off. What are their states?"
> **Domain expert:** "The two spinning ones are **Working**. The checked one is
> **Done** — they **Accepted** it. There's a fourth that finished but they
> haven't looked at yet; that one's **Ready**, and it's the one I most want the
> UI to nag about."
> **Dev:** "And if they tweak the Ready one?"
> **Domain expert:** "That's a **Refinement** — same notes, new parse. Still
> Ready afterward, just with a different result."

## Flagged ambiguities

- "in-progress" was used to mean both **Working** and **Ready** — resolved: these
  are distinct states with different durability/resume semantics. "in-progress"
  is retired from the vocabulary.
- "queued" is overloaded: the backend run-status `queued` (`events.ts`) means
  *accepted server-side, model not yet started* — it appears only after a kickoff.
  The user-facing **Queued** sub-state means *not yet kicked off at all* (waiting
  client-side for a concurrency slot). Different things; keep them distinct.
- "done" is overloaded: the backend run-status value `done` means the model
  finished and a result is available — that is the **Ready** state, NOT the
  user-facing **Done** (which requires an **Accept**). When you see `done` in
  `events.ts`/run code, read it as **Ready**.

## Scribe AI

The wire contract and its terms are the app's
[`docs/scribe-ai-protocol.md`](../../docs/scribe-ai-protocol.md)
(ADR 0032). The device runs the loop and every tool; the server runs one model
call per **Step** and keeps no conversation content.

**Conversation**:
A device-owned transcript, id `conversationId` (a ULID minted on the device).
The server never stores one; each Step carries all of it.

**Turn**:
One user message and every Step until the model stops calling tools; id
`turnId`. A Turn admitted at Step 0 may finish over the limit within the
**Turn grace**.
_Avoid_: round, exchange.

**Step**:
One model call, `step` its 0-based index within the Turn; one
`POST /scribe/v1/step`. Its idempotency key is `(turnId, step)`.
_Avoid_: request (a refused request is no Step), iteration.

**Tool**:
A capability the app defines and runs on the device: `read`, `write`, or
`destructive`. The server checks a Tool's shape, never runs it, and names none
in its system prompt.

**Offered set**:
The Tools a Step lets the model call: the app's definitions minus the KV
denylist and, once the Turn is **Tainted**, minus every `destructive` Tool.

**Proposal**:
The write calls of one Turn, resolved on the device and waiting for the User
to review and tap Add. Nothing is saved before that.
_Avoid_: saying the model "saved", "logged", or "added" anything.

**Ref**:
A short alias the device minted for a record (`c3`, `p1`); the model never sees
raw ids.

**Tainted**:
A Turn after any tool result carried text a person wrote (`untrusted_text`,
such as a Visit note). It loses `destructive` Tools for its remaining Steps.

**Usage unit**:
The meter's unit: `ceil(uncached input + 0.1 × cached input + 5 × output)`
tokens by default. Distinct from Notes Import's **Import Credit**.
_Avoid_: credit, token (tokens are the model's own count).

**Usage window**:
A period with a unit limit: `session` (5 h) and `weekly` (7 d) for
Supporters, `monthly` (30 d) for everyone else. A window starts at the first
charge after the previous one ended.

**Turn grace**:
Steps after Step 0 of a Turn admitted under the limit keep being admitted for
`turnGraceMinutes` while usage stays under the limit plus `graceUnits`, so a
Turn isn't cut off halfway.

