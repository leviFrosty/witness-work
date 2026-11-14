# Notes Import — streaming + Durable Objects migration (planned)

**Status:** Implemented 2026-06-23 (backend + client). Decisions + final shape in
the "Implemented" section at the bottom; the design narrative below is preserved
for context. Superseded by Scribe AI (witness-work ADR 0032): these routes now
answer 426 unless KV `scribe:legacy-notes-import` is `on`, and the code goes
once the cutover has run (AGENTS.md → Scribe AI).
**Owner:** —
**Repos touched:** `ww-proxy` (backend, primary) + `witness-work` (client UI/hook). Both are one repository now: the backend is `services/api`, the client the repo root.

## Problem

Today the import is a single blocking request/response:

- `POST /notes-import` (see `src/notesImport/route.ts`) calls
  `runNotesImportModel` (`src/notesImport/llm.ts`), which uses the AI SDK's
  **non-streaming** `generateObject`. The HTTP request is held open for the
  full model run.
- These LLM runs regularly take **over a minute**. That's not sustainable:
  - Risk of client / edge / Cloudflare request timeouts on slow runs.
  - The app shows a single indeterminate spinner (`useNotesImport` `submitting`
    state → `NotesImportWizard` `loadingCard`). The user has no signal, can't
    background it, and a dropped connection loses the whole run.
- Only one import can be in flight per screen; there's no notion of multiple
  concurrent imports.

## Proposed direction

Move the long-lived model run off the request path into a **Cloudflare Durable
Object** (one DO instance per import) and **stream progress** back to the client.

### Backend (`ww-proxy`)

1. **New DO class** (e.g. `NotesImportSession`), bound in `wrangler.toml` (+ the
   `[env.beta]` and `[env.dev]` blocks — bindings are not inherited; see `AGENTS.md`) with a
   migration. Keyed by an `importId` (suggest deriving from, or storing
   alongside, the existing content hash so idempotency + the client ledger still
   line up — see `notesContentHash.ts` / `notesImportLedger.ts`).
2. **Kickoff endpoint** returns immediately with `{ importId }` after App
   Attest + credit checks pass (reuse `appAttest`, `credits`, `revenuecat`,
   ZDR routing exactly as today — auth/credit/ZDR stay server-side). The DO then
   runs the model in the background (`state.waitUntil` / `blockConcurrencyWhile`
   as appropriate).
3. **Switch to streaming** in `llm.ts`: AI SDK `streamObject` (partial object
   stream) and/or surface the model's reasoning/thinking tokens. The DO relays
   these to subscribers.
4. **Stream transport:** SSE or WebSocket from the DO to the client. WebSocket
   fits the DO model well (hibernatable WebSockets keep cost down); SSE is
   simpler to consume. Decide during spike.
5. **Result retrieval / resumption:** the DO holds the final validated result
   (short retention window) so a client that reconnects can fetch it without
   re-running. Commit still happens client-side after review (unchanged).

### Concurrency + quota

- Allow **N active imports per user**, capped **3–5** depending on supporter
  status (non-supporter lower, supporter higher — exact numbers TBD).
- Needs server-side accounting of *active* imports per user (distinct from the
  existing per-import credit cap in `src/credits.ts`). A per-user DO or KV
  counter, incremented on kickoff and decremented on terminal state, is the
  likely shape.

### Client (`witness-work`)

- Rework `useNotesImport` from one-shot `await` to: kickoff → subscribe to the
  stream → render streamed status. Replace the single spinner
  (`NotesImportWizard` `loadingCard`) with a **streaming progress view** showing
  the model's thinking / partial structure so the wait feels alive.
- Support **backgrounding** an import and returning to it; a list/badge of
  active imports (up to the cap).
- `notesImportClient.ts` gains the kickoff + subscribe calls; App Attest must
  cover the streaming connection too.

## Open questions

- SSE vs WebSocket (cost, resumability, RN client support).
- Can we get useful "thinking" tokens from the provider via OpenRouter streaming
  for the chosen ZDR model? If not, fall back to coarse status events
  (`parsing` → `structuring` → `validating` → `done`).
- DO result retention window + cleanup (alarm-based eviction).
- Exact active-import caps per tier, and what the UI does at the cap.
- Idempotency/replay interaction with the existing content-hash ledger.
- Migration/rollout: keep the synchronous path behind the KV kill-switch
  (`notes-import:enabled`) as a fallback during cutover.

## Pointers

- Backend: `src/notesImport/route.ts`, `llm.ts`, `schema.ts`, `status.ts`,
  `src/credits.ts`, `src/appAttest.ts`, `wrangler.toml`.
- Client: `src/features/notes-import/hooks/useNotesImport.ts`,
  `components/NotesImportWizard.tsx`, `lib/notesImportClient.ts`,
  `lib/notesContentHash.ts`, `lib/notesImportLedger.ts`.
- Skills available in this workspace for the build: `durable-objects`,
  `agents-sdk`, `workers-best-practices`, `wrangler`.

## Implemented (2026-06-23)

**Stack decision:** Durable Objects only. Workflows were rejected (polling-only,
no token streaming — wrong primitive for a single non-checkpointable LLM call);
the Agents SDK was rejected (its `setState` auto-sync is the wrong shape for
token streaming, and its `partysocket` client is uncertified for Expo/RN). A
clean seam remains to promote the run into a Workflow later if the import ever
becomes a multi-step pipeline.

**Two Durable Objects** (`wrangler.toml`, SQLite-backed, repeated under
`[env.beta]` and `[env.dev]`):
- `NotesImportRun` (`src/notesImport/runDO.ts`) — one per import, keyed by a
  content-derived `importId`. An **alarm** runs the model in the background
  (decoupled from any client connection), appends every progress event to an
  append-only SQLite log, and fans out to attached SSE subscribers. `fetch()`
  serves the SSE stream: **replays** the log since `Last-Event-ID`, then tails
  live (lossless resume). Final result retained ~1h, then alarm-based cleanup.
- `NotesImportIndex` (`src/notesImport/indexDO.ts`) — one per meter identity;
  enforces the N-concurrent cap race-free, backs the active-imports list, and
  atomically owns the anchored import-window aggregate plus permanent replay /
  refinement records.

**Flow:** `POST /notes-import/kickoff` (App-Attested, same `contentHash`-bound
boundary as the legacy path) → gate + cap → start run DO → `{ importId,
subscribeToken }`. Client subscribes at `GET /notes-import/:importId/events`
(SSE, `?token=` capability) and falls back to `GET /notes-import/:importId/result`.
While the run is live the stream sends an SSE comment (`:\n\n`) every 15 s
(`SSE_HEARTBEAT_MS`), so a client can treat ~20 s of silence as a dead
connection; parsers skip comments. A finished, cancelled, or unknown run
closes right after its replay.

**Model:** `streamText` + `Output.object` (AI SDK v6; replaced deprecated
`generateObject`). `result.output` is the authoritative validated object;
`fullStream` is drained ONLY for cosmetic progress (phase / reasoning / output
heartbeat).

**Resolved open questions:**
- *SSE vs WebSocket* → **SSE** over `expo/fetch` (RN has no native EventSource;
  an open WebSocket can get an iOS app terminated in the background; the client
  is receive-mostly). Resumability comes from the DO's event log, not the socket.
- *Thinking tokens* → `providerOptions.openrouter.reasoning`
  (`config.reasoningEffort`, env override `NOTES_IMPORT_REASONING_EFFORT`).
  **DEFAULT `xhigh`** — on OpenRouter `deepseek-v4-flash` accepts only `high`
  and `xhigh`, and `xhigh` IS the model's max ("Think Max", ~4.2× the reasoning
  tokens of `high`). `max` is DeepSeek's native-API token, invalid on OpenRouter
  (silently degrades to default effort), so config coerces `max → xhigh`.
  `deepseek-v4-flash` co-emits reasoning AND strict structured output:
  `Output.object` maps to `response_format: json_schema` (the path V4 supports —
  NOT tool calling, which V4 rejects in thinking mode), and the schema is
  enforced only on the post-`</think>` section. The earlier "JSON in the
  reasoning channel, blank completion" failure
  was a **provider-side reasoning-parser bug** on a routed ZDR host (cf. the vLLM
  deepseek-parser issue), not a model limitation — `runNotesImportModel` recovers
  the JSON from the buffered reasoning text when `result.output` rejects, so
  reasoning stays on. `usage.reasoningTokens` is logged per run to confirm the
  model is actually thinking and to compare effort levels.
- *Retention/cleanup* → alarm, `resultRetentionSeconds` (default 3600).
- *Caps per tier* → `activeImportCap` (2) / `activeImportCapSupporter` (5),
  enforced in the index DO; kickoff returns `409`/`active_cap` at the cap.
  The legacy synchronous `POST /notes-import` takes a slot per request
  (`legacy:<uuid>`, identical requests included), released in a `finally`
  and aged out after 15 minutes in case that never runs. Its model call is
  aborted at 10 minutes (`SYNC_IMPORT_DEADLINE_MS`, `502` `model_error`,
  nothing charged), so a request still running never outlives its slot.
- *Idempotency* → `importId = imp_<sha256(uuid|contentHash[|refinement])>` →
  reconnect lands on the same run; a refinement is a distinct run.
- *Rollout* → legacy `POST /notes-import` retained as a fallback.

**Auth split:** App Attest signs the kickoff (the only abusable op — inference);
the stream is guarded by a short-lived KV capability token, not App Attest.

**Cancellation (`POST /notes-import/:importId/cancel`):** lets the client
interrupt a running import — the backbone of the app's "long-press a prompt →
edit & resend" flow. Same `?token=` capability auth as the stream/result reads
(cancel only STOPS work, it can't spend inference, so it needs no App Attest).
The run DO holds an `AbortController` per run and threads its signal into
`runNotesImportModel`'s `streamText`; `cancel()` aborts it (stops provider-token
spend), writes a terminal `cancelled` status/event, frees the user's concurrency
slot immediately (so a resend isn't blocked by the cap), and drops the raw notes.
Because `recordUsage` is only ever reached AFTER the model resolves, an
interrupted run is **never charged** — same guarantee as the failure path. On the
client, the manager's `remove(hash)` fires this best-effort before forgetting an
in-flight row; "edit & resend" then submits the edited prompt as a clean new
import.

**Empty Imports (ADR 0012):** a successful run that produced ZERO records
(`isEmptyImportResult`, the server mirror of the client's `isEmptyPreview`) does
not spend an Import Credit — `recordUsage` sees `isEmpty: true` and, within a
rolling window (`emptyWindowSeconds`/`emptyWindowLimit`, default 5 per 7 days,
tracked in the index DO's `empty_run` table), returns the credit untouched and
records no `hash_record` row (so a later re-paste of corrected text still flows as
a fresh, chargeable import). Past the window it charges again (soft degrade) and
sets `emptyCharged: true` on the `done` payload, which the client turns into a
fixed Scribe AI notice. Empty grace applies whenever a finite effective
allowance would otherwise charge; an unlimited effective allowance has nothing
to save. Supporter status itself is not a metering bypass.

**Allowance update (issue #428):** imports use a fixed window anchored by the
first successful finite charge. Runtime policy comes from `NOTES_KV`
`notes-import:limits` (KV → env → defaults, 60-second edge cache), with `-1` /
`0` / positive finite semantics for both tiers and refinements. The dedicated,
rate-limited admin reset route uses a distinct `ADMIN_API_TOKEN` secret per
environment and preserves permanent hash/refinement records.

**One-time deploy:** the SQLite DO classes use the existing `v1` migration;
`wrangler deploy` (prod) and `wrangler deploy --env beta` apply it for a new
environment (`[env.dev]` is local only and never deployed). Development pre-window aggregate data may be reset; no production
migration is needed because Scribe has not shipped.
