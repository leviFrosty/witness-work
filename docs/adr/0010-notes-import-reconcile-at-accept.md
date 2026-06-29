# Cross-import deduplication happens at Accept time, not at parse time

## Context

The model deduplicates an import's _new_ contacts and categories against the
user's existing data by being handed an `existingContacts` / `existingCategories`
snapshot in the request `context`. That snapshot is frozen when the import is
kicked off.

With one-import-at-a-time this was safe: each import was accepted (committed)
before the next began, so the next import's snapshot already contained everything
the previous one created. **Multi-import breaks that invariant** — a user can now
kick off import B before accepting import A, so B's snapshot is blind to A's new
records. The commit layer dedups only by record _id_, and new records get
content-hash-derived ids, so the same person appearing in two batches inserts
twice. In a return-visit domain — where revisiting the same householders across
months is the entire point — duplicate contacts would be routine, not rare.

## Decision

**Reconcile at Accept time.** When an import is accepted, re-map its new contacts
and categories against the user's _current_ local data (not the kickoff
snapshot). An exact normalized-name match attaches to the existing record instead
of inserting a duplicate; a genuinely ambiguous match (e.g. two people with the
same name) is surfaced as a warning for the user to resolve (merge vs. create
new), reusing the existing warnings UX.

This keeps the previous sequential-safety property under concurrency: whatever
order imports are accepted in, each Accept sees everything accepted before it.

## Consequences

- Dedup now happens in two places with different jobs: the model's kickoff-time
  dedup against the snapshot (best-effort, reduces noise) and the authoritative
  Accept-time **Reconcile** against live data. CONTEXT.md flags this so the
  second isn't mistaken for a redundant copy of the first.
- Undo stays correct: the commit record stores only what _this_ Accept inserted,
  so undoing an import that reconciled onto an existing contact deletes only its
  own additions, never the pre-existing record.
- Name normalization is a heuristic; ambiguous matches must fail safe to a
  user-resolved warning rather than auto-merging two distinct real people.
