import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import useTheme from '../../../contexts/theme'
import i18n from '../../../lib/locales'

interface Props {
  goBack: () => void
  goNext: () => void
}

const FounderNote = ({ goBack, goNext }: Props) => {
  const theme = useTheme()

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 30,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 30,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
      >
        <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
          <Text
            style={[
              styles.stepTitle,
              {
                fontStyle: 'italic',
                color: theme.colors.text,
              },
            ]}
          >
            {i18n.t('founderNoteTitle')}
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: theme.colors.textAlt,
              lineHeight: 22,
              marginBottom: 24,
            }}
          >
            {i18n.t('founderNoteBody')}
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontStyle: 'italic',
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
              marginTop: 8,
            }}
          >
            {i18n.t('founderNoteSignOff')}
          </Text>
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default FounderNote
