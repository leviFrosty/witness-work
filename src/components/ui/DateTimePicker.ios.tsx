import { Host } from '@expo/ui'
import { DatePicker, type DatePickerComponent } from '@expo/ui/swift-ui'
import { datePickerStyle, environment, tint } from '@expo/ui/swift-ui/modifiers'
import { useShallow } from 'zustand/react/shallow'
import useTheme from '@/contexts/theme'
import { appleLocaleIdentifier } from '@/lib/dates'
import { _i18n } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { changeEvent, clampDate } from '@/components/ui/dateTimePickerValue'
import type {
  DateTimeDialogProps,
  DateTimePickerMode,
  DateTimePickerProps,
} from '@/components/ui/DateTimePicker.types'

const COMPONENTS: Record<DateTimePickerMode, DatePickerComponent[]> = {
  date: ['date'],
  time: ['hourAndMinute'],
  datetime: ['date', 'hourAndMinute'],
}

export default function DateTimePicker({
  value,
  onChange,
  maximumDate,
  minimumDate,
  iOSMode = 'date',
  display = 'compact',
  testID,
}: DateTimePickerProps) {
  const theme = useTheme()
  const { colorScheme, formatRegion } = usePreferences(
    useShallow((s) => ({
      colorScheme: s.colorScheme,
      formatRegion: s.formatRegion,
    }))
  )

  const locale = appleLocaleIdentifier({
    language: _i18n.locale,
    region: formatRegion,
  })

  return (
    <Host matchContents colorScheme={colorScheme || undefined}>
      <DatePicker
        selection={value}
        range={
          minimumDate || maximumDate
            ? { start: minimumDate, end: maximumDate }
            : undefined
        }
        displayedComponents={COMPONENTS[iOSMode]}
        onDateChange={(picked) => {
          const next = clampDate(picked, minimumDate, maximumDate)
          onChange(changeEvent(next), next)
        }}
        modifiers={[
          datePickerStyle(display === 'inline' ? 'graphical' : 'compact'),
          tint(theme.colors.accent),
          ...(locale ? [environment('locale', locale)] : []),
        ]}
        testID={testID}
      />
    </Host>
  )
}

export function DateTimeDialog(_props: DateTimeDialogProps) {
  return null
}

export type {
  DateTimeDialogProps,
  DateTimePickerEvent,
  DateTimePickerProps,
} from '@/components/ui/DateTimePicker.types'
