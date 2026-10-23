import useFormValidation from '@/hooks/useFormValidation'
import { Alert, View } from 'react-native'
import { noteUserAction } from '@/lib/userAction'
import { richTextImages } from '@/lib/richText/inspect'
import {
  getNoteDoc,
  hasNote,
  noteFields,
  type NoteUpdate,
} from '@/lib/richText/notes'
import { Ref, useEffect, useImperativeHandle, useState } from 'react'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import useServiceReport from '@/stores/serviceReport'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import {
  normalizeDateForStorage,
  storedDateToLocalDate,
} from '@/lib/normalizeDate'
import { TimeEntry } from '@/types/timeEntry'
import type { RichText } from '@/types/richText'
import type { RootStackParamList } from '@/types/rootStack'
import i18n from '@/lib/locales'
import DockedFormLayout from '@/components/ui/layout/DockedFormLayout'
import FormDetailsSection from '@/components/ui/inputs/FormDetailsSection'
import Section from '@/components/ui/inputs/Section'
import NoteFormRow from '@/components/ui/inputs/NoteFormRow'
import TypeFormRow from '@/components/TypeFormRow'
import WhenDock from '@/components/WhenDock'
import { usePreferences } from '@/stores/preferences'
import useCategories from '@/stores/categories'
import {
  CUSTOM_TYPE_VALUE,
  STANDARD_TYPE_VALUE,
  type TypeSelection,
} from '@/components/TypeSelectorRow'
import { toast } from '@/stores/toasts'
import Button from '@/components/ui/Button'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  getReport,
  getTotalMinutesForServiceYear,
  timeEntryMode,
} from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'
import useAnimation from '@/hooks/useAnimation'
import Haptics from '@/lib/haptics'
import { CONFETTI_DELAY_MS } from '@/providers/AnimationViewProvider'
import useCelebrationQueue from '@/features/service-reports/stores/celebrationQueue'
import { didCrossMonthlyGoal } from '@/features/service-reports/lib/monthlyGoalCelebration'
import { resolveMonthlyGoalHours } from '@/lib/monthlyGoals'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { analytics } from '@/lib/analytics'
import { calendarMonthOf, roleForMonth } from '@/lib/roleHistory'
import { serviceYearOf } from '@/lib/serviceYear'
import useDraftChanged from '@/hooks/useDraftChanged'
import usePublisher from '@/hooks/usePublisher'
import { timeSavedProgress } from '@/features/service-reports/lib/timeSavedProgress'

/** What a new entry starts with, e.g. a Plan's length and Type to log. */
export type TimeEntryPrefill = {
  date?: Date
  hours?: number
  minutes?: number
  /** Seeds a new entry's Type, when that Category still exists. */
  categoryId?: string
  note?: string
  noteDoc?: RichText
}

/** Reads a new entry's form as it stands, to carry it to Add Time. */
export type TimeEntryDraft = {
  params: () => NonNullable<RootStackParamList['Add Time']>
}

type Props = TimeEntryPrefill & {
  /** The entry to change. A new one is made when absent. */
  existingReport?: TimeEntry
  /**
   * Where the form is, for analytics: the Add Time screen, or a day's split
   * sheet (Schedule, Home, Progress).
   */
  source: 'time_entry_form' | 'day_sheet'
  /** The entry was submitted, saved, or deleted. */
  onDone: () => void
  /** Whether the entry now differs from what the form opened with. */
  onChangedChange?: (changed: boolean) => void
  /**
   * `inline` sits within a page, e.g. a day's list with no time logged yet: the
   * Time pill, then Note and Type, then Submit, for that day only.
   */
  layout?: 'docked' | 'inline'
  /** Set to read the form's new entry as it stands, e.g. to expand it. */
  draftRef?: Ref<TimeEntryDraft>
}

/**
 * Add Time's form: a Details list (Note, Type) above a dock with the Date and
 * Time pills and Submit. The Add Time screen hosts it, and so does a day's
 * split sheet, so time for a day is entered without leaving it; a day with no
 * time yet shows it inline.
 */
const TimeEntryForm = (props: Props) => {
  const theme = useTheme()
  const {
    role: currentRole,
    roleHistory,
    publisherHours,
    monthlyGoalOverrides,
    overrideCreditLimit,
    customCreditLimitHours,
    timeDisplayFormat,
  } = usePreferences()
  const { playConfetti } = useAnimation()
  const { categories } = useCategories()

  const {
    addServiceReport,
    serviceReports,
    updateServiceReport,
    deleteServiceReport,
  } = useServiceReport()
  const existingServiceReport = getReport(serviceReports, props.existingReport)

  // A new entry seeded with a Type (e.g. logging a Plan as time) — only when
  // that Category still exists.
  const prefillCategory =
    !existingServiceReport && props.categoryId
      ? categories.find((c) => c.id === props.categoryId)
      : undefined

  // Initial picker value: the referenced Category id (post-migration), else
  // fall back to legacy `tag` string for unmigrated entries, else Standard.
  // LDC is no longer special-cased — entries that point at the LDC builtin
  // Category id pick it up here like any other Category.
  const initialPickerValue: string = (() => {
    if (prefillCategory) return prefillCategory.id
    if (existingServiceReport?.report.categoryId) {
      return existingServiceReport.report.categoryId
    }
    if (existingServiceReport?.report.tag) {
      // Try to resolve by name — entries that pre-date the migration but the
      // user added a Category with the same name will collapse onto it.
      const match = categories.find(
        (c) => c.name === existingServiceReport.report.tag
      )
      if (match) return match.id
      return existingServiceReport.report.tag
    }
    return STANDARD_TYPE_VALUE
  })()

  const [selectedValue, setSelectedValue] = useState<string>(initialPickerValue)
  const [serviceReport, setServiceReport] = useState<TimeEntry>({
    id: existingServiceReport?.report.id ?? Crypto.randomUUID(),
    hours: existingServiceReport?.report.hours || props.hours || 0,
    minutes: existingServiceReport?.report.minutes ?? (props.minutes || 0),
    date: existingServiceReport
      ? storedDateToLocalDate(existingServiceReport.report.date)
      : moment(props.date).toDate(),
    credit:
      existingServiceReport?.report.credit ??
      prefillCategory?.isCredit ??
      false,
    categoryId: existingServiceReport?.report.categoryId ?? prefillCategory?.id,
    note: existingServiceReport
      ? existingServiceReport.report.note
      : props.note,
    noteDoc: existingServiceReport
      ? existingServiceReport.report.noteDoc
      : props.noteDoc,
  })
  const validation = useFormValidation(
    {
      duration: serviceReport.hours * 60 + serviceReport.minutes <= 0,
      category: selectedValue === CUSTOM_TYPE_VALUE,
    },
    'time_entry'
  )
  // The entry's month decides whose goal its confirmation counts toward.
  const { hasAnnualGoal, annualGoalHours } = usePublisher(
    calendarMonthOf(serviceReport.date)
  )

  // Maps the Type row's report back onto the in-progress entry. The row owns
  // the Category-store side (create/delete/credit-flip + global re-stamp);
  // the entry only records the reference and the legacy `credit` stamp.
  const handleTypeChange = ({ value, category }: TypeSelection) => {
    setSelectedValue(value)
    setServiceReport({
      ...serviceReport,
      categoryId: category?.id,
      tag: undefined,
      credit: category?.isCredit ?? false,
    })
  }

  const setDate = (date: Date) => {
    setServiceReport({
      ...serviceReport,
      date,
    })
  }

  const setDuration = (hours: number, minutes: number) => {
    setServiceReport({
      ...serviceReport,
      hours,
      minutes,
    })
  }

  // Functional: the note editor calls this after other fields may have moved.
  const setNote = (note: NoteUpdate) =>
    setServiceReport((current) => ({ ...current, ...note }))
  /** The entry as it saves, with its note normalized. */
  const savedEntry = (): TimeEntry => ({
    ...serviceReport,
    ...noteFields(getNoteDoc(serviceReport)),
  })
  useImperativeHandle(props.draftRef, () => ({
    params: () => {
      const entry = savedEntry()
      return {
        date: entry.date.toISOString(),
        hours: entry.hours,
        minutes: entry.minutes,
        categoryId: entry.categoryId,
        note: entry.note,
        noteDoc: entry.noteDoc,
      }
    },
  }))
  const changed = useDraftChanged({ entry: savedEntry(), selectedValue })
  const { onChangedChange } = props
  useEffect(() => {
    onChangedChange?.(changed)
  }, [changed, onChangedChange])
  const noteAnalytics = (entry: TimeEntry) => ({
    has_note: hasNote(entry),
    has_formatting: !!entry.noteDoc,
    note_photos: entry.noteDoc ? richTextImages(entry.noteDoc.doc).length : 0,
  })

  const submit = () => {
    if (!validation.validate()) return
    playConfetti()
    Haptics.heavy()
    setTimeout(() => {
      Haptics.success()
    }, CONFETTI_DELAY_MS + 100)

    // Multi-burst Skia fireworks on the Progress month tab are reserved for
    // *crossing* the monthly goal — the moment the report's target month
    // goes from below goal to at-or-above goal. Adding more time after the
    // goal is already met (or adding time that doesn't reach goal) doesn't
    // queue anything, so the fireworks don't fire on every submission. The
    // queue is keyed by `(month, year)` so it only pops when the user is
    // actually viewing the month they crossed.
    const reportMoment = moment(serviceReport.date)
    const reportMonth = reportMoment.month()
    const reportYear = reportMoment.year()
    const goalTarget = { month: reportMonth, year: reportYear }
    // The entry's month is judged by the role that applied then.
    const role = roleForMonth(roleHistory, currentRole, goalTarget)
    const effectiveGoalHours = resolveMonthlyGoalHours(
      publisherHours[role],
      monthlyGoalOverrides,
      goalTarget
    )
    const creditOverride = {
      enabled: overrideCreditLimit,
      customLimitHours: customCreditLimitHours,
    }
    const beforeReports = getMonthsReports(
      serviceReports,
      reportMonth,
      reportYear
    )
    const beforeMinutes = adjustedMinutesForSpecificMonth(
      beforeReports,
      reportMonth,
      reportYear,
      role,
      creditOverride
    ).value
    // Month math reads stored anchors; the form holds a local day, which at
    // UTC+12 (local midnight == noon UTC) would read as the prior day.
    const afterMinutes = adjustedMinutesForSpecificMonth(
      [
        ...beforeReports,
        {
          ...serviceReport,
          date: normalizeDateForStorage(serviceReport.date),
        },
      ],
      reportMonth,
      reportYear,
      role,
      creditOverride
    ).value
    const crossedGoal = didCrossMonthlyGoal({
      beforeMinutes,
      afterMinutes,
      baseGoalHours: publisherHours[role],
      monthlyGoalOverrides,
      target: goalTarget,
    })
    if (crossedGoal) {
      useCelebrationQueue.getState().queue(reportMonth, reportYear)
    }

    // The confirmation counts toward the Annual Goal when the User has one,
    // else the month's goal. Only the entry's month changes, so the Service
    // Year moves by the month's capped difference.
    const yearly = hasAnnualGoal && annualGoalHours > 0
    const yearBeforeMinutes = yearly
      ? getTotalMinutesForServiceYear(
          getServiceYearReports(serviceReports, serviceYearOf(goalTarget)),
          serviceYearOf(goalTarget),
          (target) => roleForMonth(roleHistory, currentRole, target),
          creditOverride
        )
      : 0
    const progress = timeSavedProgress({
      addedMinutes: serviceReport.hours * 60 + serviceReport.minutes,
      beforeMinutes: yearly ? yearBeforeMinutes : beforeMinutes,
      afterMinutes: yearly
        ? yearBeforeMinutes + afterMinutes - beforeMinutes
        : afterMinutes,
      goalMinutes: (yearly ? annualGoalHours : effectiveGoalHours) * 60,
      period: yearly ? 'serviceYear' : 'month',
      entryMonth: goalTarget,
      format: timeDisplayFormat,
    })

    noteUserAction('time')
    const entry = savedEntry()
    addServiceReport(entry)
    analytics.capture('time_entry_created', {
      source: props.source,
      entry_mode: timeEntryMode(entry),
      has_category: !!entry.categoryId,
      ...noteAnalytics(entry),
    })
    toast.success(progress.added, { message: progress.progress })
    props.onDone()
  }

  const save = () => {
    if (!validation.validate()) return
    noteUserAction('time')
    const entry = savedEntry()
    updateServiceReport(entry)
    analytics.capture('time_entry_updated', {
      source: props.source,
      entry_mode: timeEntryMode(entry),
      has_category: !!entry.categoryId,
      ...noteAnalytics(entry),
    })
    toast.success(i18n.t('success'), {
      message: i18n.t('updated'),
    })

    props.onDone()
  }

  const handleRequestDelete = () => {
    Alert.alert(i18n.t('deleteTime_title'), i18n.t('deleteTime_description'), [
      {
        text: i18n.t('cancel'),
        style: 'cancel',
      },
      {
        text: i18n.t('delete'),
        style: 'destructive',
        onPress: () => {
          deleteServiceReport(serviceReport)
          analytics.capture('time_entry_deleted', {
            source: props.source,
            entry_mode: timeEntryMode(serviceReport),
          })
          toast.success(i18n.t('success'), {
            message: i18n.t('deleted'),
          })
          props.onDone()
        },
      },
    ])
  }

  // Custom is a transient picker state — until the user names the Category,
  // we don't have anything to attach the entry to.
  const hasSelectedCategory = selectedValue !== CUSTOM_TYPE_VALUE
  // A timer stopped before a minute passed hands over less than a minute.
  const providedLessThanOneMinute =
    !props.hours &&
    props.minutes !== undefined &&
    props.minutes < 1 &&
    serviceReport.hours === 0 &&
    serviceReport.minutes < 1

  const saveButton = (
    <ActionButton
      onPress={existingServiceReport ? save : submit}
      testID='time-entry-save'
    >
      {i18n.t(existingServiceReport ? 'save' : 'submit')}
    </ActionButton>
  )

  const inline = props.layout === 'inline'

  const dock = (
    <WhenDock
      durationInvalid={validation.invalid('duration')}
      testID='time-entry'
      date={serviceReport.date}
      setDate={setDate}
      hours={serviceReport.hours}
      minutes={serviceReport.minutes}
      setDuration={setDuration}
      durationLabel={i18n.t('time')}
      maxHours={99}
      minuteStep={1}
      notice={
        providedLessThanOneMinute && (
          <Text style={{ color: theme.colors.warnText }}>
            {i18n.t('providedTimeIsLessThanOneMinute')}
          </Text>
        )
      }
      saveButton={inline ? null : saveButton}
      inline={inline}
      hideDate={inline}
    />
  )

  // Keyed rows rather than a fragment: Section lays out each child as a row.
  const detailRows = [
    <NoteFormRow
      key='note'
      first
      note={serviceReport}
      onChange={setNote}
      surface='time_entry'
      maxLength={500}
      testID='time-entry-note'
    />,
    <TypeFormRow
      invalid={validation.invalid('category')}
      key='type'
      value={selectedValue}
      onChange={handleTypeChange}
      hint={hasSelectedCategory ? undefined : i18n.t('categoryNeeded')}
    />,
  ]

  if (inline) {
    return (
      <View style={{ gap: 12 }}>
        {dock}
        <Section>{detailRows}</Section>
        {saveButton}
      </View>
    )
  }

  return (
    <DockedFormLayout
      dock={dock}
      contentContainerStyle={{
        flexGrow: 1,
        // The details sit just above the dock, near the thumb, rather
        // than at the top of a tall screen.
        justifyContent: 'flex-end',
        gap: 12,
        paddingTop: 10,
        paddingBottom: 16,
        paddingHorizontal: inputLayout.horizontalPadding,
        width: '100%',
        maxWidth: inputLayout.contentMaxWidth,
        alignSelf: 'center',
      }}
    >
      <FormDetailsSection>{detailRows}</FormDetailsSection>
      {existingServiceReport && (
        <Button
          noTransform
          onPress={handleRequestDelete}
          accessibilityRole='button'
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              color: theme.colors.error,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('md'),
            }}
          >
            {i18n.t('deleteEllipsis')}
          </Text>
        </Button>
      )}
    </DockedFormLayout>
  )
}

export default TimeEntryForm
