import useTheme from '../contexts/theme'
import { HomeTabStackNavigation } from '../stacks/HomeTabStack'
import AheadOrBehindOfMonthSchedule from './AheadOrBehindOfSchedule'
import _ from 'lodash'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import MonthServiceReportProgressBar from './MonthServiceReportProgressBar'
import { usePreferences } from '../stores/preferences'
import useServiceReport from '../stores/serviceReport'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adjustedMinutesForSpecificMonth,
  calculateMinutesRemaining,
  calculateProgress,
  getDaysLeftInCurrentMonth,
  getMonthsReports,
  plannedMinutesToCurrentDayForMonth,
} from '../lib/serviceReport'
import moment from 'moment'
import i18n from '../lib/locales'
import Button from './Button'
import { View } from 'react-native'
import Text from './MyText'

export default function HourEntryCard() {
  const theme = useTheme()
  const { publisher, publisherHours, displayDetailsOnProgressBarHomeScreen } =
    usePreferences()
  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()
  const navigation = useNavigation<
    HomeTabStackNavigation & RootStackNavigation
  >()
  const goalHours = publisherHours[publisher]
  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, moment().month(), moment().year()),
    [serviceReports]
  )

  const adjustedMinutes = useMemo(
    () =>
      adjustedMinutesForSpecificMonth(
        monthReports,
        moment().month(),
        moment().year()
      ),
    [monthReports]
  )

  const progress = useMemo(
    () => calculateProgress({ minutes: adjustedMinutes.value, goalHours }),
    [adjustedMinutes, goalHours]
  )

  const encouragementHourPhrase = useCallback((progress: number) => {
    let phrases: string[] = []

    if (progress < 0.6) {
      phrases = [
        i18n.t('phrasesFar.keepGoing'),
        i18n.t('phrasesFar.youCanDoThis'),
        i18n.t('phrasesFar.neverGiveUp'),
        i18n.t('phrasesFar.preachTheWord'),
        i18n.t('phrasesFar.stayFocused'),
        i18n.t('phrasesFar.haveFaith'),
        i18n.t('phrasesFar.stayStrong'),
      ]
    }

    if (progress >= 0.6 && progress < 1) {
      phrases = [
        i18n.t('phrasesClose.oneStepCloser'),
        i18n.t('phrasesClose.almostThere'),
        i18n.t('phrasesClose.keepMovingForward'),
        i18n.t('phrasesClose.successOnTheHorizon'),
        i18n.t('phrasesClose.momentumIsYours'),
        i18n.t('phrasesClose.nearingAchievement'),
        i18n.t('phrasesClose.youreClosingIn'),
        i18n.t('phrasesClose.closerThanEver'),
      ]
    }

    if (progress >= 1) {
      phrases = [
        i18n.t('phrasesDone.youDidIt'),
        i18n.t('phrasesDone.goalAchieved'),
        i18n.t('phrasesDone.youNailedIt'),
        i18n.t('phrasesDone.congratulations'),
        i18n.t('phrasesDone.takeYourShoesOff'),
        i18n.t('phrasesDone.hatsOffToYou'),
        i18n.t('phrasesDone.missionComplete'),
        i18n.t('phrasesDone.success'),
      ]
    }

    const random = Math.floor(Math.random() * phrases.length)
    return phrases[random]
  }, [])

  const [encouragementPhrase, setEncouragementPhrase] = useState(
    encouragementHourPhrase(progress)
  )

  useEffect(() => {
    setEncouragementPhrase(encouragementHourPhrase(progress))
  }, [encouragementHourPhrase, progress])

  const minutesRemaining = useMemo(
    () =>
      calculateMinutesRemaining({ minutes: adjustedMinutes.value, goalHours }),
    [adjustedMinutes, goalHours]
  )

  const daysLeftInMonth = useMemo(() => getDaysLeftInCurrentMonth(), [])

  const plannedMinutesToCurrentDay = useMemo(() => {
    return plannedMinutesToCurrentDayForMonth(
      moment().month(),
      moment().year(),
      dayPlans,
      recurringPlans
    )
  }, [dayPlans, recurringPlans])

  // Returns hours remaining if the last day of the month because x/0 = infinity.
  // Which we don't want to display to the user
  const hoursPerDayNeeded = useMemo(
    () =>
      daysLeftInMonth === 0
        ? minutesRemaining / 60
        : _.round(minutesRemaining / 60 / daysLeftInMonth, 1),
    [daysLeftInMonth, minutesRemaining]
  )

  return (
    <View>
      <Button
        style={{
          flexDirection: 'column',
          borderRadius: theme.numbers.borderRadiusSm,
          backgroundColor: theme.colors.backgroundLighter,
          gap: 5,
          paddingTop: 5,
          // overflow: 'hidden',
          position: 'relative',
        }}
        onPress={() =>
          navigation.navigate('Month', {
            month: moment().month(),
            year: moment().year(),
          })
        }
      >
        <View style={{ paddingHorizontal: 5, gap: 7 }}>
          <MonthServiceReportProgressBar
            month={moment().month()}
            year={moment().year()}
            minimal={!displayDetailsOnProgressBarHomeScreen}
          />
          <View
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'column',
              gap: 7,
              paddingBottom: 10,
            }}
          >
            <View>
              <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
                {_.round(
                  adjustedMinutes.value / 60,
                  displayDetailsOnProgressBarHomeScreen ? 1 : 0
                )}
              </Text>
              <View
                style={{
                  position: 'absolute',
                  right: -25,
                  bottom: 0,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.textAlt,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  /{goalHours}
                </Text>
              </View>
            </View>

            <Text style={{ fontFamily: theme.fonts.bold, maxWidth: 200 }}>
              {encouragementPhrase}
            </Text>
            {plannedMinutesToCurrentDay !== 0 ? (
              <AheadOrBehindOfMonthSchedule
                month={moment().month()}
                year={moment().year()}
                fontSize='xs'
              />
            ) : hoursPerDayNeeded > 0 ? (
              <View style={{ gap: 5 }}>
                <View
                  style={{
                    borderRadius: theme.numbers.borderRadiusLg,
                    backgroundColor: theme.colors.accent3,
                    paddingHorizontal: 20,
                    marginHorizontal: 15,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      fontSize: theme.fontSize('xs'),
                      color: theme.colors.textInverse,
                      fontFamily: theme.fonts.semiBold,
                      display: 'flex',
                    }}
                  >
                    {hoursPerDayNeeded} {i18n.t('hoursPerDayToGoal')}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 8,
                    color: theme.colors.textAlt,
                    textAlign: 'center',
                  }}
                >
                  {i18n.t('goalBasedOnPublisherType')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Button>
      <Button
        onPress={() => navigation.navigate('Add Time')}
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.accentTranslucent,
          paddingVertical: 10,
          borderRadius: theme.numbers.borderRadiusSm,
        }}
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('addTime')}
        </Text>
      </Button>
    </View>
  )
}
