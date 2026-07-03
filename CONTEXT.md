# WitnessWork

WitnessWork is an iOS app that helps a Jehovah's Witness track their personal field-ministry activity — time spent, conversations had, contacts visited, and progress toward monthly and annual goals. The glossary below pins the language used across the codebase.

## Language

### Institutions

**The Organization**:
The worldwide body of Jehovah's Witnesses, directed by the Governing Body at world headquarters in Warwick, NY. Sets doctrine, produces literature, and makes global administrative decisions. The app does not communicate with the Organization directly, but the Organization's reporting requirements (e.g. whole-hour monthly reports) shape the data model.
_Avoid_: "Watchtower" as a synonym (Watchtower is a publication, not the institution).

**Branch**:
A regional or national administrative office of the Organization (e.g. US Branch, Britain Branch). Supervises preaching work and supports local congregations within its assigned territory. The User's monthly **Service Report** ultimately rolls up through their congregation to a Branch — which is why Service Reports must use whole-hour totals.
_Avoid_: "headquarters" (use The Organization for the global body, Branch for the regional office).

**Bethel**:
A common Category of Credit Time, denoting volunteer service performed at a Bethel facility. Behaves identically to any other Credit Time and is gated by the same monthly cap.
_Avoid_: using "Bethel" as a stand-in for Branch — the app only models Bethel as a Category name.

### People

**User**:
The human who installed the app. Owns the profile, preferences, contacts, conversations, plans, and service-time history on this device.
_Avoid_: "publisher" (when meaning the human — that word is reserved for the role).

**Publisher**:
The User's field-ministry role. One of six values: `publisher`, `regularAuxiliary`, `regularPioneer`, `circuitOverseer`, `specialPioneer`, `custom`. Drives entry mode, monthly/annual goals, credit cap, milestone ladder, and which Home/Progress sections render.
_Avoid_: "publisher type", "role" alone (use "Publisher" or "Publisher role").

**Profile**:
The User's identity-shaped data — name, avatar, avatar background, hero background. The bits that say "this is who the User is," surfaced through the Avatar component and the profile feature folder.
_Avoid_: "user info" (Profile is the canonical term). Today the data physically lives inside the preferences store; the conceptual split is real even though the storage isn't separated.

**Preferences**:
The User's settings — Publisher role, Monthly Goal overrides, milestone overrides, plan defaults, sync toggles, theme choice, app icon, etc. Everything the User configures _about how the app behaves_ (as opposed to who they are).
_Avoid_: "settings" (Preferences is the canonical term used in code, store names, and screen routes). Today Preferences and Profile share one store; conceptually they are distinct.

### Field activity

**Time Entry**:
A single logged session of field-ministry time on a given date (hours and minutes, optional tag, optional note, optional LDC / credit flags). The granular record the User adds, edits, or deletes.
_Avoid_: "service report" for the single-entry concept (reserved for the monthly aggregate).

**Service Report**:
The monthly aggregate a User submits to their congregation — total hours, bible studies, and the "did I share this month?" indicator for the Regular Publisher role. Derived from the User's Time Entries for that month, not stored directly.
_Avoid_: "monthly report", "field service report" (those are aliases), and "service report" when referring to a single Time Entry.

**Reporting State**:
The Regular Publisher's monthly check-in status, surfaced primarily on the home-screen widget. Three values: **unreported** (no Time Entry exists for the current month yet), **reportedToday** (a Time Entry was added today — celebratory state), **reportedThisMonth** (a Time Entry exists from earlier this month but not today). Only meaningful when the Publisher is `'publisher'` (checkbox entry mode).
_Avoid_: equating Reporting State with Service Report — Reporting State is an at-a-glance summary of _whether_ anything has been reported; the Service Report is the underlying aggregate.

**Credit Time**:
Ministry time that counts toward monthly hours but isn't ordinary house-to-house preaching — e.g. caregiving for someone with health needs, LDC, Bethel service. Subject to a monthly credit cap (default 55h; unlimited for special pioneers and circuit overseers, or whatever override the User has set).
_Avoid_: "credit hours" (use Credit Time), "non-preaching time".

**LDC Time**:
A specific, common variety of Credit Time: volunteer construction work for Kingdom Halls or Assembly Halls (Local Design / Construction). Pre-flagged on the Time Entry for convenience because it's frequent; otherwise it behaves identically to any other Credit Time and is gated by the same cap.
_Avoid_: treating LDC as a separate bucket from Credit — it isn't.

**Category**:
A User-defined grouping of Time Entries and Plans (e.g. "Bethel", "Hospital", "Morning territory"). Each Category carries whether it counts as Credit Time — for a Plan, the Category is the single source of truth for credit-ness (changing the Category's credit setting retroactively changes the forecast of every Plan referencing it). Categories are the User's organizing scheme for breaking their monthly time into meaningful slices on the Service Report.
_Avoid_: "tag" (legacy field name, less precise — Category is the canonical term).

**Service Year**:
The Jehovah's Witnesses fiscal year. Runs September 1 through August 31 of the following calendar year. "Service Year 2024" means Sept 2024 – Aug 2025. Annual goals, milestone ladders, and the Year tab all reckon by Service Year, not calendar year.
_Avoid_: "fiscal year", "calendar year" — Service Year is the canonical term and it does not equal a calendar year.

**Time Rollover**:
A mechanism that floors a finished month's hours to a whole number (for whole-hour Service Report submission) and parks the fractional remainder on the next month, so the User's Service-Year-cumulative total stays exact. Implemented as a pair of Time Entries sharing a `rolloverGroupId` — a negative entry on the source month's last day and a matching positive entry on the destination month's first day. The pair can be undone atomically.
_Avoid_: "month rollover" alone (ambiguous with Onboarding Backfill); confusing this with the one-time onboarding flow.

**Onboarding Backfill**:
A one-time, ephemeral flow shown during onboarding to a User with an annual goal who installs the app mid-Service-Year. Lets them enter prior months of the current Service Year so projections, milestones, and the Year tab aren't broken by zero history. Runs once per Service Year per install; not a recurring screen.
_Avoid_: "Service Year Catch Up" (legacy file/route name; superseded), "Catch Up" alone (collides with overdue follow-ups in visit context).

### Imports

**Import**:
Bringing a User's prior field-ministry history into the app from an outside source. Three sources: **MyTime Import** (a structured `.mytimedb` Core Data backup from the MyTime app), **iCloud Restore** (a prior WitnessWork backup), and **Notes Import** (free-form text). All three converge on the same internal shape and write into the Contacts, Visits, Time Entries, and Categories stores; an Import is forecast-free history, written straight in.
_Avoid_: "sync" (Import is a one-time backfill; iCloud Sync is ongoing replication), "migration".

**Notes Import**:
An Import whose source is arbitrary free text the User pastes or shares (handwritten-style logs, an export from another app, scattered notes). A third-party LLM translates the text into structured WitnessWork records under a zero-data-retention arrangement. Distinct from MyTime Import (structured database) and iCloud Restore (prior backup) — Notes Import is the only Import that is interpreted rather than mechanically mapped.
_Avoid_: "AI import" in user copy where it implies the in-app Assistant (the Assistant is rule-based and unrelated); "paste import" (Notes Import also covers shared/picked text).

**Import Credit**:
The unit metering free Notes Import usage. A non-**Supporter** gets a fixed number of Import Credits (5); a Supporter is unlimited. One Credit is consumed per distinct source text (identified by content hash) the first time it is parsed — follow-up refinements of that same text and re-imports of an already-seen text cost nothing. An **Empty Import** also costs nothing, up to an anti-abuse limit past which repeated Empty Imports begin consuming Credits again.
_Avoid_: "token" (tokens are the LLM's internal cost unit, separate), "import count" (Credit carries the per-distinct-source and Supporter-exemption semantics).

**Empty Import**:
A **Notes Import** that completes successfully but produces zero records — no contacts, visits, time entries, and no detected Publisher (the `isEmptyPreview` predicate; produced Categories and Warnings alone do not count as records). The import ran correctly; the pasted text simply held nothing to bring in. An Empty Import does not consume an **Import Credit**, so a User's Credits are never spent on a paste that yields nothing — subject to an anti-abuse limit, beyond which further Empty Imports within the window consume a Credit again (a **Supporter**, being unmetered, is exempt from the limit entirely). Distinct from an **Import Warning**, which flags a produced record; an Empty Import produces no records at all.
_Avoid_: "failed import" (an Empty Import succeeded — nothing errored), "import attempt", "non-valid import" (nothing invalid happened).

**Import Warning**:
A model-emitted flag on a Notes Import about an assumption, ambiguity, or low-confidence guess. Carries a severity (info / warning / error) and optionally targets one specific produced record so the preview can highlight that contact, visit, or time entry. An error-severity Warning marks data unsafe to commit and is deselected by default in the preview.
_Avoid_: "error" alone (Warnings span info through error); treating a Warning as a hard failure (most are advisory).

### Field activity — visits

**Contact**:
A person the User is engaged with in field ministry. Has identifying info (name, optional phone/email/address), an optional Coordinate for the map, and relationship state (favorite, dismissed-until, custom field values, avatar). Long-lived; outlives any single Visit.
_Avoid_: "lead", "prospect" (those are sales-funnel terms).

**Visit**:
A single field-ministry interaction with a Contact on a given date. May result in a real conversation (someone home, talked) or a not-at-home outcome (no one answered). Carries an optional note, an optional Follow-up, and a Bible Study flag for the User to indicate this Visit conducted a bible study.
_Avoid_: "Conversation" (legacy type name — Visit is the canonical term because not every Visit is a conversation).

**Not at Home**:
A Visit outcome indicating no one answered. Recorded as a flag on the Visit so the Contact's history reflects the attempt without inflating real conversation counts.
_Avoid_: treating Not at Home as a separate record type — it's a Visit outcome.

**Bible Study**:
A designation a User applies to a Visit to indicate that a bible study was conducted during that Visit. Aggregated across a month, the Bible-Study Visit count is one of the figures reported on the **Service Report**. In this app, Bible Study is a per-Visit attribute, not a Contact-level relationship status.
_Avoid_: assuming a Contact is "a Bible Study" on the Contact record itself — the app does not model the standing relationship; only the per-Visit designation.

**Follow-up**:
A scheduled future Visit attached to a Visit, optionally with a notification, an optional topic, and a dismissed flag for soft-cancellation. Surfaces in the "Missed Conversations" list and the widget's overdue list when its date passes without being acted on.
_Avoid_: "appointment" (used colloquially but not in code).

**Custom Field**:
A User-defined structured attribute on Contacts (e.g. "Language", "Best time to visit"). The User creates a Custom Field Definition (label, type, sort order); per-Contact values reference the definition by id, so renaming the label doesn't orphan data. Definitions can be archived — hidden from the form but values preserved. Distinct from a Note: Notes are unstructured free-text on a single record; Custom Fields are schema-defined attributes shared across all Contacts.
_Avoid_: "extra field", "user field" (Custom Field is the canonical term).

### Plans

**Plan**:
The umbrella term for a User's intent to do field-ministry work on a date. Two kinds: **Day Plan** (one specific date) and **Recurring Plan** (a pattern over time). Plans are forecast, not history — they are never "consumed" or "completed" by a Time Entry. Reality lives separately in Time Entries; the app reconciles them visually. A Plan may reference a **Category** (surfaced in the UI as the Plan's "Type", mirroring the Time Entry form); the Category alone determines whether the planned minutes are forecast as **Credit Time**. A Plan with no Category — or whose Category no longer exists — forecasts Standard time.
_Avoid_: "schedule" (that's the surface that displays Plans, not a synonym), "goal" (that's the hour target).

**Day Plan**:
Intent for a single specific date. Carries the planned minutes, an optional local-wall-clock start time, an optional note, an opt-in notification flag, and a `source` indicating whether the User created it manually or the Assistant inserted it as a Recommendation.
_Avoid_: "scheduled day".

**Recurring Plan**:
A repeating Plan pattern (weekly, biweekly, monthly, or monthly-by-weekday) anchored to a start date with an optional end date. Each instance can be tweaked via a **Recurring Plan Override** (per-instance minutes / start-time / note) or skipped entirely via `deletedDates`.
_Avoid_: "repeat plan", "schedule rule".

**Recurring Plan Override**:
A per-instance modification to a Recurring Plan for a specific date — adjusts minutes, start time, or note for that one occurrence without changing the underlying pattern. An Override cannot change the Plan's Category: Type is pattern-level. To do a different kind of work on one occurrence, the User skips that instance and creates a Day Plan in its place.
_Avoid_: "exception" (sounds error-related; an override is intentional).

### Assistant

**Assistant**:
The in-app recommendation engine that proposes Day Plans on the User's behalf to help them reach their monthly goal. Watches the User's Plans, Visits, excluded weekdays, and meeting days; reacts to changes via a deterministic input fingerprint so it re-arms only when the situation actually shifts.
_Avoid_: "AI" — the Assistant is rule-based, not an LLM.

**Recommendation**:
A proposal produced by the Assistant — a set of one or more proposed Day Plans plus a headline and a rationale. The User can accept (the Day Plans are inserted with `source: 'recommendation'`) or dismiss it. Accepted Recommendations live on as ordinary Day Plans. Recommended Day Plans always forecast Standard time — the Assistant never proposes Credit Time, because Credit Time near the cap contributes nothing toward the goal gap the Assistant exists to close.
_Avoid_: "suggestion" (Recommendation is the canonical term across the codebase and i18n keys).

**Recommendation Shape**:
The strategy the Assistant chose for a given Recommendation. One of: **concentrated** (few focused sessions), **distributed** (spread across the horizon), or **recurring** (a pattern that fits the horizon). Drives the headline copy and the visual rendering.
_Avoid_: "recommendation type".

**Off Day**:
A day on which the User does no field-ministry of any kind. The Assistant treats Off Days as a hard exclusion and will not propose Plans for them. Today stored as a set of weekday numbers (the same weekdays each week), but the concept covers any day.
_Avoid_: "excluded weekday" (legacy; "Off Day" is broader and clearer), "rest day" (rest is a separate engine concept inserted between work blocks).

**Meeting Day**:
A day on which the User attends a Kingdom Hall meeting. The Assistant may still propose Plans for Meeting Days but applies tighter per-day caps so the day stays light. Today stored as a set of weekday numbers; the concept covers any day.
_Avoid_: "meeting weekday", "Kingdom Hall day".

### Sync

**iCloud Sync**:
Cross-device replication of the User's data via Apple's iCloud (CloudKit / ubiquity container). Gated behind **Supporter** status — the only feature truly Supporter-gated.
_Avoid_: "cloud sync" (use iCloud Sync; the app is iOS-only and only syncs through iCloud).

**Image Sync**:
A separable, opt-in subsystem that replicates avatar binaries (the User's profile avatar and per-Contact avatars) through the iCloud ubiquity container. Distinct from iCloud Sync of structured data — Image Sync can be turned off independently, and a sender disabling Image Sync leaves receivers with iCloud Markers that never resolve.
_Avoid_: bundling Image Sync into iCloud Sync — they're independently togglable.

**iCloud Marker**:
A placeholder value (e.g. `icloud://contact-<id>` or `icloud://profile`) sitting in an avatar's `value` field on a record pulled from another device whose binary has not yet downloaded. Renders as the initials/emoji fallback. Replaced by a real `file://` URI once the binary lands; persists indefinitely if Image Sync is disabled on either side.
_Avoid_: treating iCloud Markers as broken data — they are valid "image intended, binary unavailable here" placeholders.

### Map

**Marker**:
The visual pin shown on the Map for a Contact. Colored by **staleness** — i.e. how long it has been since the User's most recent Visit with that Contact. Four buckets: no Visits at all, longer than a month ago, longer than a week ago, and within the past week. Computed at render time from Visit history, not stored.
_Avoid_: "pin" alone (Marker is the canonical term and it carries the staleness semantic).

### Monetization

**Supporter**:
A User with an active paid entitlement (subscription). Unlocks iCloud sync (the only feature truly gated) and a set of personalization options (custom accent color, custom app icon, and others). Status flips off immediately when the entitlement expires or is cancelled — no grace period.
_Avoid_: "subscriber", "premium user", "paid user" (Supporter is the canonical, donation-framed term used throughout the UI).

**Donor**:
A User who has made one or more **Tips**. Recognized in the UI with a heart icon. Does **not** receive Supporter features — Donor and Supporter are independent statuses. A User can be both, neither, or only one.
_Avoid_: "donator" (colloquial; use Donor).

**Tip**:
A one-time payment a User can make to support the project. Confers **Donor** status (heart icon) but does not grant Supporter features.
_Avoid_: treating Tip as a tier of Supporter — it isn't.

**Paywall**:
The screen that presents both the Supporter (recurring) tier and the Tip (one-time) tier. Reachable via `RootStackParamList.Paywall`, optionally pre-routed to a tier via `initialTier: 'supporter' | 'tip'`.
_Avoid_: "purchase screen" (Paywall is the canonical name despite the donation framing).

### Tenure

**Full-Time Service**:
The umbrella status covering Publishers who serve full-time: regular pioneer, special pioneer, and circuit overseer. These three roles share a single Tenure clock — the User can move between them without resetting it.
_Avoid_: "pioneering" alone (pioneering is one form of Full-Time Service, not the umbrella).

**Tenure Type**:
Which Tenure clock applies to the User's current Publisher. Two values: **Full-Time Service** (regular pioneer, special pioneer, circuit overseer) and **Auxiliary Pioneer** (regularAuxiliary). The Regular Publisher and Custom roles have no Tenure Type — they don't track tenure at all.
_Avoid_: equating Tenure Type with Publisher — multiple Publishers map to the same Tenure Type.

### Goals

**Monthly Goal**:
The User's target field-ministry hours per month. Set per-Publisher via role defaults (e.g. 50 for regular pioneer) or, for the Custom role, by free-text input. Drives the timer, projections, and the Year tab. Zero for Regular Publisher (no goal).
_Avoid_: "monthly hour goal", "monthly target".

**Annual Goal**:
The User's target field-ministry hours across one Service Year. Always derived as **Monthly Goal × 12** — not independently settable. Drives the milestone ladder's terminal rung and the Year tab's progress math.
_Avoid_: "year goal", "yearly goal" (ambiguous between calendar year and Service Year — Annual Goal is the canonical term and is always reckoned by Service Year).

**Projected Total**:
The adjusted total a User's Service Report would show if every remaining Plan in the period became reality. Logged and planned time are combined into Standard and Credit buckets and the same credit-cap rules that govern a finished month are applied to the combined result — so a Projected Total never displays a number the actual report could not reach. The "planned" portion shown alongside it is the Plans' _effective contribution_ to that reachable total, not their raw sum (planned Credit Time squeezed out by the cap doesn't count). For a Service-Year scope the cap is applied month by month — the month is the unit the credit cap governs; there is no annual cap. Standalone "planned" figures elsewhere in the app are raw intent (what the User scheduled) and are never cap-adjusted; the cap is solely the Projected Total's concern.
_Avoid_: "estimated total", "forecast total" (Projected Total is the canonical term); treating projected as logged + raw planned (the cap can make those differ).

**Milestone**:
An interim hour rung the User progresses through on the way to their Annual Goal. Each Publisher has a default ladder (e.g. 30, 50, 100, 200, 350 for regular pioneer); the Annual Goal itself is appended as the final rung at read time, never stored. Users can override the interior ladder.
_Avoid_: equating Milestone with Annual Goal — the Annual Goal is the terminal rung, not a Milestone in itself.

**Achievement Tier**:
A per-month celebration tier earned when the User's adjusted hours hit at least 100% of their Monthly Goal. Four levels: **Reached** (100–109%), **Exceeded** (110–149%), **Crushed** (150%+), and **Record** (a rolling 12-month personal best, awarded only to months that also met the goal). Applies to one finished month at a time; independent of Milestone progress.
_Avoid_: "achievement" alone (ambiguous), "tier" alone (ambiguous with subscription tiers).

**Tenure Start Date**:
The date the User's current consecutive tenure in their current Tenure Type began. Persists across role changes _within_ the same Tenure Type (e.g. regular pioneer → circuit overseer keeps the clock). Resets whenever the User changes to a Publisher of a different Tenure Type — including any move to Regular Publisher, Custom, or between Full-Time Service and Auxiliary Pioneer (those are distinct Tenure Types). Display label is role-dependent: "regular pioneer since…", "circuit overseer (full-time service) since…", "auxiliary pioneer since…".
_Avoid_: "pioneer start date" (legacy field name; misleading because auxiliary tenure is also stored here despite not being "pioneering" in JW vernacular).

**Founding Supporter**:
A Supporter who was already active when the Supporter **Reveal update** landed and saw the Founding reveal modal on first launch of that version. Recognized in the UI but **not a separate tier in code** — they receive the same perks and gating as any other Supporter. Recognition is gated by two conditions, both required: the User has the `seenFoundingSupporterReveal` flag set (sticky once granted) AND is currently a Supporter. The flag is set on dismissal of the Founding reveal modal and never cleared, so a Founding Supporter who lapses out of Supporter status loses the visual recognition (along with all other Supporter UI) but regains it on re-subscription. A User who was Founding-eligible by `since` date but lapsed before updating to the Reveal version never gets the flag and is therefore not a Founding Supporter — they are simply a Supporter.
_Avoid_: "legacy supporter" (sounds deprecated), "existing supporter" (administrative tone), "OG supporter" (slang).

### Update intros

**Reveal update**:
An app version bump that earns its own dedicated full-screen reveal on first launch. `WhatsNewSheet` is **suppressed entirely** for that version transition — the reveal IS the update intro for the audience(s) it serves. Reserved for major rollups or moments worth a ceremony (e.g. the 1.38.2 Milestone Update). A single Reveal update can chain multiple audience-specific reveals (e.g. a universal MilestoneReveal followed by a Supporter-only thank-you for users who were already Supporters at upgrade). Each reveal in the chain has its own `seen…` preference flag for one-shot semantics. Non-audience users on a Supporter-targeted Reveal update still see `WhatsNewSheet` — they need to know about the version.
_Avoid_: "modal update", "big update" — **Reveal update** is the canonical term.

### Localization

**Language**:
The User's chosen translation locale — which set of strings (English, Español, 日本語, …) the app renders. One of the supported `TranslatedLocale` values. Controls the _words_ the User reads, including month and weekday **names**. Defaults to the device language when the User has made no choice.
_Avoid_: "locale" alone (ambiguous — it historically meant both Language and formatting; the two are now distinct concerns), "region" (region governs format, not words).

**Format Region**:
The User's chosen formatting conventions — date ordering (`DD/MM` vs `MM/DD`), 12- vs 24-hour time, and the default first day of week — selected **independently of Language**, so "English language, Australian formats" is expressible. Supplies the _defaults_ for the per-axis controls below; each can still be overridden individually. Defaults to the device region. Sourced from the conventions moment already carries for each locale, not a separate dataset.
_Avoid_: "locale" (Language and Format Region are deliberately separable), "date format" (date order is only one of the three things Region governs).

**Start of Week**:
Which weekday a calendar week begins on across the app (calendar grids, weekday-label rows, recurring-plan math). A standalone preference that defaults from the **Format Region** but is independently overridable.
_Avoid_: "first day" alone (ambiguous with first-of-month).

**Clock Format**:
How a _point in time_ renders — 12-hour (`1:30 PM`) vs 24-hour (`13:30`). Defaults from the **Format Region**, independently overridable.
_Avoid_: "time format" (overloaded with Duration Format — "time" alone never disambiguates point-in-time from length-of-time).

**Duration Format**:
How a _length of time_ renders — decimal hours (`15.5`) vs unit-labeled (`15 Hrs 30 Mins`). A stylistic preference, **not** governed by Format Region (no region has a conventional way to write ministry time). Applies to all measured/computed durations app-wide.
_Avoid_: "time display format" (legacy label; the persisted key `timeDisplayFormat` survives but the User-facing term is **Duration Format**), "hours display" (the setting formats all durations, not only hour-denominated report totals).

## Relationships

- A **User** has exactly one **Publisher** at a time.
- A **User** logs many **Time Entries**.
- A **Service Report** for a given month is the aggregate of the User's **Time Entries** in that month.
- A **Service Report** uses whole-hour totals because it is submitted up to a **Branch**, which is part of **The Organization**.
- A **Time Entry** belongs to one **Category**; a Category determines whether the entry is **Credit Time**.
- **LDC Time** and time spent at **Bethel** are common Categories of Credit Time.
- A **Service Year** contains 12 months; **Time Rollover** moves fractional minutes across month boundaries within a Service Year to preserve cumulative accuracy.
- A **Contact** has many **Visits**; a **Visit** belongs to one **Contact**.
- A **Visit** is either a real conversation or a **Not at Home** outcome.
- A **Visit** may be marked as a **Bible Study** and may carry a **Follow-up**.
- A **Plan** is forecast; a **Time Entry** is history. They are not joined by data.
- The **Assistant** produces **Recommendations**; an accepted Recommendation becomes one or more **Day Plans**.
- An **Off Day** is a hard exclusion for the **Assistant**; a **Meeting Day** is a soft cap. If a day is both, **Off Day** wins.
- **iCloud Sync** is the only **Supporter**-gated feature. **Image Sync** is opt-in within iCloud Sync and toggles independently per device.
- A **User** can independently be a **Supporter**, a **Donor**, both, or neither. Donor status comes from one or more **Tips**; Supporter status comes from an active subscription entitlement.
- A **Publisher** maps to at most one **Tenure Type**. **Full-Time Service** covers regular pioneer, special pioneer, and circuit overseer. **Auxiliary Pioneer** covers only regularAuxiliary. Regular Publisher and Custom map to no Tenure Type.
- The **Tenure Start Date** persists across Publisher changes within the same Tenure Type and resets across Tenure Type changes.
- A **Monthly Goal** determines an **Annual Goal** (`Annual = Monthly × 12`); the Annual Goal is never set independently.

## Example dialogue

> **Dev:** When the **User** logs a **Time Entry** with the LDC flag, does the **Service Report** show that as LDC hours or as **Credit Time**?
>
> **Domain expert:** Both. **LDC Time** is just a kind of Credit Time — the LDC flag lets the Service Report break it out as its own line, but the cap math counts it as Credit. Same goes for **Bethel** — different label, same bucket.
>
> **Dev:** What about a **Visit** marked **Not at Home** — does that bump the Service Report's bible-study count?
>
> **Domain expert:** No. **Bible Study** is a per-Visit designation the User applies. A Not-at-Home Visit can't be a Bible Study by definition. The bible-study count only includes Visits the User explicitly marked.
>
> **Dev:** If a regular pioneer becomes a circuit overseer, does the **Tenure Start Date** reset?
>
> **Domain expert:** No — both are **Full-Time Service**, so the clock keeps running. It only resets if the User moves to a Publisher with a different Tenure Type — back to Regular Publisher, or over to Auxiliary Pioneer.
>
> **Dev:** If the **Assistant** produces a **Recommendation** and the User accepts it, does that count toward their **Annual Goal**?
>
> **Domain expert:** No. Accepting a Recommendation creates **Day Plans** — Plans are forecast, not history. Only Time Entries count toward the goal. The User still has to actually go out and log the time.
>
> **Dev:** A User makes a **Tip** during onboarding. Are they a **Supporter**?
>
> **Domain expert:** They're a **Donor** — gets the heart icon. Tips don't grant Supporter features. Supporter is the recurring entitlement that unlocks **iCloud Sync** and personalization.

## Flagged ambiguities

- "publisher" was used historically to mean both the human User and the role. Resolved: **User** is the human; **Publisher** is the role. The leaf role whose enum value is `'publisher'` is referred to in glossary prose as **"the Publisher role"** or **"Regular Publisher"** to disambiguate.
- Resolved: the canonical noun for Supporters who were already subscribed before the Supporter Reveal update is **Founding Supporter** (see Monetization entry).
