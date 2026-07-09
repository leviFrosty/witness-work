---
name: pull-requests
description: How to write a WitnessWork PR description
---

# Pull request descriptions

Keep the description to a minimum, it should be scannable by a reviewer in ~5 seconds. Only expand out the description when the change is extremely non-obviously complicated. Make the PR description only explain how/what and not why, the why will live in the commit message. Only include why if it's not in the commit message and is absolutely necessary for explaining a very very long complex change. It should include functional changes to the behavior or items and not detailed code references to specific files.

At the maximum a description should be no more than 2 paragraphs.

Do not include "Checks/tests" which mention "pnpm typecheck", etc. Only include mandatory, unresolved human-in-the-loop checks. For taste-dependent UI checks, follow the `ui-feedback-loop` skill and give the reviewer an exact screen/state and focused questions.

Reference existing issues as "fixes #321", "ref #211", etc. by using the /github-issues skill where necessary.
