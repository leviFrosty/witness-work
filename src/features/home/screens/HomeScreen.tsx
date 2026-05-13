import useTheme from '@/contexts/theme'
import { useCallback, useMemo, useState } from 'react'
import useConversations from '@/stores/conversationStore'
import {
  overdueFollowUpConversations,
  upcomingFollowUpConversations,
} from '@/lib/conversations'
import ApproachingConversations from '@/features/conversations/components/ApproachingConversations'
import MissedConversations from '@/features/conversations/components/MissedConversations'
import useContacts from '@/stores/contactsStore'
import { RefreshControl, View } from 'react-native'
import { iCloudSync } from '@/app/sync/iCloudSync'
import ServiceReportSection from '@/features/service-reports/components/ServiceReportSection'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import XView from '@/components/layout/XView'
import YearMilestoneCard from '@/components/YearMilestoneCard'
import moment from 'moment'
import useDevice from '@/hooks/useDevice'
import { getMonthsReports, getServiceYearFromDate } from '@/lib/serviceReport'
import WeekStripTeaser from '@/features/service-reports/components/WeekStripTeaser'
import i18n from '@/lib/locales'
import Text from '@/components/MyText'
import Button from '@/components/Button'
import { useNavigation } from '@react-navigation/native'
import usePublisher from '@/hooks/usePublisher'
import {
  getEffectiveHomeScreenOrder,
  HomeScreenElementKey,
  usePreferences,
} from '@/stores/preferences'
import BackupReminder from '@/features/settings/components/BackupReminder'
import { TimerSection } from '@/features/service-reports/components/TimerSection'
import UpgradeLegacyTimeReportsSheet from '@/features/service-reports/components/UpgradeLegacyTimeReportsSheet'
import ProfileCard from '@/features/profile/components/ProfileCard'
import HomeChecklist from '@/features/onboarding/components/HomeChecklist'
import SupporterNudgeCard from '@/features/supporter/components/SupporterNudgeCard'
import DidYouKnowTipCard from '@/features/updates/components/DidYouKnowTipCard'
import ContributionGraph from '@/features/profile/components/ContributionGraph'
import useDailyMinutes from '@/features/profile/hooks/useDailyMinutes'
import useIsSupporter from '@/hooks/useIsSupporter'
import { useServiceReport } from '@/stores/serviceReport'
import { isSupporterNudgeEligible } from '@/features/supporter/lib/supporterNudge'
import { HomeTabStackNavigation } from '@/types/homeStack'
import { RootStackNavigation } from '@/types/rootStack'
import { Fragment } from 'react'

// Defined inline so `useDailyMinutes` only fires when the section is actually
// mounted — for publisher (checkbox) users the case below returns null and we
// never flatten the reports collection.
const ContributionGraphSection = () => {
  const theme = useTheme()
  const daily = useDailyMinutes()
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          marginLeft: 5,
        }}
      >
        {i18n.t('profileActivityTitle')}
      </Text>
      <ContributionGraph daily={daily} />
    </View>
  )
}

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
    hideDonateHeart,
    hideSupporterNudge,
    supporterNudgeDismissedAt,
    devSupporterNudgeForceShow,
  } = usePreferences()
  const { isSupporter } = useIsSupporter()
  const { serviceReports } = useServiceReport()
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
  const { hasAnnualGoal, showsTimer, entryMode } = usePublisher()
  const { serviceReportTags, homeScreenElements, homeScreenElementsOrder } =
    usePreferences()
  const effectiveOrder = useMemo(
    () => getEffectiveHomeScreenOrder(homeScreenElementsOrder),
    [homeScreenElementsOrder]
  )
  // Anchor the "Did you know" tip card to the bottom of the scroll view only
  // when the user has it in its default trailing position. Once they reorder
  // it inline, drop the auto-margin so it flows with surrounding sections.
  const isDidYouKnowLast =
    effectiveOrder[effectiveOrder.length - 1] === 'didYouKnow'
  const navigation = useNavigation<HomeTabStackNavigation>()
  const rootNavigation = useNavigation<RootStackNavigation>()
  const serviceYear = getServiceYearFromDate(moment())
  const currentMonth = moment().month()
  const currentYear = moment().year()
  const currentMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, currentMonth, currentYear),
    [serviceReports, currentMonth, currentYear]
  )
  const hasLegacyReports = useMemo(() => {
    return serviceReportTags.some((t) => typeof t === 'string')
  }, [serviceReportTags])
  const [upgradeReportsSheet, setUpgradeReportSheet] = useState(
    hasLegacyReports && hasAnnualGoal
  )
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

  const showSupporterNudge = useMemo(
    () =>
      isSupporterNudgeEligible({
        isSupporter,
        hideDonateHeart,
        hideSupporterNudge,
        installedOn,
        supporterNudgeDismissedAt,
        serviceReports,
        contactsCount: contacts.length,
        conversationsCount: conversations.length,
        devForceShow: devSupporterNudgeForceShow,
        isDev: __DEV__,
      }),
    [
      isSupporter,
      hideDonateHeart,
      hideSupporterNudge,
      installedOn,
      supporterNudgeDismissedAt,
      serviceReports,
      contacts.length,
      conversations.length,
      devSupporterNudgeForceShow,
    ]
  )

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
        contentContainerStyle={{
          paddingBottom: insets.bottom + 85,
          // flexGrow lets the inner View's `flex: 1` actually fill the
          // viewport when the user's home sections are short, which the tip
          // card's `marginTop: 'auto'` relies on to anchor to the bottom.
          flexGrow: 1,
        }}
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
            onPressIncomplete={() =>
              rootNavigation.navigate('PreferencesPublisher')
            }
          />
          {shouldRemindToBackup && (
            <BackupReminder compact={iCloudSyncEnabled} />
          )}
          <HomeChecklist />
          {showSupporterNudge && <SupporterNudgeCard />}
          {effectiveOrder.map((key: HomeScreenElementKey) => {
            switch (key) {
              case 'approachingConversations':
                if (!homeScreenElements.approachingConversations) return null
                return (
                  <Fragment key={key}>
                    <MissedConversations
                      conversations={overdueConvosWithActiveContacts}
                    />
                    <ApproachingConversations
                      conversations={approachingConvosWithActiveContacts}
                    />
                  </Fragment>
                )
              case 'tabletServiceYearSummary':
                if (
                  !isTablet ||
                  !hasAnnualGoal ||
                  !homeScreenElements.tabletServiceYearSummary
                ) {
                  return null
                }
                return (
                  <View key={key} style={{ gap: 10 }}>
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
                          navigation.navigate('Progress', {
                            month: moment().month(),
                            year: moment().year(),
                          })
                        }
                      >
                        <YearMilestoneCard year={serviceYear + 1} />
                      </Button>
                    </XView>
                  </View>
                )
              case 'serviceReport':
                if (!homeScreenElements.serviceReport) return null
                return <ServiceReportSection key={key} />

              case 'thisWeek':
                if (!homeScreenElements.thisWeek) return null
                return (
                  <WeekStripTeaser
                    key={key}
                    month={currentMonth}
                    year={currentYear}
                    monthsReports={currentMonthsReports}
                  />
                )
              case 'timer':
                if (!showsTimer || !homeScreenElements.timer) return null
                return <TimerSection key={key} />
              case 'contributionGraph':
                if (
                  entryMode !== 'hours' ||
                  !homeScreenElements.contributionGraph
                ) {
                  return null
                }
                return <ContributionGraphSection key={key} />
              case 'didYouKnow':
                if (homeScreenElements.didYouKnow === false) return null
                return (
                  <DidYouKnowTipCard
                    key={key}
                    style={isDidYouKnowLast ? { marginTop: 'auto' } : undefined}
                  />
                )
              default:
                return null
            }
          })}
        </View>
      </KeyboardAwareScrollView>
      <UpgradeLegacyTimeReportsSheet
        sheet={upgradeReportsSheet}
        setSheet={setUpgradeReportSheet}
      />
    </View>
  )
}
