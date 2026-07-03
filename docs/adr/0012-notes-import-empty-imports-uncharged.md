---
status: accepted
---

# Empty Notes Imports do not consume an Import Credit

## Context

An **Import Credit** was charged unconditionally after any successful Notes Import model run; the server never inspected the result. A paste that produced zero records — an **Empty Import** — still decremented the User's meter, even though nothing was brought in. This wastes a non-Supporter's fixed lifetime credits (5) on nothing and reads as punitive. The wrinkle: an Empty Import still costs a real (paid) third-party LLM call, so simply making empties free creates an unbounded free-LLM abuse vector — a User's credit count never drops on empties, so the existing pre-flight `limit_reached` wall never engages.

## Decision

The credit charge moves to _after_ emptiness is known. Emptiness is the existing `isEmptyPreview` predicate (zero contacts, visits, time entries, and no detected Publisher — produced Categories and Warnings do not count as records), extracted to a module shared by client and `ww-api` so the two cannot drift. In `computeCommit`/`recordUsage` (so both the streaming and legacy paths inherit it):

- **Non-empty** → charge, as before.
- **Empty, within a rolling 7-day / 5-attempt window** → do not charge; record the empty run's timestamp in the index Durable Object.
- **Empty, past the window** → charge the Credit again (soft degrade) and set `emptyCharged: true` on the `done` payload; the client renders a fixed, translatable Scribe AI turn telling the User this empty one counted.
- **Supporter** → unmetered and untracked, exempt entirely.

Pre-flight `checkCredit` is unchanged: a free User at 0 credits is still blocked before the model runs. The grace only protects the _remaining_ credits of a still-credited User from being spent on empties. Every empty run counts toward the window; Empty Imports are not written to `hash_record`, so each is a fresh count and a later re-paste of fixed text flows normally.

## Considered options

- **Hard block past the window** — rejected: locks out a legitimate User with genuinely messy notes and introduces a brand-new user-facing error state. Soft degrade reverts only to today's behavior, which needs no new error.
- **Calendar-aligned (weekly/monthly) window** — rejected: a reset boundary is gameable, and the window is invisible so calendar alignment buys no user comprehension.
- **Cap Supporters too** — rejected: soft degrade is toothless for the unmetered (nothing to charge), and a hard cap would punish paying, App-Attest-verified accounts for a threat that doesn't yet exist. Add a runaway ceiling if logs ever show one.
- **Dedup empties by content hash** — rejected: each distinct paste is a real LLM call; the unit being rate-limited is empty _calls_, not empty _texts_.

## Consequences

- The only credit error a User can ever see remains the existing `limit_reached`; the anti-abuse limit is otherwise invisible.
- A determined free abuser gets at most (5 window empties + remaining lifetime credits) free empty calls before the wall; a Supporter is uncapped by design (accepted, monitorable).
- The billing notice must be canned client copy from `en-US.json`, never LLM-generated `assistantMessage`, so it stays deterministic and localizable.
