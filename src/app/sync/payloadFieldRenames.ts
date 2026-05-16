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
 * - `preferencesStore.values.{name,avatar,customAvatarBackground,hasCompletedProfileSetup}`
 *   → `profileStore.values.<same>` (wave-3 store split). Older peer devices
 *   that pre-date the split still write the four identity-shaped fields inside
 *   `preferencesStore.values`. On read, we relocate them into a synthesized
 *   `profileStore` so the merge step sees the canonical post-split shape.
 *   Matching keys move out of `preferencesStore.updatedAt` into
 *   `profileStore.updatedAt`.
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
const LEGACY_PROFILE_KEYS = [
  'name',
  'avatar',
  'customAvatarBackground',
  'hasCompletedProfileSetup',
] as const

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
  routeLegacyProfileFields(d)
}

/**
 * Lifts the four identity-shaped fields out of `preferencesStore.values` and
 * into `profileStore.values` (creating the slice if a legacy payload doesn't
 * carry one). Mirrors the routing for `preferencesStore.updatedAt` →
 * `profileStore.updatedAt` so iCloud LWW continues to work after the split.
 *
 * Defensive against a payload that carries both `profileStore` and the legacy
 * fields inside `preferencesStore.values` — when both exist, the profile slice
 * wins (newer schema), and the legacy keys are dropped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function routeLegacyProfileFields(d: any): void {
  const prefs = d?.preferencesStore
  if (!prefs || typeof prefs !== 'object') return

  // Detect whether any legacy profile field is present before allocating the
  // profile slice — keeps round-trip diffs minimal when nothing needs moving.
  const valuesObj = prefs.values
  const timestampsObj = prefs.updatedAt
  let needsRoute = false
  for (const key of LEGACY_PROFILE_KEYS) {
    if (valuesObj && typeof valuesObj === 'object' && key in valuesObj) {
      needsRoute = true
      break
    }
    if (
      timestampsObj &&
      typeof timestampsObj === 'object' &&
      key in timestampsObj
    ) {
      needsRoute = true
      break
    }
  }
  if (!needsRoute) return

  if (!d.profileStore || typeof d.profileStore !== 'object') {
    d.profileStore = { values: {}, updatedAt: {} }
  }
  const profile = d.profileStore
  if (!profile.values || typeof profile.values !== 'object') {
    profile.values = {}
  }
  if (!profile.updatedAt || typeof profile.updatedAt !== 'object') {
    profile.updatedAt = {}
  }

  for (const key of LEGACY_PROFILE_KEYS) {
    if (valuesObj && typeof valuesObj === 'object' && key in valuesObj) {
      if (!(key in profile.values)) profile.values[key] = valuesObj[key]
      delete valuesObj[key]
    }
    if (
      timestampsObj &&
      typeof timestampsObj === 'object' &&
      key in timestampsObj
    ) {
      if (!(key in profile.updatedAt)) {
        profile.updatedAt[key] = timestampsObj[key]
      }
      delete timestampsObj[key]
    }
  }
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
