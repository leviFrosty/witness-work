# Scribe AI tools

Each file here is one tool the model can call (ADR 0032, [protocol: Tool definitions](../../../../docs/scribe-ai-protocol.md#tool-definitions)). `types.ts`, `shared.ts` and `index.ts` aren't tools.

## The tools

In registry order. Each file's `description` is what the model reads; this is the map.

| Tool                | Access      | What it does                                                                                  |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `contacts_search`   | read        | Contacts by name or street, with address, last visit and next Follow-up                       |
| `contacts_get`      | read        | One Contact's details and visit history, never its notes                                      |
| `visits_list`       | read        | Visits for one Contact or everyone in a date range, without note text                         |
| `visits_read_notes` | read        | Note text of a Contact's recent Visits. Untrusted text; refused in data protection mode       |
| `followups_list`    | read        | Planned Follow-ups through 14 days ahead by default, overdue ones always                      |
| `plans_list`        | read        | Day Plans (and the buddies going along) and Recurring Plan instances, up to 62 days           |
| `time_summary`      | read        | Totals for a month, a Service Year or a range: goal, credit, studies, by Category             |
| `time_list`         | read        | Single Time Entries in a range of up to 31 days                                               |
| `buddies_plans`     | read        | What buddies share of their plans, up to 56 days                                              |
| `time_log`          | write       | A Time Entry for today or earlier, in a new Category if named (minutes 0 marks "shared")      |
| `plans_create`      | write       | A Day Plan, timed or anytime, in a new Category if named; names buddies, refuses repeats      |
| `plans_update`      | write       | Changes to one Day Plan, by Ref or by its day; Recurring Plans can't be changed               |
| `contacts_create`   | write       | A new Contact; returns a pending `n` ref. In data protection mode its card asks for consent   |
| `contacts_update`   | write       | Changes to an existing Contact; can't delete                                                  |
| `visits_log`        | write       | A Visit with an optional Follow-up, for a known Contact, a new one, or a choice among several |
| `categories_create` | write       | A new Category on its own, credit or not; returns a pending `nk` ref                          |
| `time_update`       | write       | Changes to one Time Entry, by Ref or by its day: hours, day, Category, note                   |
| `time_delete`       | destructive | Deletes one Time Entry, by Ref or by its day. Withdrawn once a turn reads untrusted text      |
| `memory_update`     | memory      | Adds, changes or removes one note in Scribe AI's memory, in the background; never reviewed    |

Refs the tools take and return: `c` Contact, `n` pending new Contact, `p` Day Plan, `r` Recurring Plan instance, `k` Category (`k0` is Standard), `nk` pending Category, `v` Visit, `t` Time Entry, `b` buddy.

## Add a tool

1. **One file, one default export.** `defineReadTool` for a tool that answers on the device between steps, `defineWriteTool` for one that proposes changes for the User to review. Name it `noun_verb` (`plans_list`). A write that removes a record sets `destructive: true`, so ww-api withdraws it once the turn has read untrusted text. (`defineMemoryTool` is `memory_update`'s alone: it edits Scribe AI's own notes, not the User's records, so it isn't reviewed. It goes on the wire as `write`.)
2. **Input.** A `zod/v4` `z.strictObject` where every key is present: optional values are `.nullable()`, never `.optional()` or `.default()`. Dates are `day` / `optionalDay`, Refs `ref` / `optionalRef`, and the User's own words for a date or time `spoken` (all in `shared.ts`).
3. **Description.** English for the model, 2–4 sentences, at most 400 characters: when to use it, when not to, and what it returns.
4. **Behavior.**
   - `run` returns `{ ok: true, data, trust: 'app' }`. A list returns one line per item in the context's terse form (`p1 2026-10-22 120m 09:00 k0`), not an object per item, plus `truncated` when it capped the list: Refs, dates, times and minutes bare, anything else in words. JSON-quote free text inside a line.
   - Don't worry about `maxToolResultBytes`: the runner cuts a result's longest list from the end to fit, with `truncated: true` and a hint, so put the most relevant items first.
   - `propose` returns `{ ok: true, effects, ref? }`.
   - Either may return `{ ok: false, error }` instead. The error is one English sentence that tells the model how to fix its call.
   - Resolve Refs with `ctx.refs` or the `resolveContact` / `resolveCategory` helpers.
   - Neither may call a store setter; only the apply saga writes.
   - Text a person wrote (Visit notes) needs `returnsUntrustedText: true` and `trust: 'untrusted_text'`.
   - A write that creates a Contact sets `needsConsent` on its `contact.create` in data protection mode. Its card then asks the User to confirm the householder agreed (the Contact form's switch, saved as `consentGivenAt`), and Add waits for it, as it does for a "Which Maria?" choice. Don't refuse the call or send the User to the form.
   - Anything that reads householder text gets `offInDataProtection: true`. The device refuses its calls in data protection mode, but the tool stays listed: every User shares the tool list as one cached prefix, and a shorter list in one mode would read it uncached. Say the mode in its description.
   - A write that needs a record the User names but that doesn't exist yet takes it as a nullable nested object (`visits_log` `newContact`, `time_log` and `plans_create` `newCategory`) and drafts both in one call. A separate create whose Ref the next step uses costs a step.
   - A write whose pending Ref is mostly for other calls (`categories_create`, in case the model uses it instead of `newCategory`) gets `refForLaterCalls: true`: when no other call in the step uses the Ref, its result adds `next` (use the Ref now; the User adds everything together) and the turn takes one more step.
   - Say in the description when not to call it, especially reads that look useful before a write ("not before logging"): every extra read is a step, and after one the model is likelier to drop an action.
5. **Register it.** Add the tool to `SCRIBE_TOOLS` in `index.ts`. Reads go before writes, `memory_update` last, and new tools are appended, since the order is part of the prompt cache.
6. **New effect kinds.** If a write tool proposes a kind of effect that doesn't exist yet, add it to `proposals/model.ts`. Then give it an apply and an undo in `proposals/effects/`, a preview in `proposals/cards.ts`, and a place in `APPLY_ORDER`.
7. **Test it.**
   - Add the tool's valid call to `VALID` in `tools.test.ts`, plus its own cases.
   - `registry.test.ts` fails until the tool is registered once and its schema passes the protocol's rules.
   - Update the payload snapshot: `pnpm exec vitest run src/features/scribe/tools -u`.
   - The whole payload has to stay under 14,200 bytes, because it is sent on every step.
8. **Check it on the real model.** Add the messages it should handle to `../evals/scenarios.ts` and run the eval (below). When the model's calls are right, copy one into `../evals/goldens.test.ts` so the app's side of it stays pinned.

## Evals

`src/features/scribe/evals` measures what the real model does with spoken-style messages, through these tools, the context and the turn loop, against a local ww-api with an OpenRouter key:

```bash
node ~/dev/ww-api-worktrees/<branch>/scripts/verify/dev.mjs up --secrets-from ~/dev/ww-api/.dev.vars
SCRIBE_EVAL_WORKER=~/dev/ww-api-worktrees/<branch> TZ=America/Chicago \
  pnpm exec vitest run src/features/scribe/evals/scribe.eval.test.ts
```

Each scenario's checks read the accepted calls, the Refs they resolve to and the reply (`scenarios.ts`). `SCRIBE_EVAL_ONLY=plan-*,time-basic` picks scenarios, `SCRIBE_EVAL_SHARD=1/4` runs a quarter (run four at once), and `SCRIBE_EVAL_RUNS=2` repeats each, since the model varies. The report (calls, replies, cards, steps, usage units, latency) lands in `.verify/artifacts/scribe-eval-*.json`. The whole set costs about 120,000 units a run (about $0.012). Without `SCRIBE_EVAL_WORKER` it skips, so `pnpm test` never calls the model.
