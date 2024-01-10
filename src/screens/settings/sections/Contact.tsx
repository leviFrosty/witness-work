import { View } from 'react-native'
import i18n from '../../../lib/locales'
import Section from '../../../components/inputs/Section'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faBug,
  faChevronRight,
  faHand,
  faHeart,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../../../components/IconButton'
import SectionTitle from '../shared/SectionTitle'
import { openURL } from '../../../lib/links'
import links from '../../../constants/links'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../../../stacks/RootStack'

const ContactSection = () => {
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('contact')} />
      <Section>
        <InputRowButton
          leftIcon={faBug}
          label={i18n.t('bugReport')}
          onPress={async () => {
            openURL(links.bugReport)
          }}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          leftIcon={faHand}
          label={i18n.t('featureRequest')}
          onPress={async () => {
            openURL(links.featureRequest)
          }}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
        <InputRowButton
          lastInSection
          leftIcon={faHeart}
          label={i18n.t('donate')}
          onPress={() => navigation.navigate('Donate')}
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default ContactSection
