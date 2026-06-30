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
