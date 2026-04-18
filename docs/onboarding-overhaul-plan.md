# Onboarding Overhaul Plan

Inspired by a video analysis of 1,000+ app onboarding flows. The short version of that research: the best onboarding flows **sell the outcome, not the feature list**, **earn the reveal** (the quiz visibly changes a later screen), **pair personalization with a populated home**, and **add delight to friction points**. This document turns those findings into a concrete plan for WitnessWork.

This doc is the single source of truth for the work. Every implementation sub-task must read and conform to it.

---

## 1. Current flow (what exists today)

`src/components/onboarding/Onboarding.tsx` renders 9 steps in order:

1. `steps/One.tsx` — "Welcome To WitnessWork" title + Get Started button.
2. `steps/PrivacyFirst.tsx` — 4 highlight cards (offline, on-device, share-in-link, your data).
3. `steps/iCloudRestore.tsx` — Probes iCloud; offers one-shot restore.
4. `steps/Two.tsx` — Publisher type selector + `FeatureShowcase` (static feature list filtered by publisher).
5. `steps/ProfileSetup.tsx` — Name, avatar, pioneer start date (if pioneer).
6. `steps/Three.tsx` — Notifications permission request.
7. `steps/DefaultNav.tsx` — Preferred maps provider.
8. `steps/Supporter.tsx` — Supporter tier pitch.
9. `steps/Four.tsx` — "You're all set" + Complete Setup button.

Supporting:

- `OnboardingNav.tsx` — back button + "WitnessWork" label on non-hero screens. No progress indicator today.
- `Onboarding.styles.ts` — shared styles.
- `FeatureShowcase.tsx` — publisher-filtered feature list used only in `Two.tsx`.

### What's working

- `PrivacyFirst` — privacy is a real differentiator for a JW-facing app, not filler.
- `iCloudRestore` — removes a real friction point (Cake Equity pattern).
- `FeatureShowcase` already branches by publisher, so the personalization scaffolding exists.

### What's falling short vs. the video's findings

- **`StepOne` sells nothing.** No product-in-action, no outcome framing, no human touch.
- **`FeatureShowcase` is a spec sheet, not an earned reveal.** Winners (Endel, Bitepal, Brilliant, Speak) use the quiz to compute a _new_ screen the user hasn't seen — we just filter a static list.
- **No "aha" bridge.** `StepFour` is a dead screen; users land on Home cold.
- **Notifications screen is abstract.** Centr teases the _actual_ notification; we just say "we'll notify you."
- **Supporter pitch is pre-aha.** Shown before the user has felt any value from the app.
- **No progress indicator.** Long flows feel long without one.
- **No founder touch.** Solo-maintained volunteer project with a real human maintainer, and we don't lean into it.
- **No branching by intent.** A Publisher (no hour requirement) sees the same quiz and screens as a Special Pioneer.

---

## 2. Guiding principles (from the video)

1. **Sell the outcome** — "never lose a return visit," "hit your hour goal without stress" — not "timer + reports + map."
2. **Earn the reveal** — every question the user answers must visibly change a downstream screen.
3. **Personalize, then populate** — end onboarding with a populated home preview, not a blank "ready to go" screen.
4. **Delight the friction points** — iCloud probe, notification prompt, permissions — all get animation and microcopy.
5. **Founder's fingerprints** — one short personal note from Levi, placed at a high-emotion moment.
6. **Don't frontload education** — move feature discovery into the app via a home checklist (Mural pattern, +10% retention).
7. **Branch by intent** — Publishers get a shorter path; pioneers get pioneer-specific screens.

### Intentionally _not_ doing

- **Hard paywall during onboarding.** 22% of apps do it. WitnessWork's supporter model is voluntary/donation-style and a hard paywall would violate the free-forever positioning in `supporterOnboardingDesc`.
- **Gamified mascot / pet.** Off-tone for the JW audience.
- **"Goal by an exact date" projections.** Works for language learning; inappropriate for quantifying ministry outcomes.

---

## 3. Target flow

~8–10 screens for pioneers, ~5–6 for publishers. Every screen either **sells**, **personalizes**, or **reveals**.

### Phase A — Hook

1. **`HeroWelcome`** (replaces `One.tsx`)
   - Short looping animation / video: timer starting, contact pin dropping on map, return-visit notification firing.
   - One outcome-focused line (e.g. _"Field service, remembered."_).
   - Primary CTA `Get started`. Secondary tiny-text link: _I already use WitnessWork_ → jumps to `iCloudRestore`.
   - Rationale: Timo / Frontbacks — product-in-action beats a word-mark.

2. **`FounderNote`** (new)
   - ~4-second read. Personal paragraph from Levi ("Hi, I'm Levi. I built WitnessWork while serving at Bethel…") + handwritten-style signature asset.
   - Rationale: One Year / Base Camp. WitnessWork's differentiator _is_ that it's human-made for JWs.

### Phase B — Remove setup friction

3. **`iCloudRestore`** (keep, polish)
   - Skeleton-loader / animated cloud while probing (Bumble loading-state delight).
   - `found` state headline becomes outcome-framed ("Your data's still here — want it back?").
   - `noBackup` / `unavailable` copy reassures instead of dead-ending.

### Phase C — Personalization quiz

4. **`PublisherType`** (split out of `Two.tsx`)
   - Keep the selector + `custom` goal-hours.
   - **Remove** `FeatureShowcase` from this screen.

5. **`IntentPicker`** (new — Headspace multi-intent pattern, +10% conv)
   - _"What do you want WitnessWork to help with?"_ (multi-select):
     - Track my service time
     - Remember return visits & conversations
     - Plan my week
     - Build a monthly routine / hit my goal
     - Keep a map of my territory contacts
   - Persisted to preferences. Used to drive `HomeChecklist` and to reorder `homeScreenElements` on Home.

6. **`ProfileSetup`** (split into 2 screens — House pattern, +15% conv)
   - 6a: Name + avatar.
   - 6b: If pioneer → pioneer start date (skipped for publishers).

### Phase D — The earned reveal

7. **`YourPlanPreview`** (new — the single highest-impact addition)
   - Computed from publisher type + intents + pioneer date:
     - _"Regular Pioneer · 50 hrs/month goal"_ with a sample progress ring.
     - _"Next return visit reminder: Sun, 10am"_ with a sample contact.
     - _"Pioneering since Mar 2023 · 397 days"_ if applicable.
   - Tagline: _"Your WitnessWork is ready."_
   - Rationale: Endel / Bitepal / Speak — show what the quiz unlocked _before_ asking for anything else.

### Phase E — Permissions with context

8. **`Notifications`** (rework `Three.tsx`)
   - Preview a mock notification card at top: _"WitnessWork · Return visit with Alex in 30 min"_ (Centr pattern).
   - Then the system permission sheet.
   - Keep explicit `Skip`.

### Phase F — Soft supporter ask

9. **`Supporter`** (keep, reframe, move later in flow)
   - Lead with the volunteer/Kofi framing or social proof.
   - Pair explicitly with personalization: _"As a Regular Pioneer using all 5 of these features, here's what supporter unlocks…"_
   - Stays unmistakably optional. No urgency / no countdown.

### Phase G — Aha bridge

10. **Delete `Four.tsx`**. Land on Home with a sticky **`HomeChecklist`** (Mural pattern, +10% 1-week retention).
    - Items driven by `IntentPicker`:
      - Log your first minute of service
      - Add your first return visit
      - Set your monthly goal
      - Try the map
    - Each ticks itself when the user does it. Dismissible.

### Cross-cutting

- **Progress indicator** (dots / thin bar) inside `OnboardingNav`. Total count excludes hero/founder so users see "2 of 6" and it _feels_ short.
- **Microcopy polish** — every `Continue` either asks or summarizes ("Continue · 3 goals selected").
- **Branching logic** — publisher vs. pioneer vs. custom. Defined _once_ in `Onboarding.tsx` instead of each step knowing about `isPioneer`.

---

## 4. Implementation phases & acceptance criteria

Each phase below is a discrete deliverable. The phases marked "parallel-safe" can be built concurrently in isolated worktrees; the final step reorder + branching phase must wait until all others are in.

### Phase 1a — Copy & microcopy polish (parallel-safe)

**Files:** `src/components/onboarding/steps/One.tsx`, `locales/en-US.json`, every step's action button copy.

**Acceptance:**

- `One.tsx`: outcome-framed tagline replaces "Welcome To / WitnessWork." New title i18n key, short single-line value prop.
- Secondary tiny-text link "I already use WitnessWork" navigating to the iCloud restore step.
- Every `Continue` button that follows a user selection is either a question or a summary ("Continue · 3 goals selected", "Continue as Regular Pioneer"). Where no selection, plain "Continue" stays.
- All new strings added to `en-US.json` only (other locales get stub English so they don't break i18n fallbacks — Crowdin handles the rest).
- No new dependencies.

### Phase 1b — Progress indicator in OnboardingNav (parallel-safe)

**Files:** `src/components/onboarding/OnboardingNav.tsx`, `Onboarding.styles.ts`.

**Acceptance:**

- `OnboardingNav` accepts `currentStep` and `totalSteps` props.
- Thin dot / bar indicator renders above the "WitnessWork" label.
- Hero and FounderNote screens pass `noActions` (hidden) or omit the indicator; does not count toward total.
- Visual style matches existing theme tokens (`theme.colors.accent`, `theme.colors.textAlt`). No new asset files.
- **Do not modify `Onboarding.tsx`.** The component must accept the new props as optional so existing call sites continue to work. Integrator will thread the props later.

### Phase 1c — Notifications mock preview (parallel-safe)

**Files:** `src/components/onboarding/steps/Three.tsx`, `locales/en-US.json`, possibly `src/assets/` for a small app-icon SVG if not already available (prefer reuse).

**Acceptance:**

- Mock notification card above the title text. Styled like an iOS notification banner: app icon, app name, title line (e.g. "Return visit with Alex in 30 min"), body line ("Tap to prep your study"). Subtle shadow / rounded corners via `theme`.
- No new deps. Reuse existing `Card`/`MyText`/FontAwesome icons if possible.
- Existing allow / skip logic untouched.

### Phase 2a — IntentPicker screen + prefs (parallel-safe)

**Files:** new `src/components/onboarding/steps/IntentPicker.tsx`, `src/stores/preferences.ts`, `locales/en-US.json`. **Do not modify `Onboarding.tsx` step order** — export the component only.

**Acceptance:**

- Multi-select screen with 5 options: track time, remember return visits, plan week, monthly routine/goal, map of contacts.
- Selections persist to a new preference `onboardingIntents: string[]` on the zustand store.
- Use existing `Card` / theme patterns. Tap-to-toggle with visible selected state.
- Button copy: "Continue · N selected" / "Continue" when none (but at least one required? — pick zero-required for now; users can skip).
- Export default the screen; integrator will add it to `steps` array in the final phase.

### Phase 2b — Split ProfileSetup into 2 screens (parallel-safe)

**Files:** existing `ProfileSetup.tsx`, new `ProfileSetupPioneerDate.tsx`, `locales/en-US.json`.

**Acceptance:**

- `ProfileSetup.tsx` keeps name + avatar only. `isPioneer` branch + `DateTimePicker` moves to `ProfileSetupPioneerDate.tsx`.
- Each screen has its own title + continue button.
- **Do not modify `Onboarding.tsx` step order.** Export both; integrator inserts them.

### Phase 2c — YourPlanPreview screen (parallel-safe)

**Files:** new `src/components/onboarding/steps/YourPlanPreview.tsx`, `locales/en-US.json`.

**Acceptance:**

- Pulls publisher type, pioneer start date, and (if present) `onboardingIntents` from prefs.
- Renders a "plan card" that includes:
  - Publisher type + monthly hour goal (from `publisherHours`).
  - For pioneers: "Pioneering since X · Y days" (use moment).
  - If `remember return visits` intent selected: sample return-visit line ("Alex — Sun 10am").
  - Tagline line: "Your WitnessWork is ready."
- If `onboardingIntents` preference does not exist (Phase 2a not merged yet), silently show the publisher-driven parts only. Build defensively.
- Continue button → `goNext`.

### Phase 3 — HomeChecklist component (parallel-safe, partially)

**Files:** new `src/components/onboarding/HomeChecklist.tsx`, small hook into `src/screens/HomeScreen.tsx`, prefs additions.

**Acceptance:**

- Sticky checklist card on HomeScreen, dismissible.
- Items driven by `onboardingIntents` (fall back to a sensible default list if pref missing).
- Each item has a check state. Items self-tick when the user does the underlying action (e.g. logs first minute → "Log your first minute" ticks). For this phase, it's OK to ship the checklist + the "log first minute" and "add first contact" ticks; the rest can use dismissible checkboxes.
- Persisted dismissal: `homeChecklistDismissed: boolean` pref. Reappears only via a dev reset.
- **Do not modify `Onboarding.tsx`.** This lives downstream of onboarding completion.

### Phase 4a — FounderNote screen (parallel-safe)

**Files:** new `src/components/onboarding/steps/FounderNote.tsx`, `locales/en-US.json`. Use a reasonable placeholder for the signature (a scripted font string or plain italic) — a real hand-drawn asset can replace it later.

**Acceptance:**

- Short personal paragraph (Levi, built while serving at Bethel, made for JWs, forever free).
- Sign-off line styled in italic scripted font or `Inter_700Bold` italic — no image dependency.
- Continue button.
- Export default; integrator inserts into step order later.

### Phase 4b — iCloudRestore polish (parallel-safe)

**Files:** `src/components/onboarding/steps/iCloudRestore.tsx`, `locales/en-US.json`.

**Acceptance:**

- Skeleton loader / subtle pulse animation on the probing state (use `tamagui` Spinner + a soft fade).
- Updated microcopy when `found` — outcome-framed ("Your data's still here — want it back?" or equivalent).
- Updated microcopy when `noBackup` / `unavailable` — reassuring, transitions smoothly.
- Behavior (probe, restore, skip) unchanged.

### Phase 5 — Supporter reframe (parallel-safe)

**Files:** `src/components/onboarding/steps/Supporter.tsx`, `locales/en-US.json`.

**Acceptance:**

- Leads with the volunteer / Kofi framing (optionally pulls in the publisher type to personalize: "As a Regular Pioneer using all 5 of these features…").
- Benefits list remains but is reordered or reframed around the user's selected intents when available (defensive: fall back to current order if pref missing).
- Continue / Skip UX unchanged.

### Phase 6 — Step-order + branching orchestration (**sequential, last**)

**Files:** `src/components/onboarding/Onboarding.tsx`.

**Acceptance:**

- New `steps` order:
  1. `HeroWelcome` (renamed `One`)
  2. `FounderNote`
  3. `iCloudRestore`
  4. `PublisherType` (renamed `Two` after `FeatureShowcase` removed)
  5. `IntentPicker`
  6. `ProfileSetup`
  7. `ProfileSetupPioneerDate` (pioneer only)
  8. `YourPlanPreview`
  9. `Notifications` (renamed `Three`)
  10. `DefaultNav`
  11. `Supporter`
  12. (no `Four`; completing advances to Home with `HomeChecklist`)
- Branching: pioneer-only screens auto-skipped when `!isPioneer(publisher)`.
- `PrivacyFirst` — **decision pending**: either keep after `iCloudRestore` or move to Settings. Recommended: keep after `iCloudRestore` for audience trust, but unblock that question with a note.
- `onboardingComplete` flag flipped at the end of the last screen, as today.
- Back button works across the full flow. Progress indicator wired with the pioneer-adjusted total.

---

## 5. Execution strategy

- Phases 1a–5 run in **parallel, isolated worktrees**. Each worktree branches from `development`.
- Phase 6 runs **after** the parallel phases are integrated.
- Each parallel agent is instructed _not to modify_ `src/components/onboarding/Onboarding.tsx` — the integrator owns that file to avoid merge conflicts.
- Preferences store (`src/stores/preferences.ts`) is modified by Phases 2a and 3. Both agents must follow additive-only changes (append new fields with safe defaults; do not rename or remove).
- `locales/en-US.json` is the only locale file touched; all other locales rely on i18n fallbacks. Crowdin picks them up later.

## 6. Measurement (optional, future)

The video's lifts (Headspace +10%, Dollar Shave +5%, Grammarly +20%, Mural +10%) were all measured. If there's no onboarding analytics today, instrument step completion + post-onboarding first-action _before_ shipping so we can tell which changes earned their weight.

## 7. Open questions

- **Founder-note placement.** First-open (as planned) vs. deferred to post-aha (Airbnb CEO pattern). Current plan says first-open because the volunteer framing also serves as a values pitch; revisit if it feels too soon.
- **PrivacyFirst.** Keep in flow vs. move to Settings. Current plan keeps it; see Phase 6.
- **Hero animation asset.** Real animated asset is out of scope for the parallel phases. Phase 1a ships with a static title; a follow-up can replace it.
- **Handwritten signature asset.** Same — Phase 4a ships a scripted-font placeholder.
