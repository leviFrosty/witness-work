import { View } from 'react-native'
import { useServiceReport } from '../stores/serviceReport'
import useTheme from '../contexts/theme'
import MonthServiceReportProgressBar from './MonthServiceReportProgressBar'
import { usePreferences } from '../stores/preferences'
import {
  calculateHoursRemaining,
  calculateProgress,
  totalHoursForCurrentMonth,
  hasServiceReportsForMonth,
  getDaysLeftInCurrentMonth,
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

const HourEntryCard = () => {
  const theme = useTheme()
  const { publisher, publisherHours, displayDetailsOnProgressBarHomeScreen } =
    usePreferences()
  const { serviceReports } = useServiceReport()
  const navigation = useNavigation<RootStackNavigation>()
  const goalHours = publisherHours[publisher]

  const hours = useMemo(
    () => totalHoursForCurrentMonth(serviceReports),
    [serviceReports]
  )

  const progress = useMemo(
    () => calculateProgress({ hours, goalHours }),
    [hours, goalHours]
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

    if (progress >= 0.6 && progress < 0.95) {
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

    if (progress > 0.95) {
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

  const hoursRemaining = useMemo(
    () => calculateHoursRemaining({ hours, goalHours }),
    [hours, goalHours]
  )

  const daysLeftInMonth = useMemo(() => getDaysLeftInCurrentMonth(), [])

  // Returns hours remaining if the last day of the month because x/0 = infinity.
  // Which we don't want to display to the user
  const hoursPerDayNeeded = useMemo(
    () =>
      daysLeftInMonth === 0
        ? hoursRemaining
        : (hoursRemaining / daysLeftInMonth).toFixed(1),
    [daysLeftInMonth, hoursRemaining]
  )

  return (
    <View>
      <Button
        style={{
          flexDirection: 'column',
          borderRadius: theme.numbers.borderRadiusSm,
          backgroundColor: theme.colors.backgroundLighter,
          gap: 5,
          paddingTop: 10,
          paddingHorizontal: 10,
          position: 'relative',
        }}
        onPress={() =>
          navigation.navigate('Time Reports', {
            month: moment().month(),
            year: moment().year(),
          })
        }
      >
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
                {hours}
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
                }}
              >
                {hoursPerDayNeeded} {i18n.t('hoursPerDayToGoal')}
              </Text>
            </View>
            <Text style={{ fontSize: 8, color: theme.colors.textAlt }}>
              {i18n.t('goalBasedOnPublisherType')}
            </Text>
          </View>
        </View>
      </Button>
      <ActionButton onPress={() => navigation.navigate('Add Time')}>
        {i18n.t('addTime')}
      </ActionButton>
    </View>
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
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: theme.colors.backgroundLighter,
        borderRadius: theme.numbers.borderRadiusSm,
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
            borderRadius: theme.numbers.borderRadiusSm,
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
            borderRadius: theme.numbers.borderRadiusSm,
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

interface ServiceReportProps {
  setSheet: React.Dispatch<React.SetStateAction<ExportTimeSheetState>>
}

const ServiceReport = ({ setSheet }: ServiceReportProps) => {
  const theme = useTheme()
  const { publisher } = usePreferences()
  const navigation = useNavigation<RootStackNavigation>()
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
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <View
            style={{
              flexDirection: 'column',
              gap: 5,
              flexGrow: 1,
              maxWidth: 200,
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
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontFamily: theme.fonts.semiBold,
                      textDecorationLine: 'underline',
                    }}
                  >
                    {i18n.t('viewHours')}
                  </Text>
                </Button>
              ) : (
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('hours')}
                </Text>
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
            <Text
              style={{
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('studies')}
            </Text>
            <RightCard />
          </View>
        </View>
      </Card>
    </View>
  )
}

export default ServiceReport
