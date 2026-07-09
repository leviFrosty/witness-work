---
name: ui-feedback-loop
description: Choose the visual feedback and verification loop for WitnessWork UI work. Use when implementing, reviewing, or polishing React Native screens, components, layout, styling, animation, interaction states, or accessibility; when considering simulator screenshots or computer use; or when a change is described as visual, pixel-perfect, or design-sensitive.
---

# UI feedback loop

Treat visual computer use as an expensive escalation, not a routine verification step. WitnessWork UI is usually taste-led rather than derived from a finished design, so the user is the default visual reviewer and final authority on look and feel.

## Default loop

1. Inspect nearby UI, shared components, theme tokens, and applicable UI skills.
2. Implement from code and established app patterns.
3. Run cheap automated checks independently: focused tests, typecheck, lint, builds, and nonvisual simulator diagnostics as appropriate.
4. For taste-dependent validation, ask Levi to inspect the changed UI. Give the exact screen/path, required state or data, what changed, and the few details worth judging.
5. Apply the feedback and repeat only as needed.

Do not defer objective correctness to the human: test logic, state transitions, accessibility properties, and deterministic behavior yourself. Do not use visual review as a substitute for tests.

## Computer-use threshold

Do not operate the simulator visually, capture screenshots, or ingest screenshots merely because the capability exists. Avoid it for routine layout/styling changes, simple confidence checks, and work that Levi can judge faster and with better taste.

Use visual computer use only when at least one applies:

- Levi explicitly requests autonomous simulator inspection.
- A genuinely complex interaction, animation, transient state, or reproduction cannot be evaluated reliably from code, tests, logs, or Levi's feedback.
- Pixel-precise work has an objective reference and autonomous comparison will materially improve the result.

Before using it autonomously, state why the exceptional case justifies the time and token cost. Keep the session surgical: open only the relevant screen and state, take the minimum screenshots, answer a specific visual question, then stop. Do not wander through the app or build a screenshot catalog.

This threshold governs visual simulator interaction through computer use. It does not restrict ordinary automated tests, builds, CLI-driven simulator diagnostics, or other cheap nonvisual verification.

## Human-review handoff

Make the request concrete and brief:

> Please open **[screen/path]** with **[state/data]** and check **[specific visual or interaction questions]**. The implementation and automated checks are complete; visual taste is the remaining decision.

Record a mandatory unresolved visual check in a PR description when relevant; omit already completed checks and routine automated checks.
