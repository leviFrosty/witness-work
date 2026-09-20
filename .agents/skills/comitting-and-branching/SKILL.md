---
name: comitting-and-branching
description: WitnessWork's committing and branching strategy — bare branch names, one commit per PR, amend + rebase instead of follow-up commits, and near-empty commit messages. Use when creating a branch, writing a commit, fixing up PR review feedback, or deciding whether something needs its own commit.
---

# Committing and branching

## Branch names

Bare feature or fix name, no prefix. `publisher-hours-logging`, `calendar-sync`, `notes-import`.

Never `feature/`, `fix/`, `agent/`, `claude/`, or anything else in front of it.

```bash
git switch -C publisher-hours-logging
```

## One commit per PR is the default

A whole feature is normally **one commit**. Multiple commits are only for genuinely distinct units of work landing together — e.g. a dependency bump commit separate from the feature that needs it, or a mechanical refactor separate from the behavior change built on top of it. If you can't name the second commit without describing part one and part two of the same change, it isn't a second commit.

## Follow-up fixes get amended, never appended

There are no `fix: address review feedback` commits. There are no "part 2" commits. When something needs to change — your own second pass, a review comment, a failing check — amend it into the commit that introduced the code.

```bash
# fixing the tip commit
git add -A && git commit --amend --no-edit
gpf   # git push --force-with-lease
```

For an earlier commit in a multi-commit branch:

```bash
git add -A && git commit --fixup <sha>
git rebase --autosquash <sha>~1
gpf
```

Rebase, never merge. To pick up `main`:

```bash
git fetch origin && git rebase origin/main
gpf
```

Force-pushing a PR branch is expected here, but always `--force-with-lease` (that's what `gpf` is).

## Commit messages are minimal

Subject line only, conventional-commit prefix (`feat:`, `fix:`, `chore:`, `refactor:`, `ai:`), lowercase, imperative, terse:

```
feat: let publishers opt into logging hours
fix: preserve advanced settings chevron rotation
```

**No body.** No bullet lists, no summary of what files changed, no restating the diff. The code and the subject line carry it.

Add a body only when there is a genuinely non-obvious **why** that a reader cannot recover from the code — an upstream bug being worked around, a deliberate non-obvious tradeoff. That is rare. If you're reaching for a body to explain _what_ changed, delete it.

## Hooks

Husky pre-commit hooks stay on. No `--no-verify` unless explicitly told.
