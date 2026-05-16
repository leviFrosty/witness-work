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
 * - `preferencesStore.values.publisher` → `role` (the field stores a `Publisher`
 *   enum value — only the field name renamed; the leaf enum value `'publisher'`
 *   for Regular Publisher is canonical and unchanged)
 * - The matching keys inside `preferencesStore.updatedAt`
 * - `serviceReportStore.serviceReports.*.*.tag` (per entry) is preserved
 *   alongside any incoming `categoryId`. The receiving device runs the local
 *   `migrateTagsToCategories` boot pass (idempotent) to seed Category records
 *   from any straggler `tag` fields after the iCloud merge — see
 *   `src/lib/categories.ts`. Doing the rewrite here would require access to the
 *   Categories store, which violates the no-imports rule for this module.
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
  renameKey(prefs.values, 'publisher', 'role')
  renameKey(prefs.updatedAt, 'excludedWeekdays', 'offDays')
  renameKey(prefs.updatedAt, 'meetingWeekdays', 'meetingDays')
  renameKey(prefs.updatedAt, 'publisher', 'role')
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
