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
import useFormAtTopOnWeb from '@/hooks/useFormAtTopOnWeb'
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
import { measureReward } from '@/lib/actionRewards'
import DockedFormLayout from '@/components/ui/layout/DockedFormLayout'
import { useCardStyle } from '@/components/ui/Card'
import TypeFormRow from '@/components/TypeFormRow'
import { useOpenNoteEditor } from '@/hooks/useOpenNoteEditor'
import { useFormattedMinutes } from '@/lib/minutes'
import { entryMinutes } from '@/lib/entryMinutes'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DurationInput, {
  type DurationInputMethod,
} from '@/features/service-reports/components/DurationInput'
import DetailRow from '@/features/service-reports/components/DetailRow'
import EntryDateRow from '@/features/service-reports/components/EntryDateRow'
import MonthPreview from '@/features/service-reports/components/MonthPreview'
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

export type TimeEntryPrefill = {
  date?: Date
  hours?: number
  minutes?: number

  categoryId?: string
  note?: string
  noteDoc?: RichText
}

export type TimeEntryDraft = {
  params: () => NonNullable<RootStackParamList['Add Time']>
}

type Props = TimeEntryPrefill & {
  existingReport?: TimeEntry

  source: 'time_entry_form' | 'day_sheet'

  onDone: () => void

  onChangedChange?: (changed: boolean) => void

  layout?: 'docked' | 'inline'

  draftRef?: Ref<TimeEntryDraft>
}

const TimeEntryForm = (props: Props) => {
  const formAtTop = useFormAtTopOnWeb()
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const insets = useSafeAreaInsets()
  const openNote = useOpenNoteEditor()
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

  const prefillCategory =
    !existingServiceReport && props.categoryId
      ? categories.find((c) => c.id === props.categoryId)
      : undefined

  const initialPickerValue: string = (() => {
    if (prefillCategory) return prefillCategory.id
    if (existingServiceReport?.report.categoryId) {
      return existingServiceReport.report.categoryId
    }
    if (existingServiceReport?.report.tag) {
      const match = categories.find(
        (c) => c.name === existingServiceReport.report.tag
      )
      if (match) return match.id
      return existingServiceReport.report.tag
    }
    return STANDARD_TYPE_VALUE
  })()

  const [selectedValue, setSelectedValue] = useState<string>(initialPickerValue)

  const [durationInput, setDurationInput] = useState<DurationInputMethod>()
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

  const { hasAnnualGoal, annualGoalHours } = usePublisher(
    calendarMonthOf(serviceReport.date)
  )

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

  const setNote = (note: NoteUpdate) =>
    setServiceReport((current) => ({ ...current, ...note }))

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

    const reportMoment = moment(serviceReport.date)
    const reportMonth = reportMoment.month()
    const reportYear = reportMoment.year()
    const goalTarget = { month: reportMonth, year: reportYear }

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
    const earned = measureReward('time')
    addServiceReport(entry)
    analytics.capture('time_entry_created', {
      source: props.source,
      entry_mode: timeEntryMode(entry),
      has_category: !!entry.categoryId,
      duration_input: durationInput ?? 'prefilled',
      ...noteAnalytics(entry),
    })
    toast.success(progress.added, {
      message: progress.progress,
      accessory: earned(),
    })
    props.onDone()
  }

  const save = () => {
    if (!validation.validate()) return
    noteUserAction('time')
    const entry = savedEntry()
    const earned = measureReward('time')
    updateServiceReport(entry)
    analytics.capture('time_entry_updated', {
      source: props.source,
      entry_mode: timeEntryMode(entry),
      has_category: !!entry.categoryId,
      duration_input: durationInput ?? 'prefilled',
      ...noteAnalytics(entry),
    })
    toast.success(i18n.t('success'), {
      message: i18n.t('updated'),
      accessory: earned(),
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

  const hasSelectedCategory = selectedValue !== CUSTOM_TYPE_VALUE

  const providedLessThanOneMinute =
    !props.hours &&
    props.minutes !== undefined &&
    props.minutes < 1 &&
    serviceReport.hours === 0 &&
    serviceReport.minutes < 1

  const total = entryMinutes(serviceReport)
  const { formatted: duration } = useFormattedMinutes(total)

  const saveButton = (
    <ActionButton
      onPress={existingServiceReport ? save : submit}
      testID='time-entry-save'
    >
      {existingServiceReport
        ? i18n.t('save')
        : total > 0
          ? i18n.t('timeForm_addDuration', { duration })
          : i18n.t('addTime')}
    </ActionButton>
  )

  const inline = props.layout === 'inline'
  const paddingX = inline ? 0 : 16

  const durationControl = (
    <DurationInput
      size={inline ? 'compact' : 'large'}
      hours={serviceReport.hours}
      minutes={serviceReport.minutes}
      setDuration={setDuration}
      onInput={setDurationInput}
      invalid={validation.invalid('duration')}
      testID='time-entry'
    />
  )
  const notice = providedLessThanOneMinute && (
    <Text style={{ color: theme.colors.warnText, marginTop: 8 }}>
      {i18n.t('providedTimeIsLessThanOneMinute')}
    </Text>
  )
  const noteText = serviceReport.note?.trim().split('\n')[0]
  const editNote = () =>
    openNote({
      surface: 'time_entry',
      doc: getNoteDoc(serviceReport),
      title: i18n.t('note'),
      placeholder: i18n.t('timeForm_optional'),
      characterLimit: 500,
      allowImages: true,
      onChange: (doc) => setNote(noteFields(doc)),
    })
  const typeRow = (
    <TypeFormRow
      plain
      paddingX={paddingX}
      invalid={validation.invalid('category')}
      value={selectedValue}
      onChange={handleTypeChange}
      hint={hasSelectedCategory ? undefined : i18n.t('categoryNeeded')}
    />
  )
  const noteRow = (
    <DetailRow
      divider
      label={i18n.t('note')}
      value={
        noteText ||
        i18n.t(
          hasNote(serviceReport) ? 'timeForm_noteAdded' : 'timeForm_optional'
        )
      }
      onPress={editNote}
      paddingX={paddingX}
      testID='time-entry-note-row'
    />
  )

  if (inline) {
    return (
      <View>
        {durationControl}
        {notice}
        <View style={{ marginTop: 16, marginBottom: 12 }}>
          {typeRow}
          {noteRow}
        </View>
        {saveButton}
      </View>
    )
  }

  return (
    <DockedFormLayout
      dock={
        <View
          style={{
            paddingTop: 12,
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: theme.colors.background,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: inputLayout.contentMaxWidth,
              alignSelf: 'center',
            }}
          >
            {saveButton}
          </View>
        </View>
      }
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: 16,
        paddingBottom: 8,
        paddingHorizontal: inputLayout.horizontalPadding,
        width: '100%',
        maxWidth: inputLayout.contentMaxWidth,
        alignSelf: 'center',
      }}
    >
      {!formAtTop && <View style={{ flexGrow: 1 }} />}
      <View
        style={{
          ...cardStyle,
          shadowOpacity: 0,
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <MonthPreview entry={savedEntry()} />
      </View>
      <View style={{ height: 24 }} />
      {durationControl}
      {notice}
      <View style={{ height: 28 }} />
      <View style={{ ...cardStyle, shadowOpacity: 0 }}>
        <EntryDateRow
          date={serviceReport.date}
          setDate={setDate}
          paddingX={paddingX}
        />
        {typeRow}
        {noteRow}
      </View>
      {existingServiceReport && (
        <Button
          noTransform
          onPress={handleRequestDelete}
          accessibilityRole='button'
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            marginTop: 8,
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
