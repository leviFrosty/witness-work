import Text from '../components/MyText'
import Wrapper from '../components/Wrapper'
import Section from '../components/inputs/Section'
import i18n from '../lib/locales'

const Preferences = () => {
  return (
    <Wrapper insets='bottom'>
      <Section>
        <Text>{i18n.t('preferences')}</Text>
      </Section>
    </Wrapper>
  )
}

export default Preferences
