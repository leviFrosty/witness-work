import { type CSSProperties, useId, useState } from 'react'
import { View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { _i18n } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import {
  changeEvent,
  clampDate,
  uses24HourClock,
} from '@/components/ui/dateTimePickerValue'
import {
  clockTimeOutOfRange,
  from12Hour,
  hourOutOfRange,
  fromDateInputValue,
  to12Hour,
  toDateInputValue,
  withClockTime,
} from '@/components/ui/web/dateTimeInput'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useResolvedScheme from '@/components/ui/web/useResolvedScheme'
import WebLayer from '@/components/ui/web/WebLayer'
import type {
  DateTimeDialogProps,
  DateTimePickerMode,
  DateTimePickerProps,
} from '@/components/ui/DateTimePicker.types'

export type {
  DateTimeDialogProps,
  DateTimePickerEvent,
  DateTimePickerProps,
} from '@/components/ui/DateTimePicker.types'

const PARTS: Record<DateTimePickerMode, Array<'date' | 'time'>> = {
  date: ['date'],
  time: ['time'],
  datetime: ['date', 'time'],
}

/** The first year of four digits: anything below is a year being typed. */
const MIN_YEAR = 1000

const numbersFrom = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => index + from)
const pad2 = (value: number) => String(value).padStart(2, '0')

/** The afternoon's label in the app's language ("PM"). */
const periodLabel = (pm: boolean) => {
  const parts = new Intl.DateTimeFormat(_i18n.locale, {
    hour: 'numeric',
    hour12: true,
  }).formatToParts(new Date(2000, 0, 1, pm ? 15 : 9))
  return (
    parts.find((part) => part.type === 'dayPeriod')?.value ?? (pm ? 'PM' : 'AM')
  )
}

/** The look of the form controls, in the app's theme and light or dark. */
function useFieldStyle(inline: boolean): CSSProperties {
  const theme = useTheme()
  const scheme = useResolvedScheme()
  return {
    boxSizing: 'border-box',
    minHeight: inline ? 48 : MIN_TOUCH_TARGET,
    padding: inline ? '8px 14px' : '6px 10px',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.numbers.borderRadiusSm,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    colorScheme: scheme,
    font: `${theme.fontSize(inline ? 'lg' : 'md')}px ${theme.fonts.regular}, system-ui, sans-serif`,
    outlineOffset: 2,
  }
}

function DateField({
  value,
  minimumDate,
  maximumDate,
  onPick,
  onSubmit,
  inline,
  testID,
  autoFocus,
}: {
  value: Date
  minimumDate?: Date | undefined
  maximumDate?: Date | undefined
  onPick: (date: Date) => void
  onSubmit?: (() => void) | undefined
  inline: boolean
  testID?: string | undefined
  autoFocus?: boolean
}) {
  const style = useFieldStyle(inline)
  const committed = toDateInputValue(value)
  // What the field holds while a date is typed into it: blank when half typed,
  // which `value` can't be, or the browser would put the last whole date back
  // and send the typing to the month again.
  const [text, setText] = useState(committed)
  const [shown, setShown] = useState(committed)
  if (committed !== shown) {
    setShown(committed)
    setText(committed)
  }
  return (
    <input
      type='date'
      lang={_i18n.locale}
      aria-label={i18n.t('date')}
      data-testid={testID}
      data-initial-focus={autoFocus ? '' : undefined}
      value={text}
      min={minimumDate ? toDateInputValue(minimumDate) : undefined}
      max={maximumDate ? toDateInputValue(maximumDate) : undefined}
      style={style}
      onChange={(event) => {
        setText(event.target.value)
        const next = fromDateInputValue(value, event.target.value)
        // A year still being typed ("0002") isn't a date to pick yet.
        if (next && next.getFullYear() >= MIN_YEAR)
          onPick(clampDate(next, minimumDate, maximumDate))
      }}
      onBlur={() => setText(committed)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onSubmit) {
          event.preventDefault()
          onSubmit()
        }
      }}
    />
  )
}

function TimeField({
  value,
  minimumDate,
  maximumDate,
  onPick,
  inline,
  testID,
}: {
  value: Date
  minimumDate?: Date | undefined
  maximumDate?: Date | undefined
  onPick: (date: Date) => void
  inline: boolean
  testID?: string | undefined
}) {
  const timeFormat = usePreferences(useShallow((s) => s.timeFormat))
  // A height, not only a minimum: WebKit's selects ignore the minimum.
  const field = useFieldStyle(inline)
  const style = { ...field, height: field.minHeight }
  const clock24 = uses24HourClock(timeFormat)
  const { hour, pm } = to12Hour(value.getHours())
  const pick = (hours: number, minutes: number) =>
    onPick(
      clampDate(withClockTime(value, hours, minutes), minimumDate, maximumDate)
    )

  return (
    <div
      role='group'
      aria-label={i18n.t('time')}
      data-testid={testID}
      style={{ display: 'inline-flex', gap: 6 }}
    >
      <select
        aria-label={i18n.t('hour')}
        style={style}
        value={clock24 ? value.getHours() : hour}
        onChange={(event) => {
          const chosen = Number(event.target.value)
          pick(clock24 ? chosen : from12Hour(chosen, pm), value.getMinutes())
        }}
      >
        {(clock24 ? numbersFrom(24) : numbersFrom(12, 1)).map((option) => (
          <option
            key={option}
            value={option}
            disabled={hourOutOfRange(
              value,
              clock24 ? option : from12Hour(option, pm),
              minimumDate,
              maximumDate
            )}
          >
            {clock24 ? pad2(option) : option}
          </option>
        ))}
      </select>
      <select
        aria-label={i18n.t('minutes')}
        style={style}
        value={value.getMinutes()}
        onChange={(event) => pick(value.getHours(), Number(event.target.value))}
      >
        {numbersFrom(60).map((option) => (
          <option
            key={option}
            value={option}
            disabled={clockTimeOutOfRange(
              value,
              value.getHours(),
              option,
              minimumDate,
              maximumDate
            )}
          >
            {pad2(option)}
          </option>
        ))}
      </select>
      {clock24 ? null : (
        <select
          aria-label={`${periodLabel(false)} / ${periodLabel(true)}`}
          style={style}
          value={pm ? 'pm' : 'am'}
          onChange={(event) =>
            pick(
              from12Hour(hour, event.target.value === 'pm'),
              value.getMinutes()
            )
          }
        >
          <option value='am'>{periodLabel(false)}</option>
          <option value='pm'>{periodLabel(true)}</option>
        </select>
      )}
    </div>
  )
}

/**
 * The date or time field for each part `iOSMode` asks for, side by side. A date
 * is the browser's `<input type="date">` within the limits; its calendar and
 * display follow the browser's locale. A time is an hour and minute list in the
 * app's Time Format. The calendar of `display='inline'` is the browser's date
 * field at a larger size.
 */
export default function DateTimePicker({
  value,
  onChange,
  maximumDate,
  minimumDate,
  iOSMode = 'date',
  display = 'compact',
  onSubmit,
  testID,
}: DateTimePickerProps) {
  const inline = display === 'inline'
  const commit = (next: Date) => onChange(changeEvent(next), next)
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: inline ? 'center' : 'flex-end',
        alignItems: 'center',
      }}
    >
      {PARTS[iOSMode].map((part) =>
        part === 'date' ? (
          <DateField
            key={part}
            value={value}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onPick={commit}
            onSubmit={onSubmit}
            inline={inline}
            testID={testID && `${testID}-date`}
          />
        ) : (
          <TimeField
            key={part}
            value={value}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onPick={commit}
            inline={inline}
            testID={testID && `${testID}-time`}
          />
        )
      )}
    </View>
  )
}

/**
 * A date or time in a panel under a button of its own, for controls that show
 * the value themselves. The first pick keeps the panel open until Done, since a
 * typed date arrives a digit at a time; Escape or a click outside dismisses.
 */
export function DateTimeDialog({
  part,
  value,
  maximumDate,
  minimumDate,
  onPick,
  onDismiss,
}: DateTimeDialogProps) {
  const theme = useTheme()
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <div
        ref={setAnchor}
        id={id}
        style={{ position: 'fixed', top: '30%', left: '50%' }}
      />
      <WebLayer
        anchor={anchor}
        open={anchor !== null}
        onClose={onDismiss}
        role='dialog'
        label={i18n.t(part)}
        trapFocus
        placement={{ align: 'center' }}
      >
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: 12,
            alignItems: 'center',
          }}
        >
          {part === 'date' ? (
            <DateField
              value={draft}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onPick={setDraft}
              onSubmit={() => onPick(draft)}
              inline={false}
              autoFocus
            />
          ) : (
            <TimeField
              value={draft}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onPick={setDraft}
              inline={false}
            />
          )}
          <Button
            noTransform
            onPress={() => onPick(draft)}
            style={{
              minWidth: MIN_TOUCH_TARGET,
              minHeight: MIN_TOUCH_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              {i18n.t('done')}
            </Text>
          </Button>
        </div>
      </WebLayer>
    </>
  )
}
