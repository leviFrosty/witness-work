import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  QrCode as QrCodeIcon,
  ScanQrCode as ScanQrCodeIcon,
} from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

export default function HandoffSection() {
  const navigation = useNavigation<RootStackNavigation>()
  return (
    <View style={{ gap: 5 }}>
      <SectionTitle
        text={i18n.t('handoff_section')}
        info={i18n.t('handoff_sectionInfo')}
        alignWithIcons
      />
      <Section>
        <InputRowButton
          leftIcon={QrCodeIcon}
          label={i18n.t('handoff_setUp')}
          onPress={() =>
            navigation.navigate('Set Up Another Device', { entry: 'settings' })
          }
        />
        <InputRowButton
          leftIcon={ScanQrCodeIcon}
          label={i18n.t('handoff_signIn')}
          onPress={() =>
            navigation.navigate('Sign In With QR Code', { entry: 'settings' })
          }
          lastInSection
        />
      </Section>
      <SectionFooter text={i18n.t('handoff_sectionFooter')} />
    </View>
  )
}
