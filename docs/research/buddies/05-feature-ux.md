# 05 — WitnessWork Buddies: Feature UX Recommendations

Date: 2026-09-23. Scope: UX, flows, defaults, and copy intent only. The plumbing lives in `docs/friend-sharing-plan.md` (E2EE over CloudKit) and `docs/calendar-sync-plan.md` (#265). Any copy shown in quotes below is **copy intent / placeholder**. Final strings go through `src/locales/en-US.json` using a new `buddies_*` key namespace. Nothing is hard-coded.

Domain terms follow `CONTEXT.md`: Plan, Day Plan, Recurring Plan, Follow-up, Visit, Contact, Not at Home, Milestone, Achievement Tier, Service Year, Publisher role, Supporter, Assistant/Recommendation.

---

## 0. Summary and design principles

Buddies is a tool for **going out together**, not a social network. It covers coordination (Plans and Follow-ups) first. Celebration comes second and is always opt-in.

| #   | Principle                                                                                                                                                     | Grounding                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| P1  | **Coordination before celebration.** Ship shared schedules and Follow-up invitations first. Awards come later.                                                | Issue #288. Luke 10:1 ("sent them out by twos")                                                              |
| P2  | **Nothing is shared until you choose it, per buddy, with a preview of exactly what they will see.**                                                           | Google Calendar permission levels. Strava's note that hidden details can be inferred from what stays visible |
| P3  | **Hours are never shared.** Nothing shared carries a number that invites comparison: no hours, percentages, Achievement Tiers, Milestones, or report figures. | Gal 6:4; Gal 5:26; _w21_ July, study art. 28 box; _w22_ April, study art. 16                                 |
| P4  | **Consent both ways.** Connections need invite → accept. Either side can end the connection quietly, and sharing can be paused or muted at any time.          | Apple Fitness: Invite, Hide My Activity, Mute Notifications, Remove Friend                                   |
| P5  | **Calm notifications.** Logistics may interrupt (Active, and Time Sensitive only within an hour of the event). Social events are Passive or in-app only.      | Apple HIG _Managing notifications_                                                                           |
| P6  | **Minimize householder data.** Share per Visit, preview it first, and let it expire after the visit. Notes and history are never shared.                      | HIG: keep sensitive info out of notifications                                                                |
| P7  | **Small and personal.** At most 5 buddies. No discovery and no contact upload.                                                                                | Duolingo Friend Streak (5). Headspace buddies (5, secondary source)                                          |
| P8  | **Easy for older users.** Few choices, sensible defaults, plain words, 44-pt targets, and nothing conveyed by color alone.                                    | Many users are older and non-technical                                                                       |

---

## 1. Codebase grounding: what the recommendations fit into

- **Information architecture.** The tabs are Home (with a Settings **drawer**), Contacts, Progress (only when `showsYearTabs`), Schedule, and Map. iPad adds a sidebar with Settings. See `src/app/navigation/HomeTabStack.tsx` and `DrawerNavigator.tsx`. The Settings drawer has four groups: Language; Region & Formats / Personalization / Publisher / Preferences; App (Backup, MyTime Import, Notes Import, iCloud Sync, More); and Support / Contact / Misc (`src/features/settings/components/SettingsContents.tsx`).
- **Schedule.** `src/features/plans/screens/ScheduleScreen.tsx` shows:
  - a month calendar of **40×40-pt `CalendarDay` cells**. Status colors are missed / partial / completed / planned. A note dot sits **top-right**, today has a 3-pt border, and Off Days render at 55% opacity (`src/components/CalendarDay.tsx`);
  - the legend (`CalendarKey.tsx`) and a Planned/Actual toggle (`CalendarHeader.tsx`);
  - the month Plans list (`PlanRow.tsx`) and the Assistant card.

  Tapping a day opens `SelectedDateSheet` → `DayHistoryView`, which has "Time reports" and "Plans" sections. On iPad the same content shows in `ScheduleDayInspector`.

- **Follow-ups** hang off Visits (`src/types/visit.ts`). Today they appear in:
  - the bordered "Follow-up" box inside `ConversationRow.tsx` (bell, date/time, topic);
  - Home's Missed/Approaching Conversations;
  - the Appointments widget;
  - the RescheduleVisit sheet.
- **Profile.** `ProfileCard` opens `ProfileDetailOverlay`. The overlay shows streak (weeks or months), days, hours, last 30 days, "since" badges, monthly routine, and a contribution graph. Streak math is in `src/features/profile/lib/profileStats.ts`.
- **Milestones** are hour rungs toward the Annual Goal. They exist only for roles with an annual goal (`src/lib/milestones.ts`). **Achievement Tiers** are per-month: Reached, Exceeded, Crushed, Record (`src/lib/achievementTier.ts`). Existing tier copy includes "Crushed it" and "Goal crushed!". That is fine privately but should never be broadcast.
- **Notifications** are local-only today (`src/lib/notifications.ts`).
- **A contact hand-off already exists.** The `/c/` universal link "Share Contact" bundles the contact plus **up to 50 Visits including notes** (`src/features/contacts/lib/contactShareLink.ts`).
- **Constraints from ADRs.** ADR 0011 says no account, email, or phone number, and calls this non-negotiable, so invites must use links or QR codes. ADR 0003 says Plans are forecast and never "completed", so there should be **no "plans kept" metric**.
- **`docs/friend-sharing-plan.md` conflicts with the brief:**
  1. It frames the feature as "friendly social pressure". It should be reframed as encouragement.
  2. Its UI suggests 25 friends. The cap should be 5.
  3. Pairing needs the invitee to send a **reciprocal link back**, which is too hard for older users. Make the deferred `FriendInvite` mailbox (or a ww-api relay) part of v1 so accepting is one tap.
  4. It auto-publishes `milestone`, `monthCompleted`, and `goalUnlocked` events. These leak hours-derived information. Make them opt-in "celebrations" with no numbers.
  5. The claim "ww-proxy never sees the link payload" only holds when the app is installed. Without the app, the browser sends the path to ww-proxy. Put the payload in the **URL fragment**. _(Technical assumption; verify with AASA fragment matching.)_
  6. What it gets right: display name only, no backfill of past events, and no address-book lookup.

---

## 2. Calendar sharing (#288)

### 2.1 What is shared

Sharing is set **per direction and per buddy**. Sharing with Mom does not require Mom to share with you.

| Data                                                                                                                                                                     | Shared?                                                                            | Default when you share your schedule with a buddy |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| Planned days: Day Plans plus _counted_ Recurring Plan instances (the same resolution as `resolvePlannedDay`, so Recurring instances replaced by a Day Plan are not sent) | Yes                                                                                | On                                                |
| Start time and end time (start + planned minutes)                                                                                                                        | Yes, at the "Days and times" level                                                 | **On**                                            |
| Plan note                                                                                                                                                                | Only at the "Days, times and notes" level                                          | **Off**                                           |
| Category ("Type"), which may reveal credit time, Bethel, LDC, or a Hospital category                                                                                     | **Never** (v1)                                                                     | —                                                 |
| Whether a Plan came from an Assistant Recommendation                                                                                                                     | Never                                                                              | —                                                 |
| Off Days and Meeting Days                                                                                                                                                | Never                                                                              | —                                                 |
| Time Entries, hours, goals, Projected Total, Achievement Tiers, Milestones, streaks, Service Report, Bible studies                                                       | **Never**                                                                          | —                                                 |
| Follow-ups and Contacts                                                                                                                                                  | Never through calendar sharing. Only through an explicit per-visit invitation (§3) | —                                                 |
| Time range                                                                                                                                                               | Today through a rolling ~8 weeks. **Past days are never shared.**                  | —                                                 |

**Sharing levels** follow Google Calendar's "See only free/busy (hide details)" versus "See event details":

```
Share your schedule with Mom                         (auto-saves; no Cancel)
( ) Off
( ) Days only            Mom sees: "Sat · planning to go out"
(•) Days and times       Mom sees: "Sat · 9:00–11:30 AM"
( ) Days, times, notes   Mom sees: "Sat · 9:00–11:30 AM · Cart at the station"
Mom never sees your hours, goals, Type, or reports.
```

**Recommended default: "Days and times".** It is shown, and can be changed, _before_ the consenting tap on both the invite sheet and the accept screen (§6.3). Reasons:

- Knowing when someone starts is the whole point of #288 ("my mother who is pioneering with me").
- Apple Fitness shares by default once a friend accepts and offers Hide My Activity afterwards.
- Notes and Type stay off.

If Levi prefers strict privacy-by-default, use "Off" plus a one-tap "Share my schedule" prompt right after connecting. That costs one extra step.

**Inference risk.** Strava warns that hidden details "may be deduced" from what stays visible. Summing a buddy's time windows gives their planned monthly hours. So the UI must **never total or chart a buddy's plans**: no "Mom planned 52 h", no bars. Buddy information appears only per day.

### 2.2 How buddy Plans render (faded overlay)

**Month calendar cell.** The existing 40×40 cell is unchanged. Up to 2 small (≈5-pt) **buddy dots** appear along the bottom edge in each buddy's color, plus a "+" when 3 or more buddies plan that day. Your own status colors, the duration text, and the top-right note dot stay as they are.

```
 Mon   Tue   Wed   Thu   Fri   Sat
┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐
│ 8 │ │ 9 │ │10 │ │11 │ │12 │ │13 │
│2h │ │   │ │3h │ │   │ │   │ │4h │   ← your Plan (existing)
│ ● │ │   │ │●● │ │   │ │ ● │ │●+ │   ← buddy dots (new)
└───┘ └───┘ └───┘ └───┘ └───┘ └───┘
```

- **Accessibility.** The day's label appends the buddy names, e.g. "Mom and Anna plan to go out". Colors come from a fixed palette of 5 accessible colors that works in dark mode, and each buddy also has an initial monogram, so color is never the only cue.
- **Legend and filter.** `CalendarKey` gains a row: "● Mom ● Anna · Buddies ⌄". Tapping it opens a small sheet with a **show-on-calendar checkmark per buddy** and one **"Show buddies" master toggle**. This mirrors Apple Calendar's calendar checkboxes, TimeTree's filters, and Fantastical's Calendar Sets. Visibility and color are **local to the viewer**, as in Apple Calendar where color is per calendar.
- **Day sheet** (`DayHistoryView`): add a **"Buddies" section below "Plans"**.
  - Rows are faded: the `backgroundLighter` color, no shadow, and an avatar instead of the plan-kind icon.
  - Rows are read-only: no swipe-to-delete and no row menu.
  - Each row shows name · time window · note (only if shared), plus an **"I'll come too"** button.
  - The iPad inspector gets the same section.
- **Month Plans list.** Your own list stays unchanged. Below it, add a collapsed "Buddies' plans" group, e.g. "Mom · 6 days". Buddy rows are never interleaved into your list, which keeps it uncluttered for older users.
- **Later:** dots in Home's "This week" strip (`WeekStripTeaser`).

### 2.3 "You're both planning Saturday"

- **Overlap rule:** same local date, _and_ either both time windows intersect or one side has no time.
- **In-app:** a one-line chip in the day sheet: "You and Mom both plan to go out". No extra glyph in the cell, because own-status color plus a dot already say it.
- **Push:** off by default. There is an optional Passive heads-up the evening before (§4, row 14).

### 2.4 "I'll come too" (joining a buddy's Plan)

1. Tap **I'll come too** on a buddy row.
2. A Plan form sheet opens prefilled as _your_ Day Plan: the date, the buddy's start time (at "Days only", it asks for a time), the length of their window (or your default), your default Type (Standard), and the note "With Mom" (editable). A **"Let Mom know"** toggle is on by default. There is no Cancel button; the sheet is dismissible per the repo rule.
3. Save creates a normal Day Plan with a local link to the buddy's Plan instance. It is still pure forecast (ADR 0003) and counts in _your_ Projected Total like any Plan. Mom gets an Active push: "Anna is joining you Saturday at 9:00".
4. Row badges: your `PlanRow` shows a small avatar "with Mom", and Mom's row shows "Anna is coming".
5. **If Mom edits or cancels:** your row shows "Mom's plan changed" with **Match** / **Keep mine** buttons. A push is sent per the matrix, and it is Time Sensitive only within 60 minutes of the start.
6. **If you delete your joined Plan:** Mom gets a Passive "Anna can't come Saturday".

There is no attendance tracking and no "did you go together" check.

### 2.5 The Assistant: buddy Plans should never influence Recommendations in v1

1. **Contract.** The Assistant closes _your_ goal gap from _your_ Plans, Visits, Off Days, and Meeting Days (`CONTEXT.md`). Buddy intent is not your intent.
2. **Consent.** Using a buddy's shared data to drive your recommendations is a secondary use they never agreed to.
3. **Stability.** The Assistant re-arms on an input fingerprint. Every edit a buddy makes would churn your Recommendations, which is confusing, especially for older users.
4. **Pressure.** "Mom goes out Tuesday, so should you" becomes nudging and comparison.

What does feed the Assistant: Plans you create via "I'll come too", because they are ordinary Day Plans. A later option could be a user-invoked, deterministic "Find a day with Mom" that lists overlap candidates. That would be an explicit tool, not the Assistant.

### 2.6 Empty states and edge cases

- **No buddies:** Schedule looks exactly as it does today. At most one dismissible "Plan with a buddy" tip, using the existing Did-you-know pattern. Never stack it with the Calendar Sync banner.
- **A buddy isn't sharing with you:** their detail page says "Mom isn't sharing her schedule with you". There is no nag button in v1; "Ask to see" could come in v1.1, rate-limited to once per 30 days.
- **Paused or stale data:** only the buddy detail page says "Updated 3 days ago". Cells don't show it.
- **Time zones:** send Plans as local dates (YYYY-MM-DD) plus minutes from midnight, not instants. This follows the recent UTC+12 day-shift fix. If time zones differ, label times "(Mom's time)".
- **Off Days:** a buddy's dot still shows on your dimmed Off Day.
- **Viewing beyond the ~8-week horizon:** "Mom shares plans through Nov 30".
- **4 or more buddies on the same day:** 2 dots plus "+". The day sheet lists all of them.

### 2.7 Device calendar sync (#265): UX-fit notes on `docs/calendar-sync-plan.md`

- **Fit is good:** a dedicated screen under Preferences, per-type toggles, one-way sync with overwrite copy, no alarms (in-app notifications stay the source of truth), and a free-feature row on the paywall.
- **Privacy of Follow-up events.** The title is "Follow-up: <full name>" and the location carries the address and coordinates. Device calendars are often shared with family, synced to Google (a third party), and shown on the lock screen and Watch. Recommend a "Follow-up details in your calendar" choice: _Name and address_ / _First name only_ / _Just "Follow-up"_. At minimum, show a one-line warning when the destination is a non-iCloud (for example Google) or shared calendar.
- **Buddy data:** write **only your own data** in v1.
  - Never write buddies' overlay Plans.
  - Joined Plans are your own Day Plans, so they already sync.
  - Accepted shared Follow-ups (§3) may sync as "Follow-up with Mom" using only the fields Mom shared. Delete them when the invitation expires or is cancelled.
- **Banners:** one inline banner at a time on Schedule (Calendar Sync _or_ Buddies tip).

---

## 3. Inviting a buddy to a Follow-up

### 3.1 Entry points

1. In **Contact Details → visit history → the Follow-up box** in `ConversationRow`, add an **"Invite a buddy"** button. Show it only if the Follow-up is upcoming (not past, not dismissed).
2. Add **"Invite a buddy"** to the row's `RowActionsMenu`, next to Edit and Delete.
3. _(Later)_ Add a context action on the Home Approaching Conversations row.

Do **not** add it to the Visit form. Keep the form simple.

### 3.2 Flow for the owner

1. Tap **Invite a buddy**. A dismissible sheet opens with no Cancel button.
2. **Choose one buddy** (single-select in v1, "by twos"). Buddies who are paused show why they can't be picked.
3. **Preview: "What Mom will see".** This is the exact card the buddy will receive:

```
What Mom will see
┌─────────────────────────────────────────────┐
│ Follow-up with Levi                         │
│ Sat, Oct 3 · 10:00 AM                       │
│ Maria                                  ✎    │ ← first name; editable nickname
│ 123 Oak St · [map]              Share  ◉    │ ← address on by default
│ Topic: "Why does God allow…"    Share  ○    │ ← topic off by default
└─────────────────────────────────────────────┘
Not shared: last name, phone, email, notes, visit history, other details.
It disappears from Mom's app after the visit.
[ Send invitation ]
```

Details of the preview:

- **Name:** first name only by default, editable to a nickname (e.g. "Mr. G"). If the Contact has no usable name, it shows as "Follow-up".
- **Place:** by default, the street address and map pin (from the Contact's Address/Coordinate). Switch it off to show a short **"Meeting point"** text instead, such as "I'll pick you up".
- **Topic:** off by default. The topic is the owner's own prep note and can be sensitive.
- **Never shared:** phone, email, Custom Fields, avatar, Visit notes, Visit history, Bible Study flags, other Visits.

4. **Send.** The Follow-up box now shows a status chip: _Invited Mom · waiting_ → _Mom is coming_ / _Mom can't make it_ / _Expired_.

### 3.3 Flow for the buddy (invitee)

1. **Push notification** (Active; Time Sensitive only if the visit starts within 60 minutes): "Levi invited you to a follow-up · Sat 10:00 AM", with **Accept** and **Decline** actions. The lock screen never shows the householder's name or address (HIG). The hidden-preview text is "Invitation".
2. **Invitation screen:** the same card, plus **Directions** and a **"Remind me"** setting. The reminder is the buddy's _own_, using their own follow-up reminder default. As in Apple Reminders, the owner's reminder is not shared.
3. **Answer with "I'll come" or "Can't make it".** These are the only two answers. Unlike Apple Invites, there is no "Maybe", because a two-person appointment needs a clear answer.
4. **After accepting:** the item appears read-only as **"Follow-up with Levi"** with an RSVP chip:
   - in the Schedule day sheet under "Shared with you" (dot in Levi's color);
   - on Home in the Approaching Conversations area as a distinct row (Levi's avatar, "Follow-up with Levi · Maria · Sat 10:00").

   The buddy can **change their answer** at any time. That sends a Passive notice to the owner, or Time Sensitive within 60 minutes.

### 3.4 How owner changes propagate

| Owner action                                                                                                          | What the buddy experiences                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Changes the time on the same day                                                                                      | Stays accepted with a "Changed" badge. Active push, Time Sensitive if within 60 minutes of the old or new time. Edits within 5 minutes are combined into one push. |
| Changes the date (RescheduleVisit)                                                                                    | Goes **back to "Invited"** and asks again. Active push.                                                                                                            |
| Changes the shared place or topic                                                                                     | Silent update with a "Changed" badge.                                                                                                                              |
| Dismisses the Follow-up, turns off the Follow Up switch, deletes the Visit, or archives/dismisses/deletes the Contact | Treated as **Cancelled**. Active push (Time Sensitive within 60 minutes). The item shows "Cancelled" in the day sheet for 24 h, then disappears.                   |
| Logs the Visit                                                                                                        | The shared item quietly completes. No push.                                                                                                                        |
| Removes or pauses the buddy                                                                                           | Invitations are cancelled quietly.                                                                                                                                 |

### 3.5 Auto-expiry and purge

- A pending invitation expires at the Follow-up start time. You can't accept once the visit has started.
- Accepted items are **deleted on both devices at local midnight after the visit day**. That removes the name, address, topic, and pin.
- Undelivered ciphertext on the server has a maximum TTL of about 7 days.
- Copy intent for trust: "Only you and Mom can read this. It's removed after the visit." Screenshots can't be prevented, so the preview's framing is "share only what you're comfortable with".

### 3.6 Edge cases

- The buddy is on an old app version: at send time, show "Mom needs to update WitnessWork".
- Duplicate invitation to the same buddy: blocked.
- The Visit is in the past: the button is hidden.
- The buddy has several devices: answering on one updates the others.
- The Contact has no address or pin: the Place row shows "Meeting point" or "Not shared".
- No topic: the topic row is hidden.
- The buddy declines: the owner can invite a different buddy.
- The invitee deleted and reinstalled the app: pending invitations are lost, and the owner sees "Expired".

### 3.7 Should the buddy ever receive the Contact itself?

**No, not through this feature.** The invitation is a temporary _visit_ pass, not a Contact transfer. Hand-off already exists as **Share Contact** (`/c/` link).

If a buddy-channel hand-off is ever built, make it a **separate, explicit "Hand off to a buddy"** action with field-by-field preview. Notes and history should be off by default, with copy like "You're giving Mom this contact".

**Related finding:** today's Share Contact link includes up to 50 Visits **with notes** and has no preview. Consider adding a preview and opt-out of notes there too.

---

## 4. Buddy activity and notifications

### 4.1 Policy

- **Push in real time only for logistics:** invitations, answers, changes, cancellations, and joins. These use the **Active** level. **Time Sensitive** is used _only_ when the related visit or Plan starts within 60 minutes (HIG: "happening now or will happen within an hour"). It needs the Time Sensitive capability (WWDC21 10091).
- **Social or ambient events** (celebrations, encouragement, overlaps) are **Passive** (no sound, no screen wake) or in-app only.
- **Quiet hours.** Don't build a custom quiet-hours feature. The interruption levels already keep social events silent, and iOS Focus and Scheduled Summary handle the rest. Passive and Active notifications never break through either (HIG table).
- **No communication-notification treatment** (`INSendMessageIntent`) in v1. Apple scopes that to calls and messages, and adopting it would make Siri read buddy events aloud and suggest people to allow through Focus.
- **Grouping:** thread by Follow-up invitation (so updates stack) and by buddy for social events. Coalesce repeats: HIG says "avoid sending multiple notifications for the same thing".
- **Badges** count only items awaiting _your_ answer, such as pending invitations. They never count encouragements.
- **Lock-screen privacy:** no householder data in any notification. Provide generic text for hidden previews, e.g. "Invitation" or "Buddy update" (HIG).
- **Per-buddy Mute** (Apple Fitness pattern) silences that buddy's _social_ notifications (rows 14–16, 19). Logistics for visits and Plans you're part of still come through. Explain this beside the toggle: "You'll still get updates about follow-ups and plans you've joined."
- **An in-app Buddies notification settings screen** is required by HIG. Link it from iOS Settings via the "_App_ Notification Settings" entry that Apple exposes. Suggested toggles:
  - Follow-up invitations & updates (on)
  - Plans you join (on)
  - Both planning the same day (off)
  - Celebrations (off)
  - Encouragement (on)
  - Weekly summary (off, v1.1)

### 4.2 Notification matrix

Columns: **Default** = initial user setting. **Channel**: Push / In-app / Digest. **Level** = iOS interruption level. **TS≤60** = Time Sensitive only when the event starts within 60 minutes, otherwise the listed level.

| #   | Event                                                 | Recipient           | Default                         | Channel                               | Level                           | Lock-screen copy intent (no householder data)    | Notes                                                     |
| --- | ----------------------------------------------------- | ------------------- | ------------------------------- | ------------------------------------- | ------------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| 1   | Buddy invitation link opened                          | invitee             | —                               | In-app (link opens Accept screen)     | —                               | —                                                | No push channel exists before pairing                     |
| 2   | Invitation accepted                                   | inviter             | On                              | Push                                  | Active                          | "Mom accepted your buddy invitation"             | Closes the loop without a reciprocal link                 |
| 3   | Invitation declined or expired                        | inviter             | —                               | In-app only ("Expired · Send again")  | —                               | —                                                | **Never notify a decline**                                |
| 4   | Buddy ended the connection                            | the other buddy     | —                               | **Silent**; in-app state only         | —                               | —                                                | Avoids hurt; supports personal safety                     |
| 5   | Buddy paused or changed sharing                       | buddy               | —                               | Silent (the overlay disappears)       | —                               | —                                                | Detail page: "Not sharing right now"                      |
| 6   | Invited to a Follow-up                                | invitee             | On                              | Push + Accept/Decline actions         | Active, TS≤60                   | "Levi invited you to a follow-up · Sat 10:00 AM" | Badge +1 until answered                                   |
| 7   | Buddy accepted a Follow-up                            | owner               | On                              | Push                                  | Active                          | "Mom is coming · Sat 10:00 AM"                   | Same thread as #6                                         |
| 8   | Buddy declined or withdrew                            | owner               | On                              | Push                                  | **Passive**, TS≤60              | "Mom can't make it on Saturday"                  | Gentle, no guilt                                          |
| 9   | Follow-up changed by owner                            | invitee             | On                              | Push                                  | Active, TS≤60 (old or new time) | "Levi changed Saturday's follow-up to 11:00 AM"  | Edits within 5 minutes combined; a date change asks again |
| 10  | Follow-up cancelled                                   | invitee             | On                              | Push                                  | Active, TS≤60                   | "Levi cancelled Saturday's follow-up"            |                                                           |
| 11  | Reminder before a shared Follow-up                    | invitee (their own) | Uses their own reminder default | Local notification                    | Active                          | "Follow-up with Levi in 1 hour"                  | The owner's reminder is not shared                        |
| 12  | Buddy is joining your Plan                            | Plan owner          | On                              | Push                                  | Active                          | "Anna is joining you Saturday at 9:00"           |                                                           |
| 13  | A Plan you joined changed or was removed              | joiner              | On                              | Push                                  | Active, TS≤60                   | "Mom's Saturday plan changed"                    | In-app **Match / Keep mine**                              |
| 14  | Both planning the same day                            | both                | **Off** (in-app chip always on) | Push the evening before (~6 pm)       | Passive                         | "You and Mom both plan to go out tomorrow"       | At most 1 per day                                         |
| 15  | Buddy shared a celebration                            | buddy               | **Off** push; on in-app         | In-app on buddy detail; optional push | Passive                         | "Anna shared a celebration"                      | Only if the sender chose to share it                      |
| 16  | You received encouragement                            | recipient           | On                              | Push                                  | Passive                         | "Mom sent you encouragement"                     | 1 per celebration per sender; no counts                   |
| 17  | Buddy reached a Milestone, Achievement Tier, or hours | —                   | **Never**                       | —                                     | —                               | —                                                | Not shareable                                             |
| 18  | Buddy "started service now" or is out now             | —                   | **Never** (not built)           | —                                     | —                               | —                                                | No presence, no live activity, no location                |
| 19  | Weekly buddies summary                                | user                | Off (v1.1)                      | Digest push, Sunday evening           | Passive, low relevance score    | "Next week: 2 days planned with buddies"         | Coordination content only, never activity stats           |
| 20  | Buddy's security code changed                         | user                | —                               | In-app banner on buddy detail         | —                               | —                                                | E2EE hygiene, no alarm                                    |
| 21  | Buddy needs to update the app                         | sender              | —                               | In-app, at send time                  | —                               | —                                                |                                                           |

### 4.3 Privacy levels: what a buddy can ever see

- **Connected (default):** the display name and avatar _you_ choose. Either of you can send the other Follow-up invitations. Nothing else is shared.
- **Schedule** (per buddy): Off / Days only / Days and times / Days, times and notes (§2.1).
- **Celebrations** (per buddy, off by default, later): the names of awards you choose to share, with "Always ask" as the default mode.
- **Never:** hours or minutes, goals, Projected Total, Achievement Tiers, Milestones, streak counts, Service Report figures, Bible studies, Categories/credit, Contacts or Visits (except a single previewed Follow-up invitation), and location or presence.

---

## 5. Badges and awards (later phase)

### 5.1 Principles

- **Keepsakes, not rewards.** Awards are memories of faithfulness. They are not targets to chase.
  - Deci, Koestner & Ryan (1999): _expected_ and completion-contingent rewards undermined intrinsic motivation, while _positive feedback_ enhanced it (d = 0.33 for free-choice behavior).
  - So: no locked badge walls or progress bars toward hours-based awards. The only progress bars remain the user's own Milestones.
- **Never revoked.** No "streak lost" messaging.
- **Allow breaks without penalty.** Apple lets people "pause your Activity rings for up to 90 days without breaking your award streak". Off Days and marked breaks should never end a streak.
- **Include every Publisher role.** Most awards use days in the ministry, Follow-ups, and Visits. They count a Regular Publisher's 0-hour "shared in ministry" entries, so checkbox-mode users can earn them too.
- **Private by default.** Hours-based awards can never be shared. Any shareable award is shared without numbers.
- **Iconography:** Lucide medallions in the `SinceBadge` style.
  - No sparkles (reserved for AI) and no wands or "magic".
  - No trophies or crowns (boasting).
  - No hearts (the heart already means Donor/Supporter).
  - No thumbs-up ("like" semantics).

### 5.2 How awards relate to Milestones and Achievement Tiers (no duplicated UX)

| Existing concept                                               | Stays as-is                      | What Awards add                                                                          |
| -------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Milestone (hour rung in a Service Year, fireworks on crossing) | Yes: Year tab, ladder, fireworks | A **keepsake entry** in the Awards collection. **No second celebration.** Private only.  |
| Annual Goal (final rung)                                       | Yes                              | Keepsake entry. Private only.                                                            |
| Achievement Tier (per-month Reached/Exceeded/Crushed/Record)   | Yes: Month tab                   | A **gallery view** of `celebratedTiers` months. Same data, no new trigger. Private only. |
| Profile streak stat (weeks or months)                          | Yes                              | "Steady Weeks" awards reuse `consecutiveWeeksStreak`.                                    |

### 5.3 Award catalog v1 (14 awards plus 1 deferred)

Names are working titles; copy intent only. **Shareable** means the user _may_ choose to share it; nothing is automatic.

| #               | Award                                          | Trigger (domain terms)                                                                                                                          | Roles                                   | Tiers                            | Shareable?                                                                                                        |
| --------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1               | First Day Out                                  | First Time Entry logged in WitnessWork (a 0-h "shared" entry counts)                                                                            | All                                     | once                             | Ask                                                                                                               |
| 2               | Steady Weeks                                   | ≥1 day in the ministry in each of N consecutive weeks (`consecutiveWeeksStreak`); breaks and Off Days are allowed                               | All                                     | 4 / 12 / 26 / 52 weeks           | Ask (name only, **no number**)                                                                                    |
| 3               | Every Month                                    | Shared in the ministry (any Time Entry) in all 12 months of a **Service Year**. Goal is irrelevant, so a pioneer who fell short still earns it. | All                                     | yearly                           | Ask                                                                                                               |
| 4               | Month Well Planned                             | ≥1 Plan (Day Plan or counted Recurring instance) in every week of a month. Rewards _planning_, not execution (ADR 0003).                        | All                                     | repeatable                       | Private                                                                                                           |
| 5               | First Return Visit                             | First Visit logged for a Contact whose previous Visit had a Follow-up                                                                           | All                                     | once                             | Ask                                                                                                               |
| 6               | Faithful Follow-through                        | A Visit logged within 7 days of a Follow-up date (the opposite of Missed Conversations)                                                         | All                                     | 10 / 25 / 50 / 100               | Private (counts)                                                                                                  |
| 7               | Keeping at It                                  | A conversation Visit with a Contact after ≥2 consecutive **Not at Home** Visits                                                                 | All                                     | repeatable                       | Ask                                                                                                               |
| 8               | Groundwork Laid                                | Added a Follow-up _topic_ (a question left for next time) on 10 Follow-ups                                                                      | All                                     | once                             | Private                                                                                                           |
| 9               | First Study This Service Year                  | First Visit marked **Bible Study** in a Service Year                                                                                            | All                                     | yearly                           | **Private only.** The _w22_ April article, ¶8, warns against "dampening" others' joy by relating such experiences |
| 10              | Two by Two                                     | Went out with a buddy: an accepted Follow-up invitation or a joined Plan, and you logged time that day                                          | All                                     | 1 / 10 / 25                      | Ask                                                                                                               |
| 11              | Milestone keepsakes                            | A Milestone rung reached (existing `celebratedMilestones`)                                                                                      | Roles with an Annual Goal               | per rung                         | **Private only**                                                                                                  |
| 12              | Annual Goal keepsake                           | The final rung reached                                                                                                                          | Roles with an Annual Goal               | yearly                           | **Private only**                                                                                                  |
| 13              | Goal Months gallery                            | Months with any Achievement Tier (existing)                                                                                                     | Roles with a Monthly Goal               | per month                        | **Private only**                                                                                                  |
| 14              | Service Anniversary                            | **Tenure Start Date** anniversaries per Tenure Type                                                                                             | Full-Time Service and Auxiliary Pioneer | 1 / 5 / 10 / 15 / 20 / 25+ years | Private by default; may share                                                                                     |
| 15 _(deferred)_ | Seasonal (like Apple's limited-edition awards) | For example, special-activity months                                                                                                            | —                                       | —                                | Research first. It must not look official; avoid organizational branding.                                         |

**Rejected ideas:**

- Hour-threshold awards that can be shared.
- "Plans kept" or "Went out as planned" (ADR 0003).
- "Encourager" (turns kindness into a game).
- Daily streaks or a "perfect month" (health, family, and Meeting Day realities; _w22_ April ¶4–5 on age and limitations).
- "Comeback" (it highlights inactivity).
- Anything that ranks people or compares them.

### 5.4 Where awards live and the moment they're earned

- **Where:** a new **"Awards" section in `ProfileDetailOverlay`**, below the stats and since-badges. It shows earned medallions only, newest first. Tapping one opens a detail view with the date and a one-line meaning.
- **The moment:** a non-modal card on Home at the next launch ("New award · Steady Weeks") with **View**. If the award is shareable and celebrations sharing is set to Ask, it adds **Share with buddies…**. No fireworks: those stay reserved for goal crossings, which avoids duplication. A light haptic only.

### 5.5 Sharing awards and the one-tap "Encourage"

**Recommendation:** allow a single **Encourage** tap, but only as a reply to a celebration a buddy chose to share. Hebrews 10:24, 25 and 1 Thessalonians 5:11 ("keep encouraging one another") support this. It stays on the right side of the social-media line if all of these hold:

- private 1:1: only the recipient sees who encouraged them;
- no counts shown anywhere, and no lists aggregated across buddies;
- at most one per celebration per sender, and it can't be sent in response to inactivity;
- no free text or emoji picker (Apple Fitness allows custom replies; we don't);
- a Passive notification;
- the recipient can turn it off ("Receive encouragement").

It becomes creep if it grows comments, counters, or streaks for encouraging. Strava Kudos show counts and are explicitly "similar to liking a Facebook post", which is the pattern to avoid. The Duolingo and Headspace "nudge" is a _prod about inactivity_, which is also excluded.

---

## 6. Buddy management UX

### 6.1 Where Buddies lives in the IA

- **A dedicated Buddies screen** (stack route), reached from:
  1. a **Settings drawer row "Buddies"** in the first group, next to Publisher (people and identity), for management;
  2. a **Buddies row in `ProfileDetailOverlay`** showing up to 5 avatars in a horizontal row. Headspace used this pattern: a few people, few metrics;
  3. contextual entry points: the Schedule legend's "Buddies ⌄", the Follow-up box's "Invite a buddy", and the Home invitation row.
- **No new tab.** The tab bar is already full, and a social tab signals "feed".
- **Home** shows buddy items **only when actionable**: pending invitations, and shared Follow-ups or joined Plans in the next 24 h (inside Approaching Conversations). Never celebrations.

### 6.2 The Buddies screen

```
Buddies
Go out together and encourage one another.          (copy intent)
┌──────────────────────────────────────────────┐
│ (M) Mom                                    › │
│     You share plans with each other          │
│ (A) Anna                                   › │
│     Anna shares plans with you               │
├──────────────────────────────────────────────┤
│ ⊕ Invite a buddy                             │
└──────────────────────────────────────────────┘
Up to 5 buddies, including invitations waiting for a reply.

WAITING FOR A REPLY
  Invitation for "Dad" · expires Oct 1      [Send again] [Cancel]

How buddies work ›      (privacy explainer: never hours; end-to-end encrypted)
Notifications ›
Pause all sharing       [toggle]
```

- Sort alphabetically or in the user's own order. **Never by activity.**
- Don't draw empty "slots", which read as a quota to fill.
- At 5 buddies, the Invite button is disabled with a one-line reason.

### 6.3 Inviting via a secure link

**Inviter:**

1. Tap **Invite a buddy**. A sheet asks for an optional **local label** ("Mom", used only on your phone) and your **schedule sharing level** (default "Days and times", shown and changeable).
2. Choose **Share link** (share sheet; recommend Messages) or **Show QR code** (in person: the easiest and safest option for older pairs).
3. The link **works once and expires in 7 days**. Use the HIG's succinct permission-summary style: "Works once · Expires in 7 days". The rich preview in Messages shows only "You're invited to be WitnessWork buddies". **Never call it a "magic link"** (repo rule).

**Invitee:**

1. Taps the link, or scans the QR with Camera. The app opens. If the app isn't installed, the ww-proxy fallback page links to the App Store and asks them to "tap the link again after installing". If onboarding isn't finished, it runs first and then resumes the invitation.
2. **Accept screen:**
   - the inviter's name and avatar;
   - three plain bullets: "See each other's plans if you choose · Invite each other to follow-ups · Never hours or reports";
   - **your name as your buddy will see it** (prefilled from Profile, editable, as in Apple Invites' "Change how you appear");
   - **your schedule sharing level** (preset, changeable);
   - **Accept** / **Not now**.
3. On **Accept**, both sides connect immediately through the mailbox, with no reciprocal link. The inviter gets push #2.
4. **Optional "Verify Mom":** matching short codes on both phones, kept off the main path ("only needed if the link went somewhere public").
5. **Requirements:** if the iCloud account is unavailable, show an empty state that explains the requirement. Also say plainly that Buddies is **free**. It must not be Supporter-gated: both people need it, and iCloud Sync stays the only gated feature. Buddy-list parity across your own devices follows iCloud Sync.

### 6.4 Buddy detail

```
(M) Mom                                   Buddies since Sep 2026
[ Invite Mom to a follow-up ]      [ See Mom's plans on Schedule ]

WHAT YOU SHARE WITH MOM
  Your schedule                          Days and times ›
  Celebrations                           Off            (later)
WHAT MOM SHARES WITH YOU
  Her schedule                           Days and times · updated today
  Show on my calendar                    [on]    Color ● ›
  Name shown to you                      "Mom" ›        (local rename)
NOTIFICATIONS
  Mute Mom                               [off]
  "You'll still get updates about follow-ups and plans you've joined."
UPCOMING TOGETHER
  Sat 10:00 · Follow-up (you invited) · Coming
  Tue 9:00  · Plan (you joined)

Pause sharing with Mom ›      (1 week · 1 month · until I turn it back on)
Remove Mom                    (destructive)
```

### 6.5 Pause, mute, and remove

- **Pause** stops everything you send to that buddy (schedule and celebrations) but keeps the connection and Follow-up invitations. The buddy sees only "Not sharing right now", with no reason and no push. When a timed pause ends, sharing resumes automatically with a quiet in-app note to the person who paused.
- **Mute** is local only. It silences social notifications from that buddy (§4.1).
- **Remove:**
  1. Tap **Remove Mom** to open a destructive confirmation alert (the no-Cancel rule applies to forms in sheets, not alerts). Copy intent:
     - Title: "Remove Mom as a buddy?"
     - Body: "You'll stop seeing each other's plans. Upcoming follow-ups you share will be cancelled. Mom won't get a notification."
     - Buttons: Remove / Cancel.
  2. Effects: all of Mom's shared data (overlay, shared Follow-ups, celebrations) is deleted locally. A silent encrypted "connection ended" message removes you on her side. Shared Follow-ups in either direction are cancelled. Reconnecting requires a new invitation.
  3. Tone: neutral. No guilt ("We're sorry to see…"), no "Are you sure you want to abandon…".
- **Stop sharing with everyone:** one clear action on the Buddies screen that pauses or removes all connections at once. Apple's Personal Safety guide treats stopping activity sharing as a safety task.

### 6.6 Edge cases

- **Reinstall without iCloud Sync:** the identity is lost and buddies must reconnect. Show "Reconnect with your buddies" with plain instructions.
- **Your own devices:** a buddy connected on your iPhone appears on your iPad only with iCloud Sync on.
- **Version skew** between buddies: see matrix row 21.
- **Removing a buddy you share many plans with:** the overlay simply disappears.
- **Invitation link forwarded by mistake:** it's single-use. If it's opened twice, the second person sees "This invitation was already used".

---

## 7. "Not social media": anti-features

1. No leaderboards, rankings, "most active", or lists sorted by activity.
2. No comparing hours, totals, percentages, or charts of a buddy's time. No "you vs. Mom".
3. No competitions or challenges between people. Apple Fitness has 7-day competitions with up to 600 points per day and "alerts tell you if you're ahead of or falling behind"; these are excluded.
4. No shared or joint streaks (as in Duolingo Friend Streak). They create obligation and guilt.
5. No nudges about someone's inactivity ("Mom hasn't gone out this week").
6. No feed, timeline, posts, statuses, or broadcasts.
7. No comments, chat, direct messages, emoji palettes, or free-text replies. Messages already exists for talking.
8. No like counts, followers, public profiles, search, discovery, "people you may know", contact upload, or phone/email lookup (also required by ADR 0011).
9. No presence: no "last active", "out now", live location, or Live Activity for buddies.
10. No read receipts or "seen".
11. No groups beyond 5 buddies, and no congregation-wide groups. Don't call it a "group", which collides with official field service groups.
12. No householder data outside a single previewed, expiring Follow-up invitation. No Contact hand-off in v1.
13. No sharing of Bible Study counts, Service Report figures, Achievement Tiers, or Milestones.
14. No "streak lost" or loss-aversion copy, and no revoked awards.
15. No awards for encouraging others, no hours thresholds on shareable awards, no locked badge grids.
16. No growth loops or marketing pushes ("invite 3 buddies to unlock…"), and no Supporter-gating of Buddies.
17. No LLM (Scribe AI) processing of buddy data, and no sparkles or "magic" wording anywhere in Buddies.

---

## 8. MVP scope

**MVP 1: "Plan together" (ship first).**

- The Buddies screen: at most 5; invite by link or QR; one-tap accept; pause; mute; remove; stop sharing with everyone.
- Calendar sharing (#288): per-buddy levels, show/hide, and color; cell dots, legend filter, and the day-sheet section.
- "I'll come too" joins.
- Push for rows 2, 12, and 13.
- Free for everyone.

_Why first:_ it is an explicit user request, carries the lowest privacy risk (no householder data), and is useful with just one buddy (for example, a parent and child who pioneer together). It also sets up the pairing, identity, push, and NSE work everything else depends on.

**MVP 2: "Go together to a follow-up."**

- Follow-up invitations (§3), rows 6–11, the Home/Schedule surfaces, and auto-expiry.

_Why second:_ it is the most sensitive feature because it carries third-party data, so the crypto channel and purge behavior should be proven first.

**In parallel:** #265 device calendar sync of your own data, with the §2.7 tweaks.

**Later: "Encourage one another."**

- First, a private Awards collection.
- Then opt-in celebration sharing and one-tap Encourage (rows 15–16).
- After that: overlap push (row 14), weekly summary (row 19), and "Ask to see".

**Never:** everything in §7.

**What to measure:** coordination outcomes, such as invitations accepted, days planned together, and "Two by Two" occurrences. Don't measure engagement-loop metrics such as encouragements sent or time in app.

---

## 9. Copy and i18n notes

- New keys under `buddies_*` in `en-US.json` only. Other locales are human-approved.
- Terms follow the glossary: "Follow-up" (not "appointment"), "Plan", "Day Plan", "Visit", "Not at Home".
- Consider adding **Buddy**, **Buddy Invitation**, **Follow-up Invitation**, **Celebration**, and **Award** to `CONTEXT.md`.
- "Buddy" is informal. Ask translators for warm local equivalents.
- Words to avoid: "friend request", "follow", "unfriend", "like", "kudos", "streak lost", "magic link", "group", "leaderboard", "compete", "crushed" (in anything shared).
- Tone: warm and brotherly, as in the founder note. Commend, don't compare.

## 10. Open questions for Levi

1. The default schedule level: "Days and times" (recommended) versus "Off".
2. Single-buddy Follow-up invitations versus up to 2 (car groups).
3. Whether Regular Publishers should get the "Every Month" award, or whether it could feel patronizing. Test with users.
4. The Follow-up detail level for device-calendar sync (§2.7).
5. The final user-facing name in each language.

## 11. Sources

**Apple (primary)**

- HIG Notifications: https://developer.apple.com/design/human-interface-guidelines/notifications
- HIG Managing notifications: https://developer.apple.com/design/human-interface-guidelines/managing-notifications
- HIG Live Activities: https://developer.apple.com/design/human-interface-guidelines/live-activities
- HIG Collaboration and sharing: https://developer.apple.com/design/human-interface-guidelines/collaboration-and-sharing
- WWDC21 "Send communication and Time Sensitive notifications": https://developer.apple.com/videos/play/wwdc2021/10091/
- iPhone notification settings (Scheduled Summary, previews, in-app settings link): https://support.apple.com/guide/iphone/change-notification-settings-iph7c3d96bab/ios
- Apple Intelligence notification summaries and priority: https://support.apple.com/guide/iphone/summarize-notifications-reduce-interruptions-iph1fbe7d2b9/ios
- Fitness sharing (Invite a Friend, Mute, Hide My Activity, Remove Friend, replies): https://support.apple.com/guide/iphone/share-your-activity-iph0b826155d/ios
- Watch sharing and competitions (7 days, 600 pts/day, ahead/behind alerts): https://support.apple.com/guide/watch/share-your-activity-apd68a69f5c7/watchos
- Up to 40 friends: https://support.apple.com/en-us/HT207014
- Personal Safety, activity sharing: https://support.apple.com/guide/personal-safety/manage-activity-sharing-on-apple-watch-ips91d58b7ba/web
- Awards (personal records, streaks, milestones; Monthly Challenges): https://support.apple.com/guide/watch/track-daily-activity-apd3bf6d85a6/watchos
- Pause rings for up to 90 days without breaking the award streak: https://support.apple.com/en-sg/guide/watch/apd29b30023c/watchos
- watchOS 4 "unique Monthly Challenges designed just for them": https://www.apple.com/newsroom/2017/06/watchos-4-brings-more-intelligence-and-fitness-features-to-apple-watch/
- Limited-edition "Ring in the New Year" award: https://www.apple.com/newsroom/2026/01/stay-active-in-the-new-year-with-apple-watch/
- Apple Invites RSVP / approve guests / invite guests: https://support.apple.com/guide/apple-invites/rsvp-to-an-event-devc9d9cdbd5/ios · https://support.apple.com/guide/apple-invites/approve-or-deny-rsvp-requests-dev48e9e39e0/ios · https://support.apple.com/guide/apple-invites/invite-guests-dev851dd16db/ios
- Share iCloud calendars (Allow Editing, read-only, change notifications): https://support.apple.com/guide/iphone/share-icloud-calendars-iph7613c4fb/ios
- Multiple calendars (show/hide, color): https://support.apple.com/guide/iphone/use-multiple-calendars-iph3d1110d4/ios
- Reminders sharing and assignment ("Notifications that you set for your reminders aren't shared"): https://support.apple.com/en-us/105124

**Other products**

- Google Calendar permission levels: https://support.google.com/calendar/answer/37082
- TimeTree (filters, group sharing): https://timetreeapp.com/intl/en
- Fantastical Calendar Sets / Openings / shared-calendars blog: https://flexibits.com/fantastical-ios/help/calendar-sets · https://flexibits.com/fantastical-ios/help/openings · https://flexibits.com/blog/2022/06/be-on-the-same-page-with-shared-calendars-in-fantastical/
- Strava Kudos / hidden details: https://support.strava.com/en-us/articles/15402054-what-is-kudos · https://support.strava.com/en-us/articles/15401769-hide-details-from-your-activities
- Duolingo Friend Streak (5 friends, must accept) / product lessons (why 5) / Friends Quests (nudges): https://blog.duolingo.com/friend-streak/ · https://blog.duolingo.com/product-lessons-friend-streak/ · https://blog.duolingo.com/friends-quests/
- Headspace buddies analysis (secondary): https://paulcohen.com/headspace-and-the-nuance-of-social-behavior-design/
- Todoist auto-accept invitations: https://www.todoist.com/help/articles/accept-project-invites-automatically-dyeMjN
- Deci, Koestner & Ryan (1999), _Psychological Bulletin_ 125(6):627–68: https://pubmed.ncbi.nlm.nih.gov/10589297/

**JW (verified on wol.jw.org, NWT Study Edition)**

- Gal 6:4 ("…not in comparison with the other person"): https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/48/6
- Gal 5:26 ("…stirring up competition with one another…"): https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/48/5
- Heb 10:24, 25 ("…encouraging one another…"): https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/58/10
- 1 Thess 5:11 ("keep encouraging one another and building one another up"): https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/52/5
- Luke 10:1 ("sent them out by twos"): https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/42/10
- Matt 6:1 ("…not to practice your righteousness in front of men to be noticed…"): https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/40/6
- "Find Joy in Giving Jehovah Your Personal Best," _The Watchtower_ (Study), April 2022, art. 16: avoid comparing; don't boast; the 80-year-old sister: https://wol.jw.org/en/wol/d/r1/lp-e/2022368
- "Avoid Stirring Up Competition—Promote Peace," _The Watchtower_ (Study), July 2021, art. 28: box on "who is the most productive pioneer": https://wol.jw.org/en/wol/d/r1/lp-e/2021486
- "We Must Be Holy in All Our Conduct," _The Watchtower_ (Study), Nov 15, 2014, ¶13: "none of us should feel pressured to devote many hours… just to be able to turn in a larger report": https://wol.jw.org/en/wol/d/r1/lp-e/2014844

**Codebase (read-only)**

- `/Users/levi/dev/witness-work/CONTEXT.md`, `docs/friend-sharing-plan.md`, `docs/calendar-sync-plan.md`, `docs/adr/0003-plans-are-forecast-not-consumed.md`, `docs/adr/0011-shared-account-id-over-icloud.md`
- `src/app/navigation/{HomeTabStack,DrawerNavigator}.tsx`, `src/features/plans/screens/ScheduleScreen.tsx`, `src/components/{CalendarDay,PlanRow}.tsx`, `src/features/plans/components/CalendarKey.tsx`, `src/features/service-reports/components/DayHistoryView.tsx`, `src/features/contacts/components/ConversationRow.tsx`, `src/features/contacts/lib/contactShareLink.ts`, `src/features/profile/components/ProfileDetailOverlay.tsx`, `src/features/profile/lib/profileStats.ts`, `src/lib/{achievementTier,milestones,publisherCapabilities,notifications}.ts`

## 12. Unverified or partially verified claims

1. Headspace buddies details (up to 5, email invites, text/email nudges): secondary sources only. The help center returned 403, and whether the feature is still available is unknown.
2. TimeTree per-member color labels: the help center returned 403, so this rests on a search snippet. Only "filters" was confirmed on the official site.
3. Strava map visibility hiding start/end within about 1 mile: from a search summary; the page wasn't opened.
4. Apple Fitness "can't hide your activity from a friend you're competing with": search summary only.
5. Apple Fitness sharing being mutual by default on accept, and removal being silent: inferred, not documented.
6. The November 2023 congregation reporting change (Regular Publishers report participation, not hours): not verified on jw.org. The report relies on `CONTEXT.md`.
7. Technical assumptions: the NSE can set the interruption level on CloudKit-subscription pushes; universal-link payloads can live in the URL fragment with AASA fragment matching; deep links are lost across an App Store install.
8. Avoiding communication notifications for App Review and user-expectation reasons is a design judgment.
9. Deci et al. (1999) is lab evidence. Applying it to religious service is an inference.
