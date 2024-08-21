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
import ServiceReportSection from '../components/ServiceReportSection'
import ReturnVisitContactsSection from '../components/ReturnVisitContactsSection'
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
import usePublisher from '../hooks/usePublisher'
import { usePreferences } from '../stores/preferences'
import BackupReminder from '../components/BackupReminder'
import { TimerSection } from '../components/TimerSection'
import UpgradeLegacyTimeReportsSheet from '../components/UpgradeLegacyTimeReportsSheet'
import { HomeTabStackNavigation } from '../stacks/HomeTabStack'

export const HomeScreen = () => {
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
  const { serviceReportTags, publisher, homeScreenElements } = usePreferences()
  const navigation = useNavigation<HomeTabStackNavigation>()
  const serviceYear = getServiceYearFromDate(moment())
  const hasLegacyReports = useMemo(() => {
    return serviceReportTags.some((t) => typeof t === 'string')
  }, [serviceReportTags])
  const [upgradeReportsSheet, setUpgradeReportSheet] = useState(
    hasLegacyReports && hasAnnualGoal
  )
  const [exportTimeSheet, setExportTimeSheet] = useState<ExportTimeSheetState>({
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
          flex: 1,
          padding: 15,
          paddingBottom: insets.bottom + 50,
        }}
      >
        <View style={{ gap: 20, paddingBottom: insets.bottom, flex: 1 }}>
          {!!approachingConvosWithActiveContacts.length &&
            homeScreenElements.approachingConversations && (
              <ApproachingConversations
                conversations={approachingConvosWithActiveContacts}
              />
            )}
          {shouldRemindToBackup && <BackupReminder />}
          {(homeScreenElements.monthlyRoutine ||
            (homeScreenElements.tabletServiceYearSummary &&
              isTablet &&
              hasAnnualGoal)) && (
            <XView style={{ flex: 1, justifyContent: 'space-between' }}>
              {homeScreenElements.monthlyRoutine && <MonthlyRoutine />}
              {isTablet &&
                hasAnnualGoal &&
                homeScreenElements.tabletServiceYearSummary && (
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
                            navigation.navigate('Month', {
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
          )}
          {homeScreenElements.serviceReport && (
            <ServiceReportSection setSheet={setExportTimeSheet} />
          )}
          {publisher !== 'publisher' && homeScreenElements.timer && (
            <TimerSection />
          )}
          {homeScreenElements.contacts && <ReturnVisitContactsSection />}
        </View>
      </KeyboardAwareScrollView>
      <UpgradeLegacyTimeReportsSheet
        sheet={upgradeReportsSheet}
        setSheet={setUpgradeReportSheet}
      />
      <ExportTimeSheet
        sheet={exportTimeSheet}
        setSheet={setExportTimeSheet}
        showViewAllMonthsButton={publisher !== 'publisher'}
      />
    </View>
  )
}
