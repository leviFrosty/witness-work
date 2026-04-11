import { View } from 'react-native'
import Section from '../../../components/inputs/Section'
import i18n from '../../../lib/locales'
import InputRowButton from '../../../components/inputs/InputRowButton'
import {
  faChevronRight,
  faCircleQuestion,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../../../components/IconButton'
import SectionTitle from '../shared/SectionTitle'
import { RootStackParamList } from '../../../types/rootStack'

interface Props {
  handleNavigate: (destination: keyof RootStackParamList) => unknown
}

const HelpSection = ({ handleNavigate }: Props) => {
  return (
    <View style={{ gap: 3 }}>
      <SectionTitle text={i18n.t('tutorial.help')} />
      <Section>
        <InputRowButton
          leftIcon={faCircleQuestion}
          label={i18n.t('tutorial.replayTutorials')}
          onPress={() => handleNavigate('Help')}
          lastInSection
        >
          <IconButton icon={faChevronRight} />
        </InputRowButton>
      </Section>
    </View>
  )
}

export default HelpSection
