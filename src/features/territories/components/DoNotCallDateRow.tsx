import DateTimePicker from '@/components/ui/DateTimePicker'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import i18n from '@/lib/locales'
import { wholeYearsSince } from '@/features/territories/lib/doorPins'

export default function DoNotCallDateRow({
  value,
  onChange,
  lastInSection,
}: {
  value: Date
  onChange: (date: Date) => void
  lastInSection?: boolean
}) {
  const years = wholeYearsSince(value.getTime(), Date.now())
  return (
    <InputRowContainer
      label={i18n.t('territories.pins.dateLabel')}
      info={i18n.t('territories.pins.dateLabel_info')}
      description={
        years > 0
          ? i18n.t('territories.pins.yearsAgo', { count: years })
          : undefined
      }
      controlStyle={{ alignItems: 'flex-end' }}
      lastInSection={lastInSection}
    >
      <DateTimePicker
        value={value}
        maximumDate={new Date()}
        onChange={(_event, picked) => picked && onChange(picked)}
        testID='dnc-date'
      />
    </InputRowContainer>
  )
}
