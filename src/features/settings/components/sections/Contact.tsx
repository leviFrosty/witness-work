import {
  ChevronRight as ChevronRightIcon,
  CircleQuestionMark as CircleQuestionMarkIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import IconButton from '@/components/ui/IconButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'

const ContactSection = () => {
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('helpCenter')} />
      <Section>
        <InputRowButton
          lastInSection
          leftIcon={CircleQuestionMarkIcon}
          label={i18n.t('helpCenter')}
          onPress={() => navigation.navigate('FAQ')}
        >
          <IconButton icon={ChevronRightIcon} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default ContactSection
