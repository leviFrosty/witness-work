import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { alignText } from '@/lib/direction'
import i18n from '@/lib/locales'
import { platformSyncKey } from '@/lib/syncCopy'
import { useSealingStatus } from '@/lib/syncTransport/sealed/sealingStatus'
import { sealingStatusCopy } from '@/features/settings/lib/sealingStatusCopy'
import { usePreferences } from '@/stores/preferences'

const PlatformSealingSection = () => {
  const theme = useTheme()
  const status = useSealingStatus((state) => state.status)
  const devices = usePreferences((state) => state.iCloudSyncDevices)
  if (!status) return null
  const copy = sealingStatusCopy(status, devices)

  return (
    <Section>
      <InputRowContainer
        label={i18n.t('platformSealing_label')}
        info={i18n.t(platformSyncKey('platformSealing_info'))}
        lastInSection={!copy.footer}
        style={{ justifyContent: 'space-between' }}
      >
        <Text
          style={{ color: theme.colors.textAlt, textAlign: alignText('end') }}
        >
          {copy.value}
        </Text>
      </InputRowContainer>
      {copy.footer && (
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textAlt,
            paddingTop: 4,
            paddingHorizontal: 12,
            paddingBottom: 16,
          }}
        >
          {copy.footer}
        </Text>
      )}
    </Section>
  )
}

export default PlatformSealingSection
