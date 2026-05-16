import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Publisher, PublisherHours } from '@/types/publisher'
import i18n, { TranslatedLocale } from '@/lib/locales'
import Constants from 'expo-constants'
import moment from 'moment'
import * as Device from 'expo-device'
import { hasMigratedFromAsyncStorage, MmkvStorage } from '@/stores/mmkv'
import { Address } from '@/types/contact'
import { ProfileAvatar } from '@/types/avatar'
import { MinuteDisplayFormat } from '@/types/serviceReport'
import type { AssistantEvent } from '@/types/assistant'
import { appendAssistantEventCapped } from '@/lib/assistantState'
import type { ShaderId } from '@/shaders/types'
import { DEFAULT_SHADER_ID } from '@/shaders/registry'
import type { ContactSortDirection, ContactSortKey } from '@/lib/contactsSort'
import type { ActiveFilter } from '@/lib/contactsFilters'
import type { MarkerColors } from '@/types/markerColors'

export type { MarkerColors }

/**
 * Built-in (non-custom-field) sort dimensions. Custom-field sorts use the
 * `customField:<defId>` template literal form on `ContactSortKey` and are
 * appended at render time when picking a custom field.
 */
export const builtInContactSortOptions: {
  label: () => string
  value: ContactSortKey
}[] = [
  { label: () => i18n.t('contacts_sortBySuggested'), value: 'suggested' },
  { label: () => i18n.t('recentConversation'), value: 'recentConversation' },
  { label: () => i18n.t('alphabeticalAsc'), value: 'az' },
  { label: () => i18n.t('alphabeticalDesc'), value: 'za' },
  { label: () => i18n.t('bibleStudy'), value: 'bibleStudy' },
  { label: () => i18n.t('contacts_sortByPin'), value: 'pinStaleness' },
  { label: () => i18n.t('contacts_sortByDateAdded'), value: 'createdAt' },
  { label: () => i18n.t('contacts_sortByCity'), value: 'city' },
  { label: () => i18n.t('contacts_sortByState'), value: 'state' },
  { label: () => i18n.t('contacts_sortByZip'), value: 'zip' },
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
 * In-app fallback for `planNotificationOffset` when the user has not chosen
 * one. Consumed by the day-plan form and by the prefs UI so the dropdowns
 * pre-fill with the value the app would actually use.
 */
export const DEFAULT_PLAN_NOTIFICATION_OFFSET: Required<TimeOffset> = {
  amount: 30,
  unit: 'minutes',
}

/**
 * In-app fallback for `returnVisitTimeOffset` (how far out a new conversation's
 * follow-up date is set from "now" when the user hasn't picked one).
 */
export const DEFAULT_RETURN_VISIT_TIME_OFFSET: Required<TimeOffset> = {
  amount: 1,
  unit: 'weeks',
}

/**
 * In-app fallback for `returnVisitNotificationOffset` (how long before a
 * follow-up's date the notification fires when the user hasn't picked one).
 */
export const DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET: Required<TimeOffset> = {
  amount: 2,
  unit: 'hours',
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

/**
 * User-visible alternate app icon options. `'Seasonal'` is resolved to one of
 * the four bundled `SeasonalXxx` PascalCase plugin names at apply time
 * depending on hemisphere + date — see `lib/appIcon.ts`.
 */
export type AppIconVariant =
  | 'Default'
  | 'Gold'
  | 'Dark'
  | 'Minimalist'
  | 'Mono'
  | 'Seasonal'

/**
 * The toggleable home-screen sections that the user can also reorder. Order is
 * persisted in `homeScreenElementsOrder`; visibility is persisted in
 * `homeScreenElements`. Capability gates (tablet, annual goal, timer enabled)
 * are applied at render time, not stored — turning off a capability hides the
 * section without losing the user's saved order.
 */
export type HomeScreenElementKey =
  | 'approachingConversations'
  | 'tabletServiceYearSummary'
  | 'serviceReport'
  | 'thisWeek'
  | 'timer'
  | 'contributionGraph'
  | 'didYouKnow'

export const DEFAULT_HOME_SCREEN_ELEMENTS_ORDER: HomeScreenElementKey[] = [
  'contributionGraph',
  'approachingConversations',
  'tabletServiceYearSummary',
  'serviceReport',
  'thisWeek',
  'timer',
  'didYouKnow',
]

/**
 * Returns the user's stored order with any missing keys appended in their
 * default position. Tolerates legacy entries (e.g. `monthlyRoutine`) by
 * dropping anything not in the current key set.
 */
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
  for (const k of DEFAULT_HOME_SCREEN_ELEMENTS_ORDER) {
    if (!seen.has(k)) out.push(k)
  }
  return out
}

export const PREFERENCE_DEFAULTS = {
  role: 'publisher' as Publisher,
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
  contactSort: 'suggested' as ContactSortKey,
  /**
   * Direction the active sort runs in. `desc` is the default because the
   * Contacts screen's primary sorts (recent conversation, color-pin staleness)
   * read most naturally with the most-actionable rows on top.
   */
  contactSortDirection: 'desc' as ContactSortDirection,
  /**
   * Persisted advanced filters (AND'd) on the Contacts screen. Survives a tab
   * switch so the user doesn't lose their filter set when leaving the screen.
   */
  contactsFilters: [] as ActiveFilter[],
  hasCompletedMapOnboarding: false,
  calledGoecodeApiTimes: 0,
  lastTimeRequestedAReview: null as Date | null,

  defaultNavigationMapProvider: 'apple' as DefaultNavigationMapProvider,
  lastAppVersion: Constants.expoConfig?.version || null,
  returnVisitTimeOffset: null as TimeOffset | null,
  returnVisitNotificationOffset: null as TimeOffset | null,
  returnVisitAlwaysNotify: false,
  /**
   * Default amount + unit for "notify me before plan starts" on day plans. Null
   * means "use the in-app default" (30 minutes).
   */
  planNotificationOffset: null as TimeOffset | null,
  /**
   * When true, newly created day plans default `notifyMe` to true. The user can
   * still flip the per-plan toggle off in the form. Existing plans are not
   * touched when this preference changes.
   */
  planAlwaysNotify: false,
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
  backupNotificationFrequencyAsDays: 120,
  userSpecifiedHasAnnualGoal: 'default' as boolean | 'default',
  fontSizeOffset: 0,
  /**
   * One-shot flag for the legacy-`customContactFields` → `customFieldDefs`
   * migration. Per-device because the migration runs once per install against
   * whatever shape happens to be on disk; once flipped to true, the boot runner
   * skips the migration. Non-syncable.
   *
   * The legacy `customContactFields: string[]` field that this migration
   * replaces was removed from the schema — see `lib/customFieldsMigration.ts`
   * for the rewrite, and `contactsStore.customFieldDefs` for the new home.
   */
  hasMigratedCustomFieldsToIds: false,
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
    contributionGraph: true,
    contacts: true,
    didYouKnow: true,
  },
  /**
   * User-defined order of the toggleable home-screen sections. Resolved through
   * `getEffectiveHomeScreenOrder` at read time so newly-added keys (or legacy
   * keys) don't break the layout.
   */
  homeScreenElementsOrder:
    DEFAULT_HOME_SCREEN_ELEMENTS_ORDER as HomeScreenElementKey[],
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
  mapKeyColors: undefined as Partial<MarkerColors> | undefined,
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
   * Supporter-only override for the iOS Home Screen app icon. `null` /
   * `'Default'` use the bundle's primary icon. `'Seasonal'` is resolved at
   * runtime to one of the four SeasonalXxx variants based on the user's
   * hemisphere and current date — the value persisted here stays `'Seasonal'`
   * regardless of which season is currently rendered.
   *
   * Preserved even when supporter status lapses so the user's choice isn't lost
   * — the runtime applies it only while supporter status is active and resets
   * the Home Screen tile to the default the moment supporter status lapses.
   * Mirrors `customAccentColor`.
   */
  customAppIcon: null as AppIconVariant | null,
  /**
   * Developer override for supporter status. When non-null, forces
   * `useIsSupporter()` to report the user as a supporter with the given `since`
   * date, bypassing RevenueCat. Null disables the override. Exposed from the
   * hidden developer tools screen only.
   */
  devSupporterOverride: null as Date | null,
  /**
   * When true, app-icon changes go through the public `setAlternateIconName`
   * path which fires the iOS "App Icon Updated" system alert. When false
   * (default), they go through the patched silent selector — same outcome, no
   * alert. Exposed from the developer tools screen so the alerts can be
   * re-enabled for debugging without re-patching the native module.
   * Non-syncable.
   */
  devShowAppIconAlerts: false,
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
   * One-shot flag that flips the first time the Home checklist transitions to
   * fully complete, so the celebration burst (fireworks + success haptic +
   * scale-pop) plays once and not on every Home screen mount. Per-device so a
   * user upgrading on a second device doesn't retroactively see a celebration
   * they already saw elsewhere.
   */
  homeChecklistAllDoneCelebrated: false,
  /**
   * Stable id of the onboarding step the user was last on, so a mid-flow app
   * reload resumes where they left off instead of throwing them back to the
   * hero. Stored as an id (not an index) because publisher-conditional steps
   * (e.g. pioneerDate) shift indices when publisher type changes. Null once
   * onboarding completes or is reset.
   */
  onboardingStepId: null as string | null,
  /**
   * Resolution state for the one-time Onboarding Backfill prompt shown to
   * annual-goal publishers who installed mid-service-year. (Field name kept as
   * `serviceYearCatchUpStatus` for persisted-key stability — see
   * `docs/refactor-log.md`.) Lifecycle:
   *
   * - `null` — never engaged / ineligible on older persisted installs.
   * - `'pending'` — eligible user has not resolved the onboarding step yet.
   * - `'skipped'` — user hit Skip in the onboarding step. Surfaces the recovery
   *   banner on the Progress screen.
   * - `'completed'` — user filled in the form; banner is permanently hidden.
   * - `'dismissed'` — user tapped the X on the banner; banner is permanently
   *   hidden without filling in data.
   *
   * Syncable so dismissal/completion carries across devices.
   */
  serviceYearCatchUpStatus: null as
    | 'pending'
    | 'skipped'
    | 'completed'
    | 'dismissed'
    | null,
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
   * `publisherHours[role] * 12` at render time and is NOT stored here. "Reset
   * to defaults" sets this back to `null`.
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
  /**
   * Set to true once the user has fully viewed the Milestone Update showcase
   * (scrolled to bottom or tapped the closing CTA). Suppresses both the
   * grand-reveal overlay and the "shaking present" recovery icon on the home
   * screen. Per-device — a user upgrading on a second device can re-experience
   * the reveal there independently.
   */
  seenMilestoneUpdateReveal: false,
  /**
   * Set to true if the user dismissed the grand-reveal overlay without entering
   * the showcase (tapped "Not now" or skip-anywhere). Used to surface the
   * "shaking present" icon on the home screen as a recovery affordance so the
   * reveal can be replayed on demand. Per-device.
   */
  dismissedMilestoneRevealOnce: false,
  /**
   * Sticky one-shot flag set on dismissal of the Founding Supporter reveal
   * (chained after the Milestone reveal for users who were active Supporters at
   * upgrade time). Gates the Founding badge variant and prevents re-firing the
   * reveal across future launches. **Never cleared.** A re-subscribing Founding
   * Supporter regains the badge automatically; an erroneously-granted flag
   * cannot be revoked without a migration. Per-device — a user crossing the
   * Reveal version on a second device can re-experience the reveal there
   * independently.
   */
  seenFoundingSupporterReveal: false,
  /**
   * Stable IDs of "Did you know?" tips the user has dismissed from the
   * home-screen tip card. The card surfaces the first tip in
   * `DID_YOU_KNOW_TIPS` whose id isn't here; once all are present the card
   * stops rendering. Syncable so a dismissal on one device doesn't re-surface
   * the same tip on another.
   */
  seenTipIds: [] as string[],
  /**
   * Off Days the user wants the Assistant to treat as a hard exclusion when
   * generating recommended day plans. Empty by default — no exclusion. Today
   * stored as weekday numbers (0 = Sunday … 6 = Saturday); the concept covers
   * any day. The user can override per-day even when a weekday is in this set;
   * the calendar dims Off Days as a hint.
   */
  offDays: [] as number[],
  /**
   * Meeting Days — days the user attends a Kingdom Hall meeting. The Assistant
   * treats these as "busier" days: it prefers other days first and, when a
   * meeting day is used, caps the proposed session at a lower number of hours
   * so the user still has time to study and attend. A day listed in both
   * `offDays` and `meetingDays` is treated as an Off Day — the stricter rule
   * wins. Today stored as weekday numbers (0 = Sunday … 6 = Saturday); the
   * concept covers any day.
   */
  meetingDays: [] as number[],
  /**
   * One-shot flag for the Availability Onboarding sheet, which surfaces just in
   * time the first time a recommendation would render. Flipped true when the
   * user saves OR skips the sheet, so we never re-prompt automatically — but
   * Settings retains an entry point to revisit.
   */
  hasSeenAvailabilityOnboarding: false,
  /**
   * FIFO ring buffer (cap 10) of the user's accept/dismiss actions on Assistant
   * recommendations. The engine reads this to back off from
   * repeatedly-dismissed shapes. Insert/eviction happens in the action that
   * records the event — this store only owns the default empty list.
   */
  assistantHistory: [] as AssistantEvent[],
  /**
   * Hash of the engine inputs (logged, plans, conversations, off days, meeting
   * days) at the time the user last dismissed the Assistant card. While this
   * hash matches the current inputs, the Assistant section stays hidden —
   * re-emerging once any input changes.
   */
  hasDismissedRecommendationHash: undefined as string | undefined,
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
  'hasMigratedCustomFieldsToIds',
  // Legacy field — removed from the schema but may still exist on disk for
  // installs that pre-date the id-keyed migration. Listed here so the boot
  // cleanup that wipes it doesn't propagate the deletion through sync.
  'customContactFields',
  'devSupporterOverride',
  'devSupporterNudgeForceShow',
  'devShowAppIconAlerts',
  'developerTools',
  'hasAttemptedToMigrateToMmkv',
  'monthlyRoutineHasShownInvalidMonthAlert',
  'lastAppVersion',
  'calledGoecodeApiTimes',
  'lastTimeRequestedAReview',
  'lastBackupDate',
  'onboardingStepId',
  'celebratedTiers',
  'homeChecklistAllDoneCelebrated',
  'devRolloverDateOverride',
  'seenMilestoneUpdateReveal',
  'dismissedMilestoneRevealOnce',
  'seenFoundingSupporterReveal',
])

/**
 * Persisted-shape migrations for the preferences store.
 *
 * Versioning history:
 *
 * - V0 → v1: rename `excludedWeekdays` → `offDays`, `meetingWeekdays` →
 *   `meetingDays`. The underlying data (a set of weekday numbers 0–6) is
 *   identical; only the field names change. We also migrate the
 *   `preferenceUpdatedAt` timestamp map so iCloud last-writer-wins continues to
 *   work across the rename. The legacy fields are dropped from disk.
 * - V1 → v2: rename `publisher` → `role`. The field stores a `Publisher` enum
 *   value (the user's field-ministry role); the new name reads more naturally
 *   (`preferences.role === 'regularPioneer'`) and matches the glossary. The
 *   leaf enum value `'publisher'` (Regular Publisher) is canonical and stays.
 *   The `preferenceUpdatedAt` timestamp map is migrated alongside so iCloud
 *   last-writer-wins continues to work across the rename.
 *
 * Exported for unit testing. Idempotent — re-running on an already-migrated
 * blob is a no-op.
 */
export const migratePreferencesPersistedState = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  persistedState: any,
  version: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
  let next = persistedState
  if (version < 1) {
    next = migrateExcludedMeetingWeekdaysToOffMeetingDays(next)
  }
  if (version < 2) {
    next = migratePublisherToRole(next)
  }
  return next
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const migrateExcludedMeetingWeekdaysToOffMeetingDays = (state: any): any => {
  if (!state || typeof state !== 'object') return state
  const { excludedWeekdays, meetingWeekdays, ...rest } = state
  const next = { ...rest }
  // If the new key already carries a value, it wins (defensive — a
  // downgrade-then-upgrade could leave both keys present).
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const migratePublisherToRole = (state: any): any => {
  if (!state || typeof state !== 'object') return state
  const { publisher, ...rest } = state
  const next = { ...rest }
  // If the new key already carries a value, it wins (defensive — a
  // downgrade-then-upgrade could leave both keys present).
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
        setRole: (role: Publisher) => set({ role }),
        incrementGeocodeApiCallCount: () =>
          set(({ calledGoecodeApiTimes }) => ({
            calledGoecodeApiTimes: calledGoecodeApiTimes + 1,
          })),
        updateLastTimeRequestedStoreReview: () =>
          set({ lastTimeRequestedAReview: new Date() }),
        setContactSort: (contactSort: ContactSortKey) => set({ contactSort }),
        setContactSortDirection: (contactSortDirection: ContactSortDirection) =>
          set({ contactSortDirection }),
        setContactsFilters: (contactsFilters: ActiveFilter[]) =>
          set({ contactsFilters }),
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
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : AsyncStorage
      ),
      version: 2,
      migrate: (persistedState, version) =>
        migratePreferencesPersistedState(persistedState, version),
    }
  )
)
