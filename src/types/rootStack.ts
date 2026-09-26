import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Coordinate } from '@/types/contact'

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
}

/** Where the Service History editor was opened from (analytics). */
export type ServiceHistorySource = 'year_tab' | 'add_earlier_year' | 'settings'

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>
