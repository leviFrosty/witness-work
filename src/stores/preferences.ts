import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Publisher, PublisherHours } from '../types/publisher'
import i18n, { TranslatedLocale } from '../lib/locales'
import Constants from 'expo-constants'
import moment from 'moment'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { hasMigratedFromAsyncStorage, MmkvStorage } from './mmkv'
import { Address } from '../types/contact'
import { MinuteDisplayFormat } from '../types/serviceReport'

const SortOptionValues = [
  'recentConversation',
  'az',
  'za',
  'bibleStudy',
] as const

export const contactSortOptions = [
  {
    label: i18n.t('recentConversation'),
    value: SortOptionValues[0],
  },
  {
    label: i18n.t('alphabeticalAsc'),
    value: SortOptionValues[1],
  },
  {
    label: i18n.t('alphabeticalDesc'),
    value: SortOptionValues[2],
  },
  {
    label: i18n.t('bibleStudy'),
    value: SortOptionValues[3],
  },
]

export type GoalHours = {
  month: Date
  hours: number
}

const publisherHours: PublisherHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 50,
  specialPioneer: 100,
  custom: 50,
}

/**
 * @platform iOS: All Supported
 * @platform Android: Only 'google' is supported
 */
export type DefaultNavigationMapProvider = 'apple' | 'waze' | 'google' | null

interface TimeOffset {
  amount?: number
  unit?: moment.unitOfTime.DurationConstructor
}

/**
 * These hints are enabled if true, and dismissed if false. See
 * `usePreferences.removeHint()` to set a hint to false.
 */
export const hints = {
  howToAddPlan: true,
}

type LegacyServiceReportTag = string

export function getTagName(tag: LegacyServiceReportTag | ServiceReportTag) {
  return typeof tag === 'string' ? tag : tag.value
}

export type ServiceReportTag = {
  /** Also acts as ID */
  value: string
  credit: boolean
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

export type MarkerColors = {
  noConversations: string
  longerThanAMonthAgo: string
  longerThanAWeekAgo: string
  withinThePastWeek: string
}

export type PrefillAddress = {
  /** Whether or not prefill address is enabled. */
  enabled: boolean
  /** Most recently entered address from existing contact creation. */
  address?: Address
  /** When an address was last entered */
  lastUpdated?: Date
}

/**
 * User-selected profile avatar.
 *
 * - `none`: no avatar set (display falls back to initial letter or icon)
 * - `emoji`: `value` holds the emoji character
 * - `image`: `value` holds a local file URI inside `FileSystem.documentDirectory`
 *   — image never leaves the device.
 */
export type ProfileAvatar = {
  type: 'none' | 'emoji' | 'image'
  value: string
}

const initialState = {
  publisher: 'publisher' as Publisher,
  publisherHours: publisherHours,

  /** Overrides publisherHours hour requirement for given month. */
  oneOffGoalHours: [] as GoalHours[],
  onboardingComplete: false,
  /**
   * Distinct from onboardingComplete so existing users — who installed before
   * the profile step existed — can be prompted to fill it in post-onboarding.
   */
  hasCompletedProfileSetup: false,
  /** User's first name. Collected during onboarding profile step. */
  name: '',
  /**
   * Date the user began pioneering. Used by ProfileCard to display duration
   * (e.g. "Pioneering for 2 years"). Only surfaced for pioneer-type
   * publishers.
   */
  pioneerStartDate: null as Date | null,
  /** Profile avatar — stored locally, never uploaded. */
  avatar: { type: 'none', value: '' } as ProfileAvatar,
  installedOn: new Date(),
  contactSort: 'recentConversation' as (typeof SortOptionValues)[number],
  hasCompletedMapOnboarding: false,
  calledGoecodeApiTimes: 0,
  lastTimeRequestedAReview: null as Date | null,

  /**
   * @platform iOS: Supported
   * @platform Android: Not Supported
   */
  defaultNavigationMapProvider:
    Platform.OS === 'ios'
      ? 'apple'
      : ('google' as DefaultNavigationMapProvider),
  lastAppVersion: Constants.expoConfig?.version || null,
  returnVisitTimeOffset: null as TimeOffset | null,
  returnVisitNotificationOffset: null as TimeOffset | null,
  returnVisitAlwaysNotify: false,
  /**
   * Tags were originally only strings, like "Bethel Service". Later, tags
   * needed more metadata - like whether or not a tag is a credit hour or not.
   * Example: {value: 'Bethel Service', credit: true}. This is why later the
   * data structure was changed to an object. The value also doubles as the id.
   */
  serviceReportTags: [] as (LegacyServiceReportTag | ServiceReportTag)[],
  displayDetailsOnProgressBarHomeScreen:
    Device.deviceType === Device.DeviceType.TABLET,
  monthlyRoutineHasShownInvalidMonthAlert: false,
  hideDonateHeart: false,
  ...hints,
  lastBackupDate: null as Date | null,
  remindMeAboutBackups: true,
  backupNotificationFrequencyAsDays: 60,
  userSpecifiedHasAnnualGoal: 'default' as boolean | 'default',
  fontSizeOffset: 0,
  customContactFields: [] as string[],
  hasAttemptedToMigrateToMmkv: false,
  /**
   * Hidden dev tools for diagnosing issues. To enable/disable, navigate to
   * drawer (settings) -> tap version number 5 times.
   */
  developerTools: false,
  prefillAddress: {
    address: undefined,
    enabled: true,
    lastUpdated: undefined,
  } as PrefillAddress,
  homeScreenElements: {
    approachingConversations: true,
    monthlyRoutine: true,
    tabletServiceYearSummary: true,
    serviceReport: true,
    timer: true,
    contacts: true,
  },
  colorScheme: undefined as 'light' | 'dark' | undefined,
  timeDisplayFormat: 'decimal' as MinuteDisplayFormat,
  locale: undefined as TranslatedLocale | undefined,
  mapKeyColors: undefined as MarkerColors | undefined,
  /**
   * Start of week for localization. 0 starts on Sunday, 1 starts on Monday,
   * etc.
   */
  startOfWeek: 0,
  /** Whether the user wants to override the default credit limit of 55 hours */
  overrideCreditLimit: false,
  /** Custom credit limit in hours (only used if overrideCreditLimit is true) */
  customCreditLimitHours: 55,
  /** Sort order for the iOS Contacts widget. */
  widgetContactSort: 'longestContacted' as WidgetContactSort,
  /** Quick action shown on each row of the iOS Contacts widget. */
  widgetContactAction: 'directions' as WidgetContactAction,
  /** Time window for the iOS Appointments widget. */
  widgetAppointmentWindow: '7days' as WidgetAppointmentWindow,
  /**
   * Supporter-only override for the primary accent color. Preserved even when
   * supporter status lapses so the user's choice isn't lost — the theme applies
   * it only while supporter status is active.
   */
  customAccentColor: null as string | null,
  /**
   * Supporter-only override for the avatar/profile-picture background color.
   * When null, the avatar background follows the accent color. Kept separate so
   * users who want a different-colored avatar than their accent can opt in
   * without affecting the rest of the app's tint.
   */
  customAvatarBackground: null as string | null,
  /**
   * Developer override for supporter status. When non-null, forces
   * `useIsSupporter()` to report the user as a supporter with the given `since`
   * date, bypassing RevenueCat. Null disables the override. Exposed from the
   * hidden developer tools screen only.
   */
  devSupporterOverride: null as Date | null,
  /**
   * ICloud sync (supporter-only). When true, the sync layer writes the backup
   * payload to the ubiquity container on store changes and pulls remote updates
   * on foreground / remote-change events. Off by default so opting in is
   * explicit.
   */
  iCloudSyncEnabled: false,
  /**
   * Epoch ms of the most recent successful push or pull. Null until first sync.
   * Retained for back-compat; the granular `lastiCloudPushedAt` /
   * `lastiCloudPulledAt` / `lastiCloudRemoteWrittenAt` fields are what the sync
   * settings UI surfaces for debugging.
   */
  lastiCloudSyncAt: null as number | null,
  /** Epoch ms of the most recent successful push to iCloud. */
  lastiCloudPushedAt: null as number | null,
  /** Epoch ms of the most recent successful pull/read from iCloud. */
  lastiCloudPulledAt: null as number | null,
  /** Epoch ms from `writtenAt` of the last remote payload this device read. */
  lastiCloudRemoteWrittenAt: null as number | null,
  /** DeviceId of the device that wrote the last remote payload this device read. */
  lastiCloudRemoteDeviceId: null as string | null,
  /**
   * DeviceName of the device that wrote the last remote payload this device
   * read.
   */
  lastiCloudRemoteDeviceName: null as string | null,
  /**
   * Stable per-install UUID stamped into the payload metadata. Used to
   * distinguish our own writes from remote-device writes and to attribute
   * entries in the "recent devices" display in Settings.
   */
  iCloudDeviceId: null as string | null,
  /**
   * Per-key epoch ms of the most recent change for syncable preference keys.
   * Merged last-writer-wins per key so a theme toggle on device A doesn't
   * revert a publisher-type change on device B.
   */
  preferenceUpdatedAt: {} as Record<string, number>,
  /**
   * Backfill flag for the one-time `updatedAt` stamp migration on records that
   * predate sync. Set to true after the first boot that ran the backfill so it
   * never runs twice.
   */
  hasMigratedToSyncSchema: false,
  /**
   * Whether the Home-screen onboarding "Get started" checklist has been
   * dismissed. Once dismissed it should not auto-reappear. Additive flag
   * owned by the onboarding-overhaul Phase 3 (HomeChecklist).
   */
  homeChecklistDismissed: false,
  /**
   * IDs of checklist items the user has manually ticked as complete on the
   * Home-screen onboarding checklist. Items that auto-complete from other
   * stores (e.g. `logFirstMinute`, `addFirstContact`) are not tracked here.
   */
  homeChecklistManualCompletions: [] as string[],
}

/**
 * Keys that should never be merged across devices (local bookkeeping, dev
 * flags, device-specific state). Everything outside this set participates in
 * per-key last-writer-wins merge when iCloud sync is enabled.
 *
 * Completion flags (`onboardingComplete`, `hasCompletedProfileSetup`,
 * `hasCompletedMapOnboarding`) intentionally DO sync — once the user sets up on
 * one device, the other device shouldn't re-prompt and wipe out their restored
 * profile. Device-specific _install_ bookkeeping (MMKV migration flag, dev
 * tools, geocode counter, etc.) stays local.
 */
export const NON_SYNCABLE_PREFERENCE_KEYS = new Set<string>([
  'iCloudSyncEnabled',
  'lastiCloudSyncAt',
  'lastiCloudPushedAt',
  'lastiCloudPulledAt',
  'lastiCloudRemoteWrittenAt',
  'lastiCloudRemoteDeviceId',
  'lastiCloudRemoteDeviceName',
  'iCloudDeviceId',
  'preferenceUpdatedAt',
  'hasMigratedToSyncSchema',
  'devSupporterOverride',
  'developerTools',
  'hasAttemptedToMigrateToMmkv',
  'monthlyRoutineHasShownInvalidMonthAlert',
  'lastAppVersion',
  'calledGoecodeApiTimes',
  'lastTimeRequestedAReview',
  'lastBackupDate',
])

export const usePreferences = create(
  persist(
    combine(initialState, (rawSet, getState) => {
      // Wraps the raw zustand setter so every partial update also stamps
      // per-key timestamps used by the iCloud merge algorithm. Keys in
      // `NON_SYNCABLE_PREFERENCE_KEYS` are excluded from stamping so local
      // bookkeeping (e.g. the sync timestamps themselves) doesn't generate
      // churn on the map.
      const set: typeof rawSet = (partial, replace) => {
        const resolved =
          typeof partial === 'function' ? partial(getState()) : partial

        if (
          resolved &&
          typeof resolved === 'object' &&
          !Array.isArray(resolved) &&
          !replace
        ) {
          const now = Date.now()
          const current = getState().preferenceUpdatedAt ?? {}
          const next: Record<string, number> = { ...current }
          let changed = false
          for (const key of Object.keys(resolved)) {
            if (NON_SYNCABLE_PREFERENCE_KEYS.has(key)) continue
            next[key] = now
            changed = true
          }
          if (changed) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rawSet({ ...(resolved as any), preferenceUpdatedAt: next })
            return
          }
        }
        rawSet(resolved, replace as never)
      }

      return {
        set,
        setPublisher: (publisher: Publisher) => set({ publisher }),
        incrementGeocodeApiCallCount: () =>
          set(({ calledGoecodeApiTimes }) => ({
            calledGoecodeApiTimes: calledGoecodeApiTimes + 1,
          })),
        updateLastTimeRequestedStoreReview: () =>
          set({ lastTimeRequestedAReview: new Date() }),
        setContactSort: (contactSort: (typeof SortOptionValues)[number]) =>
          set({ contactSort }),
        removeHint: (hint: keyof typeof hints) =>
          // Pass a partial rather than spreading the full preferences object —
          // the stamping wrapper iterates `Object.keys(resolved)` and would
          // otherwise bump `preferenceUpdatedAt` for every syncable key, which
          // flips last-writer-wins for unrelated prefs during iCloud merges.
          set({ [hint]: false } as Partial<typeof initialState>),
        /**
         * Will not update lastUpdated property or address if address param is
         * undefined.
         */
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
        setOverrideCreditLimit: (overrideCreditLimit: boolean) =>
          set({ overrideCreditLimit }),
        setCustomCreditLimitHours: (customCreditLimitHours: number) =>
          set({ customCreditLimitHours }),
      }
    }),
    {
      name: 'preferences',
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : AsyncStorage
      ),
    }
  )
)
