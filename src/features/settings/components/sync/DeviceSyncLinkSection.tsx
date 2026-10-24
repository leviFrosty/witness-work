import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Cloud as CloudIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import useDeviceSyncAvailable from '@/features/settings/hooks/useDeviceSyncAvailable'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * A way into Device Sync from the screens people look for it on (Account,
 * Backup & Restore). Hidden where the device can't sync.
 */
export default function DeviceSyncLinkSection() {
  const navigation = useNavigation<RootStackNavigation>()
  const available = useDeviceSyncAvailable()
  if (!available) return null
  return (
    <View style={{ gap: 5 }}>
      <Section>
        <InputRowButton
          leftIcon={CloudIcon}
          label={i18n.t('syncSettingsTitle')}
          onPress={() => navigation.navigate('PreferencesiCloud')}
          lastInSection
        >
          <IconButton icon={ChevronForwardIcon} />
        </InputRowButton>
      </Section>
      <SectionFooter text={i18n.t('syncSettings_summary')} />
    </View>
  )
}
