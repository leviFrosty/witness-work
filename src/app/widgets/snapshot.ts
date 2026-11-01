import { Contact } from '@/types/contact'
import { Visit } from '@/types/visit'
import { StalenessBreakpoints } from '@/types/staleness'
import { Publisher, PublisherHours } from '@/types/publisher'
import type { MonthlyGoalOverrides } from '@/lib/monthlyGoals'
import {
  DayPlan,
  MinuteDisplayFormat,
  TimeEntriesByYear,
} from '@/types/timeEntry'
import { RecurringPlan } from '@/lib/serviceReport'
import {
  DefaultNavigationMapProvider,
  WidgetAppointmentWindow,
  WidgetContactAction,
  WidgetContactSort,
} from '@/stores/preferences'
import moment from 'moment'
import i18n from '@/lib/locales'
import { buildReport, ReportFields } from '@/app/widgets/buildReport'
import { buildContacts, WidgetContact } from '@/app/widgets/buildContacts'
import {
  buildAppointments,
  WidgetAppointment,
} from '@/app/widgets/buildAppointments'
import { buildCalendar, WidgetCalendar } from '@/app/widgets/buildCalendar'
import type { PetWidgetSnapshot } from '@/app/widgets/petWidget'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'
import type { NativeLocale } from '@/lib/nativeLocale'

export const SNAPSHOT_VERSION = 6

export type WidgetStrings = {
  monthHoursLabel: string
  goalLabel: string
  addTimeLabel: string
  sharedGoodNewsLabel: string
  aheadOfScheduleLabel: string
  behindScheduleLabel: string
  encouragementPhrase: string

  monthLabel: string

  reportedTodayLabel: string
  conversationsThisMonthLabel: string
  studiesThisMonthLabel: string

  contactsLabel: string
  noContactsLabel: string
  callLabel: string
  textLabel: string
  directionsLabel: string

  appointmentsLabel: string
  todaysConversationsLabel: string
  upcomingConversationsLabel: string
  noAppointmentsLabel: string
  tomorrowLabel: string

  overdueLabel: string
  rescheduleLabel: string
  markCompleteLabel: string

  calendarLabel: string

  calendarPublisherLockedLabel: string

  createPlanLabel: string

  reportLabel: string

  timerLabel: string

  petPlaceholderLabel: string
}

export type WidgetConfig = {
  contactSort: WidgetContactSort

  contactAction: WidgetContactAction

  appointmentWindow: WidgetAppointmentWindow
}

export type WidgetNextMonth = {
  builtOn: string
  report: ReportFields
  calendar: WidgetCalendar
}

export type WidgetSnapshot = {
  version: number

  updatedAt: number

  builtOn: string

  locale: string

  rtl: NativeLocale['rtl']

  numberLocale: NativeLocale['numberLocale']

  accentColor: string | null

  strings: WidgetStrings

  config: WidgetConfig

  report: ReportFields

  contacts: WidgetContact[]

  appointments: WidgetAppointment[]

  calendar: WidgetCalendar

  pet: PetWidgetSnapshot | null

  nextMonth: WidgetNextMonth
}

export type BuildSnapshotArgs = {
  serviceReports: TimeEntriesByYear
  publisher: Publisher

  nextMonthPublisher: Publisher

  logsHours: boolean
  publisherHours: PublisherHours
  monthlyGoalOverrides: MonthlyGoalOverrides
  overrideCreditLimit: boolean
  customCreditLimitHours: number
  timeDisplayFormat: MinuteDisplayFormat
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]

  contacts: Contact[]
  conversations: Visit[]
  defaultNavigationMapProvider: DefaultNavigationMapProvider
  defaultPhoneRegionCode: string

  stalenessBreakpoints: StalenessBreakpoints

  widgetContactSort: WidgetContactSort
  widgetContactAction: WidgetContactAction
  widgetAppointmentWindow: WidgetAppointmentWindow

  startOfWeek: number

  buddyMarkers: Record<string, BuddyDayMarker>

  locale: string

  nativeLocale: NativeLocale

  accentColor: string | null

  pet: PetWidgetSnapshot | null
}

export function buildWidgetSnapshot(args: BuildSnapshotArgs): WidgetSnapshot {
  const now = moment()
  const nextMonthStart = now.clone().add(1, 'month').startOf('month')

  const reportFor = (publisher: Publisher, at: moment.Moment) =>
    buildReport(
      {
        serviceReports: args.serviceReports,
        publisher,
        publisherHours: args.publisherHours,
        monthlyGoalOverrides: args.monthlyGoalOverrides,
        overrideCreditLimit: args.overrideCreditLimit,
        customCreditLimitHours: args.customCreditLimitHours,
        timeDisplayFormat: args.timeDisplayFormat,
        dayPlans: args.dayPlans,
        recurringPlans: args.recurringPlans,
        contacts: args.contacts,
        conversations: args.conversations,
      },
      at
    )
  const calendarFor = (publisher: Publisher, at: moment.Moment) =>
    buildCalendar(
      {
        serviceReports: args.serviceReports,
        dayPlans: args.dayPlans,
        recurringPlans: args.recurringPlans,
        publisher,
        logsHours: args.logsHours,
        startOfWeek: args.startOfWeek,
        buddyMarkers: args.buddyMarkers,
      },
      at
    )

  const report = reportFor(args.publisher, now)

  const contacts = buildContacts({
    contacts: args.contacts,
    conversations: args.conversations,
    defaultNavigationMapProvider: args.defaultNavigationMapProvider,
    defaultPhoneRegionCode: args.defaultPhoneRegionCode,
    sort: args.widgetContactSort,
    stalenessBreakpoints: args.stalenessBreakpoints,
  })

  const appointments = buildAppointments({
    contacts: args.contacts,
    conversations: args.conversations,
  })

  const calendar = calendarFor(args.publisher, now)

  return {
    version: SNAPSHOT_VERSION,
    updatedAt: now.valueOf(),
    builtOn: now.format('YYYY-MM-DD'),
    locale: args.locale,
    rtl: args.nativeLocale.rtl,
    numberLocale: args.nativeLocale.numberLocale,
    accentColor: args.accentColor,
    strings: {
      monthHoursLabel: i18n.t('hours'),
      goalLabel: i18n.t('goal'),
      addTimeLabel: i18n.t('addTime'),
      sharedGoodNewsLabel: i18n.t('sharedTheGoodNews').replace(/\n/g, ' '),
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

      calendarLabel: i18n.t('calendar'),
      calendarPublisherLockedLabel: i18n.t('calendarPublisherLocked'),
      createPlanLabel: i18n.t('createPlan'),

      reportLabel: i18n.t('widgetReportLabel'),
      timerLabel: i18n.t('timer'),

      petPlaceholderLabel: i18n.t('pet.widgetPlaceholder'),
    },
    config: {
      contactSort: args.widgetContactSort,
      contactAction: args.widgetContactAction,
      appointmentWindow: args.widgetAppointmentWindow,
    },
    report,
    contacts,
    appointments,
    calendar,
    pet: args.pet,
    nextMonth: {
      builtOn: nextMonthStart.format('YYYY-MM-DD'),
      report: reportFor(args.nextMonthPublisher, nextMonthStart),
      calendar: calendarFor(args.nextMonthPublisher, nextMonthStart),
    },
  }
}
