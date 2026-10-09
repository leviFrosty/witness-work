import { analytics } from '@/lib/analytics'
import {
  Calendar1 as Calendar1Icon,
  CornerDownRight as CornerDownRightIcon,
  Repeat as RepeatIcon,
  X as XIcon,
} from 'lucide-react-native'
import { Modal, Pressable, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import useServiceReport from '@/stores/serviceReport'
import * as Crypto from 'expo-crypto'
import { useEffect, useState } from 'react'
import { useToastController } from '@tamagui/toast'
import i18n, { TranslationKey } from '@/lib/locales'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Select from '@/components/ui/Select'
import Wrapper from '@/components/ui/layout/Wrapper'
import Header from '@/components/ui/layout/Header'
import confirmDeletePlan, { deletePlan } from '@/lib/confirmDeletePlan'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import moment from 'moment'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import {
  combineDateAndStartTime,
  localDayFromUtcCursor,
  momentStoredDate,
  preserveOrNormalizeStoredDate,
  storedDateToLocalDate,
} from '@/lib/normalizeDate'
import {
  planDayFromRouteDate,
  splitPlanDate,
} from '@/features/plans/lib/planDayDates'
import { offsetFromMinutes, offsetToMinutes } from '@/lib/notificationOffset'
import {
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
import { RootStackParamList } from '@/types/rootStack'
import type { DayPlan, PlanLocation } from '@/types/timeEntry'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import BuddyPicker from '@/features/buddies/components/BuddyPicker'
import LinkedPlanBanner from '@/features/buddies/components/LinkedPlanBanner'
import useShareReplies from '@/features/buddies/hooks/useShareReplies'
import { planShareKey } from '@/features/buddies/lib/shares'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { placeSearchProvider } from '@/lib/placeSearch'
import PlanDetailsList from '@/features/plans/components/PlanDetailsList'
import PlanRecurrenceControls from '@/features/plans/components/PlanRecurrenceControls'
import PlanKindToggle from '@/features/plans/components/PlanKindToggle'
import DockedFormLayout from '@/components/ui/layout/DockedFormLayout'
import WhenDock from '@/components/WhenDock'
import { noteUserAction } from '@/lib/userAction'
import { richTextImages } from '@/lib/richText/inspect'
import { getNoteDoc, hasNote, noteFields } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'

type NotifyMeOffset = {
  amount: number
  unit: moment.unitOfTime.DurationConstructor
}

type RecurringSaveScope = 'instance' | 'future' | 'all'

type PlanDetailsTarget = RootStackParamList['Plan Details']

const offsetAmountOptions = [...Array(1000).keys()].map((value) => ({
  label: `${value}`,
  value,
}))
const offsetUnitOptions: {
  label: string
  value: moment.unitOfTime.DurationConstructor
}[] = ['minutes', 'hours', 'days', 'weeks'].map((value) => ({
  label: i18n.t(`${value}_lowercase` as TranslationKey),
  value: value as moment.unitOfTime.DurationConstructor,
}))

const storedDateFor = (date: Date) => preserveOrNormalizeStoredDate(date)

const storedDay = (date: Date) => momentStoredDate(storedDateFor(date))

const localDateForWrite = (date: Date) => localDayFromUtcCursor(storedDay(date))

const sameDay = (a: Date, b: Date) => storedDay(a).isSame(storedDay(b), 'day')

const ReminderOffsetSelects = (props: {
  notifyMeOffset: NotifyMeOffset
  setNotifyMeOffset: React.Dispatch<React.SetStateAction<NotifyMeOffset>>
}) => {
  const theme = useTheme()

  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <Select
          data={offsetAmountOptions}
          onChange={({ value: amount }) =>
            props.setNotifyMeOffset({
              ...props.notifyMeOffset,
              amount,
            })
          }
          placeholder={props.notifyMeOffset.amount.toString()}
          value={props.notifyMeOffset.amount.toString()}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Select
          data={offsetUnitOptions}
          onChange={({ value: unit }) =>
            props.setNotifyMeOffset({
              ...props.notifyMeOffset,
              unit,
            })
          }
          value={props.notifyMeOffset.unit}
        />
      </View>
      <Text style={{ color: theme.colors.textAlt }}>{i18n.t('before')}</Text>
    </View>
  )
}

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

  return (
    <Pressable
      accessibilityRole='radio'
      accessibilityState={{ selected: props.selected }}
      onPress={() => props.onPress(props.option.scope)}
      style={({ pressed }) => ({
        borderColor: props.selected ? theme.colors.accent : theme.colors.border,
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
            color={props.selected ? theme.colors.accent : theme.colors.textAlt}
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
          <ScopeTimeline dots={props.option.dots} lines={props.option.lines} />
        </View>
      </View>
    </Pressable>
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
      icon: CornerDownRightIcon,
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
            borderTopLeftRadius: theme.numbers.borderRadiusLg,
            borderTopRightRadius: theme.numbers.borderRadiusLg,
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

          <View style={{ gap: 10 }}>
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
              disabled={!props.selectedScope}
              onPress={props.onConfirm}
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

type PlanDayScreenProps = NativeStackScreenProps<RootStackParamList, 'PlanDay'>

const PlanDayScreen = ({ route, navigation }: PlanDayScreenProps) => {
  // A cold launch from the Calendar widget's "+" (`witnesswork://day`) opens
  // this screen with no params at all.
  const params = route.params ?? {}
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
  const [endDate, setEndDate] = useState<Date | null>(
    existingRecurringPlan?.recurrence.endDate
      ? localDateForWrite(existingRecurringPlan.recurrence.endDate)
      : null
  )
  const [willEnd, setWillEnd] = useState(
    !!existingRecurringPlan?.recurrence.endDate
  )
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
    existingRecurringPlan?.recurrence.interval ?? 1
  )
  const [frequency, setFrequency] = useState<RecurringPlanFrequencies>(
    existingRecurringPlan?.recurrence.frequency ??
      RecurringPlanFrequencies.WEEKLY
  )
  const [weekday, setWeekday] = useState(
    existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekday ?? 0
  )
  const [weekOfMonth, setWeekOfMonth] = useState(
    existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekOfMonth ?? 1
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
  const linkedShare = existingDayPlan?.buddyShare
  const shareReplies = useShareReplies(
    existingDayPlan?.buddies?.length
      ? planShareKey(existingDayPlan.id)
      : undefined
  )

  const { planNotificationOffset, planAlwaysNotify } = usePreferences()
  const { allowed: notificationsAllowed, turnOn: turnOnNotifications } =
    useNotifications()

  const defaultNotifyOffset: NotifyMeOffset = {
    amount:
      planNotificationOffset?.amount ?? DEFAULT_PLAN_NOTIFICATION_OFFSET.amount,
    unit: planNotificationOffset?.unit ?? DEFAULT_PLAN_NOTIFICATION_OFFSET.unit,
  }

  const initialNotifyOffset = (): NotifyMeOffset => {
    const savedMinutes =
      existingDayPlan &&
      savedReminderOffsetMinutes(
        combineDateAndStartTime(
          existingDayPlan.date,
          existingDayPlan.startTimeInMinutes
        ),
        existingDayPlan
      )
    if (typeof savedMinutes === 'number')
      return offsetFromMinutes(savedMinutes) ?? { amount: 0, unit: 'minutes' }
    return defaultNotifyOffset
  }

  const [notifyMe, setNotifyMe] = useState<boolean>(
    existingDayPlan ? !!existingDayPlan.notifyMe : planAlwaysNotify
  )
  const [notifyMeOffset, setNotifyMeOffset] = useState<NotifyMeOffset>(
    initialNotifyOffset()
  )

  const reminderMinutes = offsetToMinutes(notifyMeOffset)
  const reminderPassed =
    reminderMinutes !== null &&
    date.getTime() - reminderMinutes * 60_000 <= Date.now()

  const toast = useToastController()
  const theme = useTheme()

  const editingContext = `${params.existingDayPlanId || 'new'}-${params.existingRecurringPlanId || 'new'}-${params.recurringPlanDate || params.date}-${params.recurring ? 'recurring' : ''}-${JSON.stringify(prefill ?? null)}`

  useEffect(() => {
    setOneTime(initialOneTime)
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
    setEndDate(
      existingRecurringPlan?.recurrence.endDate
        ? localDateForWrite(existingRecurringPlan.recurrence.endDate)
        : null
    )
    setWillEnd(!!existingRecurringPlan?.recurrence.endDate)
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
    setInterval(existingRecurringPlan?.recurrence.interval ?? 1)
    setFrequency(
      existingRecurringPlan?.recurrence.frequency ??
        RecurringPlanFrequencies.WEEKLY
    )
    setWeekday(
      existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekday ?? 0
    )
    setWeekOfMonth(
      existingRecurringPlan?.recurrence.monthlyByWeekdayConfig?.weekOfMonth ?? 1
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
    setNotifyMe(existingDayPlan ? !!existingDayPlan.notifyMe : planAlwaysNotify)
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
          date: new Date(planStart.getTime() - minutes * 60_000),
        },
      ],
    }
  }

  const buildRecurringPayload = () => {
    const { date: planDate, startTimeInMinutes } = splitPlanDate(date)
    return {
      startDate: planDate,
      startTimeInMinutes,
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
    // Like the Type, title and location are pattern-level: an instance that
    // changes them becomes its own Day Plan.
    const detailsChanged =
      payload.title !== existingRecurringPlan.title ||
      JSON.stringify(payload.location) !==
        JSON.stringify(existingRecurringPlan.location)

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
          minutes: payload.minutes,
          categoryId: payload.categoryId,
          title: payload.title,
          location: payload.location,
          note: payload.note,
          noteDoc: payload.noteDoc,
          notifyMe: false,
          notifications: [],
        })

        return { dayPlanId: id }
      }

      const override = {
        date: instanceDate,
        minutes: payload.minutes,
        startTimeInMinutes: payload.startTimeInMinutes,
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
    })
    return editedDate
  }

  const savePlan = async (scope?: RecurringSaveScope) => {
    noteUserAction('plan')
    const { date: planDate, startTimeInMinutes } = splitPlanDate(date)
    const plannedMinutes = hours * 60 + minutes
    const plannedTitle = title.trim() || undefined
    const plannedBuddies =
      !linkedShare && invitedBuddies.length > 0 ? invitedBuddies : undefined

    // Where Plan Details shows the saved Plan: an edit can move it, and one
    // created from Plan Details (Duplicate, Invite) opens next.
    let detailsTarget: PlanDetailsTarget | undefined
    if (isEditMode) {
      if (existingDayPlan) {
        detailsTarget = { dayPlanId: existingDayPlan.id }
        updateDayPlan({
          id: existingDayPlan.id,
          date: planDate,
          startTimeInMinutes,
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

      toast.show(i18n.t('success'), {
        message: i18n.t('updatedPlan'),
        native: true,
        duration: 2500,
      })
    } else {
      if (oneTime) {
        const id = Crypto.randomUUID()
        detailsTarget = { dayPlanId: id }
        addDayPlan({
          id,
          date: planDate,
          startTimeInMinutes,
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

      toast.show(i18n.t('success'), {
        message: i18n.t('addedPlan'),
        native: true,
        duration: 2500,
      })
    }

    if (!isEditMode)
      analytics.capture('plan_created', {
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
        reminder_enabled: oneTime && notifyMe,
        prefilled: !!prefill,
      })
    setSaveScopeModalOpen(false)
    const { routes } = navigation.getState()
    const opener = routes[routes.length - 2]?.name
    if (detailsTarget && opener === 'Plan Details') {
      navigation.popTo('Plan Details', detailsTarget)
    } else {
      navigation.goBack()
    }
  }

  const saveDisabled =
    (hours === 0 && minutes === 0) || typeValue === CUSTOM_TYPE_VALUE

  const handlePrimarySave = () => {
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

        toast.show(i18n.t('success'), {
          message: i18n.t('deleted'),
          native: true,
        })
        navigation.goBack()
      },
    })
  }

  useEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          noInsets
          title={i18n.t(isEditMode ? 'editPlan' : 'createPlan')}
        />
      ),
    })
  }, [isEditMode, navigation])

  const buddiesEnabled = useBuddiesEnabled()
  const activeBuddies = useBuddies((state) => state.buddies).filter(
    (buddy) => buddy.status === 'active'
  )
  const invitedBuddyNames = activeBuddies
    .filter((buddy) => invitedBuddies.includes(buddy.inboxId))
    .map(buddyDisplayName)
    .join(', ')

  // Asking here, rather than leaving the switch disabled, matches Buddies.
  const handleNotifyMeChange = async (on: boolean) => {
    if (on && !notificationsAllowed && !(await turnOnNotifications())) return
    setNotifyMe(on)
  }

  const handleWillEndChange = () => {
    setEndDate(willEnd ? null : date)
    setWillEnd(!willEnd)
  }

  const dock = (
    <WhenDock
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
      showTime
      hours={hours}
      minutes={minutes}
      setDuration={(nextHours, nextMinutes) => {
        setHours(nextHours)
        setMinutes(nextMinutes)
      }}
      durationLabel={i18n.t('planForm_duration')}
      maxHours={23}
      minuteStep={5}
      saveButton={
        <ActionButton
          onPress={handlePrimarySave}
          disabled={saveDisabled}
          testID='plan-save'
        >
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {isEditMode
              ? i18n.t('save')
              : `${i18n.t('add')} ${i18n.t(oneTime ? 'oneTime' : 'recurring')} ${i18n.t('plan')}`}
          </Text>
        </ActionButton>
      }
    />
  )

  return (
    // The dock applies the bottom safe area itself.
    <Wrapper insets='none' style={{ flex: 1 }}>
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
        {linkedShare && <LinkedPlanBanner share={linkedShare} />}
        <PlanDetailsList
          title={title}
          setTitle={setTitle}
          location={
            placeSearchProvider('all')
              ? { value: location, onChange: setLocation }
              : undefined
          }
          note={note}
          setNote={setNote}
          buddies={
            oneTime && !linkedShare && buddiesEnabled && activeBuddies.length
              ? {
                  summary: invitedBuddyNames || undefined,
                  picker: (
                    <View style={{ gap: 8 }}>
                      <BuddyPicker
                        chipsOnly
                        value={invitedBuddies}
                        onChange={setInvitedBuddies}
                        description={i18n.t('buddies_invitePlanDescription')}
                        replies={shareReplies}
                      />
                      <Text
                        style={{
                          color: theme.colors.textAlt,
                          fontSize: 12,
                        }}
                      >
                        {i18n.t('buddies_invitePlanDescription')}
                      </Text>
                    </View>
                  ),
                }
              : undefined
          }
          notifyMe={
            oneTime
              ? {
                  on: notificationsAllowed && notifyMe,
                  onToggle: (on) => void handleNotifyMeChange(on),
                  description: notificationsAllowed
                    ? undefined
                    : i18n.t('notifyMe_description'),
                  offset: (
                    <ReminderOffsetSelects
                      notifyMeOffset={notifyMeOffset}
                      setNotifyMeOffset={setNotifyMeOffset}
                    />
                  ),
                  notice: reminderPassed && (
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
            value: typeValue,
            onChange: handleTypeChange,
            hint:
              typeValue === CUSTOM_TYPE_VALUE
                ? i18n.t('categoryNeeded')
                : undefined,
          }}
        />
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
    </Wrapper>
  )
}

export default PlanDayScreen
