import { NativeStackNavigationProp } from '@react-navigation/native-stack'

export type RootStackParamList = {
  Root: undefined
  'Conversation Form': {
    contactId?: string
    conversationToEditId?: string
    notAtHome?: boolean
    fromContactForm?: boolean
  }
  'Contact Details': { id: string; highlightedConversationId?: string } // Contact ID
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
  Donate: undefined
  Paywall: { initialTier?: 'supporter' | 'tip' } | undefined
  'Thank You': undefined
  'Import and Export': undefined
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
  PreferencesCustomFields: undefined
  RescheduleConversation: { contactId: string; conversationId: string }
  PlanSchedule: { month: number; year: number }
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
  FAQ: undefined
  More: undefined
  ServiceReportView: { month: number; year: number }
  ServiceYearCatchUp: undefined
}

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>
