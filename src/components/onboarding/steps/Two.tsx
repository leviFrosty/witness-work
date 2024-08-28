import { View } from 'react-native'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import i18n from '../../../lib/locales'
import PublisherTypeSelector from '../../PublisherTypeSelector'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import useTheme from '../../../contexts/theme'
import { usePreferences } from '../../../stores/preferences'
import PublisherFeatures from './features/PublisherFeatures'
import XView from '../../layout/XView'
import Badge from '../../Badge'

interface Props {
  goBack: () => void
  goNext: () => void
}

const StepTwo = ({ goBack, goNext }: Props) => {
  const { publisher } = usePreferences()
  const insets = useSafeAreaInsets()
  const theme = useTheme()

  return (
    <Wrapper>
      <KeyboardAwareScrollView
        style={{
          backgroundColor: theme.colors.background,
          paddingHorizontal: 20,
          paddingTop: 20,
        }}
        contentContainerStyle={{
          flex: 1,
          justifyContent: 'space-between',
          paddingBottom: insets.bottom + 30,
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ paddingBottom: 40 }}>
            <OnboardingNav goBack={goBack} />
          </View>
          <Text
            style={{
              fontSize: theme.fontSize('2xl'),
              fontFamily: theme.fonts.bold,
              paddingBottom: 10,
            }}
          >
            {i18n.t('whatTypePublisherAreYou')}
          </Text>
          <PublisherTypeSelector />
          <XView>
            <Text
              style={{
                marginTop: 40,
                marginBottom: 10,
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('features')}
            </Text>
            <Badge>{i18n.t('alwaysFree')}</Badge>
          </XView>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 5,
            }}
          >
            {publisher === 'publisher' ? <PublisherFeatures /> : null}
          </View>
        </View>
      </KeyboardAwareScrollView>
      <View style={{ marginHorizontal: 20, marginBottom: 20 }}>
        <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
      </View>
    </Wrapper>
  )
}

export default StepTwo
