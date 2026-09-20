# Home insights — prototype for #479

Source: <https://github.com/leviFrosty/witness-work/issues/479>.

**Current question:** How do actionable insights blend into WitnessWork's existing
screens? This revision follows the September 21 feedback: keep the app's navigation,
remove the separate People/Timing/Pace/History destinations, and park Wrapped.

## Open it

```sh
pnpm prototype:home
```

Open <http://localhost:4790/?variant=A>. Use Node 24 as specified in `.nvmrc`.
`PORT=4791 pnpm prototype:home` selects another port.

The product navigation follows `src/app/navigation/HomeTabStack.tsx`:

- **Home:** report, timer, week strip, conversations, and the daily highlight.
- **Contacts:** searchable/filterable contact list and conversation details.
- **Progress:** Month / Year / All time; pacing explanations sit below the existing
  projected total, beside the report and daily records. History stays here.
- **Schedule:** calendar, day inspector, recurring plans, and Assistant; suggestions
  sit alongside the plans they explain.
- **Map:** fictional contact markers and the aggregate “When someone was home”
  heatmap. No additional timing recommendation feed.

Progress follows the real `showsYearTabs` capability and is absent for checkbox
Publisher mode. Mobile uses the five-tab floating navigation; desktop uses the
sidebar. Design controls and the catalog sit apart from product navigation.

## Daily highlight

The small previous/next arrows **inside the card** cycle through all 61 active
candidates and wrap at either end. The selector jumps directly to an example.
The count identifies the current position. `?highlight=15` links directly to a
card; the choice survives reload and switching Home layouts. Actions still open
the candidate's detail/form, and the contextual link opens the relevant existing
app screen. Hidden memories and dismissed annual suggestions leave the carousel.

The separate bottom layout switcher compares:

- `?variant=A`: highlight beside the current month, with existing Home sections.
- `?variant=B`: highlight within today's agenda, with report and contacts beside it.
- `?variant=C`: highlight first, followed by the familiar Home sections.

Keyboard left/right switches layouts except in inputs or open sheets. Use the
card's controls to switch insights. Layout and insight selection are independent.

`?page=catalog` opens the design catalog; `?page=catalog&insight=47` opens a detail.
Legacy People/Timing/Pace/History links redirect to Contacts/Map/Progress.

## What to try

1. Cycle the highlight and open Contacts, Progress, Schedule, or Map from it.
2. Search/filter Contacts, select a conversation, and open its marker on Map.
   Add a fictional contact and verify its list/detail state.
3. Open Progress → Month to compare the report, records, and new pace explanation.
   Year and All time keep the comparison and record ideas within Progress.
4. Select a Schedule date, add one plan, and check that it appears on that date.
   Saving a candidate's proposed week still creates multiple plans. Generic time
   entry does not consume a plan; #46's explicit log/move flow resolves its
   specific sample plan. Report and forecast totals derive from the same records
   shown in Progress and Schedule.
5. Select a heatmap cell on Map. It shows the observed count/rate in that slot;
   sparse history still exercises the sample-size gate.
6. Try Away ranges, duration formats, discreet mode, and checkbox mode. Turning
   Insights off removes additions while preserving the existing app destinations.
   Advance the prototype clock to see the week strip and date selection follow it.
7. Open the prototype controls for the catalog, state inspection, Reset, and Undo.

## Saved for later: WitnessWork Wrapped

**“WitnessWork Wrapped — Your year, wrapped.”** The annual story remains a future
feature idea. Candidates #56, #63, and the related #64 portrait are excluded from
the current highlight rotation/catalog. Their original copy, slide/share code,
and coverage entries remain preserved on this throwaway branch. Direct detail
links display the deferred-scope explanation. There is no Wrapped card, tab, or
share flow in the current app exploration. The weekly recap remains a candidate
and a contextual Schedule addition.

## Boundaries

This is a browser recreation, not the running native iOS application. Screen
composition was checked against `HomeTabStack.tsx`, `TabBar.tsx`,
`ContactsScreen.tsx`, `ProgressMonthTab.tsx`, `ProgressYearTab.tsx`,
`ScheduleScreen.tsx`, and `MapScreen.tsx`. All records are fictional and all actions
stay in memory. Reload resets actions. No production screen, native store, map
service, notification, analytics, or persistence integration is added.

The harness reuses the app's pure duration and Publisher capability helpers;
compact totals use `formatMinutesCompact`, and full durations use `formatMinutes`.
Copy is isolated in this prototype's `en-US.json`. The runner serves an explicit
file allowlist and cannot serve the repository root or `.env`. It adds no runtime
dependencies and is not imported by the native entry point.

Candidate-specific historical/calendar examples are independent fixtures. The
September report's baseline entries total 2,280 minutes and its four plans total
540 minutes. Visits, year charts, statistical associations, recurring-series
changes, and note analysis remain illustrative, not production inference or
scheduling algorithms. The timing gate does not recompute the fixture heatmap.
Map locations are schematic. No messages are sent. Optional fonts have system
fallbacks. Personal planning targets do not alter official Publisher requirements.

## Validation

Browser walkthroughs cover the five navigation destinations, all 61 highlight
positions, wraparound, chooser, URL reload, layout independence, Contacts
search/add/detail, Progress segments, selected-day saves, Map/contact handoff,
privacy, flag-off baseline screens, checkbox navigation, and mobile layout.
Follow-up checks cover hidden/dismissed candidates, logging versus planning,
clock advancement, and accessible calendar labels. Lint and TypeScript are run
against the repository. Temporary browser tooling stays outside the repository;
no permanent prototype test suite or dependency was added.

## Original catalog coverage

The numbers map to section 5 of issue #479. All original concepts are preserved
below; **#56, #63, and #64 are parked** and not part of the active exploration.

| #   | Experience                                               | Interaction               |
| --- | -------------------------------------------------------- | ------------------------- |
| 1   | A good conversation deserves another.                    | Schedule a return visit   |
| 2   | Make a little room for {Maria}.                          | Find a time               |
| 3   | Your return visits tend to be 11 days apart.             | Plan an RV afternoon      |
| 4   | Earlier returns have often become studies.               | Set a reminder            |
| 5   | Six people are ready for another hello.                  | Review contacts           |
| 6   | Make space for someone new.                              | Plan a conversation       |
| 7   | A question makes it easier to pick up again.             | Add a question            |
| 8   | {Yusuf} mentioned an exam this week.                     | Draft a message           |
| 9   | Two favorites are waiting for a hello.                   | Schedule both             |
| 10  | There may be another conversation to continue.           | Review the other 11       |
| 11  | Make your next visit easier to find.                     | Add contact details       |
| 12  | Pick up a conversation that has gone quiet.              | Plan a return route       |
| 13  | Three return visits and a study fit together.            | Group a route             |
| 14  | You explored three new areas this month.                 | Plan a return route       |
| 15  | Saturday mornings open more doors.                       | Make room on Saturday     |
| 16  | Saturday morning may suit {Carlos}.                      | Schedule Saturday         |
| 17  | A different time could open a door.                      | Try an evening            |
| 18  | Let your own patterns shape the week.                    | Preview an Assistant plan |
| 19  | See which days start more conversations.                 | Compare weekdays          |
| 20  | Regular study visits have lasted longer in your history. | Make a weekly plan        |
| 21  | Find a rhythm that works for {Ana}.                      | Reschedule together       |
| 22  | A demonstration could be a natural next step.            | Review conversations      |
| 23  | September has been a beginning for studies.              | Plan for September        |
| 24  | A steady rhythm, month after month.                      | Prepare your report       |
| 25  | There is room to talk about a study with {Maria}.        | Review study details      |
| 26  | Your studies, across the year.                           | Review study rhythm       |
| 27  | Two small plans can make room for your goal.             | Add two sessions          |
| 28  | Catching up, with room to adjust.                        | Add a weekday plan        |
| 29  | Your goal is within reach.                               | Schedule the gap          |
| 30  | Ready to add this month’s first entry?                   | Log or plan               |
| 31  | A little ahead of your Service Year pace.                | Adjust remaining targets  |
| 32  | Fewer days, a little more time each visit.               | Choose your rhythm        |
| 33  | See how Credit Time fits into your month.                | Plan field time           |
| 34  | April was a month to remember.                           | Open that month           |
| 35  | Picture a different rhythm in March.                     | Preview March             |
| 36  | Would a more reachable goal suit this season?            | Explore a lighter goal    |
| 37  | You have made room early this month.                     | Reflect on your progress  |
| 38  | Start with a goal that fits your own history.            | Try a personal goal       |
| 39  | Your recent rhythm is building.                          | Explore your rhythm       |
| 40  | A little more time would meet your usual range.          | Add a short session       |
| 41  | Saturdays made more room this month.                     | Move a Tuesday plan       |
| 42  | Your plans mostly matched your week.                     | Plan next week            |
| 43  | Another evening may fit you better.                      | Move the recurring plan   |
| 44  | Leave a little room for this week.                       | Copy last week            |
| 45  | Tuesday mornings are becoming your rhythm.               | Make it recurring         |
| 46  | How did today’s plan go?                                 | Log or move it            |
| 47  | There is room to take a break.                           | Set Away dates            |
| 48  | Let reminders arrive when they suit you.                 | Choose reminder time      |
| 49  | Make space for the Memorial campaign.                    | Plan campaign days        |
| 50  | Six weeks to look back on your Service Year.             | Review the year           |
| 51  | Plan around your circuit overseer’s visit.               | Choose visit dates        |
| 52  | Leave your convention weekend open.                      | Mark Off Days             |
| 53  | August has often been a quieter month for you.           | Try a seasonal plan       |
| 54  | Three years of full-time service, this month.            | Write yourself a note     |
| 55  | You have made room for ministry in 24 months.            | Remember a moment         |
| 56  | A year of conversations worth remembering.               | Open your year            |
| 57  | One hello became a regular conversation.                 | Remember that first visit |
| 58  | A theme runs through your notes.                         | Explore your notes        |
| 59  | Your fiftieth return visit was another hello.            | Keep a memory             |
| 60  | Twelve weeks with room for ministry.                     | Reflect on your rhythm    |
| 61  | A little look back before the week begins.               | Plan this week            |
| 62  | Two parts of this week look different.                   | Explore this week         |
| 63  | A year made of small, meaningful moments.                | Open your Wrapped         |
| 64  | What kind of rhythm felt like you?                       | Try a year portrait       |
