import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Select, { SelectData } from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import usePublisher from '@/hooks/usePublisher'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'

const MileagePreferences = ({
  onManageVehicles,
}: {
  onManageVehicles: () => void
}) => {
  const theme = useTheme()
  const { tracksMileage, offersMileageOnboarding } = usePublisher()
  const {
    userSpecifiedMileageTracking,
    setUserSpecifiedMileageTracking,
    mileageSubmissionMethod,
    setMileageSubmissionMethod,
  } = usePreferences()
  const trackingOptions: SelectData<boolean | 'default'> = [
    {
      label: `${i18n.t('default')} (${i18n.t(offersMileageOnboarding ? 'mileage.preferences.on' : 'mileage.preferences.off')})`,
      value: 'default',
    },
    { label: i18n.t('mileage.preferences.on'), value: true },
    { label: i18n.t('mileage.preferences.off'), value: false },
  ]
  const submissionOptions: SelectData<'copy' | 'share'> = [
    { label: i18n.t('copy'), value: 'copy' },
    { label: i18n.t('share'), value: 'share' },
  ]
  return (
    <Section>
      <InputRowContainer
        label={i18n.t('mileage.preferences.tracking')}
        lastInSection={!tracksMileage}
      >
        <View style={{ flex: 1 }}>
          <Select
            data={trackingOptions}
            value={userSpecifiedMileageTracking}
            onChange={({ value }) => setUserSpecifiedMileageTracking(value)}
          />
        </View>
      </InputRowContainer>
      <Text
        style={{ color: theme.colors.textAlt, fontSize: theme.fontSize('sm') }}
      >
        {i18n.t('mileage.preferences.description')}
      </Text>
      {tracksMileage && (
        <>
          <InputRowContainer
            label={i18n.t('mileage.preferences.submission')}
            lastInSection
          >
            <View style={{ flex: 1 }}>
              <Select
                data={submissionOptions}
                value={mileageSubmissionMethod}
                onChange={({ value }) => setMileageSubmissionMethod(value)}
              />
            </View>
          </InputRowContainer>
          <Button
            onPress={onManageVehicles}
            accessibilityRole='button'
            style={{ paddingVertical: 12 }}
          >
            <Text style={{ color: theme.colors.accent }}>
              {i18n.t('mileage.vehicles.manage')}
            </Text>
          </Button>
        </>
      )}
    </Section>
  )
}
export default MileagePreferences
