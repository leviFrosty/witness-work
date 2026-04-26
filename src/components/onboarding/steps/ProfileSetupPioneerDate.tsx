import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import useTheme from '../../../contexts/theme'
import DateTimePicker from '../../DateTimePicker'
import { usePreferences } from '../../../stores/preferences'
import { getStartDateLabels } from '../../../constants/publisher'

interface Props {
  goBack: () => void
  goNext: () => void
}

const ProfileSetupPioneerDate = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { publisher, pioneerStartDate, set } = usePreferences()
  const labels = getStartDateLabels(publisher)

  const handleContinue = () => {
    goNext()
  }

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
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
          <Text style={styles.stepTitle}>{i18n.t(labels.title)}</Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t(labels.description)}
          </Text>
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {i18n.t(labels.label)}
            </Text>
            <DateTimePicker
              value={pioneerStartDate ? new Date(pioneerStartDate) : new Date()}
              onChange={(_e, date) => {
                if (date) set({ pioneerStartDate: date })
              }}
              maximumDate={new Date()}
              iOSMode='date'
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ActionButton onPress={handleContinue}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default ProfileSetupPioneerDate
