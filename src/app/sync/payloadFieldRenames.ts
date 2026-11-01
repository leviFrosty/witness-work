const LEGACY_PROFILE_KEYS = [
  'name',
  'avatar',
  'customAvatarBackground',
  'hasCompletedProfileSetup',
] as const

const LDC_BUILTIN_CATEGORY_ID_LITERAL = 'ldc-builtin-3f9c4a1d'

export function normalizeLegacyPayloadFieldNames(d: any): void {
  const prefs = d?.preferencesStore
  if (prefs && typeof prefs === 'object') {
    renameKey(prefs.values, 'excludedWeekdays', 'offDays')
    renameKey(prefs.values, 'meetingWeekdays', 'meetingDays')
    renameKey(prefs.values, 'publisher', 'role')
    renameKey(prefs.values, 'pioneerStartDate', 'tenureStartDate')
    migrateLegacyMonthlyGoalOverrides(prefs.values)
    renameKey(prefs.updatedAt, 'excludedWeekdays', 'offDays')
    renameKey(prefs.updatedAt, 'meetingWeekdays', 'meetingDays')
    renameKey(prefs.updatedAt, 'publisher', 'role')
    renameKey(prefs.updatedAt, 'pioneerStartDate', 'tenureStartDate')
    renameKey(prefs.updatedAt, 'oneOffGoalHours', 'monthlyGoalOverrides')
  }

  routeLegacyProfileFields(d)
  collapseLdcFlagOnServiceReports(d?.serviceReportStore?.serviceReports)
}

function migrateLegacyMonthlyGoalOverrides(
  values: Record<string, unknown> | undefined
): void {
  if (!values || typeof values !== 'object' || !('oneOffGoalHours' in values)) {
    return
  }

  if (!('monthlyGoalOverrides' in values)) {
    const overrides: Record<string, number> = {}
    const legacy = values.oneOffGoalHours
    if (Array.isArray(legacy)) {
      for (const item of legacy) {
        if (!item || typeof item !== 'object') continue
        const { month, hours } = item as {
          month?: unknown
          hours?: unknown
        }
        if (
          typeof month !== 'string' ||
          typeof hours !== 'number' ||
          !Number.isFinite(hours) ||
          hours < 0
        ) {
          continue
        }
        const match = /^(\d{4})-(0[1-9]|1[0-2])/.exec(month)
        if (match) overrides[`${match[1]}-${match[2]}`] = hours
      }
    }
    values.monthlyGoalOverrides = overrides
  }

  delete values.oneOffGoalHours
}

function routeLegacyProfileFields(d: any): void {
  const prefs = d?.preferencesStore
  if (!prefs || typeof prefs !== 'object') return

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

function collapseLdcFlagOnServiceReports(serviceReports: any): void {
  if (!serviceReports || typeof serviceReports !== 'object') return
  for (const yearKey of Object.keys(serviceReports)) {
    const months = serviceReports[yearKey]
    if (!months || typeof months !== 'object') continue
    for (const monthKey of Object.keys(months)) {
      const reports = months[monthKey]
      if (!Array.isArray(reports)) continue
      for (const report of reports) {
        if (!report || typeof report !== 'object') continue
        if (!('ldc' in report)) continue
        const ldcTrue = report.ldc === true
        delete report.ldc
        if (!ldcTrue) continue
        const hasNonLdcCategory =
          typeof report.categoryId === 'string' &&
          report.categoryId !== LDC_BUILTIN_CATEGORY_ID_LITERAL
        if (hasNonLdcCategory) continue
        report.categoryId = LDC_BUILTIN_CATEGORY_ID_LITERAL
        report.credit = true
      }
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
