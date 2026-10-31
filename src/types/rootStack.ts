import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Coordinate } from '@/types/contact'
import type moment from 'moment'
import type {
  BuddyShareRef,
  PlanLocation,
  RecurringPlanFrequencies,
} from '@/types/timeEntry'
import type { PetSpecies } from '@/types/pet'
import type { RichText } from '@/types/richText'
import type { SupporterGateAttribution } from '@/lib/supporterGateAnalytics'

/**
 * Scribe AI's route params, spelled out because shared types can't import a
 * feature. They mirror `ScribeConversationParams` and `ScribeVoiceParams` in
 * `@/features/scribe/types`; `src/app/navigation/scribeRouteParams.ts` fails to
 * compile if they drift.
 */
type ScribeRouteEntry =
  | 'home_orb'
  | 'plus_sheet'
  | 'menu_bar'
  | 'settings'
  | 'onboarding'
  | 'history'
  | 'conversation'
  | 'say_a_change'

export interface ScribeConversationRouteParams {
  conversationId?: string
  /** Sent once per distinct submitId. */
  initialText?: string
  inputSource?: 'voice' | 'keyboard' | 'photo' | 'paper'
  submitId?: string
  entry: ScribeRouteEntry
  focusComposer?: boolean
  /** Unsent text for the composer (Type instead, an interrupted recording). */
  draftText?: string
  /** Onboarding's Import from Paper: read on open. */
  paperPages?: { uri: string; width: number; height: number }[]
}

export interface ScribeVoiceRouteParams {
  entry: ScribeRouteEntry
  /** Continue this conversation (Say a change). */
  conversationId?: string
}

/**
 * Scribe AI's one-time Terms of Use (and, opening it, Zero Data Retention)
 * steps: `open` goes on to `next` afterwards; `enable` turns Scribe AI on from
 * Settings once the terms are accepted.
 */
export type ScribeConsentRouteParams =
  | {
      mode: 'open'
      next:
        | { route: 'ScribeConversation'; params: ScribeConversationRouteParams }
        | { route: 'ScribeVoice'; params: ScribeVoiceRouteParams }
    }
  | { mode: 'enable' }

export type RootStackParamList = {
  Root: undefined
  /** The full-screen note editor; `sessionId` is from `startNoteEditorSession`. */
  NoteEditor: { sessionId: string }
  'Visit Form': {
    contactId?: string
    visitToEditId?: string
    notAtHome?: boolean
    fromContactForm?: boolean
    /** Go back to the opener (Contact Details or Contacts) after saving. */
    returnToContacts?: boolean
    /** Go back to the opener after saving, e.g. Home's Follow-up card. */
    returnOnSave?: boolean
    /** Opened from Log Visit: added to `visit_created` (analytics). */
    logVisit?: LogVisitAttribution
    /**
     * Opened over Visit Details, so it shows as a sheet over that one, and
     * closing it returns there.
     */
    overSheet?: boolean
    /** Opens an edit with Follow Up on, e.g. Visit Details' Plan the next visit. */
    planFollowUp?: boolean
    /** A new Visit answering this Visit's Follow-up shows its planned topic. */
    followUpVisitId?: string
  }
  'Contact Details': {
    id: string // Contact ID
    highlightedVisitId?: string
    /** Opens scrolled this far, as it was read in a pane (iPhone Duo). */
    scrollY?: number
  }
  'Contact Form': {
    id: string
    edit?: boolean
    returnToContacts?: boolean
    initialCoordinate?: Coordinate
    /** Prefills a new Contact's name, e.g. what was typed in a search. */
    name?: string
    /** Opened from Log Visit: passed on to the Visit Form it continues to. */
    logVisit?: LogVisitAttribution
  }
  /** Pick a Contact, then log a conversation or Not at Home. */
  'Log Visit': undefined
  'Add Time':
    | {
        date?: string
        hours?: number
        minutes?: number
        /** Seeds a new entry's Type, e.g. logging a Plan as time. */
        categoryId?: string
        /** Seeds a new entry's Note, e.g. from a day's inline form. */
        note?: string
        noteDoc?: RichText
        /** Entering an existing service report ID will enter 'edit' mode. */
        existingReport?: string
        /** Opened by the Home timer's Save: submitting clears the timer. */
        fromTimer?: boolean
        /** The saved session's start, so a newer session isn't cleared. */
        timerSessionStart?: number
      }
    | undefined
  'Recover Contacts': undefined
  'Dismissed Contacts': undefined
  'Contacts Sort And Filter': undefined
  /** `focusId` starts renaming that Saved View. */
  'Saved Contact Views': { focusId?: string } | undefined
  Onboarding: undefined
  Update: undefined
  Preferences: undefined
  'Whats New': undefined
  Paywall:
    | {
        initialTier?: 'supporter' | 'tip'
        source?: string
        feature?: string
        gateAttribution?: SupporterGateAttribution
      }
    | undefined
  'Thank You': { purchaseTier?: 'supporter' | 'tip' } | undefined
  /** Web only: where web checkout returns (docs/web-purchases.md). */
  'Web Purchase Return': { tier?: string } | undefined
  'Import and Export': { source: 'backup_reminder' } | undefined
  'Import Data': undefined
  MytimeImport: undefined
  ScribeConversation: ScribeConversationRouteParams
  ScribeVoice: ScribeVoiceRouteParams
  ScribeHistory: undefined
  ScribeUsage: undefined
  ScribeMemory: undefined
  ScribeOffline: undefined
  ScribeConsent: ScribeConsentRouteParams
  PreferencesPublisher: undefined
  PreferencesConversation: undefined
  PreferencesCalendar: undefined
  PreferencesPlans: undefined
  PreferencesStreaksAndBadges: undefined
  PreferencesNavigation: undefined
  PreferencesAudioAndHaptics: undefined
  PreferencesRewards: undefined
  PreferencesTabOrder: undefined
  PreferencesHomeScreen: undefined
  PreferencesScheduleScreen: undefined
  PreferencesBackups: undefined
  PreferencesAppearance: undefined
  PreferencesPersonalization: undefined
  PreferencesWidgets: undefined
  PreferencesPrivacy: undefined
  Security: undefined
  PreferencesiCloud: undefined
  PreferencesiCloudDevices: undefined
  PreferencesAppIcon: undefined
  PreferencesColorKey: undefined
  PreferencesMap: undefined
  PreferencesCustomFields: undefined
  PreferencesConversationFields: undefined
  RescheduleVisit: { contactId: string; visitId: string }
  /** One Visit and its Follow-up, read-only, with its buddies. */
  'Visit Details': { visitId: string }
  /** A buddy's Follow-up invitation, read-only, with the User's answer. */
  'Follow-Up Invitation': BuddyShareRef
  /** Everyone going to a buddy's Plan or Follow-up, as the User can see them. */
  'Going List': BuddyShareRef
  /**
   * One Plan, read-only: a one-time Plan, one date of a Recurring Plan, or a
   * buddy's Plan invitation (shown even after the User says they can't make it,
   * so they can change their mind).
   */
  'Plan Details': {
    dayPlanId?: string
    recurringPlanId?: string
    /** ISO; the Recurring Plan's date shown. */
    date?: string
    share?: BuddyShareRef
  }
  PlanDay: {
    date?: string
    /** Existing plan ID for editing mode */
    existingDayPlanId?: string
    existingRecurringPlanId?: string
    /** For recurring plans, the specific date instance being edited */
    recurringPlanDate?: string
    /**
     * Seeds a new plan (not an edit), e.g. duplicating a plan or planning the
     * same time as a buddy. Pick the day with `date`.
     */
    prefill?: {
      /** ISO timestamp; only its time of day is used. */
      startTime?: string
      /** Just hours, with no set time; `startTime` is ignored. */
      anytime?: boolean
      minutes?: number
      note?: string
      noteDoc?: RichText
      title?: string
      location?: PlanLocation
      categoryId?: string
      /** Buddy inbox ids to invite. */
      buddies?: string[]
      /** A reminder, e.g. one set in a day's inline form. */
      notifyMe?: boolean
      reminderOffset?: {
        amount: number
        unit: moment.unitOfTime.DurationConstructor
      }
      /** How a Recurring Plan repeats. `endDate` is ISO. */
      recurrence?: {
        frequency: RecurringPlanFrequencies
        interval: number
        weekday: number
        weekOfMonth: number
        endDate?: string
      }
    }
    /** Starts a new plan as Recurring instead of One-Time. */
    recurring?: boolean
  }
  Rollover: undefined
  /**
   * The route builder; `date` (`YYYY-MM-DD`) defaults to today. `planId` ties
   * the day's route to that Plan: one it was opened from, or (`newPlan`) one
   * just made from the route to invite buddies.
   */
  TodayRoute:
    | {
        date?: string
        planId?: string
        newPlan?: boolean
        /** Contacts to add as stops, in order (Plan Route on the Map). */
        addContactIds?: string[]
      }
    | undefined
  MilestoneShowcase: undefined
  /**
   * Developer Tools: the web's Cloud Sync screen on a phone. `live` runs it
   * against this phone's account as a browser would; the rest show one state.
   */
  WebCloudSyncPreview: { mode: 'live' | 'turnOn' | 'waiting' | 'updatePhone' }
  FAQ: { scrollToCategory?: string } | undefined
  /** QR codes and a link for sharing WitnessWork with a friend. */
  ShareApp: undefined
  /** The anonymous server account and its recovery key. */
  Account: undefined
  /** Set Up Another Device: this phone shows a QR code for a new one. */
  'Set Up Another Device': { entry?: 'settings' | 'tools' } | undefined
  /** The account's signed-in devices (ADR 0028). */
  'Account Devices': undefined
  'Account Passkeys': undefined
  /** The account's security history (ADR 0028). */
  'Account Activity': undefined
  /** Sign In with QR Code: scan, or open, another phone's handoff link. */
  'Sign In With QR Code':
    | { entry?: 'settings' | 'onboarding' | 'link' | 'tools'; link?: string }
    | undefined
  OpenSourceLicenses: undefined
  More: undefined
  ServiceReportView: { month: number; year: number }
  OnboardingBackfill: undefined
  ServiceHistory:
    | {
        /**
         * Service Year start year (Sep of `serviceYear`); defaults to the
         * latest with finished months.
         */
        serviceYear?: number
        source?: ServiceHistorySource
      }
    | undefined
  /** Settings on compact layouts, opened from the account menu. */
  SettingsMenu: undefined
  /** Roster, requests, and invites. Opened from Schedule's header. */
  Buddies: undefined
  /** One buddy: what's planned together, their next two weeks, and settings. */
  Buddy: { inboxId: string }
  /** In-person pairing: my single-use QR code, or a scanner for theirs. */
  'Buddy Code': { mode: 'code' | 'scan'; inviteId?: string }
  /** Pre-accept screen for an incoming Buddies invite link. */
  'Buddy Invite': { link: string }
  /** What buddies see, Buddies notifications, and delete-all. */
  /** All buddies' settings, or one buddy's (`inboxId`) over them. */
  'Buddies Settings': { inboxId?: string } | undefined
  /** Alpha explainer, opt-in diagnostics, and the Buddies feedback survey. */
  'Buddies Feedback': { source: 'badge' | 'menu' | 'settings' } | undefined
  /** Mileage trip history and report. */
  Mileage: undefined
  /** Log or edit a trip. `duplicateOf` seeds a new trip dated today. */
  MileageTripForm:
    | { tripId?: string; duplicateOf?: string; source?: MileageSource }
    | undefined
  MileageTripDetails: { tripId: string }
  /** Cars, fuels, units, and delete-all. */
  MileageSettings: undefined
  /** Add or edit a car. `thenLogTrip` continues to the trip form on save. */
  MileageVehicleForm:
    | { vehicleId?: string; thenLogTrip?: boolean; source?: MileageSource }
    | undefined
  MileageFuelForm: { fuelId?: string } | undefined
  /** Adopt a Pet Companion, or Change Pet (species and coat). */
  /** `species`: the animal chosen on open (one tapped in the Home offer). */
  PetPicker: { mode: 'adopt' | 'change'; species?: PetSpecies }
  /** The pet's details: its hat and room parts, applied as they're picked. */
  /** `focus`: an unlocked item (`hat:beret`) whose tab opens first. */
  PetRoom: { focus?: string } | undefined
  /**
   * The pet's Shop (ADR 0035): `focus` picks an item (`part:option`) and its
   * category; `from` is where it was opened, for analytics: the details' Shop
   * button (`room`), a part's More in Shop card (`more`), or the Home card's
   * menu (`menu`).
   */
  PetShop: { focus?: string; from?: 'room' | 'more' | 'menu' } | undefined
  /** Rename the companion (an empty name shows the species name). */
  PetRename: undefined
  /**
   * The pet's settings, from the cog in its details: its name and look, shown
   * on Home, the reward animations and sounds, and buddies' pets visiting.
   */
  PetSettings: undefined
  /** Every buddy's pet visiting today, in a scrolling list. */
  PetVisits: undefined
  /** The pet's share card, and Share for a picture of it. */
  PetShare: undefined
  /** The User's badge collection, with progress toward each next level. */
  Badges: { source?: BadgesSource } | undefined
  /**
   * A buddy's collection: every collection at their highest shared level and
   * their One-time Badges, with no progress or dates.
   */
  BuddyBadges: { inboxId: string }
  /**
   * One badge, full screen: the coin flips out of `origin` and settles large.
   * `badgeKey` is a `BadgeKey` (`yearRound.3`, `firstBibleStudy`). A buddy's
   * badge shows only that it's theirs: no dates or progress.
   */
  BadgeView: {
    badgeKey: string
    owner: BadgeOwner
    origin?: BadgeViewOrigin
    /** Opened from news the User hadn't seen yet: shows a "New" pill. */
    isNew?: boolean
    /** A level a buddy hasn't reached, from their collection: "Not yet". */
    locked?: boolean
  }
}

/** Whose badge a badge view shows: the User's, or a buddy's by inbox id. */
export type BadgeOwner = 'me' | { inboxId: string }

/** The tapped coin's window rect, which a badge view grows out of. */
export type BadgeViewOrigin = {
  x: number
  y: number
  size: number
  /**
   * False when the coin can't be flown back to (the profile overlay fades back
   * in over it), so the view fades instead.
   */
  returns?: boolean
}

/** Where the Badges screen was opened from (analytics). */
export type BadgesSource =
  | 'profile_overlay'
  | 'profile_card'
  | 'celebration'
  | 'welcome'
  | 'settings'
  | 'other'

/** Which part of the Log Visit picker the Contact was picked from. */
export type LogVisitPickedFrom =
  | 'nearby'
  | 'followUpsDue'
  | 'recent'
  | 'beenAWhile'
  | 'all'
  | 'search'
  | 'new_contact'

/** How Log Visit reached a Visit, sent with `visit_created` (analytics). */
export type LogVisitAttribution = {
  source: 'quick_action'
  picked_from: LogVisitPickedFrom
  /** Whether the picker showed the Nearby section. */
  nearby_shown: boolean
}

/** Where a Mileage flow started (analytics). */
export type MileageSource =
  | 'home_prompt'
  | 'home_section'
  | 'quick_action'
  | 'mileage_screen'
  | 'mileage_settings'
  | 'trip_menu'

/** Where the Service History editor was opened from (analytics). */
export type ServiceHistorySource =
  | 'year_row_menu'
  | 'add_earlier_year'
  | 'settings'
  | 'streak'

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>
