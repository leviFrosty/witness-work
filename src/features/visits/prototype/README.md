# Who needs you — throwaway UI prototype

Question: which Home layout makes returning to follow-ups feel manageable?

Run `pnpm prototype:followups`, then open http://localhost:4797/?variant=A.
No install or build is needed for the HTML itself; the command uses Python 3.

- A: featured person, two compact rows, rollup.
- B: one-person focus with a contact selection rail.
- C: compact agenda with a primary action per row.

Use the floating arrows or keyboard left/right to compare. The URL keeps the
variant; all sample actions and settings live in memory. Reload resets them.
The inspector shows the queue, age buckets, and simulated outcomes.

Try normal, welcome-back, stale-only, empty, and boundary scenarios. Toggle the
fresh window, welcome-back behavior, and amber/accent. With welcome-back disabled,
the nine-person scenario exercises the collapsed queue. Ages 7 and 30 are inclusive;
31 is excluded. Only appointment-qualified fixtures are included.

The browser shell approximates native Home because this checkout has no web target.
It uses the app's green accent and gray/white surfaces, but is not native rendering.
The widget is a concept preview using the same sample filter, not a widget change.
Date/time is frozen at September 20, 2026. Next week means seven days from today.
Hide/unhide, preferences, analytics, calls/texts, and visit saves are simulations.
Swipe right opens date choices; swipe left dismisses. All mutations support a single
most-recent Undo, including bulk actions. Empty/hidden cards are visible in this
prototype to make those states inspectable.

Copy experiment: welcome-back uses “Welcome back. Take one small step.” instead of
asserting absence from a queue count, and the rollup says “past 30 days” because
items may cross a calendar-month boundary. In the 3-day experiment, the bulk older
item cutoff also follows that window, to keep the groups and action aligned.

No design verdict yet. Once a layout is selected, preserve this prototype on a
throwaway branch and link it from the implementation issue before removing it from
the implementation branch. Production integration, native gestures/accessibility,
notifications, persistent preferences, Phase 3 retreat/Not home, and actual analytics
are intentionally outside this UI experiment.
