import useTheme from '../contexts/theme'
import { useCallback, useMemo, useState } from 'react'
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
import { RefreshControl, View } from 'react-native'
import { iCloudSync } from '../lib/sync/iCloudSync'
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
import ProfileCard from '../components/ProfileCard'
import { HomeTabStackNavigation } from '../types/homeStack'
import { RootStackNavigation } from '../types/rootStack'

export const HomeScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const {
    backupNotificationFrequencyAsDays,
    remindMeAboutBackups,
    lastBackupDate,
    installedOn,
    iCloudSyncEnabled,
    lastiCloudPushedAt,
    lastiCloudPulledAt,
  } = usePreferences()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      // Pull first so any remote-side changes land before we push ours —
      // avoids a fight between two devices that both just pulled to refresh.
      await iCloudSync.pullAndMerge('pull-to-refresh')
      await iCloudSync.push('pull-to-refresh')
    } finally {
      setRefreshing(false)
    }
  }, [])
  const { conversations } = useConversations()
  const { contacts } = useContacts()
  const { isTablet } = useDevice()
  const { hasAnnualGoal } = usePublisher()
  const { serviceReportTags, publisher, homeScreenElements } = usePreferences()
  const navigation = useNavigation<HomeTabStackNavigation>()
  const rootNavigation = useNavigation<RootStackNavigation>()
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

    // If iCloud sync is on and has successfully pushed or pulled within the
    // backup-freshness window, the user's data is already off-device. Skip
    // the local-export nag. If sync has been silent longer than the window
    // (broken, signed out), fall through and nag as usual.
    const mostRecentiCloudSyncAt = Math.max(
      lastiCloudPushedAt ?? 0,
      lastiCloudPulledAt ?? 0
    )
    if (
      iCloudSyncEnabled &&
      mostRecentiCloudSyncAt > 0 &&
      moment(mostRecentiCloudSyncAt)
        .add(backupNotificationFrequencyAsDays, 'days')
        .isAfter(moment())
    ) {
      return false
    }

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
    iCloudSyncEnabled,
    lastiCloudPushedAt,
    lastiCloudPulledAt,
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
        refreshControl={
          iCloudSyncEnabled ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.accent}
              progressViewOffset={16}
              style={{ transform: [{ scale: 0.85 }] }}
            />
          ) : undefined
        }
      >
        <View style={{ gap: 20, paddingBottom: insets.bottom, flex: 1 }}>
          <ProfileCard
            onPressIncomplete={() => rootNavigation.navigate('ProfileSetup')}
          />
          {homeScreenElements.approachingConversations &&
            (approachingConvosWithActiveContacts.length > 0 ||
              overdueConvosWithActiveContacts.length > 0) && (
              <ApproachingConversations
                conversations={approachingConvosWithActiveContacts}
                overdueConversations={overdueConvosWithActiveContacts}
              />
            )}
          {shouldRemindToBackup && <BackupReminder />}
          {isTablet &&
            hasAnnualGoal &&
            homeScreenElements.tabletServiceYearSummary && (
              <View style={{ gap: 10 }}>
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
