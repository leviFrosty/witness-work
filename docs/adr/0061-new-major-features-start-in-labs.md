---
status: accepted
---

# New major features start in Labs

## Context

A big feature takes several releases to settle. Until now it either shipped to
everyone at once or hid behind a PostHog flag. A PostHog flag is a remote
rollout: we choose who gets it, it needs the network and analytics, and the
people who want to try something early can't turn it on themselves.

We want early adopters to opt in, Beta testers to live with every new feature
by default, and production to stay as it is until a feature is ready.

## Decision

Settings has a **Labs** section with one row that opens the Labs screen and
shows how many labs are on out of how many there are (`1/3`). The Labs screen
lists every lab with a switch. The section and its title disappear when there
are no labs.

- **Every new major feature starts as a lab.** It is registered in `LABS`
  (`src/lib/labs.ts`) and gated with `useLab(id)`, or `isLabOn(id)` outside
  React. A lab hides its entry points and runtime work while it is off.
- **Defaults follow the build.** A lab is on in development and Beta and off in
  production (`labDefaultOn`). Someone who flips a switch keeps their choice;
  a lab nobody flipped follows the default.
- **Labs are front end only and per device.** Choices live in MMKV on the device.
  They don't sync, back up, or reach ww-api. A lab that needs the API still
  ships the API half first and keeps it backward compatible; the API doesn't
  check whether a lab is on.
- **Promotion removes the lab.** When a feature is ready, its entry in `LABS` and
  every `useLab`/`isLabOn` check for it are deleted, so the feature is always
  on. A saved choice for a removed id is ignored, so no migration runs.
- **PostHog flags stay for remote control.** Kill switches, staged rollouts and
  experiments still use `useFeatureFlag`. A feature may use both while it is a
  lab: the flag decides whether it can be offered, and the lab decides whether
  this person turned it on.

## Consequences

- Beta testers use every lab by default and can turn one off when it gets in
  their way.
- Production users see a feature only after opting in, so a lab's copy has to
  set expectations; the section footer says labs may change or have problems.
- Turning a lab off in production hides the feature but keeps any data it
  saved, and turning it on again shows that data. A lab that saves data must
  handle being turned off and on.
- Promotion is a code change that ships in a release. A feature can't leave Labs
  remotely; use a PostHog flag alongside the lab when that matters.
