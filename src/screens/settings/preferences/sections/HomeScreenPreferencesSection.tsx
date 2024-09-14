import { Switch, View } from 'react-native'
import i18n from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import { usePreferences } from '../../../../stores/preferences'
import usePublisher from '../../../../hooks/usePublisher'
import Text from '../../../../components/MyText'
import useTheme from '../../../../contexts/theme'
import XView from '../../../../components/layout/XView'
import { rowPaddingVertical } from '../../../../constants/Inputs'
import useDevice from '../../../../hooks/useDevice'

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

const HomeElements = () => {
  const { homeScreenElements, set } = usePreferences()
  const { status, hasAnnualGoal } = usePublisher()
  const { isTablet } = useDevice()
  const theme = useTheme()

  return (
    <View
      style={{
        paddingRight: 20,
        borderBottomColor: theme.colors.border,
        borderBottomWidth: 1,
        paddingVertical: rowPaddingVertical,
      }}
    >
      <View style={{ paddingBottom: 15, gap: 5 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('sectionsVisibility')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('sectionsVisibility_description')}
        </Text>
      </View>
      <View style={{ paddingLeft: 20, gap: 12 }}>
        <View>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>{i18n.t('approachingConversations')}</Text>
            <Switch
              value={homeScreenElements.approachingConversations}
              onValueChange={(value) =>
                set({
                  homeScreenElements: {
                    ...homeScreenElements,
                    approachingConversations: value,
                  },
                })
              }
            />
          </XView>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('approachingConversations_description')}
          </Text>
        </View>
        <XView style={{ justifyContent: 'space-between' }}>
          <Text>{i18n.t('monthlyRoutine')}</Text>
          <Switch
            value={homeScreenElements.monthlyRoutine}
            onValueChange={(value) =>
              set({
                homeScreenElements: {
                  ...homeScreenElements,
                  monthlyRoutine: value,
                },
              })
            }
          />
        </XView>
        {isTablet && hasAnnualGoal && (
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>{i18n.t('serviceYearSummary')}</Text>
            <Switch
              value={homeScreenElements.tabletServiceYearSummary}
              onValueChange={(value) =>
                set({
                  homeScreenElements: {
                    ...homeScreenElements,
                    tabletServiceYearSummary: value,
                  },
                })
              }
            />
          </XView>
        )}
        <XView style={{ justifyContent: 'space-between' }}>
          <Text>{i18n.t('serviceReport')}</Text>
          <Switch
            value={homeScreenElements.serviceReport}
            onValueChange={(value) =>
              set({
                homeScreenElements: {
                  ...homeScreenElements,
                  serviceReport: value,
                },
              })
            }
          />
        </XView>
        {status !== 'publisher' && (
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>{i18n.t('timer')}</Text>
            <Switch
              value={homeScreenElements.timer}
              onValueChange={(value) =>
                set({
                  homeScreenElements: {
                    ...homeScreenElements,
                    timer: value,
                  },
                })
              }
            />
          </XView>
        )}
        <XView style={{ justifyContent: 'space-between' }}>
          <Text>{i18n.t('contacts')}</Text>
          <Switch
            disabled
            value={homeScreenElements.contacts}
            onValueChange={(value) =>
              set({
                homeScreenElements: {
                  ...homeScreenElements,
                  contacts: value,
                },
              })
            }
          />
        </XView>
      </View>
    </View>
  )
}

const HomeScreenPreferencesSection = () => {
  return (
    <View>
      <Section>
        <HomeElements />
        <HideDonateHeart />
        <DetailedProgressBar />
      </Section>
    </View>
  )
}

export default HomeScreenPreferencesSection
