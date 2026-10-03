import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Coordinate } from '@/types/contact'
import type { PlanLocation } from '@/types/timeEntry'

export type RootStackParamList = {
  Root: undefined
  'Visit Form': {
    contactId?: string
    visitToEditId?: string
    notAtHome?: boolean
    fromContactForm?: boolean
    /** Return to the persistent Contacts detail pane after saving. */
    returnToContacts?: boolean
  }
  'Contact Details': { id: string; highlightedVisitId?: string } // Contact ID
  'Contact Form': {
    id: string
    edit?: boolean
    returnToContacts?: boolean
    initialCoordinate?: Coordinate
  }
  'Contact Selector': undefined
  'Add Time':
    | {
        date?: string
        hours?: number
        minutes?: number
        /** Seeds a new entry's Type, e.g. logging a Plan as time. */
        categoryId?: string
        /** Entering an existing service report ID will enter 'edit' mode. */
        existingReport?: string
      }
    | undefined
  'Recover Contacts': undefined
  'Dismissed Contacts': undefined
  'Contacts Sort And Filter': undefined
  Onboarding: undefined
  Update: undefined
  Preferences: undefined
  'Whats New': undefined
  Paywall:
    | { initialTier?: 'supporter' | 'tip'; source?: string; feature?: string }
    | undefined
  'Thank You': { purchaseTier?: 'supporter' | 'tip' } | undefined
  'Import and Export': { source: 'backup_reminder' } | undefined
  MytimeImport: undefined
  NotesImportComposer: { hash?: string; fromOnboarding?: boolean } | undefined
  PreferencesPublisher: undefined
  PreferencesConversation: undefined
  PreferencesPlans: undefined
  PreferencesNavigation: undefined
  PreferencesAudioAndHaptics: undefined
  PreferencesHomeScreen: undefined
  PreferencesScheduleScreen: undefined
  PreferencesBackups: undefined
  PreferencesAppearance: undefined
  PreferencesPersonalization: undefined
  PreferencesWidgets: undefined
  PreferencesPrivacy: undefined
  PreferencesiCloud: undefined
  PreferencesAppIcon: undefined
  PreferencesColorKey: undefined
  PreferencesCustomFields: undefined
  RescheduleVisit: { contactId: string; visitId: string }
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
      minutes?: number
      note?: string
      title?: string
      location?: PlanLocation
      categoryId?: string
    }
    /** Starts a new plan as Recurring instead of One-Time. */
    recurring?: boolean
  }
  Rollover: undefined
  MilestoneShowcase: undefined
  FAQ: { scrollToCategory?: string } | undefined
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
  /** One buddy's profile, upcoming Plans, and remove action. */
  Buddy: { inboxId: string }
  /** In-person pairing: my single-use QR code, or a scanner for theirs. */
  'Buddy Code': { mode: 'code' | 'scan'; inviteId?: string }
  /** Pre-accept screen for an incoming Buddies invite link. */
  'Buddy Invite': { link: string }
  /** What buddies see, Buddies notifications, and delete-all. */
  'Buddies Settings': undefined
  /** Alpha explainer, opt-in diagnostics, and the Buddies feedback survey. */
  'Buddies Feedback': { source: 'badge' | 'card' | 'settings' } | undefined
}

/** Where the Service History editor was opened from (analytics). */
export type ServiceHistorySource =
  | 'year_tab'
  | 'year_row_menu'
  | 'add_earlier_year'
  | 'settings'

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>
