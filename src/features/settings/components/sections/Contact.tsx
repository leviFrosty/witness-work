import { View } from 'react-native'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import {
  faChevronRight,
  faCircleQuestion,
} from '@fortawesome/free-solid-svg-icons'
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
          leftIcon={faCircleQuestion}
          label={i18n.t('helpCenter')}
          onPress={() => navigation.navigate('FAQ')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default ContactSection
