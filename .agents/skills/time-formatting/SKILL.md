---
name: time-formatting
description: How to render time/duration in WitnessWork — always route measured minutes through the `src/lib/minutes.ts` helpers so displays respect the user's timeDisplayFormat. Use whenever rendering hours/minutes in JSX, i18n templates, widgets, or tight UI, or when reviewing a manual `minutes / 60` / hardcoded `h`/`hrs` suffix.
---

# Rendering time

All render-time math goes through `src/lib/minutes.ts` helpers — never hand-roll hours/minutes parsing.

## User-facing displays

User-facing time displays MUST go through `useFormattedMinutes(minutes)` (hook) or `formatMinutes(minutes, format)` (pure):

- Never hand-roll `_.round(minutes / 60, 1)`.
- Never hardcode an `h` / `hrs` suffix in JSX or string templates.
- Never pass a raw hour count into `i18n.t('…', { count })` for display.

Reads must respect the user's `timeDisplayFormat` preference: `'decimal'` → `1.5h`, `'short'` → `1h 30m`.

## i18n templates

Templates that wrap a time value should accept a pre-formatted `{{value}}` (no inline `hrs`/`h`), and the caller supplies `formatMinutes(...).formatted`.

Goal counts the user explicitly entered **in hours** can stay as `${goalHours} ${i18n.t('hours')}` — only _measured/computed_ time needs the formatter.

## Tight UI — the only sanctioned bypass

Calendar squares, contribution-graph tooltips, and widgets use the compact variants instead:
`formatMinutesCompact` / `useCompactFormattedMinutes` / `formatHoursCompact`.

## Digits and other numbers

The helpers above print the app Language's digits (Arabic-Indic in Arabic). Numbers that aren't durations go through `src/lib/numbers.ts`: `formatNumber` (grouped, Format Region separators), `formatPlainNumber` (years and typed values, no grouping). Numbers passed to `i18n.t` placeholders are localized for you. Never `toLocaleString()` without a locale, which follows the device instead of the app. Parse typed numbers with `parseDecimalInput`/`parseIntegerInput` from `src/lib/digits.ts`, which accept ٠-٩ as well as 0-9.

Dates follow one rule: `moment.format` always writes ASCII digits, so use it as is for keys, ids and payloads (`YYYY-MM-DD`, `YYYY-MM`). Anything a user reads goes through `src/lib/dates.ts`, which adds the app Language's digits: `formatDate`/`formatTime`/`formatDateTime`/`formatRelative`/`formatCalendar` and the compact helpers, `formatDisplay(m, 'MMMM YYYY')` for other patterns, and `localizeDisplayDate(text)` for a `fromNow()`, `humanize()` or other string moment built. Never run a display helper's output back into a key or a parser.
