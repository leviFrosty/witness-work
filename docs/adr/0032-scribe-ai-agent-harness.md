---
status: accepted
---

# Scribe AI is a tool-calling agent: the app owns the tools, the server owns the model, usage is metered in tokens

## Context

Scribe AI today is Notes Import: one model call turns pasted, dictated or
photographed text into Contacts, Visits and Time Entries, which the User
reviews and accepts (ADR 0008, 0009, 0010, 0012, 0018, 0025). It can't plan
time, edit a Contact, answer "how am I doing this month?", or take a
correction without starting over. The schema of everything it can produce is
one structured-output object that grows with every new action, and ww-api
hand-maintains a mirror of it.

Publishers want to speak an update right after a call ("two hours this
morning with Sarah, and I talked to John at 42 Oak St, follow up next
Tuesday") and have it land as reviewable changes, on iOS and Android, and to
keep talking to fix what it got wrong. That's a conversation in which the model
reads the User's data and proposes writes. The User's data lives only on the
device (local-first; ADR 0008 keeps content off the server), so the model's
tools have to run on the phone.

Metering doesn't fit either. An Import Credit is charged per distinct source
text (content hash) with a free Empty Import allowance. A conversation has no
source text; its cost grows with every turn, every tool step, and the history
it resends. One credit per message would make a two-word correction cost as
much as a page of notes, and one per conversation would let one conversation
run forever.

The research behind this decision is in
[`docs/research/assistant-tool-architecture.md`](../research/assistant-tool-architecture.md)
(§7) and [`docs/research/voice-assistant-ux.md`](../research/voice-assistant-ux.md)
(Design A).

## Decision

### 1. A stateless step loop with client-executed tools

The app runs the loop. Each model step is one bearer request,
`POST /scribe/v1/step`, that carries the whole conversation; ww-api runs one
model call and streams the reply back over SSE. The device executes the tool
calls the model made and sends the next step. ww-api stores no conversation,
transcript, tool call, or tool result, before, during or after a step; it
keeps only metering records. The device keeps the transcript.

### 2. The app owns tool definitions

Each tool is one file in `src/features/scribe/tools/`: its name, the
model-facing description, a Zod input schema (sent as JSON Schema), and an
access level (`read`, `write`, `destructive`). The app sends the definitions
of the tools it offers with every step. Adding or changing a capability is a
change to the app alone, with no ww-api deploy.

ww-api owns everything around the tools: the system prompt and its safety
framing, validation and caps on the tool payload (count, size, shape), the
kill switches (global, and a per-tool denylist by name), the protocol floor,
and metering. The model never sees a tool the server's denylist names.

### 3. Reads run, writes propose, the User applies

- A `read` tool runs on the device between steps and returns structured data.
- A `write` tool never writes during the loop. Its call becomes part of a
  **Proposal**: effects the device validated and resolved but hasn't applied.
  The User reviews the Proposal as cards and taps Add. Applying is a saga:
  effects run in order, each returns an undo record, a failure undoes what
  already ran, and the batch can be undone afterwards from the toast or
  History.
- Undo, for 30 days after Add, reverses only what is still as Add left it:
  a record Add created is deleted if it's still there, and a change Add made
  is reverted only if the record hasn't changed since. A Contact or Category
  Add created stays when something outside the Proposal now uses it (a Visit
  logged since, a Time Entry or Plan in that Category). Whatever stays is
  counted as kept, and the User's next message tells the model the Proposal
  was undone.
- `destructive` exists in the type so the harness can treat it differently
  (capped, double-confirmed, withdrawn after untrusted text). v1 shipped no
  destructive tool; `time_delete` is the first. It proposes like a write, so
  the User still confirms it on a review card, and Undo puts the entry back.

### 4. The model never sees raw ids

Every id the model can use is a **Ref**, a short alias the device minted for
this conversation (`c3`, `p7`). The device resolves Refs at propose time and
rejects any Ref it didn't issue. Records a Proposal will create get pending
Refs (`n1`) that later calls in the same conversation may use. Updates carry
the record's `updatedAt` from when it was read and are re-checked at apply
(ADR 0010's Reconcile at Accept).

### 5. Untrusted text is labeled and wrapped

A tool result that carries text someone wrote (a Contact's notes, a Visit
note, a shared Contact's history) is labeled `untrusted_text`. ww-api wraps it
as data with a fixed notice before the model sees it, and once a turn has
read untrusted text it withdraws `destructive` tools for the rest of that
turn. Buddy data is trusted (it comes from people the User paired with), but
it travels as data in tool results, never as instructions. The model has no
tool that sends anything to a person or a service, and the app renders its
text as plain text.

### 6. Usage is metered in tokens, in windows, and Import Credits end

ww-api meters every model call (steps, and page transcription) in **usage
units**, a cost-weighted sum of the provider's reported token usage:
uncached input, cache writes (billed above plain input on this model), cached
input, and output including reasoning, each with a configurable weight.
Limits are windows, like Claude's:

- Supporter: a 5-hour session window and a 7-day weekly window, sized to be
  generous.
- Free: a 30-day monthly window, sized so an average User fits about two
  longer conversations and three quick edits a month.

Every limit and weight is read from KV first, so they can be tuned with real
usage. The app shows each window as percent used and when it resets, never raw
tokens. A step that starts under the limit finishes, and a turn that started
under the limit may finish its remaining steps up to a fixed grace; the
overshoot is charged.

Import Credits and the Empty Import grace (ADR 0012) end. The per-day page
allowance stays only as an abuse ceiling; pages are metered in usage units like
everything else. The cutover is hard: every `/notes-import/*` route except the
public status probe answers 426 `upgrade_required`, which older app versions
already show as Update Required. A KV switch can re-allow the legacy routes
temporarily. Past Notes Import ledger entries stay undoable on the device.

### 7. On-device speech on both platforms

Voice stays on-device (ADR 0018): the app records, transcribes on the device,
and sends text. Android gets an implementation of
`modules/speech-transcription` that uses only Android's on-device recognizer;
where it isn't available the voice entry opens the conversation with the
keyboard instead.

### 8. One model path

ww-api keeps OpenRouter with zero-data-retention routing (ADR 0008) and the
same model and host as Notes Import, now with tool calling. A provider-health
check (cached for minutes) and KV/env overrides select a fallback model or
host if tool calling isn't served there; routing still fails closed rather
than leaving the ZDR allowlist.
Each call names the User to OpenRouter only by a one-way hash of the account
id, so a provider's policy block lands on that User rather than on the whole
API key.

## Considered options

- **A server-owned tool registry, with the app declaring `name@version` and a
  contract hash** (the research's recommendation). The server would own the
  model-facing descriptions, so prompt tuning wouldn't need an app release,
  and requests would be smaller. Rejected: every new tool or schema change
  would need a ww-api deploy that ships before the app, an append-only
  history of every released schema, and CI that replays manifests across
  repos. The app is the only party that can execute a tool, so it's the
  natural owner of its contract. The costs of app ownership (a few KB more
  per request, descriptions that change with app releases, a handful of
  cache prefixes across app versions) are smaller, and server-side caps and
  the per-tool denylist keep the safety controls on the server.
- **A server-held run in a Durable Object over a WebSocket.** Fewer bytes per
  step and it survives brief disconnects, but it stores ministry text on the
  server and adds a long-lived connection on mobile. A step is short, so a
  dropped stream costs at most one step.
- **Keep per-import credits and add a per-message credit.** Simple to
  explain, but the unit has nothing to do with cost: a correction and a
  10-step conversation would cost the same. It also needs its own rules for
  empties, refinements and resends. Tokens are what the model bills, so a
  token meter can't be gamed by message shape and needs no special cases.
- **Show raw token counts.** Exact, but meaningless to a Publisher.
  Percent of a window and a reset time say what matters: how much is left
  and when it comes back.
- **Carry Import Credits over, or run both meters for a while.** Dual support
  means two clients, two meters and two sets of copy for a free allowance
  that is small. Older app versions get Update Required, which they already
  handle.
- **Server speech-to-text for Android or for locales without an on-device
  model.** Rejected for the reasons in ADR 0018; the keyboard is the
  fallback.

## Consequences

- New capabilities are app-only changes. A bad tool can be withdrawn by name
  from KV without a release; app versions that still send it simply don't
  get it offered.
- Every step resends the transcript and the tool definitions (about 2,400
  tokens for 16 tools). Prompt caching absorbs most of it (measured: 72 % of
  a first step's input, 85–96 % across a turn or conversation); the meter
  charges cached input at its lower weight and cache writes at their higher
  one, so a long conversation costs more than a short one, and a cold step
  more than a warm one, as they should.
- The device holds every conversation, its Refs and its Proposals in MMKV, not
  synced or backed up, so each device has its own Scribe AI history: the 50
  most recently used conversations, each for 90 days after its last use. The
  records a conversation added sync like any others.
- ww-api can't validate what a tool means, only its shape and size. The device
  is the authority: it parses every call with the tool's Zod schema before
  anything runs.
- Long conversations end by asking the User to start a new one when the
  context budget is nearly used; turns are never dropped silently.
- Notes Import's server code (runs, index and credit Durable Objects, the
  model schema mirror, credits) and the app's Notes Import client and manager
  are removed. Its ledger stays as a read-only undo path until its entries
  expire, 365 days after each import.
- Android needs `RECORD_AUDIO`, which was blocked while voice was iOS-only.
- Wire contract, measured usage and the default limits:
  [`docs/scribe-ai-protocol.md`](../scribe-ai-protocol.md). Operating it (KV
  switches, the Notes Import cutover runbook, real-model checks): ww-api's
  `AGENTS.md` → Scribe AI.

## Open risks

- **The provider stops serving tool calls** for the model on the ZDR hosts.
  The health probe requires `tools`, a KV fallback model can take over, and
  with neither Scribe AI reports `no_provider` and its entry points hide.
  Routing never leaves the allowlist.
- **A ww-api deploy closes Notes Import before the app replaces it.** KV
  `scribe:legacy-notes-import` must be `on` before a deploy with Scribe AI
  reaches apps without it; the cutover runbook turns it off after the store
  release.
- **Limits are sized from a few measured runs**, not real use. Every limit
  and weight is in KV, and `api_scribe_step` logs real usage to tune them.
- **Bulk history no longer fits one call.** Notes Import read up to 100k
  characters at once; a step takes 32,000 characters of user text and writes
  at most 4,096 output tokens. Paper pages are read one at a time, and
  `finish: length` asks the User to split the message. Revisit if onboarding
  imports drop.
- **On-device speech varies** by Android device and language, and emulators
  may lack it. The keyboard is the fallback.
- **Less reasoning drops actions.** At `low` effort the model sometimes left
  out the second of two actions in one message; `medium` is the default,
  slower and costlier per step.

## How we know it works

- On iOS and Android, speaking "I did two hours this morning, and I talked to
  John at 42 Oak St about hope for the future, follow up next Tuesday" gives
  review cards for the time and for John with a Visit and a Follow-up dated
  next Tuesday ("from "next Tuesday""); Add creates the records and Undo
  removes them.
- Typing works on every device that can attest; voice falls back to the
  keyboard where on-device speech isn't available.
- A free User at the monthly limit sees when it resets and the Supporter
  upsell; usage shows percent and reset times only.
- An app from before Scribe AI gets Update Required for Notes Import once the
  legacy switch is off, and still opens account sessions.
- ww-api's logs, analytics and Sentry events carry no conversation content.
