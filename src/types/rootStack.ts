import { NativeStackNavigationProp } from '@react-navigation/native-stack'

export type RootStackParamList = {
  Root: undefined
  'Conversation Form': {
    contactId?: string
    conversationToEditId?: string
    notAtHome?: boolean
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
  Onboarding: undefined
  Update: undefined
  Preferences: undefined
  'Whats New': undefined
  Donate: undefined
  Paywall: undefined
  'Thank You': undefined
  'Import and Export': undefined
  PreferencesPublisher: undefined
  PreferencesConversation: undefined
  PreferencesNavigation: undefined
  PreferencesHomeScreen: undefined
  PreferencesBackups: undefined
  PreferencesAppearance: undefined
  PlanSchedule: { month: number; year: number }
  PlanDay: { date?: string }
}

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>
