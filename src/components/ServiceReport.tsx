import { View } from 'react-native'
import { useServiceReport } from '../stores/serviceReport'
import useTheme from '../contexts/theme'
import MonthServiceReportProgressBar from './MonthServiceReportProgressBar'
import { usePreferences } from '../stores/preferences'
import {
  calculateMinutesRemaining,
  calculateProgress,
  totalMinutesForCurrentMonth,
  hasServiceReportsForMonth,
  getDaysLeftInCurrentMonth,
  plannedMinutesToCurrentDayForMonth,
} from '../lib/serviceReport'
import Card from './Card'
import Text from './MyText'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { getStudiesForGivenMonth } from '../lib/contacts'
import useContacts from '../stores/contactsStore'
import moment from 'moment'
import LottieView from 'lottie-react-native'
import * as Crypto from 'expo-crypto'
import i18n from '../lib/locales'
import useConversations from '../stores/conversationStore'
import ActionButton from './ActionButton'
import IconButton from './IconButton'
import { faArrowUpFromBracket } from '@fortawesome/free-solid-svg-icons'
import { faSquare } from '@fortawesome/free-regular-svg-icons'
import Button from './Button'
import { ExportTimeSheetState } from './ExportTimeSheet'
import useDevice from '../hooks/useDevice'
import _ from 'lodash'
import AheadOrBehindOfMonthSchedule from './AheadOrBehindOfSchedule'

const HourEntryCard = () => {
  const theme = useTheme()
  const { publisher, publisherHours, displayDetailsOnProgressBarHomeScreen } =
    usePreferences()
  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()
  const navigation = useNavigation<RootStackNavigation>()
  const goalHours = publisherHours[publisher]

  const minutes = useMemo(
    () => totalMinutesForCurrentMonth(serviceReports),
    [serviceReports]
  )

  const progress = useMemo(
    () => calculateProgress({ minutes, goalHours }),
    [minutes, goalHours]
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

    if (progress >= 0.7 && progress < 1) {
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
    () => calculateMinutesRemaining({ minutes, goalHours }),
    [minutes, goalHours]
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
    <Button
      style={{
        flexDirection: 'column',
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.backgroundLighter,
        gap: 5,
        paddingTop: 10,
        overflow: 'hidden',
        position: 'relative',
      }}
      onPress={() =>
        navigation.navigate('Time Reports', {
          month: moment().month(),
          year: moment().year(),
        })
      }
    >
      <View style={{ paddingHorizontal: 6, gap: 10 }}>
        <MonthServiceReportProgressBar
          month={moment().month()}
          year={moment().year()}
          minimal={!displayDetailsOnProgressBarHomeScreen}
        />
        <View style={{ marginBottom: 10 }}>
          <View
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <View>
              <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
                {_.round(
                  minutes / 60,
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
                fontSize='sm'
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
      </View>
      <ActionButton onPress={() => navigation.navigate('Add Time')}>
        {i18n.t('addTime')}
      </ActionButton>
    </Button>
  )
}

const RightCard = () => {
  const theme = useTheme()
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const studies = useMemo(
    () =>
      getStudiesForGivenMonth({ contacts, conversations, month: new Date() }),
    [contacts, conversations]
  )
  const encouragementStudiesPhrase = (studies: number) => {
    let phrases: string[] = []

    if (studies === 0) {
      phrases = [
        i18n.t('phrasesStudiesNone.keepGoing'),
        i18n.t('phrasesStudiesNone.stayStrong'),
        i18n.t('phrasesStudiesNone.stayPositive'),
        i18n.t('phrasesStudiesNone.grindOn'),
        i18n.t('phrasesStudiesNone.keepSearching'),
        i18n.t('phrasesStudiesNone.stayResilient'),
      ]
    }
    if (studies > 0 && studies <= 15) {
      phrases = [
        i18n.t('phrasesStudiesDone.bravo'),
        i18n.t('phrasesStudiesDone.wellDone'),
        i18n.t('phrasesStudiesDone.amazingJob'),
        i18n.t('phrasesStudiesDone.wayToGo'),
        i18n.t('phrasesStudiesDone.victoryLap'),
        i18n.t('phrasesStudiesDone.fantastic'),
        i18n.t('phrasesStudiesDone.wow'),
      ]
    }
    if (studies > 15) {
      phrases = ['🤩🤯🎉']
    }

    const random = Math.floor(Math.random() * phrases.length)
    return phrases[random]
  }
  const [encouragementPhrase, setEncouragementPhrase] = useState(
    encouragementStudiesPhrase(studies)
  )

  useEffect(() => {
    setEncouragementPhrase(encouragementStudiesPhrase(studies))
  }, [studies])
  return (
    <View
      style={{
        flexDirection: 'column',
        paddingHorizontal: 6,
        paddingVertical: 10,
        backgroundColor: theme.colors.backgroundLighter,
        borderRadius: theme.numbers.borderRadiusLg,
        flexGrow: 1,
      }}
    >
      <View
        style={{
          gap: 10,
          justifyContent: 'center',
          alignItems: 'center',
          flexGrow: 1,
        }}
      >
        <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
          {studies}
        </Text>
        <Text
          style={{
            fontFamily: theme.fonts.bold,
            maxWidth: 125,
          }}
        >
          {encouragementPhrase}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 8,
          color: theme.colors.textAlt,
          textAlign: 'center',
        }}
      >
        {i18n.t('basedOnContacts')}
      </Text>
    </View>
  )
}

const CheckMarkAnimationComponent = ({ undoId }: { undoId?: string }) => {
  const theme = useTheme()
  const { deleteServiceReport } = useServiceReport()

  return (
    <View
      style={{
        backgroundColor: theme.colors.backgroundLighter,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
      }}
    >
      <LottieView
        autoPlay={true}
        loop={false}
        style={{
          width: 110,
          height: 110,
          backgroundColor: theme.colors.backgroundLighter,
        }}
        // Find more Lottie files at https://lottiefiles.com/featured
        source={require('./../assets/lottie/checkMark.json')}
      />
      {undoId && (
        <Button onPress={() => deleteServiceReport(undoId)}>
          <Text
            style={{
              fontSize: 10,
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('undo')}
          </Text>
        </Button>
      )}
    </View>
  )
}

const StandardPublisherTimeEntry = () => {
  const theme = useTheme()
  const [undoId, setUndoId] = useState<string>()
  const { serviceReports, addServiceReport } = useServiceReport()
  const hasGoneOutInServiceThisMonth = hasServiceReportsForMonth(
    serviceReports,
    moment().month(),
    moment().year()
  )

  const handleSubmitDidService = () => {
    const id = Crypto.randomUUID()
    addServiceReport({
      date: new Date(),
      hours: 0,
      minutes: 0,
      id,
    })
    setUndoId(id)
  }

  return (
    <View>
      {hasGoneOutInServiceThisMonth ? (
        <View
          style={{
            backgroundColor: hasGoneOutInServiceThisMonth
              ? theme.colors.backgroundLighter
              : theme.colors.accent,
            borderColor: theme.colors.border,
            paddingVertical: hasGoneOutInServiceThisMonth ? 5 : 46,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: theme.numbers.borderRadiusLg,
            paddingHorizontal: 20,
            overflow: 'hidden',
          }}
        >
          <CheckMarkAnimationComponent undoId={undoId} />
        </View>
      ) : (
        <Button
          style={{
            backgroundColor: hasGoneOutInServiceThisMonth
              ? theme.colors.backgroundLighter
              : theme.colors.accent,
            borderColor: theme.colors.border,
            paddingVertical: hasGoneOutInServiceThisMonth ? 5 : 46,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: theme.numbers.borderRadiusLg,
            paddingHorizontal: 25,
          }}
          onPress={handleSubmitDidService}
        >
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <IconButton
              icon={faSquare}
              size='xl'
              iconStyle={{ color: theme.colors.textInverse }}
            />
            <Text
              style={{
                color: theme.colors.textInverse,
                fontSize: 18,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('sharedTheGoodNews')}
            </Text>
          </View>
        </Button>
      )}
    </View>
  )
}

const RowSectionTitle = ({
  title,
  underline,
}: {
  title: string
  underline?: boolean
}) => {
  const theme = useTheme()

  return (
    <Text
      style={{
        color: theme.colors.textAlt,
        fontFamily: theme.fonts.semiBold,
        textDecorationLine: underline ? 'underline' : 'none',
      }}
    >
      {title}
    </Text>
  )
}

interface ServiceReportProps {
  setSheet: React.Dispatch<React.SetStateAction<ExportTimeSheetState>>
}

const ServiceReport = ({ setSheet }: ServiceReportProps) => {
  const theme = useTheme()
  const { publisher } = usePreferences()
  const navigation = useNavigation<RootStackNavigation>()
  const { isTablet } = useDevice()

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
            marginLeft: 5,
          }}
        >
          {i18n.t('serviceReport')}
        </Text>
        <IconButton
          icon={faArrowUpFromBracket}
          size='sm'
          onPress={() =>
            setSheet({
              open: true,
              month: moment().month(),
              year: moment().year(),
            })
          }
        />
      </View>

      <Card>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          <View
            style={{
              flexDirection: 'column',
              gap: 5,
              flexGrow: 1,
              maxWidth: isTablet ? 800 : 200,
            }}
          >
            <View style={{ flexDirection: 'row' }}>
              {publisher !== 'publisher' ? (
                <Button
                  onPress={() =>
                    navigation.navigate('Time Reports', {
                      month: moment().month(),
                      year: moment().year(),
                    })
                  }
                >
                  <RowSectionTitle
                    title={i18n.t('viewHours')}
                    underline={true}
                  />
                </Button>
              ) : (
                <RowSectionTitle title={i18n.t('hours')} />
              )}
            </View>
            {publisher === 'publisher' ? (
              <StandardPublisherTimeEntry />
            ) : (
              <HourEntryCard />
            )}
          </View>
          <View
            style={{
              flexDirection: 'column',
              gap: 5,
              flexGrow: 1,
            }}
          >
            <RowSectionTitle title={i18n.t('studies')} />
            <RightCard />
          </View>
        </View>
      </Card>
    </View>
  )
}

export default ServiceReport
