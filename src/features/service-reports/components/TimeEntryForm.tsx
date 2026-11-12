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
import useNoteEditorMode from '@/hooks/useNoteEditorMode'
import { useOpenNoteEditor } from '@/hooks/useOpenNoteEditor'
import InlineNoteEditor from '@/components/richText/editor/InlineNoteEditor'
import { useFormattedMinutes } from '@/lib/minutes'
import { entryMinutes, splitMinutes } from '@/lib/entryMinutes'
import { localDayKey } from '@/lib/normalizeDate'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import DurationInput, {
  type DurationInputMethod,
} from '@/components/DurationInput'
import DetailRow from '@/features/service-reports/components/DetailRow'
import EntryDayPicker, {
  type DateInputMethod,
} from '@/features/service-reports/components/EntryDayPicker'
import DayEntryList from '@/features/service-reports/components/DayEntryList'
import DayPlanSuggestion from '@/features/service-reports/components/DayPlanSuggestion'
import {
  dayPlanSuggestion,
  loggedMinutesOnDays,
} from '@/features/service-reports/lib/entryDays'
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
import { canonicalJson } from '@/lib/canonicalJson'
import type { Category } from '@/types/category'
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

  onEditingChange?: (editing: boolean) => void

  onAddAnother?: (date: Date) => void

  layout?: 'docked' | 'inline'

  draftRef?: Ref<TimeEntryDraft>
}

type FormDraft = { entry: TimeEntry; type: string }

type ParkedDraft = FormDraft & {
  baseline: string
  durationInput?: DurationInputMethod
  dateInput?: DateInputMethod
}

const draftFor = (
  existing: TimeEntry | undefined,
  prefill: TimeEntryPrefill,
  categories: Category[]
): FormDraft => {
  const prefillCategory =
    !existing && prefill.categoryId
      ? categories.find((c) => c.id === prefill.categoryId)
      : undefined
  const type = (() => {
    if (prefillCategory) return prefillCategory.id
    if (existing?.categoryId) return existing.categoryId
    if (existing?.tag) {
      const match = categories.find((c) => c.name === existing.tag)
      return match ? match.id : existing.tag
    }
    return STANDARD_TYPE_VALUE
  })()
  return {
    type,
    entry: {
      id: existing?.id ?? Crypto.randomUUID(),
      hours: existing?.hours || prefill.hours || 0,
      minutes: existing?.minutes ?? (prefill.minutes || 0),
      date: existing
        ? storedDateToLocalDate(existing.date)
        : moment(prefill.date).toDate(),
      credit: existing?.credit ?? prefillCategory?.isCredit ?? false,
      categoryId: existing?.categoryId ?? prefillCategory?.id,
      note: existing ? existing.note : prefill.note,
      noteDoc: existing ? existing.noteDoc : prefill.noteDoc,
    },
  }
}

const withNote = (entry: TimeEntry): TimeEntry => ({
  ...entry,
  ...noteFields(getNoteDoc(entry)),
})

const snapshot = (draft: FormDraft) =>
  canonicalJson({ entry: withNote(draft.entry), selectedValue: draft.type })

const TimeEntryForm = (props: Props) => {
  const formAtTop = useFormAtTopOnWeb()
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const insets = useSafeAreaInsets()
  const openNote = useOpenNoteEditor()
  const noteMode = useNoteEditorMode()
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
    dayPlans,
    recurringPlans,
  } = useServiceReport()
  const [editing, setEditing] = useState(props.existingReport)
  const existingServiceReport = getReport(serviceReports, editing)
  const editingInPlace = !props.existingReport && !!existingServiceReport

  const [initial] = useState(() =>
    draftFor(existingServiceReport?.report, props, categories)
  )
  const [selectedValue, setSelectedValue] = useState<string>(initial.type)

  const [durationInput, setDurationInput] = useState<DurationInputMethod>()
  const [dateInput, setDateInput] = useState<DateInputMethod>()
  const [serviceReport, setServiceReport] = useState<TimeEntry>(initial.entry)
  const [baseline, setBaseline] = useState(() => snapshot(initial))
  const [parked, setParked] = useState<ParkedDraft>()
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

  const changed =
    snapshot({ entry: serviceReport, type: selectedValue }) !== baseline

  const confirmLeavingEdit = (leave: () => void) => {
    if (!editingInPlace || !changed) {
      leave()
      return
    }
    Alert.alert(i18n.t('discardChanges'), undefined, [
      { text: i18n.t('keepEditing'), style: 'cancel' },
      { text: i18n.t('discard'), style: 'destructive', onPress: leave },
    ])
  }

  const startNew = () => {
    setEditing(undefined)
    setParked(undefined)
    if (!parked) return
    setServiceReport(parked.entry)
    setSelectedValue(parked.type)
    setBaseline(parked.baseline)
    setDurationInput(parked.durationInput)
    setDateInput(parked.dateInput)
  }

  const editInPlace = (entry: TimeEntry) => {
    if (!editing) {
      setParked({
        entry: serviceReport,
        type: selectedValue,
        baseline,
        durationInput,
        dateInput,
      })
    }
    const draft = draftFor(entry, {}, categories)
    setEditing(entry)
    setServiceReport(draft.entry)
    setSelectedValue(draft.type)
    setBaseline(snapshot(draft))
    setDurationInput(undefined)
    setDateInput(undefined)
  }

  const selectEntry = (entry: TimeEntry) =>
    confirmLeavingEdit(() =>
      entry.id === editing?.id ? startNew() : editInPlace(entry)
    )

  const setDate = (date: Date, method: DateInputMethod) => {
    if (
      editingInPlace &&
      method === 'day' &&
      localDayKey(date) === localDayKey(serviceReport.date)
    ) {
      confirmLeavingEdit(startNew)
      return
    }
    setServiceReport({
      ...serviceReport,
      date,
    })
    setDateInput(method)
  }

  const planned =
    !existingServiceReport &&
    !loggedMinutesOnDays(serviceReports, [serviceReport.date]).get(
      localDayKey(serviceReport.date)
    )
      ? dayPlanSuggestion(serviceReport.date, dayPlans, recurringPlans)
      : undefined

  const applyPlanned = () => {
    if (!planned) return
    const category = categories.find((c) => c.id === planned.categoryId)
    setServiceReport({
      ...serviceReport,
      ...splitMinutes(planned.minutes),
      ...(category && {
        categoryId: category.id,
        tag: undefined,
        credit: category.isCredit,
      }),
    })
    if (category) setSelectedValue(category.id)
    setDurationInput('plan')
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

  const savedEntry = (): TimeEntry => withNote(serviceReport)
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
  const unsaved = changed || (!!parked && snapshot(parked) !== parked.baseline)
  const { onChangedChange, onEditingChange, onAddAnother } = props
  useEffect(() => {
    onChangedChange?.(unsaved)
  }, [unsaved, onChangedChange])
  const isEditing = !!existingServiceReport
  useEffect(() => {
    onEditingChange?.(isEditing)
  }, [isEditing, onEditingChange])
  const source = editingInPlace ? 'add_time_day_entry' : props.source
  const noteAnalytics = (entry: TimeEntry) => ({
    has_note: hasNote(entry),
    has_formatting: !!entry.noteDoc,
    note_photos: entry.noteDoc ? richTextImages(entry.noteDoc.doc).length : 0,
  })

  const leaveEdit = () => (editingInPlace ? startNew() : props.onDone())

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
      date_input: dateInput ?? 'kept',
      ...noteAnalytics(entry),
    })
    toast.success(progress.added, {
      message: progress.progress,
      accessory: earned(),
      ...(onAddAnother && {
        durationMs: 5000,
        action: {
          label: i18n.t('timeForm_addAnother'),
          onPress: () => {
            analytics.capture('time_entry_add_another')
            onAddAnother(entry.date)
          },
        },
      }),
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
      source,
      entry_mode: timeEntryMode(entry),
      has_category: !!entry.categoryId,
      duration_input: durationInput ?? 'prefilled',
      date_input: dateInput ?? 'kept',
      ...noteAnalytics(entry),
    })
    toast.success(i18n.t('success'), {
      message: i18n.t('updated'),
      accessory: earned(),
    })

    leaveEdit()
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
            source,
            entry_mode: timeEntryMode(serviceReport),
          })
          toast.success(i18n.t('success'), {
            message: i18n.t('deleted'),
          })
          leaveEdit()
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
      divider={inline}
      paddingX={paddingX}
      invalid={validation.invalid('category')}
      value={selectedValue}
      onChange={handleTypeChange}
      hint={hasSelectedCategory ? undefined : i18n.t('categoryNeeded')}
    />
  )
  const noteRow =
    noteMode === 'inline' ? (
      <View
        testID='time-entry-note-row'
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingHorizontal: paddingX,
          paddingTop: 16,
          paddingBottom: 16,
          gap: 10,
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.medium,
            fontSize: theme.fontSize('md'),
          }}
        >
          {i18n.t('note')}
        </Text>
        <InlineNoteEditor
          note={serviceReport}
          onChange={setNote}
          surface='time_entry'
          label={i18n.t('note')}
          placeholder={i18n.t('timeForm_optional')}
          maxLength={500}
          testID='time-entry-note'
        />
      </View>
    ) : (
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
              gap: 10,
            }}
          >
            <View style={{ paddingHorizontal: 4 }}>
              <MonthPreview entry={savedEntry()} />
            </View>
            {saveButton}
          </View>
        </View>
      }
      contentContainerStyle={{
        flexGrow: 1,
        paddingBottom: 8,
        paddingHorizontal: inputLayout.horizontalPadding,
        width: '100%',
        maxWidth: inputLayout.contentMaxWidth,
        alignSelf: 'center',
      }}
    >
      <EntryDayPicker date={serviceReport.date} setDate={setDate} />
      {!props.existingReport && (
        <DayEntryList
          date={serviceReport.date}
          editing={existingServiceReport?.report}
          onSelect={selectEntry}
          onDeleted={(entry) => {
            if (entry.id === editing?.id) startNew()
          }}
        />
      )}
      <View style={{ flexGrow: formAtTop ? 0 : 1, minHeight: 16 }} />
      {planned && (
        <View style={{ marginBottom: 16 }}>
          <DayPlanSuggestion
            minutes={planned.minutes}
            applied={total === planned.minutes}
            onPress={applyPlanned}
          />
        </View>
      )}
      {durationControl}
      {notice}
      <View style={{ height: 16 }} />
      <View style={{ ...cardStyle, shadowOpacity: 0 }}>
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
