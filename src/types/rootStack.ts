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

  initialText?: string
  inputSource?: 'voice' | 'keyboard' | 'photo' | 'paper'
  submitId?: string
  entry: ScribeRouteEntry
  focusComposer?: boolean

  draftText?: string

  paperPages?: { uri: string; width: number; height: number }[]
}

export interface ScribeVoiceRouteParams {
  entry: ScribeRouteEntry

  conversationId?: string
}

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

  NoteEditor: { sessionId: string }
  'Visit Form': {
    contactId?: string
    visitToEditId?: string
    notAtHome?: boolean
    fromContactForm?: boolean

    returnToContacts?: boolean

    returnOnSave?: boolean

    logVisit?: LogVisitAttribution

    overSheet?: boolean

    planFollowUp?: boolean

    followUpVisitId?: string
  }
  'Contact Details': {
    id: string
    highlightedVisitId?: string

    scrollY?: number
  }
  'Contact Form': {
    id: string
    edit?: boolean
    returnToContacts?: boolean
    initialCoordinate?: Coordinate

    name?: string

    logVisit?: LogVisitAttribution
  }

  'Log Visit': undefined
  'Add Time':
    | {
        date?: string
        hours?: number
        minutes?: number

        categoryId?: string

        note?: string
        noteDoc?: RichText

        existingReport?: string

        fromTimer?: boolean

        timerSessionStart?: number
      }
    | undefined
  'Recover Contacts': undefined
  'Dismissed Contacts': undefined
  'Contacts Sort And Filter': undefined

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

  'Visit Details': { visitId: string }

  'Follow-Up Invitation': BuddyShareRef

  'Going List': BuddyShareRef

  'Plan Details': {
    dayPlanId?: string
    recurringPlanId?: string

    date?: string
    share?: BuddyShareRef
  }
  PlanDay: {
    date?: string

    existingDayPlanId?: string
    existingRecurringPlanId?: string

    recurringPlanDate?: string

    prefill?: {
      startTime?: string

      anytime?: boolean
      minutes?: number
      note?: string
      noteDoc?: RichText
      title?: string
      location?: PlanLocation
      categoryId?: string

      buddies?: string[]

      notifyMe?: boolean
      reminderOffset?: {
        amount: number
        unit: moment.unitOfTime.DurationConstructor
      }

      recurrence?: {
        frequency: RecurringPlanFrequencies
        interval: number
        weekday: number
        weekOfMonth: number
        endDate?: string
      }
    }

    recurring?: boolean
  }
  Rollover: undefined

  TodayRoute:
    | {
        date?: string
        planId?: string
        newPlan?: boolean

        addContactIds?: string[]
      }
    | undefined
  MilestoneShowcase: undefined
  FAQ: { scrollToCategory?: string } | undefined

  ShareApp: undefined

  Account: undefined

  'Set Up Another Device': { entry?: 'settings' | 'tools' } | undefined

  'Account Devices': undefined

  'Account Activity': undefined

  'Sign In With QR Code':
    | { entry?: 'settings' | 'onboarding' | 'link' | 'tools'; link?: string }
    | undefined
  OpenSourceLicenses: undefined
  More: undefined
  ServiceReportView: { month: number; year: number }
  OnboardingBackfill: undefined
  ServiceHistory:
    | {
        serviceYear?: number
        source?: ServiceHistorySource
      }
    | undefined

  SettingsMenu: undefined

  Buddies: undefined

  Buddy: { inboxId: string }

  'Buddy Code': { mode: 'code' | 'scan'; inviteId?: string }

  'Buddy Invite': { link: string }

  'Buddies Settings': { inboxId?: string } | undefined

  'Buddies Feedback': { source: 'badge' | 'menu' | 'settings' } | undefined

  Mileage: undefined

  MileageTripForm:
    | { tripId?: string; duplicateOf?: string; source?: MileageSource }
    | undefined
  MileageTripDetails: { tripId: string }

  MileageSettings: undefined

  MileageVehicleForm:
    | { vehicleId?: string; thenLogTrip?: boolean; source?: MileageSource }
    | undefined
  MileageFuelForm: { fuelId?: string } | undefined

  PetPicker: { mode: 'adopt' | 'change'; species?: PetSpecies }

  PetRoom: { focus?: string } | undefined

  PetShop: { focus?: string; from?: 'room' | 'more' | 'menu' } | undefined

  PetRename: undefined

  PetSettings: undefined

  PetVisits: undefined

  PetShare: undefined

  Badges: { source?: BadgesSource } | undefined

  BuddyBadges: { inboxId: string }

  BadgeView: {
    badgeKey: string
    owner: BadgeOwner
    origin?: BadgeViewOrigin

    isNew?: boolean

    locked?: boolean
  }
}

export type BadgeOwner = 'me' | { inboxId: string }

export type BadgeViewOrigin = {
  x: number
  y: number
  size: number

  returns?: boolean
}

export type BadgesSource =
  | 'profile_overlay'
  | 'profile_card'
  | 'celebration'
  | 'welcome'
  | 'settings'
  | 'other'

export type LogVisitPickedFrom =
  | 'nearby'
  | 'followUpsDue'
  | 'recent'
  | 'beenAWhile'
  | 'all'
  | 'search'
  | 'new_contact'

export type LogVisitAttribution = {
  source: 'quick_action'
  picked_from: LogVisitPickedFrom

  nearby_shown: boolean
}

export type MileageSource =
  | 'home_prompt'
  | 'home_section'
  | 'quick_action'
  | 'mileage_screen'
  | 'mileage_settings'
  | 'trip_menu'

export type ServiceHistorySource =
  | 'year_row_menu'
  | 'add_earlier_year'
  | 'settings'
  | 'streak'

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>
