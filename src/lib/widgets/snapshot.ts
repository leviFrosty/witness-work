import { Contact } from '../../types/contact'
import { Conversation } from '../../types/conversation'
import { Publisher, PublisherHours } from '../../types/publisher'
import {
  DayPlan,
  MinuteDisplayFormat,
  ServiceReportsByYears,
} from '../../types/serviceReport'
import { RecurringPlan } from '../serviceReport'
import { DefaultNavigationMapProvider } from '../../stores/preferences'
import i18n from '../locales'
import { buildReport, ReportFields } from './buildReport'
import { buildContacts, WidgetContact } from './buildContacts'
import { buildAppointments, WidgetAppointment } from './buildAppointments'

/**
 * Bumped whenever the snapshot shape changes in a way the Swift decoder cares
 * about. Swift compares this and refuses to render stale shapes.
 *
 * History: 1 — initial stub: { hours, strings: {monthHoursLabel, goalLabel} } 2
 * — adds report (hours/checkbox modes), contacts[], appointments[], and
 * pre-translated strings for all 3 widgets.
 */
export const SNAPSHOT_VERSION = 2

export type WidgetStrings = {
  // Report widget
  monthHoursLabel: string
  goalLabel: string
  addTimeLabel: string
  sharedGoodNewsLabel: string
  hoursPerDayToGoalSuffix: string
  aheadOfScheduleLabel: string
  behindScheduleLabel: string
  encouragementPhrase: string

  // Contacts widget
  contactsLabel: string
  noContactsLabel: string
  callLabel: string
  textLabel: string
  directionsLabel: string

  // Appointments widget
  appointmentsLabel: string
  todaysConversationsLabel: string
  upcomingConversationsLabel: string
  noAppointmentsLabel: string
  todayLabel: string
  tomorrowLabel: string
}

export type WidgetSnapshot = {
  version: number
  /** Epoch ms when the snapshot was produced. */
  updatedAt: number
  /** App locale at write time, e.g. 'en-us'. */
  locale: string
  /**
   * Pre-translated display strings. The widget never calls i18n; the JS side
   * resolves every label and writes the result so SwiftUI can render the user's
   * chosen locale without duplicating translation infrastructure.
   */
  strings: WidgetStrings
  /** Hours/checkbox card data. Mode branches on publisher type. */
  report: ReportFields
  /**
   * Top contacts by user-selected sort. Always written from the same source
   * order; the widget App Intent picks N for its family.
   */
  contacts: WidgetContact[]
  /**
   * Upcoming follow-ups within the widest configurable window (30 days). The
   * widget App Intent narrows this client-side.
   */
  appointments: WidgetAppointment[]
}

export type BuildSnapshotArgs = {
  // Report inputs
  serviceReports: ServiceReportsByYears
  publisher: Publisher
  publisherHours: PublisherHours
  overrideCreditLimit: boolean
  customCreditLimitHours: number
  timeDisplayFormat: MinuteDisplayFormat
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]

  // Contacts/appointments inputs
  contacts: Contact[]
  conversations: Conversation[]
  defaultNavigationMapProvider: DefaultNavigationMapProvider
  defaultPhoneRegionCode: string

  // Locale
  locale: string
}

export function buildWidgetSnapshot(args: BuildSnapshotArgs): WidgetSnapshot {
  const report = buildReport({
    serviceReports: args.serviceReports,
    publisher: args.publisher,
    publisherHours: args.publisherHours,
    overrideCreditLimit: args.overrideCreditLimit,
    customCreditLimitHours: args.customCreditLimitHours,
    timeDisplayFormat: args.timeDisplayFormat,
    dayPlans: args.dayPlans,
    recurringPlans: args.recurringPlans,
  })

  const contacts = buildContacts({
    contacts: args.contacts,
    conversations: args.conversations,
    defaultNavigationMapProvider: args.defaultNavigationMapProvider,
    defaultPhoneRegionCode: args.defaultPhoneRegionCode,
  })

  const appointments = buildAppointments({
    contacts: args.contacts,
    conversations: args.conversations,
  })

  return {
    version: SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    locale: args.locale,
    strings: {
      monthHoursLabel: i18n.t('hours'),
      goalLabel: i18n.t('goal'),
      addTimeLabel: i18n.t('addTime'),
      sharedGoodNewsLabel: i18n.t('sharedTheGoodNews').replace(/\n/g, ' '),
      hoursPerDayToGoalSuffix: i18n.t('hoursPerDayToGoal'),
      aheadOfScheduleLabel: i18n.t('aheadOfSchedule'),
      behindScheduleLabel: i18n.t('behindSchedule'),
      encouragementPhrase: report.encouragementPhrase,

      contactsLabel: i18n.t('contacts'),
      noContactsLabel: i18n.t('noContactsYet'),
      callLabel: i18n.t('call'),
      textLabel: i18n.t('text'),
      directionsLabel: i18n.t('directions'),

      appointmentsLabel: i18n.t('appointments'),
      todaysConversationsLabel: i18n.t('todaysConversations'),
      upcomingConversationsLabel: i18n.t('upcomingConversations'),
      noAppointmentsLabel: i18n.t('noUpcomingAppointments'),
      todayLabel: i18n.t('today'),
      tomorrowLabel: i18n.t('tomorrow'),
    },
    report,
    contacts,
    appointments,
  }
}
