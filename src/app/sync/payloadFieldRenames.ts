/**
 * Wire-payload field-name normalisations applied on read so receivers see the
 * canonical schema regardless of which app version wrote the payload. Used by
 * `parsePayload` immediately after JSON validation and before any merge step.
 *
 * Why this lives outside `payload.ts`: keeping it as a tiny pure module (no
 * store / RN / Expo imports) makes it cheap to unit-test in isolation — the
 * full `parsePayload` module pulls in every zustand store which transitively
 * pulls native modules vitest can't load.
 *
 * Rename table (legacy → canonical):
 *
 * - `preferencesStore.values.excludedWeekdays` → `offDays`
 * - `preferencesStore.values.meetingWeekdays` → `meetingDays`
 * - The matching keys inside `preferencesStore.updatedAt`
 *
 * New name wins if both keys somehow coexist on the wire (defensive); the
 * legacy key is always dropped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeLegacyPayloadFieldNames(d: any): void {
  const prefs = d?.preferencesStore
  if (!prefs || typeof prefs !== 'object') return
  renameKey(prefs.values, 'excludedWeekdays', 'offDays')
  renameKey(prefs.values, 'meetingWeekdays', 'meetingDays')
  renameKey(prefs.updatedAt, 'excludedWeekdays', 'offDays')
  renameKey(prefs.updatedAt, 'meetingWeekdays', 'meetingDays')
}

function renameKey(
  obj: Record<string, unknown> | undefined,
  from: string,
  to: string
): void {
  if (!obj || typeof obj !== 'object') return
  if (!(from in obj)) return
  if (!(to in obj)) obj[to] = obj[from]
  delete obj[from]
}
