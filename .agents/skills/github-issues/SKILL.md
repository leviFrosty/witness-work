---
name: github-issues
description: Issue/PRD tracking and triage for WitnessWork via the `gh` CLI on leviFrosty/witness-work. Use when creating, reading, listing, commenting on, labeling, or closing GitHub issues, or when applying the repo's triage labels.
---

# GitHub issues & triage

Issues and PRDs for this repo live as GitHub issues at [`leviFrosty/witness-work`](https://github.com/leviFrosty/witness-work). Use the `gh` CLI for all operations — it infers the repo from `git remote -v` when run inside the clone.

## Common operations

- **Create:** `gh issue create --title "..." --body "..."` (heredoc for multi-line bodies).
- **Read:** `gh issue view <number> --comments`.
- **List:** `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with `--label` / `--state` filters as needed.
- **Comment:** `gh issue comment <number> --body "..."`.
- **Label:** `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close:** `gh issue close <number> --comment "..."`.

When a skill says "publish to the issue tracker" → create a GitHub issue. "Fetch the relevant ticket" → `gh issue view <number> --comments`.

## Triage labels

Five canonical roles, each mapping directly to a label string in this repo:

| Label             | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| `needs-triage`    | Maintainer needs to evaluate this issue                 |
| `needs-info`      | Waiting on the reporter (repro, questions, screenshots) |
| `ready-for-agent` | Fully specified, ready for an AFK agent                 |
| `ready-for-human` | Requires human implementation                           |
| `wontfix`         | Will not be actioned                                    |

If a label is missing, recreate it via `gh label create` rather than inventing a new name.

Full reference (consumed by the engineering skills too): `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md`.
