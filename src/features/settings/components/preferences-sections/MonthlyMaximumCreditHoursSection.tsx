import { useState } from 'react'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'

const MonthlyMaximumCreditHoursSection = () => {
  const theme = useTheme()
  const { creditCapMinutes } = usePublisher()
  const { overrideCreditLimit, set } = usePreferences()
  // This input is explicitly in hours; 0 is the stored unlimited sentinel.
  const limitHours = creditCapMinutes === null ? 0 : creditCapMinutes / 60
  const [draft, setDraft] = useState<string | null>(null)

  const changeLimit = (value: string) => {
    if (!/^\d*$/.test(value) || Number(value) > 200) return
    setDraft(value)
    // Clearing the input is an editing step, not a request for unlimited credit.
    if (value === '' || Number(value) === limitHours) return
    set({ overrideCreditLimit: true, customCreditLimitHours: Number(value) })
  }

  return (
    <Section>
      <TextInputRow
        label={i18n.t('monthlyMaximumCreditHours')}
        info={i18n.t('monthlyMaximumCreditHours_description')}
        lastInSection
        textInputProps={{
          accessibilityLabel: i18n.t('monthlyMaximumCreditHours'),
          value: draft ?? limitHours.toString(),
          onChangeText: changeLimit,
          onEndEditing: () => setDraft(null),
          type: 'number',
          keyboardType: 'number-pad',
        }}
      />
      <Text
        style={{ fontSize: theme.fontSize('sm'), color: theme.colors.textAlt }}
      >
        {i18n.t('creditLimitNoLimitHint')}
      </Text>
      {overrideCreditLimit && (
        <Button
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
