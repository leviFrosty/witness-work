import useFormValidation from '@/hooks/useFormValidation'
import { analytics } from '@/lib/analytics'
import { formatTime } from '@/lib/dates'
import {
  Calendar1 as Calendar1Icon,
  Repeat as RepeatIcon,
  X as XIcon,
} from 'lucide-react-native'
import { CornerDownForwardIcon } from '@/components/ui/DirectionalIcon'
import { Modal, Pressable, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import useServiceReport from '@/stores/serviceReport'
import * as Crypto from 'expo-crypto'
import { Ref, useEffect, useImperativeHandle, useState } from 'react'
import { toast } from '@/stores/toasts'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useWideOnWeb from '@/hooks/useWideOnWeb'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import ReminderOffsetSelect from '@/components/ReminderOffsetSelect'
import confirmDeletePlan, { deletePlan } from '@/lib/confirmDeletePlan'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import {
  combineDateAndStartTime,
  DEFAULT_START_TIME_IN_MINUTES,
  localDayFromUtcCursor,
  momentStoredDate,
  preserveOrNormalizeStoredDate,
  storedDateToLocalDate,
} from '@/lib/normalizeDate'
import {
  allEventsStartDate,
  planDayFromRouteDate,
  splitPlanDate,
} from '@/features/plans/lib/planDayDates'
import {
  offsetFromMinutes,
  offsetToMinutes,
  reminderFireDate,
} from '@/lib/notificationOffset'
import {
  ANYTIME_PLAN_REMINDER_MINUTES,
  anytimePlanReminderDate,
  reminderRequestId,
  savedReminderOffsetMinutes,
} from '@/lib/reminderSchedule'
import {
  DEFAULT_PLAN_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import useCategories from '@/stores/categories'
import useNotifications from '@/hooks/notifications'

import {
  CUSTOM_TYPE_VALUE,
  STANDARD_TYPE_VALUE,
  type TypeSelection,
} from '@/components/TypeSelectorRow'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import type { DayPlan, PlanLocation } from '@/types/timeEntry'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import BuddyPicker from '@/features/buddies/components/BuddyPicker'
import LinkedPlanBanner from '@/features/buddies/components/LinkedPlanBanner'
import useShareReplies from '@/features/buddies/hooks/useShareReplies'
import { planShareKey } from '@/features/buddies/lib/shares'
import { organizerMinutes } from '@/features/buddies/lib/linkedPlans'
import { incomingShareKey } from '@/features/buddies/lib/state'
import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { placeSearchProvider } from '@/lib/placeSearch'
import PlanDetailsList from '@/features/plans/components/PlanDetailsList'
import type {
  PlanFormDraft,
  PlanFormSlot,
} from '@/features/service-reports/components/DayHistoryView'
import PlanRecurrenceControls from '@/features/plans/components/PlanRecurrenceControls'
import PlanKindToggle from '@/features/plans/components/PlanKindToggle'
import DockedFormLayout from '@/components/ui/layout/DockedFormLayout'
import WhenDock from '@/components/WhenDock'
import { noteUserAction } from '@/lib/userAction'
import { useFormattedMinutes } from '@/lib/minutes'
import { richTextImages } from '@/lib/richText/inspect'
import { getNoteDoc, hasNote, noteFields } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'

type NotifyMeOffset = {
  amount: number
  unit: moment.unitOfTime.DurationConstructor
}

type RecurringSaveScope = 'instance' | 'future' | 'all'

/** Where Plan Details shows a saved Plan. */
export type PlanDetailsTarget = RootStackParamList['Plan Details']

const storedDateFor = (date: Date) => preserveOrNormalizeStoredDate(date)

const storedDay = (date: Date) => momentStoredDate(storedDateFor(date))

const localDateForWrite = (date: Date) => localDayFromUtcCursor(storedDay(date))

const sameDay = (a: Date, b: Date) => storedDay(a).isSame(storedDay(b), 'day')

type ScopeOptionConfig = {
  scope: RecurringSaveScope
  title: string
  icon: AppIcon
  dots: [boolean, boolean, boolean]
  lines: [boolean, boolean]
}

const ScopeTimelineDot = (props: { active: boolean }) => {
  const theme = useTheme()

  return (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: props.active ? theme.colors.accent : theme.colors.border,
        backgroundColor: props.active ? theme.colors.accent : theme.colors.card,
      }}
    />
  )
}

const ScopeTimelineLine = (props: { active: boolean }) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flex: 1,
        height: 1,
        backgroundColor: props.active
          ? theme.colors.accent
          : theme.colors.border,
      }}
    />
  )
}

const ScopeTimeline = (props: Pick<ScopeOptionConfig, 'dots' | 'lines'>) => (
  <View style={{ marginTop: 9 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <ScopeTimelineDot active={props.dots[0]} />
      <ScopeTimelineLine active={props.lines[0]} />
      <ScopeTimelineDot active={props.dots[1]} />
      <ScopeTimelineLine active={props.lines[1]} />
      <ScopeTimelineDot active={props.dots[2]} />
    </View>
  </View>
)

const ScopeOption = (props: {
  option: ScopeOptionConfig
  selected: boolean
  onPress: (scope: RecurringSaveScope) => void
}) => {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <PointerHover onHoverChange={setHovered}>
      <Pressable
        accessibilityRole='radio'
        accessibilityState={{ selected: props.selected }}
        onPress={() => props.onPress(props.option.scope)}
        style={({ pressed }) => ({
          borderColor: props.selected
            ? theme.colors.accent
            : theme.colors.border,
          borderWidth: 1,
          borderRadius: theme.numbers.borderRadiusMd,
          backgroundColor: props.selected
            ? theme.colors.accentTranslucent
            : theme.colors.backgroundLighter,
          padding: 14,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: theme.numbers.borderRadiusMd,
              borderWidth: 1,
              borderColor: props.selected
                ? theme.colors.accent
                : theme.colors.border,
              backgroundColor: theme.colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LucideIcon
              icon={props.option.icon}
              size={18}
              color={
                props.selected ? theme.colors.accent : theme.colors.textAlt
              }
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('md'),
                color: theme.colors.text,
              }}
            >
              {props.option.title}
            </Text>
            <ScopeTimeline
              dots={props.option.dots}
              lines={props.option.lines}
            />
          </View>
        </View>
        <HoverTint
          visible={hovered}
          borderRadius={theme.numbers.borderRadiusMd}
        />
      </Pressable>
    </PointerHover>
  )
}

const RecurringSaveScopeModal = (props: {
  open: boolean
  selectedScope: RecurringSaveScope | null
  setSelectedScope: React.Dispatch<
    React.SetStateAction<RecurringSaveScope | null>
  >
  onCancel: () => void
  onConfirm: () => void
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const scopeValidation = useFormValidation(
    { scope: !props.selectedScope },
    'plan_save_scope',
    props.open
  )
  const scopeOptions: ScopeOptionConfig[] = [
    {
      scope: 'instance',
      title: i18n.t('saveScope_instance_title'),
      icon: Calendar1Icon,
      dots: [false, true, false],
      lines: [false, false],
    },
    {
      scope: 'future',
      title: i18n.t('saveScope_future_title'),
      icon: CornerDownForwardIcon,
      dots: [false, true, true],
      lines: [false, true],
    },
    {
      scope: 'all',
      title: i18n.t('saveScope_all_title'),
      icon: RepeatIcon,
      dots: [true, true, true],
      lines: [true, true],
    },
  ]

  return (
    <Modal
      visible={props.open}
      transparent
      animationType='fade'
      onRequestClose={props.onCancel}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0, 0, 0, 0.28)',
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={props.onCancel} />
        <View
          style={{
            backgroundColor: theme.colors.backgroundLighter,
            borderTopStartRadius: theme.numbers.borderRadiusLg,
            borderTopEndRadius: theme.numbers.borderRadiusLg,
            borderColor: theme.colors.border,
            borderTopWidth: 1,
            padding: 20,
            paddingBottom: Math.max(28, insets.bottom + 12),
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('lg'),
                  color: theme.colors.text,
                }}
              >
                {i18n.t('saveRecurringPlanScopeTitle')}
              </Text>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('saveRecurringPlanScopeDescription')}
              </Text>
            </View>
            <Button
              noTransform
              accessibilityLabel={i18n.t('cancel')}
              onPress={props.onCancel}
              style={{ padding: 8 }}
            >
              <LucideIcon icon={XIcon} size={22} color={theme.colors.text} />
            </Button>
          </View>

          <View
            style={{
              gap: 10,
              borderWidth: 1,
              borderRadius: theme.numbers.borderRadiusMd,
              borderColor: scopeValidation.invalid('scope')
                ? theme.colors.error
                : 'transparent',
            }}
          >
            {scopeOptions.map((option) => (
              <ScopeOption
                key={option.scope}
                option={option}
                selected={props.selectedScope === option.scope}
                onPress={props.setSelectedScope}
              />
            ))}
          </View>

          <View style={{ gap: 10, marginTop: 2 }}>
            <ActionButton
              noTransform
              onPress={() => {
                if (scopeValidation.validate()) props.onConfirm()
              }}
            >
              <Text
                style={{
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('lg'),
                }}
              >
                {i18n.t('saveChanges')}
              </Text>
            </ActionButton>
          </View>
        </View>
      </View>
    </Modal>
  )
}

type Props = {
  /** The day, the Plan to edit, or a new Plan's seeds, as PlanDay takes them. */
  params: RootStackParamList['PlanDay']
  /**
   * Where the form is, for analytics: the Plan screen, or a day's split sheet
   * (Schedule, Home, Progress).
   */
  source: 'plan_form' | 'day_sheet'
  /** Saved, with where Plan Details shows the Plan now. */
  onSaved: (target?: PlanDetailsTarget) => void
  onDeleted: () => void
  /**
   * `inline` sits within a page, e.g. a day's list: One Time / Recurring and
   * How long?, then the details, then Add Plan, for that day only.
   */
  layout?: 'docked' | 'inline'
  /** Set to read the form's new Plan as it stands, e.g. to expand it. */
  draftRef?: Ref<PlanFormDraft>
}

/**
 * The Plan form: a Details list (title, location, note, buddies, reminder,
 * Type) above a dock with One Time / Recurring, the Date and How long? pills,
 * and Save. The Plan screen hosts it, and so does a day's split sheet, so a day
 * is planned without leaving it.
 */
const PlanDayForm = ({
  params,
  source,
  onSaved,
  onDeleted,
  layout = 'docked',
  draftRef,
}: Props) => {
  const wideOnWeb = useWideOnWeb()
  const navigation = useNavigation<RootStackNavigation>()
  const defaultDate = planDayFromRouteDate(params.date)
  const defaultStoredDate = storedDateFor(defaultDate)
  const {
    dayPlans,
    recurringPlans,
    addDayPlan,
    addRecurringPlan,
    updateDayPlan,
    updateRecurringPlan,
    addRecurringPlanOverride,
    updateRecurringPlanOverride,
    removeRecurringPlanOverride,
    getRecurringPlanForDate,
    deleteSingleEventFromRecurringPlan,
  } = useServiceReport()

  const existingDayPlan = params.existingDayPlanId
    ? dayPlans.find((p) => p.id === params.existingDayPlanId)
    : null
  const existingRecurringPlan = params.existingRecurringPlanId
    ? recurringPlans.find((p) => p.id === params.existingRecurringPlanId)
    : null

  const editingDate =
    existingRecurringPlan && params.recurringPlanDate
      ? planDayFromRouteDate(params.recurringPlanDate)
      : defaultDate
  const editingStoredDate = storedDateFor(editingDate)
  const editingWriteDate = localDateForWrite(editingDate)

  const recurringPlanData = existingRecurringPlan
    ? getRecurringPlanForDate(existingRecurringPlan.id, editingWriteDate)
    : null

  const isEditMode = !!(existingDayPlan || existingRecurringPlan)
  // Seeds for a new plan (Duplicate, Plan the Same Time); ignored when editing.
  const prefill = isEditMode ? undefined : params.prefill
  const prefillStartTime = prefill?.startTime
    ? moment(prefill.startTime).hours() * 60 +
      moment(prefill.startTime).minutes()
    : undefined
  const prefillRecurrence = prefill?.recurrence
  const initialEndDate = existingRecurringPlan?.recurrence.endDate
    ? localDateForWrite(existingRecurringPlan.recurrence.endDate)
    : prefillRecurrence?.endDate
      ? new Date(prefillRecurrence.endDate)
      : null
  const initialOneTime = existingRecurringPlan
    ? false
    : isEditMode || !params.recurring

  const [oneTime, setOneTime] = useState(initialOneTime)
  const [date, setDate] = useState(
    existingDayPlan
      ? combineDateAndStartTime(
          existingDayPlan.date,
          existingDayPlan.startTimeInMinutes
        )
      : existingRecurringPlan
        ? combineDateAndStartTime(
            editingStoredDate,
            recurringPlanData?.startTimeInMinutes
          )
        : combineDateAndStartTime(defaultStoredDate, prefillStartTime)
  )
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate)
  const [willEnd, setWillEnd] = useState(!!initialEndDate)
  const [hours, setHours] = useState(
    existingDayPlan
      ? Math.floor(existingDayPlan.minutes / 60)
      : recurringPlanData
        ? Math.floor(recurringPlanData.minutes / 60)
        : Math.floor((prefill?.minutes ?? 0) / 60)
  )
  const [minutes, setMinutes] = useState(
    existingDayPlan
      ? existingDayPlan.minutes % 60
      : recurringPlanData
        ? recurringPlanData.minutes % 60
        : (prefill?.minutes ?? 0) % 60
  )
  const [interval, setInterval] = useState<number>(
    existingRecurringPlan?.recurrence.interval ??
      prefillRecurrence?.interval ??
      1
  )
  const [frequency, setFrequency] = useState<RecurringPlanFrequencies>(
    existingRecurringPlan?.recurrence.frequency ??
      prefillRecurrence?.frequency ??
      RecurringPlanFrequencies.WEEKLY
  )
  const [weekday, setWeekday] = useState(
    existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekday ??
      prefillRecurrence?.weekday ??
      0
  )
  const [weekOfMonth, setWeekOfMonth] = useState(
    existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekOfMonth ??
      prefillRecurrence?.weekOfMonth ??
      1
  )
  const [saveScopeModalOpen, setSaveScopeModalOpen] = useState(false)
  const [selectedSaveScope, setSelectedSaveScope] =
    useState<RecurringSaveScope | null>(null)

  const { categories } = useCategories()

  const resolveInitialTypeValue = (): string => {
    const categoryId =
      existingDayPlan?.categoryId ??
      existingRecurringPlan?.categoryId ??
      prefill?.categoryId
    if (categoryId && categories.some((c) => c.id === categoryId)) {
      return categoryId
    }
    return STANDARD_TYPE_VALUE
  }
  const [typeValue, setTypeValue] = useState<string>(resolveInitialTypeValue)

  const handleTypeChange = ({ value }: TypeSelection) => {
    setTypeValue(value)
  }

  const existingCategoryId =
    existingDayPlan?.categoryId ?? existingRecurringPlan?.categoryId
  const danglingExistingCategoryId =
    existingCategoryId && !categories.some((c) => c.id === existingCategoryId)
      ? existingCategoryId
      : undefined
  const selectedCategoryId =
    typeValue !== STANDARD_TYPE_VALUE &&
    typeValue !== CUSTOM_TYPE_VALUE &&
    categories.some((c) => c.id === typeValue)
      ? typeValue
      : typeValue === STANDARD_TYPE_VALUE
        ? danglingExistingCategoryId
        : undefined

  const calculateWeekOfMonth = (targetDate: Date): number => {
    const momentDate = moment(targetDate)
    const targetWeekday = momentDate.day()
    const targetDateNum = momentDate.date()
    const firstDayOfMonth = momentDate.clone().startOf('month')
    const firstWeekdayOfMonth = firstDayOfMonth.clone()

    while (firstWeekdayOfMonth.day() !== targetWeekday) {
      firstWeekdayOfMonth.add(1, 'day')
    }

    const weeksBetween = momentDate.diff(firstWeekdayOfMonth, 'weeks')
    const occurrence = weeksBetween + 1
    const lastDayOfMonth = momentDate.clone().endOf('month')
    const daysFromEnd = lastDayOfMonth.date() - targetDateNum
    const isLastWeek = daysFromEnd < 7 && targetWeekday === momentDate.day()

    return isLastWeek ? -1 : occurrence
  }

  const handleFrequencyChange = (
    value: React.SetStateAction<RecurringPlanFrequencies>
  ) => {
    const newFrequency = typeof value === 'function' ? value(frequency) : value
    setFrequency(newFrequency)

    if (newFrequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY) {
      const selectedWeekday = moment(date).day()
      const selectedWeekOfMonth = calculateWeekOfMonth(date)

      setWeekday(selectedWeekday)
      setWeekOfMonth(selectedWeekOfMonth)
    }
  }

  const handleDateChange = (value: React.SetStateAction<Date>) => {
    const newDate = typeof value === 'function' ? value(date) : value
    setDate(newDate)

    if (frequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY) {
      const selectedWeekday = moment(newDate).day()
      const selectedWeekOfMonth = calculateWeekOfMonth(newDate)

      setWeekday(selectedWeekday)
      setWeekOfMonth(selectedWeekOfMonth)
    }
  }

  const initialNote = (): NoteFields => {
    const source = existingDayPlan ?? recurringPlanData ?? prefill
    return source ? { note: source.note, noteDoc: source.noteDoc } : {}
  }
  const [note, setNote] = useState<NoteFields>(initialNote)
  /** The note as it saves: normalized, and rebuilt if it went stale. */
  const savedNote = noteFields(getNoteDoc(note))
  const [title, setTitle] = useState(
    existingDayPlan?.title ??
      existingRecurringPlan?.title ??
      prefill?.title ??
      ''
  )
  const [location, setLocation] = useState<PlanLocation | undefined>(
    existingDayPlan?.location ??
      existingRecurringPlan?.location ??
      prefill?.location
  )
  const initialInvitedBuddies =
    existingDayPlan?.buddies ?? prefill?.buddies ?? []
  const [invitedBuddies, setInvitedBuddies] = useState<string[]>(
    initialInvitedBuddies
  )
  // A Plan that follows a buddy's invitation: the organizer sets its day,
  // time, title, place, and note, so only the User's own fields show.
  const linkedShare = existingDayPlan?.buddyShare
  const linkedInvitation = useBuddies((state) =>
    linkedShare
      ? state.incomingShares[
          incomingShareKey(linkedShare.from, linkedShare.shareId)
        ]
      : undefined
  )
  const organizerName = useBuddies((state) => {
    const organizer = linkedShare
      ? state.buddies.find((buddy) => buddy.inboxId === linkedShare.from)
      : undefined
    return organizer ? buddyDisplayName(organizer) : undefined
  })
  const plannedByOrganizer = linkedInvitation
    ? organizerMinutes(linkedInvitation)
    : undefined
  const { formatted: organizerHours } = useFormattedMinutes(
    plannedByOrganizer ?? 0
  )
  const shareReplies = useShareReplies(
    existingDayPlan?.buddies?.length
      ? planShareKey(existingDayPlan.id)
      : undefined
  )

  const {
    planNotificationOffset,
    planAlwaysNotify,
    planTimeMode,
    set: setPreferences,
  } = usePreferences()

  // New Plans open in whichever mode the User last picked.
  const initialAnytime = existingDayPlan
    ? !!existingDayPlan.anytime
    : existingRecurringPlan
      ? !!recurringPlanData?.anytime
      : (prefill?.anytime ??
        (prefill?.startTime ? false : planTimeMode === 'hours'))
  const [anytime, setAnytime] = useState(initialAnytime)
  const { allowed: notificationsAllowed, turnOn: turnOnNotifications } =
    useNotifications()

  const defaultNotifyOffset: NotifyMeOffset = {
    amount:
      planNotificationOffset?.amount ?? DEFAULT_PLAN_NOTIFICATION_OFFSET.amount,
    unit: planNotificationOffset?.unit ?? DEFAULT_PLAN_NOTIFICATION_OFFSET.unit,
  }

  const initialNotifyOffset = (): NotifyMeOffset => {
    const savedMinutes = existingDayPlan
      ? savedReminderOffsetMinutes(
          combineDateAndStartTime(
            existingDayPlan.date,
            existingDayPlan.startTimeInMinutes
          ),
          existingDayPlan
        )
      : existingRecurringPlan?.reminderOffsetMinutes
    if (typeof savedMinutes === 'number')
      return offsetFromMinutes(savedMinutes) ?? { amount: 0, unit: 'minutes' }
    return prefill?.reminderOffset ?? defaultNotifyOffset
  }

  const initialNotifyMe = existingDayPlan
    ? !!existingDayPlan.notifyMe
    : existingRecurringPlan
      ? !!existingRecurringPlan.notifyMe
      : (prefill?.notifyMe ?? planAlwaysNotify)
  const [notifyMe, setNotifyMe] = useState<boolean>(initialNotifyMe)
  const [notifyMeOffset, setNotifyMeOffset] = useState<NotifyMeOffset>(
    initialNotifyOffset()
  )

  useImperativeHandle(draftRef, () => ({
    params: () => ({
      date: date.toISOString(),
      recurring: !oneTime,
      prefill: {
        anytime,
        startTime: anytime ? undefined : date.toISOString(),
        minutes: hours * 60 + minutes,
        title,
        location,
        ...savedNote,
        categoryId: selectedCategoryId,
        buddies: invitedBuddies,
        notifyMe,
        reminderOffset: notifyMeOffset,
        recurrence: {
          frequency,
          interval,
          weekday,
          weekOfMonth,
          endDate: willEnd && endDate ? endDate.toISOString() : undefined,
        },
      },
    }),
  }))

  const reminderMinutes = offsetToMinutes(notifyMeOffset)
  const anytimeReminderAt = new Date(date)
  anytimeReminderAt.setHours(0, ANYTIME_PLAN_REMINDER_MINUTES, 0, 0)
  const reminderPassed = anytime
    ? anytimeReminderAt.getTime() <= Date.now()
    : reminderMinutes !== null &&
      date.getTime() - reminderMinutes * 60_000 <= Date.now()

  const theme = useTheme()

  const editingContext = `${params.existingDayPlanId || 'new'}-${params.existingRecurringPlanId || 'new'}-${params.recurringPlanDate || params.date}-${params.recurring ? 'recurring' : ''}-${JSON.stringify(prefill ?? null)}`

  useEffect(() => {
    setOneTime(initialOneTime)
    setAnytime(initialAnytime)
    setDate(
      existingDayPlan
        ? combineDateAndStartTime(
            existingDayPlan.date,
            existingDayPlan.startTimeInMinutes
          )
        : existingRecurringPlan
          ? combineDateAndStartTime(
              editingStoredDate,
              recurringPlanData?.startTimeInMinutes
            )
          : combineDateAndStartTime(defaultStoredDate, prefillStartTime)
    )
    setEndDate(initialEndDate)
    setWillEnd(!!initialEndDate)
    setHours(
      existingDayPlan
        ? Math.floor(existingDayPlan.minutes / 60)
        : recurringPlanData
          ? Math.floor(recurringPlanData.minutes / 60)
          : Math.floor((prefill?.minutes ?? 0) / 60)
    )
    setMinutes(
      existingDayPlan
        ? existingDayPlan.minutes % 60
        : recurringPlanData
          ? recurringPlanData.minutes % 60
          : (prefill?.minutes ?? 0) % 60
    )
    setInterval(
      existingRecurringPlan?.recurrence.interval ??
        prefillRecurrence?.interval ??
        1
    )
    setFrequency(
      existingRecurringPlan?.recurrence.frequency ??
        prefillRecurrence?.frequency ??
        RecurringPlanFrequencies.WEEKLY
    )
    setWeekday(
      existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekday ??
        prefillRecurrence?.weekday ??
        0
    )
    setWeekOfMonth(
      existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekOfMonth ??
        prefillRecurrence?.weekOfMonth ??
        1
    )
    setNote(initialNote())
    setTitle(
      existingDayPlan?.title ??
        existingRecurringPlan?.title ??
        prefill?.title ??
        ''
    )
    setLocation(
      existingDayPlan?.location ??
        existingRecurringPlan?.location ??
        prefill?.location
    )
    setInvitedBuddies(initialInvitedBuddies)
    setNotifyMe(initialNotifyMe)
    setNotifyMeOffset(initialNotifyOffset())
    setTypeValue(resolveInitialTypeValue())
    setSaveScopeModalOpen(false)
    setSelectedSaveScope(null)
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingContext])

  /**
   * The reminder intent to save. `useReconciledReminders` schedules this
   * device's OS reminder from it, once permission allows.
   */
  const planReminderIntent = (
    planId: string,
    planDate: Date,
    startTimeInMinutes: number
  ): Pick<DayPlan, 'notifyMe' | 'reminderOffsetMinutes' | 'notifications'> => {
    // An anytime Plan reminds the morning of; older app versions read the
    // saved fire time.
    if (notifyMe && anytime) {
      return {
        notifyMe,
        reminderOffsetMinutes: undefined,
        notifications: [
          {
            id: reminderRequestId('plan', planId),
            date: anytimePlanReminderDate(planDate),
          },
        ],
      }
    }
    const minutes = notifyMe ? offsetToMinutes(notifyMeOffset) : null
    if (minutes === null)
      return { notifyMe, reminderOffsetMinutes: undefined, notifications: [] }
    const planStart = combineDateAndStartTime(planDate, startTimeInMinutes)
    return {
      notifyMe,
      reminderOffsetMinutes: minutes,
      // The fire time, for older app versions on other devices.
      notifications: [
        {
          id: reminderRequestId('plan', planId),
          date: reminderFireDate(planStart, minutes),
        },
      ],
    }
  }

  /**
   * The picked day and start time. An anytime Plan keeps the noon default, so
   * older app versions show it as a noon Plan.
   */
  const splitPickedDate = () => {
    const { date: planDate, startTimeInMinutes } = splitPlanDate(date)
    return {
      planDate,
      startTimeInMinutes: anytime
        ? DEFAULT_START_TIME_IN_MINUTES
        : startTimeInMinutes,
    }
  }

  const buildRecurringPayload = () => {
    const { planDate, startTimeInMinutes } = splitPickedDate()
    // Each instance's reminder is worked out from these. An anytime one
    // reminds the morning of; the offset still applies to dates given a time.
    const offsetMinutes = notifyMe ? offsetToMinutes(notifyMeOffset) : null
    return {
      startDate: planDate,
      startTimeInMinutes,
      anytime: anytime || undefined,
      minutes: hours * 60 + minutes,
      categoryId: selectedCategoryId,
      recurrence: {
        endDate,
        frequency,
        interval,
        monthlyByWeekdayConfig:
          frequency === RecurringPlanFrequencies.MONTHLY_BY_WEEKDAY
            ? { weekday, weekOfMonth }
            : undefined,
      },
      title: title.trim() || undefined,
      location,
      ...savedNote,
      notifyMe,
      reminderOffsetMinutes: offsetMinutes ?? undefined,
    }
  }

  /** Saves an edit to a Recurring Plan; returns where the edited date is now. */
  const saveExistingRecurringPlan = (
    scope: RecurringSaveScope
  ): PlanDetailsTarget | undefined => {
    if (!existingRecurringPlan) return

    const payload = buildRecurringPayload()
    const editedDate = {
      recurringPlanId: existingRecurringPlan.id,
      date: payload.startDate.toISOString(),
    }
    const instanceDate = editingWriteDate
    const categoryChanged =
      (payload.categoryId ?? undefined) !==
      (existingRecurringPlan.categoryId ?? undefined)
    // Like the Type, title, location and reminder are pattern-level: an
    // instance that changes them becomes its own Day Plan.
    const detailsChanged =
      payload.title !== existingRecurringPlan.title ||
      JSON.stringify(payload.location) !==
        JSON.stringify(existingRecurringPlan.location) ||
      payload.notifyMe !== !!existingRecurringPlan.notifyMe ||
      (payload.notifyMe &&
        payload.reminderOffsetMinutes !==
          existingRecurringPlan.reminderOffsetMinutes)

    if (scope === 'instance') {
      const selectedDateMatchesInstance = sameDay(
        payload.startDate,
        editingDate
      )

      if (!selectedDateMatchesInstance || categoryChanged || detailsChanged) {
        removeRecurringPlanOverride(existingRecurringPlan.id, instanceDate)
        deleteSingleEventFromRecurringPlan(
          existingRecurringPlan.id,
          instanceDate
        )
        const id = Crypto.randomUUID()
        addDayPlan({
          id,
          date: payload.startDate,
          startTimeInMinutes: payload.startTimeInMinutes,
          anytime: payload.anytime,
          minutes: payload.minutes,
          categoryId: payload.categoryId,
          title: payload.title,
          location: payload.location,
          note: payload.note,
          noteDoc: payload.noteDoc,
          ...planReminderIntent(
            id,
            payload.startDate,
            payload.startTimeInMinutes
          ),
        })

        return { dayPlanId: id }
      }

      const override = {
        date: instanceDate,
        minutes: payload.minutes,
        startTimeInMinutes: payload.startTimeInMinutes,
        anytime,
        note: payload.note,
        noteDoc: payload.noteDoc,
      }

      const existingOverride = existingRecurringPlan.overrides?.some((o) =>
        sameDay(o.date, instanceDate)
      )

      if (existingOverride) {
        updateRecurringPlanOverride(existingRecurringPlan.id, override)
      } else {
        addRecurringPlanOverride(existingRecurringPlan.id, override)
      }
      return editedDate
    }

    if (scope === 'future') {
      if (sameDay(editingDate, existingRecurringPlan.startDate)) {
        updateRecurringPlan({
          id: existingRecurringPlan.id,
          ...payload,
        })
        return editedDate
      }

      const lastOldDate = localDayFromUtcCursor(
        storedDay(editingDate).clone().subtract(1, 'day')
      )
      updateRecurringPlan({
        id: existingRecurringPlan.id,
        recurrence: {
          ...existingRecurringPlan.recurrence,
          endDate: lastOldDate,
        },
        // The store re-anchors every date it's handed, so pass the kept
        // stored anchors back as local days.
        overrides: existingRecurringPlan.overrides
          ?.filter((override) =>
            storedDay(override.date).isBefore(storedDay(editingDate), 'day')
          )
          .map((override) => ({
            ...override,
            date: storedDateToLocalDate(override.date),
          })),
        deletedDates: existingRecurringPlan.deletedDates
          ?.filter((deletedDate) =>
            storedDay(deletedDate).isBefore(storedDay(editingDate), 'day')
          )
          .map(storedDateToLocalDate),
      })
      const id = Crypto.randomUUID()
      addRecurringPlan({ id, ...payload })
      return { ...editedDate, recurringPlanId: id }
    }

    updateRecurringPlan({
      id: existingRecurringPlan.id,
      ...payload,
      startDate: allEventsStartDate(
        existingRecurringPlan.startDate,
        editingDate,
        payload.startDate
      ),
    })
    return editedDate
  }

  const validation = useFormValidation(
    {
      duration: hours * 60 + minutes <= 0,
      category: typeValue === CUSTOM_TYPE_VALUE,
    },
    'plan'
  )

  const savePlan = async (scope?: RecurringSaveScope) => {
    if (!validation.validate()) return
    noteUserAction('plan')
    const { planDate, startTimeInMinutes } = splitPickedDate()
    const plannedMinutes = hours * 60 + minutes
    const plannedTitle = title.trim() || undefined
    // A buddy whose pairing ended while the form was open left its summary;
    // they leave the Plan too, rather than stay invited to nothing.
    const { buddies: knownBuddies, removedBuddies } = useBuddies.getState()
    const stillInvited = invitedBuddies.filter(
      (inboxId) =>
        !(inboxId in removedBuddies) ||
        knownBuddies.some(
          (buddy) => buddy.inboxId === inboxId && buddy.status === 'active'
        )
    )
    const plannedBuddies =
      !linkedShare && stillInvited.length > 0 ? stillInvited : undefined

    // Where Plan Details shows the saved Plan: an edit can move it, and one
    // created from Plan Details (Duplicate, Invite) opens next.
    let detailsTarget: PlanDetailsTarget | undefined
    if (isEditMode) {
      if (existingDayPlan && linkedShare) {
        detailsTarget = { dayPlanId: existingDayPlan.id }
        // The organizer's details come from their invitation, even one that
        // arrived while the form was open: only the User's own fields save.
        const current =
          useServiceReport
            .getState()
            .dayPlans.find((plan) => plan.id === existingDayPlan.id)
            ?.buddyShare ?? linkedShare
        // Hours set to the organizer's follow theirs again.
        const ownMinutes =
          plannedByOrganizer !== undefined
            ? plannedMinutes !== plannedByOrganizer
            : !!current.ownMinutes || plannedMinutes !== existingDayPlan.minutes
        const { ownMinutes: _own, ...link } = current
        updateDayPlan({
          id: existingDayPlan.id,
          minutes: plannedMinutes,
          categoryId: selectedCategoryId,
          buddyShare: ownMinutes ? { ...link, ownMinutes: true } : link,
          ...planReminderIntent(
            existingDayPlan.id,
            planDate,
            startTimeInMinutes
          ),
        })
        analytics.capture('buddy_linked_plan_saved', { own_hours: ownMinutes })
      } else if (existingDayPlan) {
        detailsTarget = { dayPlanId: existingDayPlan.id }
        updateDayPlan({
          id: existingDayPlan.id,
          date: planDate,
          startTimeInMinutes,
          anytime: anytime || undefined,
          minutes: plannedMinutes,
          categoryId: selectedCategoryId,
          title: plannedTitle,
          location,
          ...savedNote,
          buddies: plannedBuddies,
          ...planReminderIntent(
            existingDayPlan.id,
            planDate,
            startTimeInMinutes
          ),
        })
      } else if (existingRecurringPlan && scope) {
        detailsTarget = saveExistingRecurringPlan(scope)
      }

      toast.success(i18n.t('success'), {
        message: i18n.t('updatedPlan'),
        durationMs: 2500,
      })
    } else {
      if (oneTime) {
        const id = Crypto.randomUUID()
        detailsTarget = { dayPlanId: id }
        addDayPlan({
          id,
          date: planDate,
          startTimeInMinutes,
          anytime: anytime || undefined,
          minutes: plannedMinutes,
          categoryId: selectedCategoryId,
          title: plannedTitle,
          location,
          ...savedNote,
          buddies: plannedBuddies,
          ...planReminderIntent(id, planDate, startTimeInMinutes),
        })
      } else {
        const id = Crypto.randomUUID()
        const payload = buildRecurringPayload()
        detailsTarget = {
          recurringPlanId: id,
          date: payload.startDate.toISOString(),
        }
        addRecurringPlan({ id, ...payload })
      }

      toast.success(i18n.t('success'), {
        message: i18n.t('addedPlan'),
        durationMs: 2500,
      })
    }

    if (!isEditMode)
      analytics.capture('plan_created', {
        source,
        plan_kind: oneTime ? 'day' : 'recurring',
        scope: scope ?? 'all',
        frequency: oneTime ? undefined : frequency,
        has_category: !!selectedCategoryId,
        has_note: hasNote(savedNote),
        has_formatting: !!savedNote.noteDoc,
        note_photos: savedNote.noteDoc
          ? richTextImages(savedNote.noteDoc.doc).length
          : 0,
        has_title: !!plannedTitle,
        has_location: !!location,
        invited_buddies: oneTime ? (plannedBuddies?.length ?? 0) : 0,
        reminder_enabled: notifyMe,
        time_mode: anytime ? 'hours' : 'span',
        prefilled: !!prefill,
      })
    setSaveScopeModalOpen(false)
    onSaved(detailsTarget)
  }

  const handlePrimarySave = () => {
    if (!validation.validate()) return
    if (existingRecurringPlan) {
      setSelectedSaveScope(null)
      setSaveScopeModalOpen(true)
      return
    }

    savePlan()
  }

  const handleRequestDelete = () => {
    confirmDeletePlan({
      recurring: !!existingRecurringPlan,
      onDelete: (scope) => {
        if (existingDayPlan) {
          deletePlan({ kind: 'day', planId: existingDayPlan.id })
        } else if (existingRecurringPlan) {
          deletePlan(
            {
              kind: 'recurring',
              planId: existingRecurringPlan.id,
              date: editingWriteDate,
            },
            scope
          )
        } else {
          return
        }

        toast.success(i18n.t('success'), {
          message: i18n.t('deleted'),
        })
        onDeleted()
      },
    })
  }

  const buddiesAvailability = useBuddiesAvailability()
  const activeBuddies = useBuddies((state) => state.buddies).filter(
    (buddy) => buddy.status === 'active'
  )
  const buddyRequests = useBuddies((state) => state.incomingClaims.length)
  // A Plan that has happened is history: nobody new is invited to it.
  const planHasEnded =
    date.getTime() + (hours * 60 + minutes) * 60 * 1000 <= Date.now()
  const invitedBuddyNames = activeBuddies
    .filter((buddy) => invitedBuddies.includes(buddy.inboxId))
    .map(buddyDisplayName)
    .join(', ')

  const setUpBuddies = () => {
    analytics.capture('buddies_opened', {
      source: 'plan_form',
      has_requests: buddyRequests > 0,
    })
    navigation.navigate('Buddies')
  }

  // Before any buddy is confirmed, the row opens Buddies to set it up; not
  // while Buddies is turned off, which couldn't pair anyone.
  const buddiesRow =
    !oneTime || linkedShare || planHasEnded
      ? undefined
      : activeBuddies.length && buddiesAvailability !== 'hidden'
        ? {
            summary: invitedBuddyNames || undefined,
            picker: (
              <BuddyPicker
                chipsOnly
                value={invitedBuddies}
                onChange={setInvitedBuddies}
                replies={shareReplies}
              />
            ),
          }
        : buddiesAvailability === 'enabled'
          ? { setUp: setUpBuddies }
          : undefined

  // Asking here, rather than leaving the switch disabled, matches Buddies.
  const handleNotifyMeChange = async (on: boolean) => {
    if (on && !notificationsAllowed && !(await turnOnNotifications())) return
    setNotifyMe(on)
  }

  const handleWillEndChange = () => {
    setEndDate(willEnd ? null : date)
    setWillEnd(!willEnd)
  }

  const saveButton = (
    <ActionButton onPress={handlePrimarySave} testID='plan-save'>
      <Text
        style={{
          color: theme.colors.textInverse,
          fontFamily: theme.fonts.bold,
          fontSize: theme.fontSize('lg'),
        }}
      >
        {isEditMode
          ? i18n.t('save')
          : i18n.t(oneTime ? 'addOneTimePlan' : 'addRecurringPlan')}
      </Text>
    </ActionButton>
  )

  const inline = layout === 'inline'

  const dock = (
    <WhenDock
      durationInvalid={validation.invalid('duration')}
      testID='plan'
      header={
        <>
          {!isEditMode && (
            <PlanKindToggle oneTime={oneTime} setOneTime={setOneTime} />
          )}
          {!oneTime && (
            <PlanRecurrenceControls
              frequency={frequency}
              setFrequency={handleFrequencyChange}
              weekday={weekday}
              setWeekday={setWeekday}
              weekOfMonth={weekOfMonth}
              setWeekOfMonth={setWeekOfMonth}
            />
          )}
        </>
      }
      date={date}
      setDate={handleDateChange}
      hours={hours}
      minutes={minutes}
      setDuration={(nextHours, nextMinutes) => {
        setHours(nextHours)
        setMinutes(nextMinutes)
      }}
      notice={
        linkedShare &&
        organizerName &&
        plannedByOrganizer !== undefined &&
        hours * 60 + minutes !== plannedByOrganizer ? (
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              textAlign: 'center',
            }}
          >
            {i18n.t('planForm_organizerPlanned', {
              name: organizerName,
              hours: organizerHours,
            })}
          </Text>
        ) : undefined
      }
      // Only the hours are the User's: the organizer sets when it is.
      timeSpan={
        linkedShare
          ? undefined
          : {
              anytime,
              setWhen: (when) => {
                setAnytime(when.anytime)
                setHours(Math.floor(when.minutes / 60))
                setMinutes(when.minutes % 60)
                if (when.startTimeInMinutes !== undefined) {
                  const next = new Date(date)
                  next.setHours(0, when.startTimeInMinutes, 0, 0)
                  setDate(next)
                }
                setPreferences({
                  planTimeMode: when.anytime ? 'hours' : 'span',
                })
              },
            }
      }
      durationLabel={i18n.t(
        linkedShare ? 'planForm_yourHours' : 'planForm_duration'
      )}
      maxHours={23}
      minuteStep={5}
      saveButton={inline ? null : saveButton}
      inline={inline}
      hideDate={inline || !!linkedShare}
    />
  )

  const detailsList = (
    <PlanDetailsList
      organizerFields={linkedShare ? 'hidden' : 'editable'}
      title={title}
      setTitle={setTitle}
      location={
        placeSearchProvider('all')
          ? { value: location, onChange: setLocation }
          : undefined
      }
      note={note}
      setNote={setNote}
      buddies={buddiesRow}
      notifyMe={
        hasCapability('deviceNotifications')
          ? {
              on: notificationsAllowed && notifyMe,
              onToggle: (on) => void handleNotifyMeChange(on),
              description: notificationsAllowed
                ? undefined
                : i18n.t('notifyMe_description'),
              offset: anytime ? (
                <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
                  {i18n.t('planForm_anytimeReminder', {
                    time: formatTime(anytimeReminderAt),
                  })}
                </Text>
              ) : (
                <ReminderOffsetSelect
                  value={notifyMeOffset}
                  onChange={setNotifyMeOffset}
                />
              ),
              // A Recurring Plan's later dates still remind.
              notice: oneTime && reminderPassed && (
                <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
                  {i18n.t('reminderTimePassed')}
                </Text>
              ),
            }
          : undefined
      }
      end={
        oneTime
          ? undefined
          : {
              willEnd,
              onToggle: handleWillEndChange,
              endDate,
              setEndDate,
            }
      }
      type={{
        invalid: validation.invalid('category'),
        value: typeValue,
        onChange: handleTypeChange,
        hint:
          typeValue === CUSTOM_TYPE_VALUE
            ? i18n.t('categoryNeeded')
            : undefined,
      }}
    />
  )

  const saveScopeModal = (
    <RecurringSaveScopeModal
      open={saveScopeModalOpen}
      selectedScope={selectedSaveScope}
      setSelectedScope={setSelectedSaveScope}
      onCancel={() => setSaveScopeModalOpen(false)}
      onConfirm={() => {
        if (!selectedSaveScope) return
        savePlan(selectedSaveScope)
      }}
    />
  )

  if (inline) {
    return (
      <>
        <View style={{ gap: 12 }}>
          {dock}
          {detailsList}
          {saveButton}
        </View>
        {saveScopeModal}
      </>
    )
  }

  return (
    <>
      <DockedFormLayout
        dock={dock}
        contentContainerStyle={{
          flexGrow: 1,
          // The details sit just above the dock, near the thumb, rather
          // than at the top of a tall screen. A wide window on the web has
          // no thumb to be near: they start at the top.
          justifyContent: wideOnWeb ? 'flex-start' : 'flex-end',
          gap: 12,
          paddingTop: 10,
          paddingBottom: 16,
          paddingHorizontal: inputLayout.horizontalPadding,
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        {linkedShare && <LinkedPlanBanner share={linkedShare} />}
        {detailsList}
        {isEditMode && (
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
      {saveScopeModal}
    </>
  )
}

/** The Plan form a day's sheet shows, folded into its Plans or in its place. */
export const renderDaySheetPlanForm = ({
  date,
  layout,
  params,
  onDone,
  draftRef,
}: PlanFormSlot) => (
  <PlanDayForm
    params={params ?? { date: date.toISOString() }}
    source='day_sheet'
    layout={layout}
    draftRef={draftRef}
    onSaved={onDone}
    onDeleted={() => onDone()}
  />
)

export default PlanDayForm
