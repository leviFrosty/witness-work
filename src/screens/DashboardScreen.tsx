import useTheme from '../contexts/theme'
import { useMemo, useState } from 'react'
import useConversations from '../stores/conversationStore'
import { upcomingFollowUpConversations } from '../lib/conversations'
import ApproachingConversations from '../components/ApproachingConversations'
import ExportTimeSheet, {
  ExportTimeSheetState,
} from '../components/ExportTimeSheet'
import useContacts from '../stores/contactsStore'
import { View } from 'react-native'
import MonthlyRoutine from '../components/MonthlyRoutine'
import ServiceReport from '../components/ServiceReport'
import ContactsList from '../components/ContactsList'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import XView from '../components/layout/XView'
import AnnualServiceReportSummary from '../components/AnnualServiceReportSummary'
import moment from 'moment'
import useDevice from '../hooks/useDevice'
import { getServiceYearFromDate } from '../lib/serviceReport'
import i18n from '../lib/locales'
import Text from '../components/MyText'
import Button from '../components/Button'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import usePublisher from '../hooks/usePublisher'
import { usePreferences } from '../stores/preferences'
import BackupReminder from '../components/BackupReminder'
import { TimerSection } from '../components/TimerSection'

export const DashboardScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const {
    backupNotificationFrequencyAsDays,
    remindMeAboutBackups,
    lastBackupDate,
    installedOn,
  } = usePreferences()
  const { conversations } = useConversations()
  const { contacts } = useContacts()
  const { isTablet } = useDevice()
  const { hasAnnualGoal } = usePublisher()
  const navigation = useNavigation<RootStackNavigation>()
  const serviceYear = getServiceYearFromDate(moment())
  const [sheet, setSheet] = useState<ExportTimeSheetState>({
    open: false,
    month: 0,
    year: 0,
  })

  const approachingConversations = useMemo(
    () =>
      upcomingFollowUpConversations({
        currentTime: new Date(),
        conversations,
        withinNextDays: 1,
      }),
    [conversations]
  )

  const conversationsWithNotificationOrTopic = useMemo(
    () =>
      approachingConversations.filter(
        (c) => c.followUp?.notifyMe || c.followUp?.topic
      ),
    [approachingConversations]
  )

  const approachingConvosWithActiveContacts = useMemo(
    () =>
      conversationsWithNotificationOrTopic.filter((convo) => {
        const contactIsActive = contacts.find((c) => c.id === convo.contact.id)
        if (contactIsActive) {
          return convo
        }
      }),
    [contacts, conversationsWithNotificationOrTopic]
  )

  const shouldRemindToBackup = useMemo(() => {
    if (!remindMeAboutBackups) return false

    const installedMoreThanNotificationFrequencyAgo = moment(installedOn)
      .add(backupNotificationFrequencyAsDays, 'days')
      .isBefore(moment())

    if (lastBackupDate === null && installedMoreThanNotificationFrequencyAgo) {
      return true
    }

    if (
      moment(lastBackupDate)
        .add(backupNotificationFrequencyAsDays, 'days')
        .isBefore(moment())
    ) {
      return true
    }

    return false
  }, [
    backupNotificationFrequencyAsDays,
    installedOn,
    lastBackupDate,
    remindMeAboutBackups,
  ])

  return (
    <View style={{ flexGrow: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 85 }}
        automaticallyAdjustKeyboardInsets
        style={{
          flexGrow: 1,
          padding: 15,
          paddingBottom: insets.bottom + 50,
        }}
      >
        <View style={{ gap: 30, paddingBottom: insets.bottom, flex: 1 }}>
          {!!approachingConvosWithActiveContacts.length && (
            <ApproachingConversations
              conversations={approachingConvosWithActiveContacts}
            />
          )}
          {shouldRemindToBackup && <BackupReminder />}
          <XView style={{ flex: 1, justifyContent: 'space-between' }}>
            <MonthlyRoutine />
            {isTablet && hasAnnualGoal && (
              <View
                style={{
                  flexDirection: 'row',
                  flexGrow: 1,
                  maxWidth: '50%',
                }}
              >
                <View
                  style={{
                    gap: 10,
                    flexGrow: 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: theme.fonts.semiBold,
                      marginLeft: 5,
                    }}
                  >
                    {i18n.t('serviceYearSummary')}
                  </Text>
                  <XView>
                    <Button
                      style={{ flex: 1 }}
                      onPress={() =>
                        navigation.navigate('Time Reports', {
                          month: moment().month(),
                          year: moment().year(),
                        })
                      }
                    >
                      <AnnualServiceReportSummary
                        serviceYear={serviceYear}
                        month={moment().month()}
                        year={moment().year()}
                      />
                    </Button>
                  </XView>
                </View>
              </View>
            )}
          </XView>
          <ServiceReport setSheet={setSheet} />
          <TimerSection />
          <ContactsList />
        </View>
      </KeyboardAwareScrollView>
      <ExportTimeSheet
        sheet={sheet}
        setSheet={setSheet}
        showViewAllMonthsButton
      />
    </View>
  )
}
