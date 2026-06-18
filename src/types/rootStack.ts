import { NativeStackNavigationProp } from '@react-navigation/native-stack'

export type RootStackParamList = {
  Root: undefined
  'Visit Form': {
    contactId?: string
    visitToEditId?: string
    notAtHome?: boolean
    fromContactForm?: boolean
  }
  'Contact Details': { id: string; highlightedVisitId?: string } // Contact ID
  'Contact Form': { id: string; edit?: boolean } // Contact ID
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
  Paywall: { initialTier?: 'supporter' | 'tip' } | undefined
  'Thank You': { purchaseTier?: 'supporter' | 'tip' } | undefined
  'Import and Export': undefined
  MytimeImport: undefined
  NotesImport: undefined
  PreferencesPublisher: undefined
  PreferencesConversation: undefined
  PreferencesPlans: undefined
  PreferencesNavigation: undefined
  PreferencesHomeScreen: undefined
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
}

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>
