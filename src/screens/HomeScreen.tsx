import useTheme from '../contexts/theme'
import { useMemo, useState } from 'react'
import useConversations from '../stores/conversationStore'
import {
  overdueFollowUpConversations,
  upcomingFollowUpConversations,
} from '../lib/conversations'
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
import { HomeTabStackNavigation } from '../types/homeStack'

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

  // `upcomingFollowUpConversations` already enforces the
  // notify-or-topic-required filter via `isAppointment`, so we only need to
  // narrow to active (non-deleted/non-dismissed) contacts here.
  const approachingConvosWithActiveContacts = useMemo(() => {
    const activeIds = new Set(contacts.map((c) => c.id))
    return approachingConversations.filter((c) => activeIds.has(c.contact.id))
  }, [contacts, approachingConversations])

  // Overdue follow-ups — mirrors the widget's 30-day lookback so a user
  // tapping a missed appointment from the widget can also find it listed in
  // the app. Unlike upcoming, overdue items are not filtered by notify/topic
  // since the user always wants to know they missed something.
  const overdueConvosWithActiveContacts = useMemo(() => {
    const overdue = overdueFollowUpConversations({
      currentTime: new Date(),
      conversations,
      lookbackDays: 30,
    })
    const activeIds = new Set(contacts.map((c) => c.id))
    return overdue.filter((c) => activeIds.has(c.contact.id))
  }, [contacts, conversations])

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
          {homeScreenElements.approachingConversations &&
            (approachingConvosWithActiveContacts.length > 0 ||
              overdueConvosWithActiveContacts.length > 0) && (
              <ApproachingConversations
                conversations={approachingConvosWithActiveContacts}
                overdueConversations={overdueConvosWithActiveContacts}
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
