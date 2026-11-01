import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import {
  History as HistoryIcon,
  Smartphone as SmartphoneIcon,
} from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

export default function AccountSecuritySection() {
  const navigation = useNavigation<RootStackNavigation>()
  return (
    <View style={{ gap: 5 }}>
      <SectionTitle
        text={i18n.t('accountSecurity_section')}
        info={i18n.t('accountSecurity_sectionInfo')}
        alignWithIcons
      />
      <Section>
        <InputRowButton
          leftIcon={SmartphoneIcon}
          label={i18n.t('accountSecurity_devices')}
          onPress={() => navigation.navigate('Account Devices')}
        />
        <InputRowButton
          leftIcon={HistoryIcon}
          label={i18n.t('accountSecurity_activity')}
          onPress={() => navigation.navigate('Account Activity')}
          lastInSection
        />
      </Section>
    </View>
  )
}
