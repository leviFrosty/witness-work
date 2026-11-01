import { perf } from '@/lib/perf'
import { syncTimestamp } from '@/lib/syncClock'
import {
  NON_SYNCABLE_PREFERENCE_KEYS,
  SYNC_MAP_KEYS,
  SYNC_SET_KEYS,
  entryTimestampKey,
} from '@/lib/syncPreferencePolicy'
import { canonicalJson } from '@/lib/canonicalJson'
import type { ResetEpoch } from '@/lib/syncResetEpoch'
import type { SyncDeviceFiles } from '@/lib/syncDevices'
import { roleHistoryEntries } from '@/lib/syncPreferencePolicy'
import { DEFAULT_SCHEDULE_SCREEN_ELEMENTS_ORDER } from '@/lib/scheduleScreenPreferences'
import { DEFAULT_TAB_ORDER } from '@/lib/tabOrderPreferences'
import type {
  AllTimeCardId,
  ProgressCardLayoutItem,
  YearCardId,
} from '@/lib/progressCards'
import { create } from 'zustand'
import { combine } from 'zustand/middleware'
import { persist } from '@/stores/persist'
import { Publisher, PublisherHours } from '@/types/publisher'
import { getTenureType } from '@/lib/publisherCapabilities'
import i18n, { TranslatedLocale } from '@/lib/locales'
import type { DateOrder, FormatRegion, TimeFormat } from '@/lib/dates'
import Constants from 'expo-constants'
import moment from 'moment'
import * as Device from 'expo-device'
import { createPreferencesStorage } from '@/stores/bootPreferences'
import { Address } from '@/types/contact'
import { MinuteDisplayFormat } from '@/types/timeEntry'
import type { AssistantEvent } from '@/types/assistant'
import type { EarnedBadge } from '@/types/badges'
import type { BadgesWelcomeState } from '@/lib/badges/welcome'
import { appendAssistantEventCapped } from '@/lib/assistantState'
import type { ContactSortDirection, ContactSortKey } from '@/lib/contactsSort'
import type { ActiveFilter } from '@/lib/contactsFilters'
import type {
  ActiveSavedContactView,
  SavedContactView,
} from '@/types/savedContactView'
import type { ContactsView } from '@/types/homeStack'
import type { MapCardDetail, MapLayer } from '@/types/map'
import type { MarkerColors } from '@/types/markerColors'
import type { StalenessBreakpoints } from '@/types/staleness'
import type {
  DistanceUnit,
  FuelEconomyUnit,
  MileageEntryMode,
} from '@/types/mileage'
import { DEFAULT_STALENESS_BREAKPOINTS } from '@/constants/staleness'
import { STALENESS_DISPLAY_ORDER } from '@/lib/contactStaleness'
import { DEFAULT_UNLOGGED_DAY_REMINDER_TIME } from '@/lib/unloggedDayReminders'
import { DEFAULT_MONTH_REPORT_REMINDER_TIME } from '@/lib/monthReportReminders'
import {
  DEFAULT_WEEK_PLAN_REMINDER_DAY,
  DEFAULT_WEEK_PLAN_REMINDER_TIME,
} from '@/lib/weekPlanReminders'
import {
  isValidMonthlyGoalHours,
  monthlyGoalOverridesFromLegacy,
  monthlyGoalKey,
  normalizeMonthlyGoalOverrides,
  type CalendarMonth,
  type MonthlyGoalOverrides,
} from '@/lib/monthlyGoals'
import {
  AUXILIARY_REDUCED_GOAL_HOURS,
  monthStatusOf,
  roleOfMonthStatus,
  type MonthStatus,
} from '@/lib/monthStatus'
import {
  roleForMonth,
  setRoleForPeriod,
  standingRole,
  type RoleHistory,
} from '@/lib/roleHistory'
import type { ScheduleIntroPageId } from '@/stores/scheduleIntro'

export type { MarkerColors }

export type UnreadReleaseNotes = {
  since: string
  at: number
  cardDismissed: boolean
}

export type UpdateRevealState = {
  version: string
  status: 'seen' | 'skipped'
}

export const builtInContactSortOptions: {
  label: () => string
  value: ContactSortKey
}[] = [
  { label: () => i18n.t('contacts_sortBySuggested'), value: 'suggested' },
  { label: () => i18n.t('recentConversation'), value: 'recentConversation' },
  { label: () => i18n.t('contacts_sortByNextFollowUp'), value: 'nextFollowUp' },
  { label: () => i18n.t('alphabeticalAsc'), value: 'az' },
  { label: () => i18n.t('alphabeticalDesc'), value: 'za' },
  { label: () => i18n.t('bibleStudy'), value: 'bibleStudy' },
  { label: () => i18n.t('contacts_sortByPin'), value: 'pinStaleness' },
  { label: () => i18n.t('contacts_sortByDateAdded'), value: 'createdAt' },
  { label: () => i18n.t('contacts_sortByCity'), value: 'city' },
  { label: () => i18n.t('contacts_sortByState'), value: 'state' },
  { label: () => i18n.t('contacts_sortByZip'), value: 'zip' },
]

const publisherHours: PublisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 50,
  specialPioneer: 100,
  custom: 50,
}

export type PlanTimeMode = 'hours' | 'span'

export type DefaultNavigationMapProvider = 'apple' | 'waze' | 'google' | null

export const reportExportMethods = [
  'copy',
  'share',
  'hourglass',
  'nwpublisher',
] as const
export type ReportExportMethod = (typeof reportExportMethods)[number]

interface TimeOffset {
  amount?: number
  unit?: moment.unitOfTime.DurationConstructor
}

export const DEFAULT_PLAN_NOTIFICATION_OFFSET: Required<TimeOffset> = {
  amount: 30,
  unit: 'minutes',
}

export const DEFAULT_RETURN_VISIT_TIME_OFFSET: Required<TimeOffset> = {
  amount: 1,
  unit: 'weeks',
}

export const DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET: Required<TimeOffset> = {
  amount: 2,
  unit: 'hours',
}

export const hints = {
  howToAddPlan: true,
}

export const widgetContactSortOptions = [
  'longestContacted',
  'recentConversation',
  'az',
  'bibleStudy',
] as const
export type WidgetContactSort = (typeof widgetContactSortOptions)[number]

export const widgetContactActionOptions = [
  'directions',
  'call',
  'text',
  'none',
] as const
export type WidgetContactAction = (typeof widgetContactActionOptions)[number]

export const widgetAppointmentWindowOptions = [
  'today',
  '7days',
  '14days',
  '30days',
] as const
export type WidgetAppointmentWindow =
  (typeof widgetAppointmentWindowOptions)[number]

export const rewardSoundSets = [
  'signature',
  'classic',
  'click',
  'soft',
  'wood',
  'analog',
  'thock',
  'off',
] as const
export type RewardSoundSet = (typeof rewardSoundSets)[number]

export const DEFAULT_REWARD_SOUND_SET: RewardSoundSet = 'signature'

export const knownRewardSoundSet = (set: string): RewardSoundSet =>
  (rewardSoundSets as readonly string[]).includes(set)
    ? (set as RewardSoundSet)
    : DEFAULT_REWARD_SOUND_SET

export type PrefillAddress = {
  enabled: boolean

  address?: Address

  lastUpdated?: Date
}

export type AppIconVariant =
  | 'Default'
  | 'Gold'
  | 'Dark'
  | 'Minimalist'
  | 'Mono'
  | 'Seasonal'

export type HomeScreenElementKey =
  | 'approachingConversations'
  | 'together'
  | 'tabletServiceYearSummary'
  | 'serviceReport'
  | 'mileage'
  | 'pet'
  | 'quickActions'
  | 'thisWeek'
  | 'timer'
  | 'didYouKnow'

export const DEFAULT_HOME_SCREEN_ELEMENTS_ORDER: HomeScreenElementKey[] = [
  'approachingConversations',
  'together',
  'tabletServiceYearSummary',
  'serviceReport',
  'pet',
  'quickActions',
  'thisWeek',
  'mileage',
  'timer',
  'didYouKnow',
]

export function getEffectiveHomeScreenOrder(
  stored: string[] | undefined
): HomeScreenElementKey[] {
  const valid = new Set<HomeScreenElementKey>(
    DEFAULT_HOME_SCREEN_ELEMENTS_ORDER
  )
  const seen = new Set<HomeScreenElementKey>()
  const out: HomeScreenElementKey[] = []
  for (const k of stored ?? []) {
    if (
      valid.has(k as HomeScreenElementKey) &&
      !seen.has(k as HomeScreenElementKey)
    ) {
      out.push(k as HomeScreenElementKey)
      seen.add(k as HomeScreenElementKey)
    }
  }
  DEFAULT_HOME_SCREEN_ELEMENTS_ORDER.forEach((k, i) => {
    if (seen.has(k)) return
    const previous = DEFAULT_HOME_SCREEN_ELEMENTS_ORDER[i - 1]
    const at = previous ? out.indexOf(previous) : -1
    if (at === -1) out.push(k)
    else out.splice(at + 1, 0, k)
    seen.add(k)
  })
  return out
}

export const PREFERENCE_DEFAULTS = {
  role: 'publisher' as Publisher,
  publisherHours: publisherHours,

  monthlyGoalOverrides: {} as MonthlyGoalOverrides,

  roleHistory: null as RoleHistory | null,
  onboardingComplete: false,

  tenureStartDate: null as Date | null,
  installedOn: new Date(),
  contactSort: 'suggested' as ContactSortKey,

  contactSortDirection: 'desc' as ContactSortDirection,

  contactsFilters: [] as ActiveFilter[],

  stalenessChipOrder: STALENESS_DISPLAY_ORDER,

  savedContactViews: {} as Record<string, SavedContactView>,

  activeSavedContactView: null as ActiveSavedContactView | null,

  contactsView: 'list' as ContactsView,

  mapLayer: 'standard' as MapLayer,

  mapCardDetail: 'nextVisit' as MapCardDetail,
  hasCompletedMapOnboarding: false,
  calledGoecodeApiTimes: 0,
  lastTimeRequestedAReview: null as Date | null,

  defaultNavigationMapProvider: (Device.osName === 'Android'
    ? 'google'
    : 'apple') as DefaultNavigationMapProvider,
  lastAppVersion: Constants.expoConfig?.version || null,

  unreadReleaseNotes: null as UnreadReleaseNotes | null,
  returnVisitTimeOffset: null as TimeOffset | null,
  returnVisitNotificationOffset: null as TimeOffset | null,
  returnVisitAlwaysNotify: false,

  planNotificationOffset: null as TimeOffset | null,

  planAlwaysNotify: false,

  planTimeMode: 'hours' as PlanTimeMode,

  unloggedDayReminders: false,

  unloggedDayReminderTime: DEFAULT_UNLOGGED_DAY_REMINDER_TIME,

  unloggedDayRemindersEnabledAt: null as number | null,

  monthReportReminders: false,

  monthReportReminderTime: DEFAULT_MONTH_REPORT_REMINDER_TIME,

  monthReportReminderOfferAnswered: false,

  weekPlanReminder: false,

  weekPlanReminderDay: DEFAULT_WEEK_PLAN_REMINDER_DAY,

  weekPlanReminderTime: DEFAULT_WEEK_PLAN_REMINDER_TIME,

  weekPlanReminderEnabledAt: null as number | null,

  streakReminders: true,

  showStreaks: true,

  rewardAnimations: true,

  rewardSounds: DEFAULT_REWARD_SOUND_SET as RewardSoundSet,

  scheduleIntroSeen: false,

  scheduleIntroCoveredPages: [] as ScheduleIntroPageId[],
  monthlyRoutineHasShownInvalidMonthAlert: false,
  hideDonateHeart: false,

  supporterNudgeDismissedAt: null as number | null,

  hideSupporterNudge: false,

  supporterNudgeAvailableSince: null as number | null,

  devSupporterNudgeForceShow: false,

  supporterPauseStartedAt: null as number | null,
  supporterPauseResumesAt: null as number | null,
  ...hints,
  lastBackupDate: null as Date | null,

  backupReminderSnoozedAt: null as number | null,

  analyticsEnabled: true,
  remindMeAboutBackups: true,
  backupNotificationFrequencyAsDays: 120,
  userSpecifiedHasAnnualGoal: 'default' as boolean | 'default',
  fontSizeOffset: 0,

  hasMigratedCustomFieldsToIds: false,

  hasMigratedTagsToCategories: false,

  hasMigratedProfileFromPreferences: false,

  hasCollapsedLdcIntoCategory: false,
  hasAttemptedToMigrateToMmkv: false,

  developerTools: false,
  prefillAddress: {
    address: undefined,
    enabled: true,
    lastUpdated: undefined,
  } as PrefillAddress,

  defaultPhoneRegionCode: null as string | null,

  contactInformationOrder: [] as string[],
  showContactPhone: true,
  showContactEmail: true,
  scheduleScreenElements: { assistant: true },
  scheduleScreenElementsOrder: DEFAULT_SCHEDULE_SCREEN_ELEMENTS_ORDER,
  homeScreenElements: {
    approachingConversations: true,

    together: false,
    monthlyRoutine: true,
    tabletServiceYearSummary: true,
    thisWeek: true,
    serviceReport: true,
    mileage: true,
    pet: true,
    quickActions: true,
    timer: true,
    contacts: true,
    didYouKnow: true,
  },

  homeScreenElementsOrder:
    DEFAULT_HOME_SCREEN_ELEMENTS_ORDER as HomeScreenElementKey[],

  progressCards: null as ProgressCardLayoutItem[] | null,

  yearProgressCards: null as ProgressCardLayoutItem<YearCardId>[] | null,

  allTimeProgressCards: null as ProgressCardLayoutItem<AllTimeCardId>[] | null,

  tabOrder: DEFAULT_TAB_ORDER,
  colorScheme: undefined as 'light' | 'dark' | undefined,
  timeDisplayFormat: 'decimal' as MinuteDisplayFormat,
  locale: undefined as TranslatedLocale | undefined,

  formatRegion: undefined as FormatRegion | undefined,
  mapKeyColors: undefined as Partial<MarkerColors> | undefined,

  stalenessBreakpoints: DEFAULT_STALENESS_BREAKPOINTS as StalenessBreakpoints,

  startOfWeek: undefined as number | undefined,

  timeFormat: undefined as TimeFormat | undefined,

  dateOrder: undefined as DateOrder | undefined,

  overrideCreditLimit: false,

  customCreditLimitHours: 55,

  widgetContactSort: 'longestContacted' as WidgetContactSort,

  widgetContactAction: 'directions' as WidgetContactAction,

  widgetAppointmentWindow: '7days' as WidgetAppointmentWindow,

  customAccentColor: null as string | null,

  customAppIcon: null as AppIconVariant | null,

  devSupporterOverride: null as Date | null,

  devShowAppIconAlerts: false,

  iCloudClockOffsetMs: 0,
  iCloudClockCalibrated: false,
  iCloudSyncPendingPush: false,
  iCloudSyncIssue: null as
    | 'newer-version'
    | 'invalid-file'
    | 'read-failed'
    | 'push-failed'
    | null,

  iCloudSyncErrorCode: null as
    | 'storage-full'
    | 'unauthorized'
    | 'network'
    | 'rate-limited'
    | 'server-error'
    | 'not-found'
    | 'unknown'
    | null,
  iCloudSyncNeedsResolution: false,

  iCloudResetEpoch: null as ResetEpoch | null,

  iCloudResetAdoptedNotice: null as {
    epochId: string
    deviceName: string | null
    at: number
  } | null,

  iCloudSyncDevices: {} as SyncDeviceFiles,
  iCloudSyncPausedForLapse: false,
  iCloudFreshSetup: false,
  hasReconciledSyncDefinitions: false,
  iCloudSyncEnabled: false,

  iCloudSyncSetByUser: false,

  iCloudSyncIncludeImages: false,

  syncProvider: null as 'cloud' | 'platform' | null,

  cloudSyncOffer: null as 'pending' | 'dismissed' | null,

  cloudSyncAccountToken: null as string | null,

  cloudSyncConfig: null as {
    enabled: boolean
    entitlement: 'supporter' | 'everyone'
  } | null,

  cloudSyncEntitled: null as boolean | null,

  dataProtectionMode: false,

  dataProtectionModeSetByUser: false,

  dataProtectionRetentionPromptedAt: undefined as string | undefined,

  audioEnabled: typeof __DEV__ === 'undefined' || !__DEV__,

  hapticsEnabled: true,

  scribeAiEnabled: true,

  iCloudImageSync: {} as Record<
    string,
    {
      localMtime: number
      uploadedMtime: number | null
      containerMtime?: number
      lastError?: string
      errorCode?: string
      failedAt?: number
      failures?: number
    }
  >,

  lastiCloudSyncAt: null as number | null,

  lastiCloudPushedAt: null as number | null,

  lastiCloudPulledAt: null as number | null,

  lastiCloudUploadedAt: null as number | null,

  iCloudUploadPendingSince: null as number | null,

  iCloudUploadIssue: null as 'icloud-full' | 'upload-failed' | null,

  lastiCloudRemoteWrittenAt: null as number | null,

  lastiCloudRemoteDeviceId: null as string | null,

  lastiCloudRemoteDeviceName: null as string | null,

  iCloudDeviceId: null as string | null,

  iCloudDeviceBinding: null as string | null,

  iCloudIdentityToken: null as string | null,

  iCloudAccountChangedAt: null as number | null,

  googleDriveAccountId: null as string | null,

  googleDriveNeedsReconnect: false,

  preferenceUpdatedAt: {} as Record<string, number>,

  hasMigratedToSyncSchema: false,

  homeChecklistDismissed: false,

  homeChecklistManualCompletions: [] as string[],

  homeChecklistAllDoneCelebrated: false,

  homeChecklistCompletedAt: null as number | null,

  onboardingStepId: null as string | null,

  serviceYearCatchUpStatus: null as
    | 'pending'
    | 'skipped'
    | 'completed'
    | 'dismissed'
    | null,

  celebratedTiers: {} as Record<string, string[]>,

  celebratedMilestones: {} as Record<string, number[]>,

  earnedBadges: {} as Record<string, EarnedBadge>,

  badgeLedger: [] as string[],

  showBadges: true,

  badgesBackfilledAt: null as number | null,

  badgesSeenAt: 0,

  badgesWelcome: null as BadgesWelcomeState | null,

  badgeCardDismissed: [] as string[],

  milestoneOverrides: null as number[] | null,

  lastRolloverYearMonth: null as string | null,

  autoRolloverEnabled: false,

  logsHours: false,

  hoursLoggingAsked: false,

  rolloverIncludesCredit: false,

  devRolloverDateOverride: null as Date | null,

  devStreakOverride: null as number | null,

  updateReveal: null as UpdateRevealState | null,

  seenTipIds: [] as string[],

  defaultExportMethod: 'nwpublisher' as ReportExportMethod,

  submittedReportMonths: [] as string[],

  reportCommentOverrides: {} as Record<string, string>,

  offDays: [] as number[],

  meetingDays: [] as number[],

  hasSeenAvailabilityOnboarding: false,

  assistantHistory: [] as AssistantEvent[],

  hasDismissedRecommendationHash: undefined as string | undefined,

  dismissedFollowUpCards: {} as Partial<
    Record<'missed' | 'approaching', string[]>
  >,

  mileageTrackingEnabled: undefined as boolean | undefined,

  distanceUnit: undefined as DistanceUnit | undefined,

  fuelEconomyUnit: undefined as FuelEconomyUnit | undefined,

  mileageEntryMode: 'distance' as MileageEntryMode,

  petPromptDismissed: false,
}

export { NON_SYNCABLE_PREFERENCE_KEYS } from '@/lib/syncPreferencePolicy'

export const migratePreferencesPersistedState = (
  persistedState: any,
  version: number
): any => {
  let next = persistedState
  if (version < 1) {
    next = migrateExcludedMeetingWeekdaysToOffMeetingDays(next)
  }
  if (version < 2) {
    next = migratePublisherToRole(next)
  }
  if (version < 3) {
    next = migrateDropProfileFields(next)
  }
  if (version < 4) {
    next = migratePioneerStartDateToTenureStartDate(next)
  }
  if (version < 5) {
    next = migrateStartOfWeekZeroToAuto(next)
  }
  if (version < 6) {
    next = migrateOneOffGoalHoursToMonthlyGoalOverrides(next)
  }
  if (version < 7) {
    next = migrateDropProfileCardShaderPreferences(next)
  }
  if (version < 8) {
    next = migrateDropMilestoneRevealPreferences(next)
  }
  if (version < 9) {
    next = migrateDropFoundingSupporterRevealPreference(next)
  }
  if (version < 10) {
    next = migrateDropOnboardingIntents(next)
  }
  if (version < 11) {
    next = migrateUnchosenContactSortToSuggested(next)
  }
  if (version < 12) {
    next = migrateShowPetHomeSection(next)
  }
  if (version < 13) {
    next = migrateShowThisWeekHomeSection(next)
  }
  if (version < 14) {
    next = migrateDropProgressBarDetailsPreference(next)
  }
  if (version < 15) {
    next = migrateShowQuickActionsHomeSection(next)
  }
  return next
}

export const migrateDropProgressBarDetailsPreference = (
  state: unknown
): unknown => {
  if (!state || typeof state !== 'object') return state
  const record = state as Record<string, unknown>
  const timestamps =
    record.preferenceUpdatedAt && typeof record.preferenceUpdatedAt === 'object'
      ? (record.preferenceUpdatedAt as Record<string, unknown>)
      : null
  const key = 'displayDetailsOnProgressBarHomeScreen'
  if (!(key in record) && !(timestamps && key in timestamps)) return state

  const { [key]: _value, ...rest } = record
  const next: Record<string, unknown> = { ...rest }
  if (timestamps) {
    const { [key]: _timestamp, ...restTimestamps } = timestamps
    next.preferenceUpdatedAt = restTimestamps
  }
  return next
}

const showMissingHomeSection = (
  state: unknown,
  key: HomeScreenElementKey
): unknown => {
  if (!state || typeof state !== 'object') return state
  const elements = (state as { homeScreenElements?: unknown })
    .homeScreenElements
  if (!elements || typeof elements !== 'object' || Array.isArray(elements))
    return state
  if (Object.hasOwn(elements, key)) return state
  return {
    ...state,
    homeScreenElements: { ...elements, [key]: true },
  }
}

export const migrateShowThisWeekHomeSection = (state: unknown): unknown =>
  showMissingHomeSection(state, 'thisWeek')

export const migrateShowPetHomeSection = (state: unknown): unknown =>
  showMissingHomeSection(state, 'pet')

export const migrateShowQuickActionsHomeSection = (state: unknown): unknown =>
  showMissingHomeSection(state, 'quickActions')

export const migrateUnchosenContactSortToSuggested = (
  state: unknown
): unknown => {
  if (!state || typeof state !== 'object') return state
  const record = state as Record<string, unknown>
  if (record.contactSort !== 'recentConversation') return state
  const timestamps =
    record.preferenceUpdatedAt && typeof record.preferenceUpdatedAt === 'object'
      ? (record.preferenceUpdatedAt as Record<string, unknown>)
      : {}
  if ('contactSort' in timestamps || 'contactSortDirection' in timestamps)
    return state
  return { ...record, contactSort: 'suggested', contactSortDirection: 'desc' }
}

export const migrateDropOnboardingIntents = (state: unknown): unknown => {
  if (!state || typeof state !== 'object') return state
  const record = state as Record<string, unknown>
  const timestamps =
    record.preferenceUpdatedAt && typeof record.preferenceUpdatedAt === 'object'
      ? (record.preferenceUpdatedAt as Record<string, unknown>)
      : null
  const hasTimestamp = timestamps !== null && 'onboardingIntents' in timestamps
  if (!('onboardingIntents' in record) && !hasTimestamp) return state

  const { onboardingIntents: _intents, ...rest } = record
  const next: Record<string, unknown> = { ...rest }
  if (timestamps) {
    const { onboardingIntents: _intentsTs, ...restTs } = timestamps
    next.preferenceUpdatedAt = restTs
  }
  return next
}

export const migrateDropFoundingSupporterRevealPreference = (
  state: unknown
): unknown => {
  if (!state || typeof state !== 'object') return state
  const record = state as Record<string, unknown>
  if (!('seenFoundingSupporterReveal' in record)) return state
  const { seenFoundingSupporterReveal: _seen, ...rest } = record
  return rest
}

export const migrateDropMilestoneRevealPreferences = (
  state: unknown
): unknown => {
  if (!state || typeof state !== 'object') return state
  const record = state as Record<string, unknown>
  if (
    !('seenMilestoneUpdateReveal' in record) &&
    !('dismissedMilestoneRevealOnce' in record)
  ) {
    return state
  }
  const {
    seenMilestoneUpdateReveal: _seen,
    dismissedMilestoneRevealOnce: _dismissed,
    ...rest
  } = record
  return rest
}

export const migrateDropProfileCardShaderPreferences = (
  state: unknown
): unknown => {
  if (!state || typeof state !== 'object') return state
  const record = state as Record<string, unknown>
  const timestamps =
    record.preferenceUpdatedAt && typeof record.preferenceUpdatedAt === 'object'
      ? (record.preferenceUpdatedAt as Record<string, unknown>)
      : null
  const hasValues =
    'profileCardShaderEnabled' in record || 'profileCardShaderId' in record
  const hasTimestamps =
    timestamps !== null &&
    ('profileCardShaderEnabled' in timestamps ||
      'profileCardShaderId' in timestamps)

  if (!hasValues && !hasTimestamps) return state

  const {
    profileCardShaderEnabled: _enabled,
    profileCardShaderId: _shaderId,
    ...rest
  } = record
  const next: Record<string, unknown> = { ...rest }

  if (timestamps) {
    const {
      profileCardShaderEnabled: _enabledTs,
      profileCardShaderId: _shaderIdTs,
      ...restTs
    } = timestamps
    next.preferenceUpdatedAt = restTs
  }

  return next
}

export const migrateOneOffGoalHoursToMonthlyGoalOverrides = (
  state: unknown
): unknown => {
  if (!state || typeof state !== 'object') return state
  const record = state as Record<string, unknown>

  const hasLegacy = 'oneOffGoalHours' in record
  const hasCanonical = 'monthlyGoalOverrides' in record
  if (!hasLegacy && !hasCanonical) return state

  const { oneOffGoalHours, ...rest } = record
  const next: Record<string, unknown> = { ...rest }
  next.monthlyGoalOverrides = hasCanonical
    ? normalizeMonthlyGoalOverrides(next.monthlyGoalOverrides)
    : monthlyGoalOverridesFromLegacy(oneOffGoalHours)

  if (
    next.preferenceUpdatedAt &&
    typeof next.preferenceUpdatedAt === 'object'
  ) {
    const timestamps = next.preferenceUpdatedAt as Record<string, unknown>
    const { oneOffGoalHours: legacyTs, ...restTs } = timestamps
    const nextTs: Record<string, unknown> = { ...restTs }

    if (legacyTs !== undefined && nextTs.monthlyGoalOverrides === undefined) {
      nextTs.monthlyGoalOverrides = legacyTs
    }
    next.preferenceUpdatedAt = nextTs
  }

  return next
}

const migrateStartOfWeekZeroToAuto = (state: any): any => {
  if (!state || typeof state !== 'object') return state
  if (state.startOfWeek !== 0) return state

  const { startOfWeek: _dropped, ...rest } = state
  const next = { ...rest }
  if (
    next.preferenceUpdatedAt &&
    typeof next.preferenceUpdatedAt === 'object'
  ) {
    const { startOfWeek: _droppedTs, ...restTs } = next.preferenceUpdatedAt
    next.preferenceUpdatedAt = restTs
  }
  return next
}

const migrateExcludedMeetingWeekdaysToOffMeetingDays = (state: any): any => {
  if (!state || typeof state !== 'object') return state
  const { excludedWeekdays, meetingWeekdays, ...rest } = state
  const next = { ...rest }

  if (excludedWeekdays !== undefined && next.offDays === undefined) {
    next.offDays = excludedWeekdays
  }
  if (meetingWeekdays !== undefined && next.meetingDays === undefined) {
    next.meetingDays = meetingWeekdays
  }
  if (
    next.preferenceUpdatedAt &&
    typeof next.preferenceUpdatedAt === 'object'
  ) {
    const {
      excludedWeekdays: excludedTs,
      meetingWeekdays: meetingTs,
      ...restTs
    } = next.preferenceUpdatedAt
    const nextTs: Record<string, number> = { ...restTs }
    if (excludedTs !== undefined && nextTs.offDays === undefined) {
      nextTs.offDays = excludedTs
    }
    if (meetingTs !== undefined && nextTs.meetingDays === undefined) {
      nextTs.meetingDays = meetingTs
    }
    next.preferenceUpdatedAt = nextTs
  }
  return next
}

const migratePublisherToRole = (state: any): any => {
  if (!state || typeof state !== 'object') return state
  const { publisher, ...rest } = state
  const next = { ...rest }

  if (publisher !== undefined && next.role === undefined) {
    next.role = publisher
  }
  if (
    next.preferenceUpdatedAt &&
    typeof next.preferenceUpdatedAt === 'object'
  ) {
    const { publisher: publisherTs, ...restTs } = next.preferenceUpdatedAt
    const nextTs: Record<string, number> = { ...restTs }
    if (publisherTs !== undefined && nextTs.role === undefined) {
      nextTs.role = publisherTs
    }
    next.preferenceUpdatedAt = nextTs
  }
  return next
}

const migrateDropProfileFields = (state: any): any => state

const migratePioneerStartDateToTenureStartDate = (state: any): any => {
  if (!state || typeof state !== 'object') return state
  if (!('pioneerStartDate' in state)) return state

  const { pioneerStartDate, ...rest } = state
  const next = { ...rest }
  const role = next.role as Publisher | undefined
  const tenureType = role ? getTenureType(role) : null
  const valueShouldCarryOver = tenureType !== null

  const hasNew = 'tenureStartDate' in next
  if (!hasNew) {
    next.tenureStartDate = valueShouldCarryOver ? pioneerStartDate : null
  }

  if (
    next.preferenceUpdatedAt &&
    typeof next.preferenceUpdatedAt === 'object'
  ) {
    const { pioneerStartDate: legacyTs, ...restTs } = next.preferenceUpdatedAt
    const nextTs: Record<string, number> = { ...restTs }
    if (
      legacyTs !== undefined &&
      valueShouldCarryOver &&
      nextTs.tenureStartDate === undefined
    ) {
      nextTs.tenureStartDate = legacyTs
    }

    next.preferenceUpdatedAt = nextTs
  }

  return next
}

const tenureResetFor = (
  previousRole: Publisher,
  nextRole: Publisher
): { tenureStartDate?: null } => {
  const oldType = getTenureType(previousRole)
  return oldType !== null && oldType === getTenureType(nextRole)
    ? {}
    : { tenureStartDate: null }
}

export const usePreferences = create(
  persist(
    combine(PREFERENCE_DEFAULTS, (rawSet, getState) => {
      const set: (
        partial:
          | Partial<typeof PREFERENCE_DEFAULTS>
          | ((
              state: typeof PREFERENCE_DEFAULTS
            ) => Partial<typeof PREFERENCE_DEFAULTS>),
        replace?: boolean
      ) => void = (partial, replace) => {
        perf.count('prefs:set')
        let resolved =
          typeof partial === 'function' ? partial(getState()) : partial

        if (resolved.dataProtectionMode === true) {
          resolved = {
            ...resolved,
            prefillAddress: {
              ...(resolved.prefillAddress ?? getState().prefillAddress),
              address: undefined,
              lastUpdated: undefined,
            },
          }
        }

        if (
          resolved &&
          typeof resolved === 'object' &&
          !Array.isArray(resolved) &&
          !replace
        ) {
          const state = getState()
          const keys = Object.keys(resolved) as (keyof typeof state)[]

          if (keys.every((key) => Object.is(state[key], resolved[key]))) {
            perf.count('prefs:set:noop')
            return
          }
          const current = state.preferenceUpdatedAt ?? {}
          const next: Record<string, number> = { ...current }
          let changed = false
          for (const key of keys) {
            if (NON_SYNCABLE_PREFERENCE_KEYS.has(key)) continue
            const before = state[key]
            const after = resolved[key]

            if (
              Object.is(before, after) ||
              canonicalJson(before) === canonicalJson(after)
            )
              continue
            next[key] = syncTimestamp(current[key])
            const mapBefore =
              key === 'roleHistory' ? roleHistoryEntries(before) : before
            const mapAfter =
              key === 'roleHistory' ? roleHistoryEntries(after) : after
            if (
              SYNC_MAP_KEYS.has(key) ||
              SYNC_SET_KEYS.has(key) ||
              key === 'roleHistory'
            ) {
              const oldMap = (
                SYNC_SET_KEYS.has(key)
                  ? Object.fromEntries(
                      ((before as string[]) ?? []).map((entry) => [entry, true])
                    )
                  : (mapBefore ?? {})
              ) as Record<string, unknown>
              const newMap = (
                SYNC_SET_KEYS.has(key)
                  ? Object.fromEntries(
                      ((after as string[]) ?? []).map((entry) => [entry, true])
                    )
                  : (mapAfter ?? {})
              ) as Record<string, unknown>
              for (const entry of new Set([
                ...Object.keys(oldMap),
                ...Object.keys(newMap),
              ])) {
                if (
                  canonicalJson(oldMap[entry]) === canonicalJson(newMap[entry])
                )
                  continue
                const stampKey = entryTimestampKey(key, entry)
                next[stampKey] = syncTimestamp(
                  current[stampKey] ?? current[key]
                )
              }
            }
            changed = true
          }
          if (changed) {
            rawSet({ ...(resolved as any), preferenceUpdatedAt: next })
            return
          }
        }
        rawSet(resolved, replace as never)
      }

      return {
        set,

        setRole: (role: Publisher, options?: { from?: CalendarMonth }) => {
          const state = getState()
          const previousRole = state.role

          const roleHistory = options?.from
            ? setRoleForPeriod(
                state.roleHistory,
                previousRole,
                options.from,
                null,
                role
              )
            : null
          set({ role, roleHistory, ...tenureResetFor(previousRole, role) })
        },

        setRoleForMonths: (
          start: CalendarMonth,
          end: CalendarMonth,
          role: Publisher
        ) => {
          const state = getState()
          const roleHistory = setRoleForPeriod(
            state.roleHistory,
            state.role,
            start,
            end,
            role
          )
          const nextRole = standingRole(roleHistory, state.role)
          set({
            roleHistory,
            ...(nextRole === state.role
              ? {}
              : { role: nextRole, ...tenureResetFor(state.role, nextRole) }),
          })
        },

        setMonthStatus: (
          target: CalendarMonth,
          status: MonthStatus,
          scope: 'month' | 'onward' = 'month'
        ) => {
          const state = getState()
          const key = monthlyGoalKey(target)
          const previousStatus = monthStatusOf(
            roleForMonth(state.roleHistory, state.role, target),
            state.monthlyGoalOverrides[key]
          )
          const roleHistory = setRoleForPeriod(
            state.roleHistory,
            state.role,
            target,
            scope === 'onward' ? null : target,
            roleOfMonthStatus(status)
          )
          const nextRole = standingRole(roleHistory, state.role)

          let monthlyGoalOverrides = state.monthlyGoalOverrides
          if (status === 'regularAuxiliaryReduced') {
            monthlyGoalOverrides = {
              ...monthlyGoalOverrides,
              [key]: AUXILIARY_REDUCED_GOAL_HOURS,
            }
          } else if (previousStatus === 'regularAuxiliaryReduced') {
            monthlyGoalOverrides = { ...monthlyGoalOverrides }
            delete monthlyGoalOverrides[key]
          }

          set({
            roleHistory,
            ...(nextRole === state.role
              ? {}
              : { role: nextRole, ...tenureResetFor(state.role, nextRole) }),
            ...(monthlyGoalOverrides === state.monthlyGoalOverrides
              ? {}
              : { monthlyGoalOverrides }),
          })
        },
        incrementGeocodeApiCallCount: () =>
          set(({ calledGoecodeApiTimes }) => ({
            calledGoecodeApiTimes: calledGoecodeApiTimes + 1,
          })),
        updateLastTimeRequestedStoreReview: () =>
          set({ lastTimeRequestedAReview: new Date() }),
        setDefaultPhoneRegionCode: (defaultPhoneRegionCode: string) =>
          set({ defaultPhoneRegionCode }),

        markDataProtectionRetentionPrompted: (at: Date = new Date()) =>
          set({ dataProtectionRetentionPromptedAt: at.toISOString() }),
        removeHint: (hint: keyof typeof hints) =>
          set({ [hint]: false } as Partial<typeof PREFERENCE_DEFAULTS>),

        updatePrefillAddress: (address?: Address) => {
          if (!address || !Object.keys(address)) {
            return
          }

          set(({ prefillAddress }) => {
            return {
              prefillAddress: {
                ...prefillAddress,
                address,
                lastUpdated: new Date(),
              },
            }
          })
        },

        clearPrefillAddress: () => {
          set(({ prefillAddress }) => ({
            prefillAddress: {
              ...prefillAddress,
              address: undefined,
              lastUpdated: undefined,
            },
          }))
        },
        setOverrideCreditLimit: (overrideCreditLimit: boolean) =>
          set({ overrideCreditLimit }),
        setCustomCreditLimitHours: (customCreditLimitHours: number) =>
          set({ customCreditLimitHours }),

        setMonthlyGoalOverride: (target: CalendarMonth, hours: number) => {
          if (!isValidMonthlyGoalHours(hours)) {
            throw new RangeError(
              'Monthly Goal hours must be a finite, nonnegative number'
            )
          }

          const key = monthlyGoalKey(target)
          set((state) => {
            const baseGoalHours =
              state.publisherHours[
                roleForMonth(state.roleHistory, state.role, target)
              ]
            const existing = state.monthlyGoalOverrides[key]

            if (hours === baseGoalHours) {
              if (existing === undefined) return {}
              const next = { ...state.monthlyGoalOverrides }
              delete next[key]
              return { monthlyGoalOverrides: next }
            }

            if (existing === hours) return {}
            return {
              monthlyGoalOverrides: {
                ...state.monthlyGoalOverrides,
                [key]: hours,
              },
            }
          })
        },
        clearMonthlyGoalOverride: (target: CalendarMonth) => {
          const key = monthlyGoalKey(target)
          set((state) => {
            if (!(key in state.monthlyGoalOverrides)) return {}
            const next = { ...state.monthlyGoalOverrides }
            delete next[key]
            return { monthlyGoalOverrides: next }
          })
        },
        setAutoRolloverEnabled: (autoRolloverEnabled: boolean) =>
          set({ autoRolloverEnabled }),
        setRolloverIncludesCredit: (rolloverIncludesCredit: boolean) =>
          set({ rolloverIncludesCredit }),
        setMilestoneOverrides: (values: number[]) =>
          set({ milestoneOverrides: values }),
        resetMilestoneOverrides: () => set({ milestoneOverrides: null }),
        markTierCelebrated: (monthKey: string, tier: string) =>
          set(({ celebratedTiers }) => {
            const existing = celebratedTiers[monthKey] ?? []
            if (existing.includes(tier)) return {}
            return {
              celebratedTiers: {
                ...celebratedTiers,
                [monthKey]: [...existing, tier],
              },
            }
          }),

        recordBadges: ({
          earned,
          ledger,
          backfilledAt,
          welcome,
        }: {
          earned: { key: string; record: EarnedBadge }[]
          ledger: string[]
          backfilledAt?: number

          welcome?: BadgesWelcomeState
        }) =>
          set(({ earnedBadges, badgeLedger, badgesBackfilledAt }) => {
            const additions = earned.filter(({ key }) => !earnedBadges[key])
            const newLedger = ledger.filter(
              (entry) => !badgeLedger.includes(entry)
            )
            const patch: Partial<typeof PREFERENCE_DEFAULTS> = {}
            if (additions.length)
              patch.earnedBadges = {
                ...earnedBadges,
                ...Object.fromEntries(
                  additions.map(({ key, record }) => [key, record])
                ),
              }
            if (newLedger.length)
              patch.badgeLedger = [...badgeLedger, ...newLedger].sort()
            if (backfilledAt && badgesBackfilledAt === null)
              patch.badgesBackfilledAt = backfilledAt
            if (welcome) patch.badgesWelcome = welcome
            return patch
          }),
        markBadgesSeen: () => set({ badgesSeenAt: Date.now() }),

        dismissBadgeCard: (keys: string[]) =>
          set(({ badgeCardDismissed }) => {
            const additions = keys.filter(
              (key) => !badgeCardDismissed.includes(key)
            )
            return additions.length
              ? { badgeCardDismissed: [...badgeCardDismissed, ...additions] }
              : {}
          }),
        setShowBadges: (showBadges: boolean) => set({ showBadges }),

        resetBadges: () =>
          set({
            earnedBadges: {},
            badgeLedger: [],
            badgesBackfilledAt: null,
            badgesSeenAt: 0,
            badgesWelcome: null,
            badgeCardDismissed: [],
          }),
        markMilestoneCelebrated: (
          serviceYearKey: string,
          milestoneHours: number
        ) =>
          set(({ celebratedMilestones }) => {
            const existing = celebratedMilestones[serviceYearKey] ?? []
            if (existing.includes(milestoneHours)) return {}
            return {
              celebratedMilestones: {
                ...celebratedMilestones,
                [serviceYearKey]: [...existing, milestoneHours],
              },
            }
          }),

        markReportSubmitted: (monthKey: string) =>
          set(({ submittedReportMonths }) =>
            submittedReportMonths.includes(monthKey)
              ? {}
              : {
                  submittedReportMonths: [
                    ...submittedReportMonths,
                    monthKey,
                  ].slice(-24),
                }
          ),

        unmarkReportSubmitted: (monthKey: string) =>
          set(({ submittedReportMonths }) =>
            submittedReportMonths.includes(monthKey)
              ? {
                  submittedReportMonths: submittedReportMonths.filter(
                    (key) => key !== monthKey
                  ),
                }
              : {}
          ),
        setReportCommentOverride: (monthKey: string, text: string) =>
          set(({ reportCommentOverrides }) => ({
            reportCommentOverrides: {
              ...reportCommentOverrides,
              [monthKey]: text,
            },
          })),
        clearReportCommentOverride: (monthKey: string) =>
          set(({ reportCommentOverrides }) => {
            if (!(monthKey in reportCommentOverrides)) return {}
            const next = { ...reportCommentOverrides }
            delete next[monthKey]
            return { reportCommentOverrides: next }
          }),
        markScheduleIntroCovered: (page: ScheduleIntroPageId) =>
          set(({ scheduleIntroCoveredPages }) =>
            scheduleIntroCoveredPages.includes(page)
              ? {}
              : {
                  scheduleIntroCoveredPages: [
                    ...scheduleIntroCoveredPages,
                    page,
                  ],
                }
          ),
        markTipSeen: (tipId: string) =>
          set(({ seenTipIds }) =>
            seenTipIds.includes(tipId)
              ? {}
              : { seenTipIds: [...seenTipIds, tipId] }
          ),
        recordAssistantEvent: (event: AssistantEvent) =>
          set(({ assistantHistory }) => ({
            assistantHistory: appendAssistantEventCapped(
              assistantHistory,
              event,
              10
            ),
          })),
        replaceLastAssistantEvent: (event: AssistantEvent) =>
          set(({ assistantHistory }) => {
            if (assistantHistory.length === 0) return {}
            const next = [...assistantHistory]
            next[next.length - 1] = event
            return { assistantHistory: next }
          }),
        setOffDays: (offDays: number[]) => set({ offDays }),
        setMeetingDays: (meetingDays: number[]) => set({ meetingDays }),
        setHasSeenAvailabilityOnboarding: (value: boolean) =>
          set({ hasSeenAvailabilityOnboarding: value }),
        setHasDismissedRecommendationHash: (value: string | undefined) =>
          set({ hasDismissedRecommendationHash: value }),
      }
    }),
    {
      name: 'preferences',
      storage: createPreferencesStorage(),
      version: 15,
      migrate: (persistedState, version) =>
        migratePreferencesPersistedState(persistedState, version),
    }
  )
)
