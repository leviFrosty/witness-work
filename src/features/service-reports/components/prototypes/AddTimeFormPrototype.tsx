/**
 * PROTOTYPE — throwaway. Not for main.
 *
 * Question: after Add Time's reachability rework (docked pills, Details above
 * the dock), the form reads unclearly. What should Add Time look like, both
 * full screen and inside a day sheet's folded "Add Time" card?
 *
 * Variants render inside the real TimeEntryForm (same state, same submit), and
 * are switched in dev with `__ADD_TIME_PROTO__.getState().setVariant('A')` or
 * the floating bar (`setBar(true)`). `current` is the shipped form.
 */
import { ReactNode, Ref, useEffect, useRef, useState } from 'react'
import {
  Platform,
  StyleSheet,
  TextInput as NativeTextInput,
  View,
} from 'react-native'
import { create } from 'zustand'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import {
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  ChevronDown as ChevronDownIcon,
  ChevronsUpDown as ChevronsUpDownIcon,
  Maximize2 as Maximize2Icon,
  Minus as MinusIcon,
  Pencil as PencilIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import {
  ChevronBackwardIcon as ChevronLeftIcon,
  ChevronForwardIcon as ChevronRightIcon,
} from '@/components/ui/DirectionalIcon'
import { alignText } from '@/lib/direction'
import PointerTooltip from '@/components/ui/PointerTooltip'
import ActionButton from '@/components/ui/ActionButton'
import DateTimePicker, { DateTimeDialog } from '@/components/ui/DateTimePicker'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PickerSheet from '@/components/ui/PickerSheet'
import PullDownMenu from '@/components/ui/PullDownMenu'
import Select from '@/components/ui/Select'
import WheelPicker from '@/components/ui/WheelPicker'
import Section from '@/components/ui/inputs/Section'
import NoteFormRow from '@/components/ui/inputs/NoteFormRow'
import DockedFormLayout from '@/components/ui/layout/DockedFormLayout'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { useCardStyle } from '@/components/ui/Card'
import {
  CUSTOM_TYPE_VALUE,
  STANDARD_TYPE_VALUE,
  type TypeSelection,
} from '@/components/TypeSelectorRow'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import {
  formatMinutes,
  formatMinutesCompact,
  useFormattedMinutes,
} from '@/lib/minutes'
import useServiceReport from '@/stores/serviceReport'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import { calendarMonthOf, roleForMonth } from '@/lib/roleHistory'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { useOpenNoteEditor } from '@/hooks/useOpenNoteEditor'
import { getNoteDoc, noteFields } from '@/lib/richText/notes'
import { formatPlainNumber } from '@/lib/numbers'
import { formatDate, formatWeekdayMonthDayCompact } from '@/lib/dates'
import { tracking } from '@/lib/tracking'
import { usePreferences } from '@/stores/preferences'
import useCategories from '@/stores/categories'
import type { NoteUpdate } from '@/lib/richText/notes'
import type { TimeEntry } from '@/types/timeEntry'
import type { Category } from '@/types/category'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type AddTimeVariant = 'current' | 'A' | 'B' | 'C' | 'D' | 'E'
const VARIANTS: AddTimeVariant[] = ['current', 'A', 'B', 'C', 'D', 'E']
/** Variants that use the day sheet's own Add Time card. */
export const CARD_VARIANTS: AddTimeVariant[] = ['D', 'E']
const VARIANT_NAMES: Record<AddTimeVariant, string> = {
  current: 'Shipped',
  A: 'Quick amounts',
  B: 'Grouped list',
  C: 'Inline wheels',
  D: 'Combined',
  E: 'Quiet',
}

export const useAddTimePrototype = create<{
  variant: AddTimeVariant
  bar: boolean
  setVariant: (variant: AddTimeVariant) => void
  setBar: (bar: boolean) => void
}>((set) => ({
  variant: 'current',
  bar: false,
  setVariant: (variant) => set({ variant }),
  setBar: (bar) => set({ bar }),
}))

if (__DEV__) {
  ;(globalThis as Record<string, unknown>).__ADD_TIME_PROTO__ =
    useAddTimePrototype
}

/** Floating dev-only switcher; hidden unless `bar` is on. */
export const AddTimePrototypeSwitcher = () => {
  const { variant, bar, setVariant } = useAddTimePrototype()
  const insets = useSafeAreaInsets()
  if (!__DEV__ || !bar) return null
  const index = VARIANTS.indexOf(variant)
  const step = (by: number) =>
    setVariant(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length])
  return (
    <View
      pointerEvents='box-none'
      style={{
        position: 'absolute',
        top: insets.top + 4,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#111',
          borderRadius: 999,
          paddingHorizontal: 4,
        }}
      >
        <Button noTransform onPress={() => step(-1)} style={{ padding: 12 }}>
          <LucideIcon icon={ChevronLeftIcon} size={18} color='#fff' />
        </Button>
        <Text style={{ color: '#fff' }}>
          {variant} ({VARIANT_NAMES[variant]})
        </Text>
        <Button noTransform onPress={() => step(1)} style={{ padding: 12 }}>
          <LucideIcon icon={ChevronRightIcon} size={18} color='#fff' />
        </Button>
      </View>
    </View>
  )
}

export type ProtoFormProps = {
  variant: Exclude<AddTimeVariant, 'current'>
  inline: boolean
  editing: boolean
  date: Date
  setDate: (date: Date) => void
  hours: number
  minutes: number
  setDuration: (hours: number, minutes: number) => void
  typeValue: string
  onTypeChange: (selection: TypeSelection) => void
  note: TimeEntry
  setNote: (note: NoteUpdate) => void
  durationInvalid: boolean
  typeInvalid: boolean
  notice?: ReactNode
  onSubmit: () => void
  onDelete?: () => void
}

// ---------------------------------------------------------------------------
// Small shared pieces (fields, not layouts)

const useTypeOptions = () => {
  const { categories } = useCategories()
  const userCategories = categories.filter(
    (c) => c.id !== LDC_BUILTIN_CATEGORY_ID
  )
  return [
    { label: i18n.t('standard'), value: STANDARD_TYPE_VALUE },
    { label: i18n.t('ldc'), value: LDC_BUILTIN_CATEGORY_ID },
    ...userCategories.map((c) => ({
      label: i18n.t(c.name as TranslationKey, { defaultValue: c.name }),
      value: c.id,
    })),
  ]
}

const useSelectType = (onTypeChange: ProtoFormProps['onTypeChange']) => {
  const { categories } = useCategories()
  return (value: string) => {
    if (value === STANDARD_TYPE_VALUE || value === CUSTOM_TYPE_VALUE) {
      onTypeChange({ value, category: null })
      return
    }
    const category = categories.find((c) => c.id === value)
    if (category) onTypeChange({ value, category })
  }
}

const dayLabel = (date: Date) => {
  const day = moment(date).startOf('day')
  const today = moment().startOf('day')
  if (day.isSame(today)) {
    return `${i18n.t('today')} · ${formatWeekdayMonthDayCompact(day)}`
  }
  if (day.isSame(today.clone().subtract(1, 'day'), 'day')) {
    return `${i18n.t('protoAddTime_yesterday')} · ${formatWeekdayMonthDayCompact(day)}`
  }
  if (day.isSame(today, 'year')) return formatWeekdayMonthDayCompact(day)
  return formatDate(day, { style: 'medium' })
}

const SectionLabel = (props: { children: string; trailing?: ReactNode }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
      }}
    >
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          textTransform: 'uppercase',
          letterSpacing: tracking(0.5),
        }}
      >
        {props.children}
      </Text>
      {props.trailing}
    </View>
  )
}

/** A 44pt+ selectable chip. */
const Chip = (props: {
  label: string
  active: boolean
  onPress: () => void
  icon?: AppIcon
  dashed?: boolean
  testID?: string
}) => {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={props.onPress}
      accessibilityRole='radio'
      accessibilityState={{ checked: props.active }}
      testID={props.testID}
      style={{
        minHeight: 44,
        minWidth: 56,
        paddingHorizontal: 16,
        borderRadius: 999,
        borderCurve: 'continuous',
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderStyle: props.dashed ? 'dashed' : 'solid',
        borderColor: props.active ? theme.colors.accent : theme.colors.border,
        backgroundColor: props.active
          ? theme.colors.accentTranslucent
          : theme.colors.card,
      }}
    >
      {props.icon && (
        <LucideIcon icon={props.icon} size={16} color={theme.colors.text} />
      )}
      <Text
        style={{
          fontFamily: props.active ? theme.fonts.semiBold : theme.fonts.medium,
          color: theme.colors.text,
        }}
      >
        {props.label}
      </Text>
    </Button>
  )
}

/** Round 44pt − / + button. */
const StepButton = (props: {
  icon: AppIcon
  onPress: () => void
  label: string
  disabled?: boolean
  size?: number
  /** Gray fill with a green glyph, so it doesn't read as a selection. */
  neutral?: boolean
}) => {
  const theme = useTheme()
  const size = props.size ?? 44
  const green =
    theme.colors.background === '#E9E9E9' ? '#087A33' : theme.colors.accent
  return (
    <Button
      noTransform
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole='button'
      accessibilityLabel={props.label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.neutral
          ? theme.colors.background === '#E9E9E9'
            ? '#EBEBEF'
            : '#3A3A3C'
          : theme.colors.accentTranslucent,
        opacity: props.disabled && !props.neutral ? 0.4 : 1,
      }}
    >
      <LucideIcon
        icon={props.icon}
        size={20}
        color={
          props.disabled && props.neutral
            ? theme.colors.textAlt
            : props.neutral
              ? green
              : theme.colors.accent
        }
        style={{ opacity: props.disabled && props.neutral ? 0.65 : 1 }}
      />
    </Button>
  )
}

/** Type chips plus "New" that names a Category in place. */
const TypeChips = (props: {
  value: string
  onTypeChange: ProtoFormProps['onTypeChange']
}) => {
  const theme = useTheme()
  const options = useTypeOptions()
  const select = useSelectType(props.onTypeChange)
  const { addCategory } = useCategories()
  const [name, setName] = useState('')
  const creating = props.value === CUSTOM_TYPE_VALUE
  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const category: Category = {
      id: Crypto.randomUUID(),
      name: trimmed,
      isCredit: false,
    }
    addCategory(category)
    props.onTypeChange({ value: category.id, category })
    setName('')
  }
  return (
    <View style={{ gap: 10 }}>
      <View
        accessibilityRole='radiogroup'
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
      >
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={props.value === option.value}
            onPress={() => select(option.value)}
          />
        ))}
        <Chip
          label={i18n.t('protoAddTime_newType')}
          icon={PlusIcon}
          dashed
          active={creating}
          onPress={() => select(CUSTOM_TYPE_VALUE)}
        />
      </View>
      {creating && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <NativeTextInput
            autoFocus
            value={name}
            onChangeText={setName}
            onSubmitEditing={add}
            placeholder={i18n.t('enterCustomCategory')}
            placeholderTextColor={theme.colors.textAlt}
            maxLength={20}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: theme.numbers.borderRadiusSm,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 12,
              color: theme.colors.text,
              fontFamily: theme.fonts.regular,
            }}
          />
          <ActionButton onPress={add} size='md'>
            {i18n.t('add')}
          </ActionButton>
        </View>
      )}
    </View>
  )
}

const DurationWheels = (props: {
  hours: number
  minutes: number
  minuteStep: number
  onChange: (hours: number, minutes: number) => void
}) => {
  const theme = useTheme()
  const hourItems = [...Array(25).keys()].map((value) => ({
    value,
    label: formatPlainNumber(value),
  }))
  const minuteValues = [...Array(Math.ceil(60 / props.minuteStep)).keys()].map(
    (i) => i * props.minuteStep
  )
  if (!minuteValues.includes(props.minutes)) {
    minuteValues.push(props.minutes)
    minuteValues.sort((a, b) => a - b)
  }
  const minuteItems = minuteValues.map((value) => ({
    value,
    label: formatPlainNumber(value),
  }))
  const unit = (text: string) => (
    <Text style={{ color: theme.colors.textAlt, minWidth: 40 }}>{text}</Text>
  )
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <WheelPicker
          data={hourItems}
          value={props.hours}
          onValueChange={(hours) => props.onChange(hours, props.minutes)}
          accessibilityLabel={i18n.t('hours')}
          testID='proto-hours'
        />
      </View>
      {unit(i18n.t('hours_lowercase'))}
      <View style={{ flex: 1 }}>
        <WheelPicker
          data={minuteItems}
          value={props.minutes}
          onValueChange={(minutes) => props.onChange(props.hours, minutes)}
          accessibilityLabel={i18n.t('minutes')}
          testID='proto-minutes'
        />
      </View>
      {unit(i18n.t('protoAddTime_min'))}
    </View>
  )
}

/** Sheet with exact wheels, for the readouts that open one. */
const DurationSheet = (props: {
  open: boolean
  hours: number
  minutes: number
  onClose: () => void
  onDone: (hours: number, minutes: number) => void
}) => {
  const [draft, setDraft] = useState({ h: props.hours, m: props.minutes })
  const [wasOpen, setWasOpen] = useState(props.open)
  if (props.open !== wasOpen) {
    setWasOpen(props.open)
    if (props.open) setDraft({ h: props.hours, m: props.minutes })
  }
  return (
    <PickerSheet
      open={props.open}
      onCancel={props.onClose}
      onDone={() => props.onDone(draft.h, draft.m)}
    >
      <DurationWheels
        hours={draft.h}
        minutes={draft.m}
        minuteStep={1}
        onChange={(h, m) => setDraft({ h, m })}
      />
    </PickerSheet>
  )
}

const useDatePicker = (date: Date, setDate: (date: Date) => void) => {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(date)
  const openPicker = () => {
    setDraft(date)
    setOpen(true)
  }
  const merge = (picked: Date) => {
    const next = new Date(date)
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate())
    return next
  }
  const element =
    Platform.OS === 'android' ? (
      open ? (
        <DateTimeDialog
          part='date'
          value={date}
          onPick={(picked) => {
            setOpen(false)
            setDate(merge(picked))
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null
    ) : (
      <PickerSheet
        open={open}
        onCancel={() => setOpen(false)}
        onDone={() => {
          setDate(merge(draft))
          setOpen(false)
        }}
      >
        <View style={{ alignItems: 'center', paddingHorizontal: 8 }}>
          <DateTimePicker
            value={draft}
            display='inline'
            maximumDate={new Date()}
            onChange={(_, picked) => picked && setDraft(picked)}
          />
        </View>
      </PickerSheet>
    )
  return { openPicker, element }
}

const submitLabel = (editing: boolean, total: number, duration: string) =>
  editing
    ? i18n.t('save')
    : total > 0
      ? i18n.t('protoAddTime_addDuration', { duration })
      : i18n.t('addTime')

/**
 * Lays a variant out for its host: full screen keeps the content near the thumb
 * and docks the primary button, inline (a day sheet's card) stacks it.
 */
const Host = (props: {
  inline: boolean
  children: ReactNode
  button: ReactNode
  footer?: ReactNode
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  if (props.inline) {
    return (
      <View style={{ gap: 16 }}>
        {props.children}
        {props.button}
      </View>
    )
  }
  return (
    <DockedFormLayout
      dock={
        <View
          style={{
            backgroundColor: theme.colors.background,
            paddingTop: 12,
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: inputLayout.contentMaxWidth,
              alignSelf: 'center',
            }}
          >
            {props.button}
          </View>
        </View>
      }
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'flex-end',
        gap: 20,
        paddingTop: 16,
        paddingBottom: 8,
        paddingHorizontal: inputLayout.horizontalPadding,
        width: '100%',
        maxWidth: inputLayout.contentMaxWidth,
        alignSelf: 'center',
      }}
    >
      {props.children}
      {props.footer}
    </DockedFormLayout>
  )
}

const DeleteLink = (props: { onPress?: () => void }) => {
  const theme = useTheme()
  if (!props.onPress) return null
  return (
    <Button
      noTransform
      onPress={props.onPress}
      accessibilityRole='button'
      style={{ alignItems: 'center', paddingVertical: 12 }}
    >
      <Text
        style={{
          color: theme.colors.error,
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {i18n.t('deleteEllipsis')}
      </Text>
    </Button>
  )
}

const NoteSection = (props: ProtoFormProps) => (
  <Section>
    <NoteFormRow
      first
      note={props.note}
      onChange={props.setNote}
      surface='time_entry'
      maxLength={500}
      testID='time-entry-note'
    />
  </Section>
)

// ---------------------------------------------------------------------------
// A — Quick amounts: a big readout with ± and preset chips, Type as chips.

const PRESETS = [30, 60, 90, 120, 180, 240]
const STEP = 15

const VariantA = (props: ProtoFormProps) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const format = usePreferences((s) => s.timeDisplayFormat)
  const total = props.hours * 60 + props.minutes
  const { formatted } = useFormattedMinutes(total)
  const [sheet, setSheet] = useState(false)
  const date = useDatePicker(props.date, props.setDate)
  const setTotal = (next: number) => {
    const clamped = Math.max(0, Math.min(next, 24 * 60))
    props.setDuration(Math.floor(clamped / 60), clamped % 60)
  }
  const card = {
    ...cardStyle,
    padding: 16,
    gap: 14,
  }
  return (
    <Host
      inline={props.inline}
      footer={<DeleteLink onPress={props.onDelete} />}
      button={
        <ActionButton onPress={props.onSubmit} testID='time-entry-save'>
          {submitLabel(props.editing, total, formatted)}
        </ActionButton>
      }
    >
      {!props.inline && (
        <Button
          noTransform
          onPress={date.openPicker}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('date')}
          style={{
            ...cardStyle,
            minHeight: 52,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <LucideIcon
            icon={CalendarIcon}
            size={20}
            color={theme.colors.textAlt}
          />
          <Text style={{ flex: 1, fontFamily: theme.fonts.semiBold }}>
            {dayLabel(props.date)}
          </Text>
          <Text style={{ color: theme.colors.accent }}>
            {i18n.t('protoAddTime_change')}
          </Text>
        </Button>
      )}
      <View style={{ gap: 8 }}>
        <SectionLabel>{i18n.t('protoAddTime_howMuchTime')}</SectionLabel>
        <View
          style={[
            card,
            props.durationInvalid && { borderColor: theme.colors.error },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <StepButton
              icon={MinusIcon}
              label={i18n.t('protoAddTime_less', {
                duration: formatMinutes(STEP, format).formatted,
              })}
              disabled={total === 0}
              onPress={() => setTotal(total - STEP)}
              size={48}
            />
            <Button
              noTransform
              onPress={() => setSheet(true)}
              accessibilityRole='button'
              accessibilityLabel={i18n.t('time')}
              accessibilityValue={{ text: formatted }}
              testID='time-entry-duration-pill'
              style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}
            >
              <Text
                style={{
                  fontSize: 34,
                  fontFamily: theme.fonts.bold,
                  color: total ? theme.colors.text : theme.colors.textAlt,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatted}
              </Text>
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('protoAddTime_tapForExact')}
              </Text>
            </Button>
            <StepButton
              icon={PlusIcon}
              label={i18n.t('protoAddTime_more', {
                duration: formatMinutes(STEP, format).formatted,
              })}
              onPress={() => setTotal(total + STEP)}
              size={48}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
            }}
          >
            {PRESETS.map((preset) => (
              <Chip
                key={preset}
                label={formatMinutes(preset, format).formatted}
                active={total === preset}
                onPress={() => setTotal(preset)}
              />
            ))}
          </View>
          {props.notice}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <SectionLabel>{i18n.t('type')}</SectionLabel>
        <TypeChips value={props.typeValue} onTypeChange={props.onTypeChange} />
      </View>
      <NoteSection {...props} />
      <DurationSheet
        open={sheet}
        hours={props.hours}
        minutes={props.minutes}
        onClose={() => setSheet(false)}
        onDone={(h, m) => {
          props.setDuration(h, m)
          setSheet(false)
        }}
      />
      {date.element}
    </Host>
  )
}

// ---------------------------------------------------------------------------
// B — Grouped list: one labelled list, like Health's Add Data, with steppers.

const ListRow = (props: {
  label: string
  first?: boolean
  children: ReactNode
  invalid?: boolean
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderTopWidth: props.first ? 0 : 1,
        borderTopColor: theme.colors.border,
      }}
    >
      <Text
        style={{
          flexShrink: 1,
          fontFamily: theme.fonts.medium,
          fontSize: theme.fontSize('md'),
          color: props.invalid ? theme.colors.error : theme.colors.text,
        }}
      >
        {props.label}
      </Text>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        {props.children}
      </View>
    </View>
  )
}

const Stepper = (props: {
  value: number
  unit: string
  step: number
  max: number
  onChange: (value: number) => void
  onPressValue: () => void
  label: string
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <StepButton
        icon={MinusIcon}
        label={`${props.label} −`}
        disabled={props.value <= 0}
        onPress={() => props.onChange(Math.max(0, props.value - props.step))}
      />
      <Button
        noTransform
        onPress={props.onPressValue}
        accessibilityRole='adjustable'
        accessibilityLabel={props.label}
        accessibilityValue={{ text: `${props.value} ${props.unit}` }}
        style={{
          minWidth: 64,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatPlainNumber(props.value)}
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.regular,
            }}
          >
            {` ${props.unit}`}
          </Text>
        </Text>
      </Button>
      <StepButton
        icon={PlusIcon}
        label={`${props.label} +`}
        disabled={props.value >= props.max}
        onPress={() =>
          props.onChange(Math.min(props.max, props.value + props.step))
        }
      />
    </View>
  )
}

const VariantB = (props: ProtoFormProps) => {
  const theme = useTheme()
  const total = props.hours * 60 + props.minutes
  const { formatted } = useFormattedMinutes(total)
  const [sheet, setSheet] = useState(false)
  const date = useDatePicker(props.date, props.setDate)
  const options = useTypeOptions()
  const select = useSelectType(props.onTypeChange)
  return (
    <Host
      inline={props.inline}
      footer={<DeleteLink onPress={props.onDelete} />}
      button={
        <ActionButton onPress={props.onSubmit} testID='time-entry-save'>
          {submitLabel(props.editing, total, formatted)}
        </ActionButton>
      }
    >
      <View style={{ gap: 8 }}>
        <SectionLabel
          trailing={
            total > 0 ? (
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {formatted}
              </Text>
            ) : undefined
          }
        >
          {i18n.t('time')}
        </SectionLabel>
        <Section
          style={
            props.durationInvalid
              ? { borderWidth: 1, borderColor: theme.colors.error }
              : undefined
          }
        >
          <ListRow first label={i18n.t('hours')}>
            <Stepper
              label={i18n.t('hours')}
              unit={i18n.t('protoAddTime_hr')}
              value={props.hours}
              step={1}
              max={24}
              onChange={(hours) => props.setDuration(hours, props.minutes)}
              onPressValue={() => setSheet(true)}
            />
          </ListRow>
          <ListRow label={i18n.t('minutes')}>
            <Stepper
              label={i18n.t('minutes')}
              unit={i18n.t('protoAddTime_min')}
              value={props.minutes}
              step={15}
              max={45}
              onChange={(minutes) => props.setDuration(props.hours, minutes)}
              onPressValue={() => setSheet(true)}
            />
          </ListRow>
        </Section>
        {props.notice}
      </View>
      <View style={{ gap: 8 }}>
        <SectionLabel>{i18n.t('protoAddTime_details')}</SectionLabel>
        <Section>
          {!props.inline && (
            <ListRow first label={i18n.t('date')}>
              <Button
                noTransform
                onPress={date.openPicker}
                accessibilityRole='button'
                accessibilityLabel={i18n.t('date')}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: 'rgba(118,118,128,0.16)',
                }}
              >
                <Text style={{ fontFamily: theme.fonts.medium }}>
                  {dayLabel(props.date)}
                </Text>
              </Button>
            </ListRow>
          )}
          <ListRow
            first={props.inline}
            label={i18n.t('type')}
            invalid={props.typeInvalid}
          >
            <Select
              data={options}
              value={props.typeValue}
              onChange={({ value }) => select(value)}
            />
          </ListRow>
          <NoteFormRow
            note={props.note}
            onChange={props.setNote}
            surface='time_entry'
            maxLength={500}
            testID='time-entry-note'
          />
        </Section>
      </View>
      <DurationSheet
        open={sheet}
        hours={props.hours}
        minutes={props.minutes}
        onClose={() => setSheet(false)}
        onDone={(h, m) => {
          props.setDuration(h, m)
          setSheet(false)
        }}
      />
      {date.element}
    </Host>
  )
}

// ---------------------------------------------------------------------------
// C — Inline wheels: the duration wheels always on screen, no extra sheet.

const VariantC = (props: ProtoFormProps) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const total = props.hours * 60 + props.minutes
  const { formatted } = useFormattedMinutes(total)
  const date = useDatePicker(props.date, props.setDate)
  return (
    <Host
      inline={props.inline}
      footer={<DeleteLink onPress={props.onDelete} />}
      button={
        <ActionButton onPress={props.onSubmit} testID='time-entry-save'>
          {submitLabel(props.editing, total, formatted)}
        </ActionButton>
      }
    >
      <View style={{ gap: 8 }}>
        <SectionLabel
          trailing={
            !props.inline ? (
              <Button
                noTransform
                onPress={date.openPicker}
                accessibilityRole='button'
                accessibilityLabel={i18n.t('date')}
                style={{
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <LucideIcon
                  icon={CalendarIcon}
                  size={16}
                  color={theme.colors.accent}
                />
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {dayLabel(props.date)}
                </Text>
              </Button>
            ) : undefined
          }
        >
          {i18n.t('planForm_howLong')}
        </SectionLabel>
        <View
          style={[
            cardStyle,
            { paddingVertical: 4 },
            props.durationInvalid && { borderColor: theme.colors.error },
          ]}
        >
          <DurationWheels
            hours={props.hours}
            minutes={props.minutes}
            minuteStep={5}
            onChange={props.setDuration}
          />
        </View>
        {props.notice}
      </View>
      <View style={{ gap: 8 }}>
        <SectionLabel>{i18n.t('type')}</SectionLabel>
        <TypeChips value={props.typeValue} onTypeChange={props.onTypeChange} />
      </View>
      <NoteSection {...props} />
      {date.element}
    </Host>
  )
}

// ---------------------------------------------------------------------------
// D — Combined: A's time hero and presets, B's grouped value rows, a month
// strip above that previews what the entry adds.

const D_PRESETS = [30, 60, 90, 120, 180]
/** Brand green dark enough to read as text on the light theme. */
const useGreenText = () => {
  const theme = useTheme()
  return theme.colors.background === '#E9E9E9' ? '#0F7535' : theme.colors.accent
}
const D_GAP = 12

/** A preset in the User's own format, short enough for a row of five. */
const presetLabel = (minutes: number, format: 'decimal' | 'short') =>
  format === 'decimal'
    ? formatPlainNumber(minutes / 60)
    : formatMinutesCompact(minutes)

/**
 * Unselected = quiet gray fill; selected = green tint, 2pt green border and a
 * check, so it never rests on color alone. The CTA alone is solid green.
 */
const DChip = (props: {
  label: string
  active: boolean
  onPress: () => void
  flex?: boolean
  dashed?: boolean
  icon?: AppIcon
  accessibilityLabel?: string
  role?: 'radio' | 'button'
  /** Presets: the field above already shows the value, so no check. */
  noCheck?: boolean
  testID?: string
}) => {
  const theme = useTheme()
  const light = theme.colors.background === '#E9E9E9'
  const icon = props.icon
  return (
    <Button
      noTransform
      onPress={props.onPress}
      accessibilityRole={props.role ?? 'radio'}
      testID={props.testID}
      accessibilityLabel={props.accessibilityLabel}
      accessibilityState={
        props.role === 'button' ? undefined : { checked: props.active }
      }
      style={{
        flex: props.flex ? 1 : undefined,
        minHeight: 44,
        paddingHorizontal: props.flex ? 2 : 16,
        minWidth: props.flex ? undefined : 64,
        borderRadius: 999,
        borderCurve: 'continuous',
        flexDirection: 'row',
        gap: 4,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: props.active ? 2 : 0,
        // Light mode: the darker green clears 3:1 for a state indicator.
        borderColor: props.active
          ? light
            ? '#0F7535'
            : theme.colors.accent
          : light
            ? '#C7C7CC'
            : '#3A3A3E',
        backgroundColor: props.active
          ? light
            ? '#DDF6E6'
            : '#1F4D30'
          : light
            ? '#EBEBEF'
            : '#444446',
      }}
    >
      {icon && (
        <LucideIcon
          icon={icon}
          size={15}
          strokeWidth={props.active ? 3 : 2}
          color={theme.colors.text}
        />
      )}
      <Text
        numberOfLines={1}
        style={{
          fontFamily: props.active ? theme.fonts.bold : theme.fonts.medium,
          color: theme.colors.text,
        }}
      >
        {props.label}
      </Text>
    </Button>
  )
}

/** A plain row inside a card: label, muted value, chevron. */
const DValueRow = (props: {
  divider?: boolean
  label: string
  value: string
  onPress: () => void
  inset?: number
  /** A recessed field, matching the time field, for a lone row. */
  filled?: boolean
}) => {
  const theme = useTheme()
  const light = theme.colors.background === '#E9E9E9'
  return (
    <Button
      noTransform
      onPress={props.onPress}
      accessibilityRole='button'
      accessibilityLabel={props.label}
      accessibilityValue={{ text: props.value }}
      style={{
        minHeight: props.filled ? 48 : 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: props.filled ? 14 : (props.inset ?? 0),
        borderRadius: props.filled ? 12 : 0,
        borderCurve: 'continuous',
        backgroundColor: props.filled
          ? light
            ? '#F0F0F3'
            : '#323234'
          : undefined,
        borderTopWidth: props.divider ? StyleSheet.hairlineWidth : 0,
        borderTopColor: theme.colors.border,
      }}
    >
      <Text style={{ fontFamily: theme.fonts.medium, flexShrink: 0 }}>
        {props.label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          textAlign: alignText('end'),
          color: theme.colors.textAlt,
        }}
      >
        {props.value}
      </Text>
      <LucideIcon
        icon={ChevronRightIcon}
        size={18}
        color={theme.colors.textAlt}
      />
    </Button>
  )
}

/** The CTA: solid green, or a neutral, legible disabled state. */
const DButton = (props: {
  label: string
  disabled: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const light = theme.colors.background === '#E9E9E9'
  return (
    <Button
      noTransform
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole='button'
      accessibilityState={{ disabled: props.disabled }}
      accessibilityHint={
        props.disabled ? i18n.t('protoAddTime_enterTimeFirst') : undefined
      }
      testID='time-entry-save'
      style={{
        minHeight: 52,
        borderRadius: theme.numbers.borderRadiusSm,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        // Faded, not swapped: the same action, not ready yet.
        backgroundColor: !props.disabled
          ? theme.colors.accent
          : light
            ? 'rgba(8,204,80,0.4)'
            : 'rgba(27,209,93,0.22)',
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('lg'),
          fontFamily: theme.fonts.bold,
          // Near-black on the green in both themes: white on it is ~2:1.
          color: !props.disabled
            ? '#141414'
            : light
              ? 'rgba(20,20,20,0.7)'
              : '#A6D9B5',
        }}
      >
        {props.label}
      </Text>
    </Button>
  )
}

/** "2 Hrs": the number at full ink, the unit secondary. */
const DurationText = (props: {
  minutes: number
  size: number
  /** The unit's size as a share of the number's. */
  unitScale?: number
  /** Trims the line box to the numeral, for tight spacing around it. */
  tight?: boolean
}) => {
  const theme = useTheme()
  const { formatted } = useFormattedMinutes(props.minutes)
  // Split each "<number> <unit>" pair so units read as secondary.
  const parts = formatted.split(/(\d+(?:[.,]\d+)?)/).filter(Boolean)
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      style={{
        fontSize: props.size,
        lineHeight: props.tight ? Math.round(props.size * 1.08) : undefined,
        fontFamily: theme.fonts.bold,
        color: props.minutes ? theme.colors.text : theme.colors.textAlt,
        fontVariant: ['tabular-nums'],
      }}
    >
      {parts.map((part, index) =>
        /\d/.test(part) ? (
          part
        ) : (
          <Text
            key={index}
            style={{
              fontSize: props.size * (props.unitScale ?? 0.6),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {part}
          </Text>
        )
      )}
    </Text>
  )
}

/** The month the entry lands in, and where this entry takes it. */
const MonthSummary = (props: { date: Date; addMinutes: number }) => {
  const theme = useTheme()
  const green = useGreenText()
  const { serviceReports } = useServiceReport()
  const {
    role: currentRole,
    roleHistory,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()
  const target = calendarMonthOf(props.date)
  const { effectiveGoalHours } = useMonthlyGoal(target)
  const role = roleForMonth(roleHistory, currentRole, target)
  const logged = adjustedMinutesForSpecificMonth(
    getMonthsReports(serviceReports, target.month, target.year),
    target.month,
    target.year,
    role,
    { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
  ).value
  const goal = effectiveGoalHours * 60
  const after = logged + props.addMinutes
  const { formatted: loggedText } = useFormattedMinutes(logged)
  const { formatted: addText } = useFormattedMinutes(props.addMinutes)
  const { formatted: goalText } = useFormattedMinutes(goal)
  const { formatted: leftText } = useFormattedMinutes(Math.max(0, goal - after))
  if (!goal) return null
  const share = (minutes: number): `${number}%` =>
    `${Math.min(100, (minutes / goal) * 100)}%`
  const adding = props.addMinutes > 0
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          color: theme.colors.text,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {moment(props.date).format('MMMM')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ fontSize: 17, fontFamily: theme.fonts.semiBold }}>
          {loggedText}
        </Text>
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('protoAddTime_ofGoal', { goal: goalText })}
        </Text>
      </View>
      <View
        style={{
          height: 10,
          borderRadius: 5,
          backgroundColor: 'rgba(118,118,128,0.2)',
          overflow: 'hidden',
        }}
      >
        {adding && (
          <View
            style={{
              position: 'absolute',
              start: share(logged),
              top: 0,
              bottom: 0,
              width: share(props.addMinutes),
              minWidth: 12,
              borderStartWidth: 2,
              borderStartColor: theme.colors.card,
              backgroundColor:
                theme.colors.background === '#E9E9E9'
                  ? 'rgba(8,204,80,0.6)'
                  : 'rgba(27,209,93,0.6)',
              borderTopEndRadius: 5,
              borderBottomEndRadius: 5,
            }}
          />
        )}
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: share(logged),
            backgroundColor: theme.colors.accent,
            borderRadius: 5,
          }}
        />
      </View>
      <Text style={{ color: theme.colors.textAlt }}>
        {adding ? (
          <Text style={{ color: green, fontFamily: theme.fonts.semiBold }}>
            {i18n.t('protoAddTime_plusThisEntry', { duration: addText })}
          </Text>
        ) : null}
        {adding ? ' · ' : ''}
        {i18n.t('protoAddTime_toGo', { duration: leftText })}
      </Text>
    </View>
  )
}

/**
 * − / + as wide as a preset column, so the stepper row and the presets under it
 * share one grid. Unavailable keeps its shape and dims only the glyph.
 */
const DStep = (props: {
  icon: AppIcon
  label: string
  disabled?: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const light = theme.colors.background === '#E9E9E9'
  const green = useGreenText()
  return (
    <Button
      noTransform
      onPress={props.disabled ? undefined : props.onPress}
      accessibilityRole='button'
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      style={{
        flexGrow: 1,
        flexBasis: 0,
        height: 44,
        borderRadius: 22,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: light ? '#EBEBEF' : '#444446',
      }}
    >
      <LucideIcon
        icon={props.icon}
        size={22}
        color={props.disabled ? theme.colors.textAlt : green}
        style={{ opacity: props.disabled ? 0.6 : 1 }}
      />
    </Button>
  )
}

const VariantD = (props: ProtoFormProps) => {
  const theme = useTheme()
  const green = useGreenText()
  // Full screen: the time field takes the height left over above the card
  // (up to 72pt more), so the main input fills it instead of a gap.
  const [extra, setExtra] = useState(0)
  // Read once the dock has laid out and the screen has settled.
  const spare = useRef(0)
  useEffect(() => {
    if (props.inline) return
    const timer = setTimeout(
      // Up to ~2x the steppers' height; the rest stays between the cards.
      () => setExtra(0 * spare.current),
      450
    )
    return () => clearTimeout(timer)
  }, [props.inline])
  const cardStyle = useCardStyle()
  const insets = useSafeAreaInsets()
  const format = usePreferences((s) => s.timeDisplayFormat)
  const total = props.hours * 60 + props.minutes
  const { formatted } = useFormattedMinutes(total)
  const [sheet, setSheet] = useState(false)
  const date = useDatePicker(props.date, props.setDate)
  const options = useTypeOptions()
  const select = useSelectType(props.onTypeChange)
  const openNote = useOpenNoteEditor()
  const setTotal = (next: number) => {
    const clamped = Math.max(0, Math.min(next, 24 * 60))
    props.setDuration(Math.floor(clamped / 60), clamped % 60)
  }
  const noteText = props.note.note?.trim()
  const editNote = () =>
    openNote({
      title: i18n.t('note'),
      surface: 'time_entry',
      doc: getNoteDoc(props.note),
      placeholder: i18n.t('optional'),
      characterLimit: 500,
      allowImages: true,
      onChange: (doc) => props.setNote(noteFields(doc)),
    })
  const inline = props.inline
  const label = (text: string) => (
    <Text
      style={{
        color:
          props.typeInvalid && text === i18n.t('type')
            ? theme.colors.error
            : theme.colors.textAlt,
        fontSize: theme.fontSize('sm'),
        fontFamily: theme.fonts.semiBold,
        textTransform: 'uppercase',
        letterSpacing: tracking(0.5),
      }}
    >
      {text}
    </Text>
  )

  const timeControls = (
    <View style={{ gap: D_GAP }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: D_GAP }}>
        <DStep
          icon={MinusIcon}
          label={i18n.t('protoAddTime_less', {
            duration: formatMinutesCompact(STEP),
          })}
          disabled={total === 0}
          onPress={() => setTotal(total - STEP)}
        />
        <Button
          noTransform
          onPress={() => setSheet(true)}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('time')}
          accessibilityValue={{ text: formatted }}
          accessibilityHint={i18n.t('protoAddTime_exactHint')}
          testID='time-entry-duration-pill'
          style={{
            // Spans three preset columns and the two gaps between them.
            flexGrow: 3,
            flexBasis: D_GAP * 2,
            minHeight: inline ? 56 : 76 + extra,
            borderRadius: 12,
            borderCurve: 'continuous',
            // A step lighter than the chips, so it reads as the input.
            backgroundColor:
              theme.colors.background === '#E9E9E9' ? '#F0F0F3' : '#323234',
            // Same control in both places: a recessed fill, no stroke.
            borderWidth: props.durationInvalid ? 1 : 0,
            borderColor: props.durationInvalid
              ? theme.colors.error
              : theme.colors.background === '#E9E9E9'
                ? 'rgba(0,0,0,0.10)'
                : 'rgba(255,255,255,0.14)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {/* Inset on both sides for the pencil keeps the value centered
              without widening the field's grid column. */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              start: 34,
              end: 34,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DurationText
              minutes={total}
              size={inline ? 34 : 40 + Math.round((extra / 72) * 16)}
            />
          </View>
          <View
            style={{
              position: 'absolute',
              end: 12,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            }}
          >
            <LucideIcon
              icon={PencilIcon}
              size={17}
              strokeWidth={2}
              color={theme.colors.textAlt}
            />
          </View>
        </Button>
        <DStep
          icon={PlusIcon}
          label={i18n.t('protoAddTime_more', {
            duration: formatMinutesCompact(STEP),
          })}
          onPress={() => setTotal(total + STEP)}
        />
      </View>
      <View
        accessibilityRole='radiogroup'
        style={{ flexDirection: 'row', gap: D_GAP }}
      >
        {D_PRESETS.map((preset) => (
          <DChip
            key={preset}
            flex
            noCheck
            testID={`proto-preset-${preset}`}
            label={presetLabel(preset, format)}
            accessibilityLabel={formatMinutes(preset, format).formatted}
            active={total === preset}
            onPress={() => setTotal(preset)}
          />
        ))}
      </View>
      {props.notice}
    </View>
  )

  const typeChips = (
    <View
      accessibilityRole='radiogroup'
      accessibilityLabel={i18n.t('type')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: D_GAP }}
    >
      {options.map((option) => (
        <DChip
          key={option.value}
          label={option.label}
          active={props.typeValue === option.value}
          onPress={() => select(option.value)}
        />
      ))}
      <Button
        noTransform
        onPress={() => select(CUSTOM_TYPE_VALUE)}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('protoAddTime_newType')}
        style={{
          minHeight: 44,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: theme.colors.textAlt,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <LucideIcon icon={PlusIcon} size={16} color={green} />
        <Text style={{ color: green, fontFamily: theme.fonts.semiBold }}>
          {i18n.t('type')}
        </Text>
      </Button>
    </View>
  )

  const button = (
    <DButton
      label={
        total === 0 && !props.editing
          ? i18n.t('protoAddTime_enterTimeToAdd')
          : submitLabel(props.editing, total, formatted)
      }
      disabled={total === 0 && !props.editing}
      onPress={props.onSubmit}
    />
  )

  const sheets = (
    <>
      <DurationSheet
        open={sheet}
        hours={props.hours}
        minutes={props.minutes}
        onClose={() => setSheet(false)}
        onDone={(h, m) => {
          props.setDuration(h, m)
          setSheet(false)
        }}
      />
      {date.element}
    </>
  )

  if (inline) {
    // The card's header already says Add Time: no inner card, one inset.
    return (
      <View>
        {timeControls}
        {/* Standard / LDC / + New explain themselves under "Add Time". */}
        {/* Type is required and "Standard" / "LDC" don't name the field,
            so it keeps its caption; the gap above pays for it. */}
        <View style={{ marginTop: 20, gap: 8 }}>
          {label(i18n.t('type'))}
          {typeChips}
        </View>
        {/* Extras and commit, set apart from how much / what kind. */}
        <View style={{ marginVertical: 12 }}>
          <DValueRow
            filled
            label={i18n.t('note')}
            value={noteText || i18n.t('protoAddTime_noteOptional')}
            onPress={editNote}
          />
        </View>
        {button}
        {sheets}
      </View>
    )
  }

  // Full screen: the month up top for context; everything the thumb
  // touches sits in one card just above the button.
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
            {button}
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
      {/* Spare height on tall phones collects up here, so the form stays
          anchored low. */}
      <View style={{ flex: 1 }} />
      <View
        style={{
          ...cardStyle,
          shadowOpacity: 0,
          paddingHorizontal: 20,
          paddingVertical: 10,
        }}
      >
        <MonthSummary date={props.date} addMinutes={total} />
      </View>
      <View style={{ height: 24 }} />
      <View
        style={{
          ...cardStyle,
          shadowOpacity: 0,
          paddingHorizontal: 20,
          paddingTop: 20,
        }}
      >
        {timeControls}
        <View style={{ gap: 8, paddingTop: 28, paddingBottom: 20 }}>
          {label(i18n.t('type'))}
          {typeChips}
        </View>
      </View>
      <View style={{ gap: 8, marginTop: 24 }}>
        <View style={{ paddingHorizontal: 20 }}>
          {label(i18n.t('formDetails'))}
        </View>
        <View style={{ ...cardStyle, shadowOpacity: 0, paddingHorizontal: 20 }}>
          <DValueRow
            label={i18n.t('date')}
            value={dayLabel(props.date)}
            onPress={date.openPicker}
          />
          <DValueRow
            divider
            label={i18n.t('note')}
            value={noteText || i18n.t('protoAddTime_noteOptional')}
            onPress={editNote}
          />
        </View>
      </View>
      <DeleteLink onPress={props.onDelete} />
      {sheets}
    </DockedFormLayout>
  )
}

// ---------------------------------------------------------------------------
// E: D's flow, quieter. One shape per decision (value, presets, details),
// neutral controls, and green kept for the action and progress.

/** − / + as quiet circles with ink glyphs. */
const EStep = (props: {
  icon: AppIcon
  label: string
  disabled?: boolean
  /** On the page background (full screen), not a card. */
  onPage?: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const fill = useEFill()
  return (
    <Button
      noTransform
      onPress={props.disabled ? undefined : props.onPress}
      accessibilityRole='button'
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      style={{
        // Unavailable dims the whole control, the same on every surface.
        opacity: props.disabled ? 0.45 : 1,
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fill,
      }}
    >
      <LucideIcon
        icon={props.icon}
        size={22}
        strokeWidth={2.25}
        color={theme.colors.text}
      />
    </Button>
  )
}

/** A plain list row: label, value, trailing glyph. Not interactive itself. */
const ERowContent = (props: {
  label: string
  value: string
  trailing: AppIcon
  divider?: boolean
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderTopWidth: props.divider ? StyleSheet.hairlineWidth : 0,
        borderTopColor: theme.colors.border,
      }}
    >
      <Text style={{ fontFamily: theme.fonts.medium, flexShrink: 0 }}>
        {props.label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          textAlign: alignText('end'),
          color: theme.colors.textAlt,
        }}
      >
        {props.value}
      </Text>
      <LucideIcon
        icon={props.trailing}
        size={18}
        color={theme.colors.textAlt}
      />
    </View>
  )
}

/** Neutral fill for E's controls; translucent, so it reads on card or page. */
const useEFill = () => {
  const theme = useTheme()
  return theme.colors.background === '#E9E9E9'
    ? 'rgba(118,118,128,0.12)'
    : 'rgba(118,118,128,0.32)'
}

/**
 * The presets as one segmented track. The selection is a raised, outlined thumb
 * with a semibold label, so it doesn't rest on fill alone.
 */
const ESegments = (props: {
  options: { key: string; label: string; spoken: string }[]
  value: string | null
  onChange: (key: string) => void
}) => {
  const theme = useTheme()
  const light = theme.colors.background === '#E9E9E9'
  const fill = useEFill()
  return (
    <View
      accessibilityRole='radiogroup'
      style={{
        flexDirection: 'row',
        padding: 3,
        gap: 2,
        borderRadius: 999,
        backgroundColor: fill,
      }}
    >
      {props.options.map((option) => {
        const active = option.key === props.value
        return (
          <Button
            key={option.key}
            noTransform
            onPress={() => props.onChange(option.key)}
            accessibilityRole='radio'
            accessibilityLabel={option.spoken}
            accessibilityState={{ selected: active, checked: active }}
            testID={`proto-preset-${option.key}`}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active
                ? light
                  ? '#FFFFFF'
                  : '#636366'
                : 'transparent',
              // Outlined, so selection holds on a white card and with
              // Increase Contrast, not only by shade.
              borderWidth: active ? 1 : 0,
              borderColor: light ? '#C6C6C8' : '#8E8E93',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: active ? (light ? 0.14 : 0.3) : 0,
              shadowRadius: 3,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: active ? theme.fonts.bold : theme.fonts.medium,
              }}
            >
              {option.label}
            </Text>
          </Button>
        )
      })}
    </View>
  )
}

const VariantE = (props: ProtoFormProps) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const insets = useSafeAreaInsets()
  const format = usePreferences((s) => s.timeDisplayFormat)
  const total = props.hours * 60 + props.minutes
  const { formatted } = useFormattedMinutes(total)
  const [sheet, setSheet] = useState(false)
  const date = useDatePicker(props.date, props.setDate)
  const options = useTypeOptions()
  const select = useSelectType(props.onTypeChange)
  const openNote = useOpenNoteEditor()
  const inline = props.inline
  const setTotal = (next: number) => {
    const clamped = Math.max(0, Math.min(next, 24 * 60))
    props.setDuration(Math.floor(clamped / 60), clamped % 60)
  }
  const noteText = props.note.note?.trim()
  const editNote = () =>
    openNote({
      title: i18n.t('note'),
      surface: 'time_entry',
      doc: getNoteDoc(props.note),
      placeholder: i18n.t('optional'),
      characterLimit: 500,
      allowImages: true,
      onChange: (doc) => props.setNote(noteFields(doc)),
    })
  const typeLabel =
    options.find((option) => option.value === props.typeValue)?.label ??
    i18n.t('standard')

  const hero = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <EStep
        icon={MinusIcon}
        label={i18n.t('protoAddTime_less', {
          duration: formatMinutesCompact(STEP),
        })}
        disabled={total === 0}
        onPage={!inline}
        onPress={() => setTotal(total - STEP)}
      />
      <Button
        noTransform
        onPress={() => setSheet(true)}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('time')}
        accessibilityValue={{ text: formatted }}
        accessibilityHint={i18n.t('protoAddTime_exactHint')}
        testID='time-entry-duration-pill'
        style={{
          flex: 1,
          minHeight: inline ? 64 : 76,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderWidth: props.durationInvalid ? 1 : 0,
          borderColor: theme.colors.error,
        }}
      >
        {/* The value centers on its own; the pencil hangs after it. */}
        <View style={{ flexShrink: 1, marginHorizontal: 28 }}>
          <DurationText
            minutes={total}
            size={inline ? 40 : 64}
            unitScale={inline ? 0.6 : 0.42}
            tight={!inline}
          />
          <View
            style={{
              position: 'absolute',
              start: '100%',
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              paddingStart: 8,
              paddingTop: inline ? 8 : 10,
            }}
          >
            <LucideIcon
              icon={PencilIcon}
              size={inline ? 16 : 20}
              strokeWidth={2}
              color={theme.colors.textAlt}
            />
          </View>
        </View>
      </Button>
      <EStep
        icon={PlusIcon}
        label={i18n.t('protoAddTime_more', {
          duration: formatMinutesCompact(STEP),
        })}
        onPage={!inline}
        onPress={() => setTotal(total + STEP)}
      />
    </View>
  )

  const presets = (
    <ESegments
      options={D_PRESETS.map((preset) => ({
        key: String(preset),
        label: presetLabel(preset, format),
        spoken: formatMinutes(preset, format).formatted,
      }))}
      value={D_PRESETS.includes(total) ? String(total) : null}
      onChange={(key) => setTotal(Number(key))}
    />
  )

  const typeRow = (divider: boolean) => (
    <PullDownMenu
      fill
      accessibilityLabel={i18n.t('type')}
      accessibilityValue={typeLabel}
      testID='proto-type-menu'
      actions={[
        options.map((option) => ({
          id: option.value,
          title: option.label,
          checked: props.typeValue === option.value,
          onPress: () => select(option.value),
        })),
        [
          {
            id: 'new-type',
            title: i18n.t('protoAddTime_newType'),
            systemImage: 'plus',
            onPress: () => select(CUSTOM_TYPE_VALUE),
          },
        ],
      ]}
    >
      <View>
        <ERowContent
          divider={divider}
          label={i18n.t('type')}
          value={typeLabel}
          trailing={
            Platform.OS === 'android' ? ChevronDownIcon : ChevronsUpDownIcon
          }
        />
      </View>
    </PullDownMenu>
  )

  const noteRow = (
    <Button
      noTransform
      onPress={editNote}
      accessibilityRole='button'
      accessibilityLabel={i18n.t('note')}
      accessibilityValue={{
        text: noteText || i18n.t('protoAddTime_noteOptional'),
      }}
    >
      <ERowContent
        divider
        label={i18n.t('note')}
        value={noteText || i18n.t('protoAddTime_noteOptional')}
        trailing={ChevronRightIcon}
      />
    </Button>
  )

  const button = (
    <DButton
      label={
        total === 0 && !props.editing
          ? i18n.t('protoAddTime_enterTimeToAdd')
          : submitLabel(props.editing, total, formatted)
      }
      disabled={total === 0 && !props.editing}
      onPress={props.onSubmit}
    />
  )

  const sheets = (
    <>
      <DurationSheet
        open={sheet}
        hours={props.hours}
        minutes={props.minutes}
        onClose={() => setSheet(false)}
        onDone={(h, m) => {
          props.setDuration(h, m)
          setSheet(false)
        }}
      />
      {date.element}
    </>
  )

  if (inline) {
    return (
      <View>
        {hero}
        <View style={{ marginTop: 12 }}>{presets}</View>
        <View style={{ marginTop: 16, marginBottom: 12 }}>
          {typeRow(true)}
          {noteRow}
        </View>
        {button}
        {sheets}
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
            {button}
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
      {/* One stack anchored low for the thumb; spare height on tall phones
          collects above it. */}
      <View style={{ flexGrow: 1 }} />
      <View
        style={{
          ...cardStyle,
          shadowOpacity: 0,
          paddingHorizontal: 20,
          paddingVertical: 10,
        }}
      >
        <MonthSummary date={props.date} addMinutes={total} />
      </View>
      <View style={{ height: 24 }} />
      <View>
        {hero}
        <View style={{ marginTop: 8 }}>{presets}</View>
      </View>
      <View style={{ height: 28 }} />
      <View style={{ ...cardStyle, shadowOpacity: 0, paddingHorizontal: 16 }}>
        <Button
          noTransform
          onPress={date.openPicker}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('date')}
          accessibilityValue={{ text: dayLabel(props.date) }}
        >
          <ERowContent
            label={i18n.t('date')}
            value={dayLabel(props.date)}
            trailing={ChevronRightIcon}
          />
        </Button>
        {typeRow(true)}
        {noteRow}
      </View>
      <DeleteLink onPress={props.onDelete} />
      {sheets}
    </DockedFormLayout>
  )
}

/**
 * The day sheet's entry point for a day with no time: a "+" card that says the
 * day is empty and unfolds the form in place.
 */
export const ProtoAddTimeCard = (props: {
  /** "Add Time" by default; Plan Day reuses the card. */
  title?: string
  /** Badge glyphs folded / open: + / clock by default. */
  icon?: AppIcon
  openIcon?: AppIcon
  testID?: string
  /** Under the folded title; none for a future day. */
  subtitle?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onExpand?: () => void
  children: ReactNode
  ref?: Ref<View>
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const green = useGreenText()
  // The chevron sits 22pt from the edge like Plan Day's; ⤢ keeps a clear
  // 12pt between its 44pt frame and the chevron's.
  const trailing = (right: number) => ({
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    right,
    width: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  })
  return (
    <View ref={props.ref} style={cardStyle}>
      <View>
        <Button
          noTransform
          onPress={() => props.onOpenChange(!props.open)}
          accessibilityRole='button'
          accessibilityState={{ expanded: props.open }}
          accessibilityLabel={props.title ?? i18n.t('addTime')}
          testID={props.testID ?? 'day-time-form'}
          style={{
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingLeft: 14,
            paddingRight: props.onExpand ? 116 : 48,
          }}
        >
          {
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.colors.accentTranslucent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LucideIcon
                icon={
                  props.open
                    ? (props.openIcon ?? ClockIcon)
                    : (props.icon ?? PlusIcon)
                }
                size={18}
                color={green}
              />
            </View>
          }
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('md'),
              }}
            >
              {props.title ?? i18n.t('addTime')}
            </Text>
            {!props.open && props.subtitle && (
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {props.subtitle}
              </Text>
            )}
          </View>
        </Button>
        {!props.open && (
          <View pointerEvents='none' style={trailing(0)}>
            <LucideIcon
              icon={ChevronRightIcon}
              size={20}
              strokeWidth={2.25}
              color={theme.colors.textAlt}
            />
          </View>
        )}
        {props.onExpand && (
          <View style={trailing(68)}>
            <PointerTooltip label={i18n.t('openFullScreen')}>
              <Button
                noTransform
                onPress={props.onExpand}
                accessibilityRole='button'
                accessibilityLabel={i18n.t('openFullScreen')}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LucideIcon
                  icon={Maximize2Icon}
                  size={18}
                  strokeWidth={2.25}
                  color={theme.colors.textAlt}
                />
              </Button>
            </PointerTooltip>
          </View>
        )}
        {props.open && (
          <View style={trailing(0)}>
            <Button
              noTransform
              onPress={() => props.onOpenChange(false)}
              accessibilityRole='button'
              accessibilityLabel={i18n.t('protoAddTime_collapse')}
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LucideIcon
                icon={ChevronDownIcon}
                size={20}
                strokeWidth={2.25}
                color={theme.colors.textAlt}
              />
            </Button>
          </View>
        )}
      </View>
      {props.open && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          {props.children}
        </View>
      )}
    </View>
  )
}

const AddTimeFormPrototype = (props: ProtoFormProps) => {
  switch (props.variant) {
    case 'A':
      return <VariantA {...props} />
    case 'B':
      return <VariantB {...props} />
    case 'C':
      return <VariantC {...props} />
    case 'D':
      return <VariantD {...props} />
    case 'E':
      return <VariantE {...props} />
  }
}

export default AddTimeFormPrototype
