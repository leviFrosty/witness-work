import { Contact } from '../../types/contact'
import { Conversation } from '../../types/conversation'
import { Publisher, PublisherHours } from '../../types/publisher'
import {
  DayPlan,
  MinuteDisplayFormat,
  ServiceReportsByYears,
} from '../../types/serviceReport'
import { RecurringPlan } from '../serviceReport'
import {
  DefaultNavigationMapProvider,
  WidgetAppointmentWindow,
  WidgetContactAction,
  WidgetContactSort,
} from '../../stores/preferences'
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
 * pre-translated strings for all 3 widgets. 3 — adds
 * favorites/staleness/lastContactedRelative on contacts; drops isBibleStudy
 * from appointments and adds isOverdue/timeFormatted; adds
 * today/week/publisher-state fields to report; adds top-level config block
 * driven by Settings > Widgets. 4 — Report widget is always-month. Drops
 * today/week minute fields and the todayLabel/weekLabel strings. Drops
 * `startOfWeek` from BuildSnapshotArgs.
 */
export const SNAPSHOT_VERSION = 4

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
  /** Eyebrow label above the Report widget's progress bar. */
  monthLabel: string
  /** Publisher state copy. */
  reportedTodayLabel: string
  conversationsThisMonthLabel: string
  studiesThisMonthLabel: string

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
  tomorrowLabel: string
  /** Reschedule sheet copy. */
  overdueLabel: string
  rescheduleLabel: string
  markCompleteLabel: string
}

export type WidgetConfig = {
  /** Source-of-truth for the contacts widget sort. */
  contactSort: WidgetContactSort
  /** Source-of-truth for the contacts widget quick action per row. */
  contactAction: WidgetContactAction
  /** Source-of-truth for the appointments widget time window. */
  appointmentWindow: WidgetAppointmentWindow
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
  /**
   * Widget configuration sourced from in-app Settings > Widgets. App Intents
   * are deliberately not used as a configuration source — settings is the only
   * place users tune widget behavior.
   */
  config: WidgetConfig
  /** Hours/checkbox card data. Mode branches on publisher type. */
  report: ReportFields
  /**
   * Contacts ordered by the user's selected sort with favorites and bible
   * studies tiered to the top. The widget renders 1/4/8 per family.
   */
  contacts: WidgetContact[]
  /**
   * Follow-ups in the widest configurable window (30d back through 30d
   * forward). Overdue come first; the widget further narrows by
   * `appointmentWindow`.
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

  // Widget configuration (source of truth = preferences)
  widgetContactSort: WidgetContactSort
  widgetContactAction: WidgetContactAction
  widgetAppointmentWindow: WidgetAppointmentWindow

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
    conversations: args.conversations,
  })

  const contacts = buildContacts({
    contacts: args.contacts,
    conversations: args.conversations,
    defaultNavigationMapProvider: args.defaultNavigationMapProvider,
    defaultPhoneRegionCode: args.defaultPhoneRegionCode,
    sort: args.widgetContactSort,
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
      monthLabel: i18n.t('month'),
      reportedTodayLabel: i18n.t('reportedToday'),
      conversationsThisMonthLabel: i18n.t('conversationsThisMonth'),
      studiesThisMonthLabel: i18n.t('studiesThisMonth'),

      contactsLabel: i18n.t('contacts'),
      noContactsLabel: i18n.t('noContactsYet'),
      callLabel: i18n.t('call'),
      textLabel: i18n.t('text'),
      directionsLabel: i18n.t('directions'),

      appointmentsLabel: i18n.t('appointments'),
      todaysConversationsLabel: i18n.t('todaysConversations'),
      upcomingConversationsLabel: i18n.t('upcomingConversations'),
      noAppointmentsLabel: i18n.t('noUpcomingAppointments'),
      tomorrowLabel: i18n.t('tomorrow'),
      overdueLabel: i18n.t('overdue'),
      rescheduleLabel: i18n.t('reschedule'),
      markCompleteLabel: i18n.t('markComplete'),
    },
    config: {
      contactSort: args.widgetContactSort,
      contactAction: args.widgetContactAction,
      appointmentWindow: args.widgetAppointmentWindow,
    },
    report,
    contacts,
    appointments,
  }
}
