import { Switch, View } from 'react-native'
import i18n from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import { usePreferences } from '../../../../stores/preferences'
import usePublisher from '../../../../hooks/usePublisher'
import Text from '../../../../components/MyText'
import useTheme from '../../../../contexts/theme'

const DetailedProgressBar = () => {
  const { displayDetailsOnProgressBarHomeScreen, publisher, set } =
    usePreferences()
  const theme = useTheme()

  if (publisher === 'publisher') return null

  return (
    <InputRowContainer
      lastInSection
      style={{
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <View
        style={{
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {i18n.t('detailedProgressBar')}
        </Text>
        <Switch
          value={displayDetailsOnProgressBarHomeScreen}
          onValueChange={(value) =>
            set({ displayDetailsOnProgressBarHomeScreen: value })
          }
        />
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('detailedProgressBar_description')}
      </Text>
    </InputRowContainer>
  )
}

const HideDonateHeart = () => {
  const { hideDonateHeart, set } = usePreferences()
  const { status } = usePublisher()

  const lastInSection = status === 'publisher'

  return (
    <InputRowContainer
      lastInSection={lastInSection}
      label={i18n.t('hideDonateHeart')}
      style={{ justifyContent: 'space-between' }}
    >
      <Switch
        value={hideDonateHeart}
        onValueChange={(value) => set({ hideDonateHeart: value })}
      />
    </InputRowContainer>
  )
}

const HomeScreenPreferencesSection = () => {
  return (
    <View style={{ gap: 3 }}>
      <Section>
        <HideDonateHeart />
        <DetailedProgressBar />
      </Section>
    </View>
  )
}

export default HomeScreenPreferencesSection
