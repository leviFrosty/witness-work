# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's GitHub issues.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Notes

- The previous `need-repro-steps` label was folded into `needs-info` — `needs-info` covers any state where we're waiting on the reporter (repro steps, clarifying questions, screenshots, etc.).
- Labels were created on 2026-05-05 during initial setup. If a label is missing, recreate via `gh label create` rather than inventing a new name.

Edit the right-hand column to match whatever vocabulary you actually use.
