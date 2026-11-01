import { useState } from 'react'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import { isDigitsOnlyInput, parseIntegerInput } from '@/lib/digits'
import { formatPlainNumber } from '@/lib/numbers'
import { usePreferences } from '@/stores/preferences'

const MonthlyMaximumCreditHoursSection = () => {
  const theme = useTheme()
  const { creditCapMinutes } = usePublisher('standing')
  const { overrideCreditLimit, set } = usePreferences()

  const limitHours = creditCapMinutes === null ? 0 : creditCapMinutes / 60
  const [draft, setDraft] = useState<string | null>(null)

  const changeLimit = (value: string) => {
    if (!isDigitsOnlyInput(value)) return
    const hours = parseIntegerInput(value)
    if (hours !== undefined && hours > 200) return
    setDraft(value)

    if (hours === undefined || hours === limitHours) return
    set({ overrideCreditLimit: true, customCreditLimitHours: hours })
  }

  return (
    <Section>
      <TextInputRow
        label={i18n.t('monthlyMaximumCreditHours')}
        info={i18n.t('monthlyMaximumCreditHours_description')}
        description={i18n.t('creditLimitNoLimitHint')}
        controlStyle={{ width: 96 }}
        lastInSection={!overrideCreditLimit}
        textInputProps={{
          accessibilityLabel: i18n.t('monthlyMaximumCreditHours'),
          accessibilityHint: i18n.t('creditLimitNoLimitHint'),
          value: draft ?? formatPlainNumber(limitHours),
          onChangeText: changeLimit,
          onEndEditing: () => setDraft(null),
          type: 'number',
          keyboardType: 'number-pad',
        }}
      />
      {overrideCreditLimit && (
        <Button
          style={{ padding: 16, minHeight: 48 }}
          onPress={() => {
            setDraft(null)
            set({ overrideCreditLimit: false })
          }}
        >
          <Text
            style={{
              textDecorationLine: 'underline',
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {i18n.t('resetToDefaults')}
          </Text>
        </Button>
      )}
    </Section>
  )
}

export default MonthlyMaximumCreditHoursSection
