import { useState } from 'react'
import { View } from 'react-native'
import { Host } from '@expo/ui'
import { DatePickerDialog, TimePickerDialog } from '@expo/ui/jetpack-compose'
import { useShallow } from 'zustand/react/shallow'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatDate, formatTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import {
  changeEvent,
  clampDate,
  uses24HourClock,
  withDay,
  withTime,
} from '@/components/ui/dateTimePickerValue'
import type {
  DateTimeDialogProps,
  DateTimePickerProps,
} from '@/components/ui/DateTimePicker.types'

export function DateTimeDialog({
  part,
  value,
  maximumDate,
  minimumDate,
  onPick,
  onDismiss,
}: DateTimeDialogProps) {
  const theme = useTheme()
  const { colorScheme, timeFormat } = usePreferences(
    useShallow((s) => ({
      colorScheme: s.colorScheme,
      timeFormat: s.timeFormat,
    }))
  )
  const pick = (next: Date) => onPick(clampDate(next, minimumDate, maximumDate))

  const common = { color: theme.colors.accent, onDismissRequest: onDismiss }

  return (
    <Host
      colorScheme={colorScheme || undefined}
      seedColor={theme.colors.accent}
      style={{ position: 'absolute', width: 0, height: 0 }}
    >
      {part === 'date' ? (
        <DatePickerDialog
          {...common}
          initialDate={new Date(
            Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
          ).toISOString()}
          selectableDates={
            minimumDate || maximumDate
              ? { start: minimumDate, end: maximumDate }
              : undefined
          }
          onDateSelected={(day) =>
            pick(
              withDay(value, {
                year: day.getUTCFullYear(),
                month: day.getUTCMonth(),
                date: day.getUTCDate(),
              })
            )
          }
        />
      ) : (
        <TimePickerDialog
          {...common}
          initialDate={value.toISOString()}
          is24Hour={uses24HourClock(timeFormat)}
          onDateSelected={(time) => pick(withTime(value, time))}
        />
      )}
    </Host>
  )
}

export default function DateTimePicker({
  value,
  onChange,
  maximumDate,
  minimumDate,
  iOSMode = 'date',
  testID,
}: DateTimePickerProps) {
  const theme = useTheme()
  const [open, setOpen] = useState<'date' | 'time' | null>(null)
  const parts: Array<'date' | 'time'> =
    iOSMode === 'datetime' ? ['date', 'time'] : [iOSMode]

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'flex-end',
      }}
    >
      {parts.map((part) => {
        const shown =
          part === 'date'
            ? formatDate(value, { style: 'medium' })
            : formatTime(value)
        return (
          <Button
            key={part}
            noTransform
            accessibilityRole='button'
            accessibilityLabel={i18n.t(part)}
            accessibilityValue={{ text: shown }}
            testID={testID && `${testID}-${part}`}
            onPress={() => setOpen(part)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 8,
              backgroundColor: theme.colors.card,
              borderRadius: theme.numbers.borderRadiusSm,
            }}
          >
            <Text>{shown}</Text>
          </Button>
        )
      })}
      {open && (
        <DateTimeDialog
          part={open}
          value={value}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onPick={(next) => {
            setOpen(null)
            onChange(changeEvent(next), next)
          }}
          onDismiss={() => setOpen(null)}
        />
      )}
    </View>
  )
}

export type {
  DateTimeDialogProps,
  DateTimePickerEvent,
  DateTimePickerProps,
} from '@/components/ui/DateTimePicker.types'
