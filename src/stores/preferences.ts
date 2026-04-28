import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Publisher, PublisherHours } from '../types/publisher'
import i18n, { TranslatedLocale } from '../lib/locales'
import Constants from 'expo-constants'
import moment from 'moment'
import * as Device from 'expo-device'
import { hasMigratedFromAsyncStorage, MmkvStorage } from './mmkv'
import { Address } from '../types/contact'
import { ProfileAvatar } from '../types/avatar'
import { MinuteDisplayFormat } from '../types/serviceReport'
import type { ShaderId } from '../shaders/types'
import { DEFAULT_SHADER_ID } from '../shaders/registry'

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
 * Intents selected by the user during onboarding (`IntentPicker` step). Drives
 * the post-onboarding HomeChecklist and personalization of the plan-preview /
 * supporter reframe screens. Additive-only; consumers should treat an empty
 * array as "no preference expressed" and fall back to sensible defaults.
 */
export type OnboardingIntent =
  | 'trackTime'
  | 'returnVisits'
  | 'planWeek'
  | 'monthlyGoal'
  | 'mapContacts'

export const PREFERENCE_DEFAULTS = {
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
   * Multi-select intents captured during onboarding (`IntentPicker` step).
   * Drives the post-onboarding `HomeChecklist` and personalizes later
   * onboarding screens. Empty array means the user skipped or the step hasn't
   * run yet — consumers must treat that case defensively.
   */
  onboardingIntents: [] as OnboardingIntent[],
  /**
   * Date the user began their current publisher role. Despite the name, this
   * stores the start date for any role that tracks one — see `tracksStartDate`
   * in `constants/publisher.ts` (regular pioneer, special pioneer, circuit
   * overseer, regular auxiliary). Used by ProfileCard / ProfileDetailOverlay to
   * display duration (e.g. "Pioneering for 2 years").
   */
  pioneerStartDate: null as Date | null,
  /** Profile avatar — stored locally, never uploaded. */
  avatar: { type: 'none', value: '' } as ProfileAvatar,
  installedOn: new Date(),
  contactSort: 'recentConversation' as (typeof SortOptionValues)[number],
  hasCompletedMapOnboarding: false,
  calledGoecodeApiTimes: 0,
  lastTimeRequestedAReview: null as Date | null,

  defaultNavigationMapProvider: 'apple' as DefaultNavigationMapProvider,
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
  /**
   * Epoch ms of the last time the Home supporter-nudge card was dismissed (via
   * "Not right now" or the CTA). `null` means never dismissed. Drives the
   * 365-day cooldown in `isSupporterNudgeEligible`. Syncable — dismissal is
   * user intent and should follow the user.
   */
  supporterNudgeDismissedAt: null as number | null,
  /**
   * Explicit opt-out for the Home supporter-nudge card. Separate from
   * `hideDonateHeart` so a user can keep the heart icon but silence the larger
   * periodic card, or vice versa. Syncable.
   */
  hideSupporterNudge: false,
  /**
   * Dev override that bypasses tenure, engagement, and cooldown gates for the
   * supporter-nudge card. Only honored under `__DEV__` (production reads it but
   * ignores it, same pattern as `devSupporterOverride`). Non-syncable.
   */
  devSupporterNudgeForceShow: false,
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
  /**
   * Most recently selected phone region on the contact form, as an ISO 3166-1
   * alpha-2 code (e.g. `"US"`, `"GB"`, `"DE"`). Format matches what
   * `react-native-phone-number-input` / `expo-localization` exchange. Used as
   * the default region for new contacts so the user doesn't re-pick their
   * country every time. Null until first contact is saved — falls back to the
   * device locale.
   */
  defaultPhoneRegionCode: null as string | null,
  homeScreenElements: {
    approachingConversations: true,
    monthlyRoutine: true,
    tabletServiceYearSummary: true,
    thisWeek: true,
    serviceReport: true,
    timer: true,
    contacts: true,
  },
  colorScheme: undefined as 'light' | 'dark' | undefined,
  /**
   * Toggles the Skia-backed shader overlay on `ProfileCard`. Off by default
   * while the effect is still being tuned — the preference is only surfaced
   * under `__DEV__` today and will be revisited before wider release.
   */
  profileCardShaderEnabled: false,
  /**
   * Which shader from `src/shaders/registry.ts` is active on the profile card.
   * Reserved for a future picker + unlock flow. Today only `holographic` is
   * surfaced in the UI, but the preference is already typed as `ShaderId` so
   * adding new entries is a pure registry change.
   */
  profileCardShaderId: DEFAULT_SHADER_ID as ShaderId,
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
   * on foreground / remote-change events. Defaulted to true for supporters on
   * first launch; off by default for non-supporters.
   */
  iCloudSyncEnabled: false,
  /**
   * True once the user has explicitly toggled iCloud sync on or off in
   * Settings. Before this is set, supporters get sync enabled automatically.
   * After this is set, the user's explicit choice is respected permanently.
   */
  iCloudSyncSetByUser: false,
  /**
   * When true, user-uploaded images (profile + contact avatars) are uploaded to
   * the iCloud ubiquity container alongside the JSON sync payload and
   * downloaded on other devices. Default false — images stay on-device unless
   * the user opts in. Per-device (non-syncable) so consent isn't implicitly
   * extended to other devices on the same Apple ID.
   */
  iCloudSyncIncludeImages: false,
  /**
   * Persistent bookkeeping for the image-sync uploader. Keyed by container
   * filename (e.g. `witness-work-img-contact-<id>.jpg`). Drives the
   * upload/retry loop across app restarts so an interrupted migration or a
   * transient network failure automatically resumes on the next push
   * opportunity — see docs/icloud-image-sync-plan.md and
   * `src/lib/sync/imageSync.ts`.
   *
   * Field semantics:
   *
   * - `localMtime`: last-seen modification time of the on-device source file
   *   (`file://...`). If the user re-picks their avatar, this bumps past
   *   `uploadedMtime` and the entry becomes dirty.
   * - `uploadedMtime`: local-file mtime at the point of the last successful
   *   upload. `null` means "never uploaded" (brand new or bookkeeping lost).
   * - `lastError` / `failedAt`: last failure classification and timestamp.
   *   `'quota'` errors suppress store-edit retries and only retry on
   *   foreground; other errors retry freely on the next push cycle.
   *
   * Per-device (non-syncable) — this is purely local queue state and must not
   * ride the JSON payload, otherwise a stale entry from Device A could cause
   * Device B to think a file is already uploaded when it isn't.
   */
  iCloudImageSync: {} as Record<
    string,
    {
      localMtime: number
      uploadedMtime: number | null
      lastError?: string
      failedAt?: number
    }
  >,
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
   * dismissed. Once dismissed it should not auto-reappear. Additive flag owned
   * by the onboarding-overhaul Phase 3 (HomeChecklist).
   */
  homeChecklistDismissed: false,
  /**
   * IDs of checklist items the user has manually ticked as complete on the
   * Home-screen onboarding checklist. Items that auto-complete from other
   * stores (e.g. `logFirstMinute`, `addFirstContact`) are not tracked here.
   */
  homeChecklistManualCompletions: [] as string[],
  /**
   * Stable id of the onboarding step the user was last on, so a mid-flow app
   * reload resumes where they left off instead of throwing them back to the
   * hero. Stored as an id (not an index) because publisher-conditional steps
   * (e.g. pioneerDate) shift indices when publisher type changes. Null once
   * onboarding completes or is reset.
   */
  onboardingStepId: null as string | null,
  /**
   * Tracks which achievement tiers have already been celebrated per month, so
   * the one-time confetti / haptic / scale-pulse doesn't re-fire every time the
   * user reopens the MonthScreen. Keyed `YYYY-MM`; values are the tier names
   * the user has already been shown the crossing animation for. Non-syncable —
   * per-device so a user upgrading on a second device doesn't retroactively see
   * a celebration they've already seen elsewhere.
   */
  celebratedTiers: {} as Record<string, string[]>,
  /**
   * User-customized milestone ladder for the Year tab's `YearMilestoneCard` /
   * `MilestoneAdjustSheet`. `null` means "use the publisher-type default
   * ladder" from `src/lib/milestones.ts`. When non-null, these hours override
   * the defaults and persist across publisher-type changes (shared list, not
   * per-publisher). The final row — the annual goal — is derived from
   * `publisherHours[publisher] * 12` at render time and is NOT stored here.
   * "Reset to defaults" sets this back to `null`.
   */
  milestoneOverrides: null as number[] | null,
  /**
   * Most recent `YYYY-MM` for which the Time Rollover prompt has been resolved
   * (either applied or dismissed). When this matches the current month, no
   * rollover prompt or auto-rollover runs again until the next month. Syncable
   * so a second device doesn't re-prompt for the same month.
   */
  lastRolloverYearMonth: null as string | null,
  /**
   * When true, fractional minutes are rolled over silently on first app launch
   * in a new month — no full-screen prompt. Set via the "Automatically handle
   * for future months" checkbox on the rollover screen. Syncable.
   */
  autoRolloverEnabled: false,
  /**
   * Dev-only clock override for the Time Rollover system. When set, the
   * rollover hook uses this date as "today" instead of `moment()`. Lets a
   * developer simulate opening the app on, say, April 1st with March's
   * fractional minutes already on disk. Non-syncable — local testing only.
   */
  devRolloverDateOverride: null as Date | null,
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
  'iCloudSyncSetByUser',
  'iCloudSyncIncludeImages',
  'iCloudImageSync',
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
  'devSupporterNudgeForceShow',
  'developerTools',
  'hasAttemptedToMigrateToMmkv',
  'monthlyRoutineHasShownInvalidMonthAlert',
  'lastAppVersion',
  'calledGoecodeApiTimes',
  'lastTimeRequestedAReview',
  'lastBackupDate',
  'onboardingStepId',
  'celebratedTiers',
  'devRolloverDateOverride',
])

export const usePreferences = create(
  persist(
    combine(PREFERENCE_DEFAULTS, (rawSet, getState) => {
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
        setDefaultPhoneRegionCode: (defaultPhoneRegionCode: string) =>
          set({ defaultPhoneRegionCode }),
        removeHint: (hint: keyof typeof hints) =>
          // Pass a partial rather than spreading the full preferences object —
          // the stamping wrapper iterates `Object.keys(resolved)` and would
          // otherwise bump `preferenceUpdatedAt` for every syncable key, which
          // flips last-writer-wins for unrelated prefs during iCloud merges.
          set({ [hint]: false } as Partial<typeof PREFERENCE_DEFAULTS>),
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
        setAutoRolloverEnabled: (autoRolloverEnabled: boolean) =>
          set({ autoRolloverEnabled }),
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
