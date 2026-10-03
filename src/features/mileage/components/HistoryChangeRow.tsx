import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import DateTimePicker from '@/components/ui/DateTimePicker'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Text from '@/components/ui/MyText'
import type { HistoryChangeMode } from '@/lib/mileage/calc'

type Props = {
  mode: HistoryChangeMode
  onChangeMode: (mode: HistoryChangeMode) => void
  date: Date
  onChangeDate: (date: Date) => void
}

/**
 * Shown once a price, fuel, or fuel economy is edited: apply the change from a
 * date (earlier trips keep the old value) or correct the current value.
 */
export default function HistoryChangeRow({
  mode,
  onChangeMode,
  date,
  onChangeDate,
}: Props) {
  const theme = useTheme()
  return (
    <View style={{ gap: 10 }}>
      <SegmentedControl<HistoryChangeMode>
        variant='pill'
        value={mode}
        onChange={onChangeMode}
        options={[
          { key: 'starting', label: i18n.t('mileage.changeStarting') },
          { key: 'correct', label: i18n.t('mileage.changeCorrect') },
        ]}
      />
      {mode === 'starting' ? (
        <Section>
          <InputRowContainer
            label={i18n.t('mileage.effectiveFrom')}
            controlStyle={{ alignItems: 'flex-end' }}
            lastInSection
          >
            <DateTimePicker
              value={date}
              onChange={(_e, picked) => picked && onChangeDate(picked)}
            />
          </InputRowContainer>
        </Section>
      ) : null}
      <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
        {i18n.t(
          mode === 'starting'
            ? 'mileage.changeStarting_description'
            : 'mileage.changeCorrect_description'
        )}
      </Text>
    </View>
  )
}
