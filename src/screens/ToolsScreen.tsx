import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Text from '../components/MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import { Alert, Platform, Switch, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ActionButton from '../components/ActionButton'
import useServiceReport from '../stores/serviceReport'
import useContacts from '../stores/contactsStore'
import Card from '../components/Card'
import XView from '../components/layout/XView'
import Constants from 'expo-constants'
import { hasMigratedFromAsyncStorage } from '../stores/mmkv'
import useConversations from '../stores/conversationStore'
import axios from 'axios'
import moment from 'moment'
import { useState } from 'react'
import { useToastController } from '@tamagui/toast'
import { RecurringPlanFrequencies } from '../lib/serviceReport'
import { useTimeCache } from '../stores/timeCache'
import { PREFERENCE_DEFAULTS, usePreferences } from '../stores/preferences'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { mmkvStorage } from '../stores/mmkv'
import DateTimePicker from '../components/DateTimePicker'
import SupporterBadge from '../components/SupporterBadge'
import useIsSupporter from '../hooks/useIsSupporter'
import JsonViewer from '../components/JsonViewer'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../types/rootStack'
import { useRollover } from '../hooks/useRollover'
import * as ICloudBridge from '../../modules/icloud-bridge'
import * as Notifications from 'expo-notifications'
import { splitDateAndStartTime } from '../lib/normalizeDate'
import IconButton from '../components/IconButton'
import { faRotate } from '@fortawesome/free-solid-svg-icons'
import useCelebrationQueue from '../stores/celebrationQueue'
import { monthCelebrationKey } from '../lib/achievementTier'

const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
})

const SectionHeader = ({ title, color }: { title: string; color?: string }) => {
  const theme = useTheme()
  return (
    <Text
      style={{
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('lg'),
        color: color ?? theme.colors.textAlt,
        marginTop: 10,
        marginBottom: -5,
      }}
    >
      {title}
    </Text>
  )
}

const confirmDestructive = (title: string, onConfirm: () => void) => {
  Alert.alert(title, 'This cannot be undone.', [
    { text: i18n.t('cancel'), style: 'cancel' },
    { text: i18n.t('delete'), style: 'destructive', onPress: onConfirm },
  ])
}

export default function ToolsScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const toast = useToastController()

  const {
    serviceReports,
    dayPlans,
    recurringPlans,
    _WARNING_forceDeleteServiceReports,
    addServiceReport,
    addDayPlan,
    addRecurringPlan,
    set: setServiceReports,
  } = useServiceReport()
  const {
    contacts,
    _WARNING_forceDeleteContacts,
    _WARNING_clearDeleted,
    addContact,
    addCustomFieldDef,
  } = useContacts()
  const { cache, invalidateAllCache } = useTimeCache()
  const { conversations, addConversation, _WARNING_forceDeleteConversations } =
    useConversations()
  const preferences = usePreferences()
  const {
    devSupporterOverride,
    devSupporterNudgeForceShow,
    supporterNudgeDismissedAt,
    hideSupporterNudge,
    hasCompletedProfileSetup,
    name,
    devRolloverDateOverride,
    lastRolloverYearMonth,
    autoRolloverEnabled,
    celebratedTiers,
    set: setPreferences,
  } = preferences
  const celebrationQueue = useCelebrationQueue()
  const { isSupporter, since: supporterSince } = useIsSupporter()
  const navigation = useNavigation<RootStackNavigation>()
  const rollover = useRollover()

  const showDone = (label: string) =>
    toast.show(label, { message: '', native: true })

  const generateContacts = async () => {
    const { data } = await axios.get(
      'https://jsonplaceholder.typicode.com/users'
    )
    if (Array.isArray(data)) {
      // customFields is id-keyed against contactsStore.customFieldDefs (see
      // customFieldsMigration.ts) — writing the raw company object would
      // produce label-keyed values that no renderer can resolve. Create defs
      // up-front and key by their ids. addCustomFieldDef returns the existing
      // def on label collision, so re-running stays a no-op for the def list.
      const companyDef = addCustomFieldDef('Company')
      const catchphraseDef = addCustomFieldDef('Catchphrase')
      const bsDef = addCustomFieldDef('BS')

      data.forEach((contact, index) => {
        const customFields: Record<string, string> = {}
        if (companyDef && contact.company?.name) {
          customFields[companyDef.id] = contact.company.name
        }
        if (catchphraseDef && contact.company?.catchPhrase) {
          customFields[catchphraseDef.id] = contact.company.catchPhrase
        }
        if (bsDef && contact.company?.bs) {
          customFields[bsDef.id] = contact.company.bs
        }
        addContact({
          createdAt: moment()
            .subtract(index + 1 * 3, 'weeks')
            .toDate(),
          id: `generated-${index}`,
          name: contact.name,
          address: {
            line1: contact.address.street,
            city: contact.address.city,
            zip: contact.address.zipcode,
          },
          coordinate: {
            latitude: contact.address.geo.lat,
            longitude: contact.address.geo.lng,
          },
          email: contact.email,
          customFields,
          phone: contact.phone,
          isFavorite: index < 2,
        })
      })

      data.forEach((_: unknown, index: number) => {
        const contactId = `generated-${index}`
        const conversationCount = index < 4 ? 5 : 2

        for (let j = 0; j < conversationCount; j++) {
          addConversation({
            id: `generated-conv-${index}-${j}`,
            contact: { id: contactId },
            date: moment()
              .subtract(j * 5 + index, 'days')
              .toDate(),
            note: j === 0 ? 'Discussed chapter 3' : '',
            isBibleStudy: index < 3 && j < 3,
            followUp:
              j === 0 && index < 4
                ? {
                    date: moment()
                      .add(3 + index, 'days')
                      .toDate(),
                    notifyMe: true,
                    topic: 'Continue discussion',
                  }
                : undefined,
          })
        }
      })
    }
  }

  const generateServiceReports = () => {
    const tags = ['Special', 'Campaign', 'Memorial', 'Convention', undefined]
    let i = 0
    while (i < 1000) {
      const reportsForDay = (i * 2654435761) % 4
      for (let j = 0; j <= reportsForDay; j++) {
        const seed = i * 31 + j * 17
        const r = ((seed * 2654435761) % 1000) / 1000
        const hours = Math.floor(Math.pow(r, 2.5) * 17)
        const minutes = (seed * 7) % 12 === 0 ? 0 : ((seed * 7) % 12) * 5
        if (hours === 0 && minutes === 0) continue
        addServiceReport({
          date: moment().subtract(i, 'day').toDate(),
          hours,
          id: `generated-${i}-${j}`,
          minutes,
          credit: seed % 3 === 0,
          ldc: seed % 5 === 0,
          tag: tags[seed % tags.length],
        })
      }
      const gapR = ((i * 2654435761 + 12345) % 1000) / 1000
      const gap = Math.floor(Math.pow(gapR, 2.5) * 7) + 1
      i += gap
    }
  }

  const generateOverdueFollowUps = () => {
    const variants: {
      suffix: string
      name: string
      hoursOverdue: number
      notifyMe: boolean
      topic?: string
    }[] = [
      {
        suffix: 'fresh',
        name: 'Overdue — 5h ago (notify + topic)',
        hoursOverdue: 5,
        notifyMe: true,
        topic: 'Continue Revelation chapter 21',
      },
      {
        suffix: 'yesterday',
        name: 'Overdue — 1d ago (notify, no topic)',
        hoursOverdue: 26,
        notifyMe: true,
      },
      {
        suffix: 'lastweek',
        name: 'Overdue — 7d ago (topic, no notify)',
        hoursOverdue: 24 * 7,
        notifyMe: false,
        topic: 'Follow up on bible study offer',
      },
      {
        suffix: 'oldish',
        name: 'Overdue — 20d ago (notify + topic)',
        hoursOverdue: 24 * 20,
        notifyMe: true,
        topic: 'Return visit — left tract last time',
      },
    ]

    variants.forEach((v, i) => {
      const contactId = `overdue-contact-${v.suffix}`
      addContact({
        createdAt: moment()
          .subtract(v.hoursOverdue + 24, 'hours')
          .toDate(),
        id: contactId,
        name: v.name,
      })
      addConversation({
        id: `overdue-conv-${v.suffix}`,
        contact: { id: contactId },
        date: moment()
          .subtract(v.hoursOverdue + 2, 'hours')
          .toDate(),
        note: `Overdue test variant ${i + 1}`,
        isBibleStudy: false,
        followUp: {
          date: moment().subtract(v.hoursOverdue, 'hours').toDate(),
          notifyMe: v.notifyMe,
          topic: v.topic,
        },
      })
    })
  }

  const generateServicePlans = () => {
    // Realistic field-service start times (minutes since midnight): 8:00, 9:30,
    // 10:00, 13:00, 14:00, 15:30, 18:00, 19:00. Cycled deterministically so
    // repeated runs produce the same spread.
    const startTimePool = [480, 570, 600, 780, 840, 930, 1080, 1140]
    const pickStartTime = (i: number) =>
      startTimePool[(i * 2654435761) % startTimePool.length]

    for (let i = 0; i < 30; i++) {
      if (i < 3) {
        addRecurringPlan({
          id: `generated-${i}`,
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            endDate: null,
            interval: 1,
          },
          startDate: moment()
            .subtract(i + 7, 'days')
            .toDate(),
          startTimeInMinutes: pickStartTime(i),
          note: i === 3 ? 'Note' : '',
        })
      } else {
        let date = moment()
        if (i < 15) {
          date = moment().subtract(i, 'days')
        } else {
          date = moment().add(Math.floor(i / 2), 'days')
        }
        addDayPlan({
          date: date.toDate(),
          id: `generated-${i}`,
          minutes: 120 + i * 10,
          startTimeInMinutes: pickStartTime(i),
        })
      }
    }
  }

  const [scheduledNotifications, setScheduledNotifications] = useState<
    Notifications.NotificationRequest[]
  >([])

  // Asks for notification permission if not yet granted. Returns true if the
  // app may schedule, false otherwise. The dev tool helpers below all funnel
  // through this so the user gets one consistent prompt path.
  const ensureNotificationPermission = async (): Promise<boolean> => {
    const { granted } = await Notifications.getPermissionsAsync()
    if (granted) return true
    const r = await Notifications.requestPermissionsAsync()
    if (!r.granted) {
      toast.show('Notifications denied', {
        message: 'Enable notifications in iOS Settings, then retry.',
        native: true,
      })
      return false
    }
    return true
  }

  // Snapshot of what's actually in the OS queue right now — useful for
  // confirming that creating/editing/deleting plans keeps storage and the OS
  // queue in sync. Returns the count so callers can include it in toasts.
  const refreshScheduledNotifications = async (): Promise<number> => {
    const all = await Notifications.getAllScheduledNotificationsAsync()
    setScheduledNotifications(all)
    return all.length
  }

  // Smallest possible end-to-end check: schedules a generic notification 10s
  // out. Verifies the OS scheduling pipeline independent of any plan logic.
  const scheduleTestNotificationIn10s = async () => {
    if (!(await ensureNotificationPermission())) return
    const fireAt = new Date(Date.now() + 10_000)
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Test notification',
        body: 'Fired from dev tools (10s)',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    })
    const count = await refreshScheduledNotifications()
    toast.show('Scheduled', {
      message: `Fires in 10s · queue=${count} · id ${id.slice(0, 8)}…`,
      native: true,
    })
  }

  // Exercises the real plan path: creates a day plan starting 3 minutes from
  // now with a 1-minute notify offset, so the notification fires in ~2 min.
  // Stores the OS notification id on the plan exactly like PlanDayScreen does
  // so deletion via the normal UI cancels it.
  const generateImminentDayPlanWithNotification = async () => {
    const planStart = new Date(Date.now() + 3 * 60_000)
    const fireAt = new Date(planStart.getTime() - 60_000)
    const { date: storedDate, startTimeInMinutes } =
      splitDateAndStartTime(planStart)

    let notificationId: string | null = null
    if (await ensureNotificationPermission()) {
      notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t('plan_reminder_title'),
          body: `${i18n.t('plan_notification_part1')} 1 ${i18n.t(
            'minutes_lowercase'
          )}. (1h)\nDev imminent test plan`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
        },
      })
    }

    addDayPlan({
      id: `dev-imminent-${Date.now()}`,
      date: storedDate,
      startTimeInMinutes,
      minutes: 60,
      note: 'Dev imminent test plan',
      notifyMe: true,
      notifications: notificationId
        ? [{ id: notificationId, date: fireAt }]
        : [],
    })

    const count = await refreshScheduledNotifications()
    toast.show('Generated', {
      message: notificationId
        ? `Plan in 3min · notif in ~2min · queue=${count}`
        : 'Plan created without notification (permission denied)',
      native: true,
    })
  }

  const cancelAllScheduledNotifications = () =>
    confirmDestructive('Cancel all scheduled notifications', async () => {
      await Notifications.cancelAllScheduledNotificationsAsync()
      const count = await refreshScheduledNotifications()
      showDone(`Cancelled · queue=${count}`)
    })

  const resetLocal = () => {
    // Lock iCloud sync off + mark setByUser BEFORE wiping local data, otherwise
    // SupporterSyncDefault (App.tsx) sees a supporter with no local records and
    // setByUser=false, calls resolveInitialEnable(), gets `pull`, and restores
    // everything from iCloud — kicking the user back to home instead of
    // onboarding. Re-applied after the defaults reset so the flag survives.
    setPreferences({ iCloudSyncEnabled: false, iCloudSyncSetByUser: true })
    _WARNING_forceDeleteContacts()
    _WARNING_clearDeleted()
    _WARNING_forceDeleteServiceReports()
    setServiceReports({ dayPlans: [], recurringPlans: [] })
    _WARNING_forceDeleteConversations()
    invalidateAllCache()
    setPreferences({ ...PREFERENCE_DEFAULTS, iCloudSyncSetByUser: true })
    mmkvStorage.clearAll()
    void AsyncStorage.clear()
  }

  const cacheSize = Object.keys(cache ?? {}).length

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top,
        paddingHorizontal: 10,
      }}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 15, paddingTop: 30, paddingBottom: 300 }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('4xl'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('developerTools')}
        </Text>

        <SectionHeader title={i18n.t('metadata')} />
        <Card>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {i18n.t('appVersion')}
            </Text>
            <Text style={{ color: theme.colors.textAlt, fontFamily: MONO }}>
              {Constants.expoConfig?.version ?? i18n.t('versionUnknown')}
            </Text>
          </XView>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {i18n.t('migratedToMmkv')}
            </Text>
            <Text style={{ color: theme.colors.textAlt, fontFamily: MONO }}>
              {`${hasMigratedFromAsyncStorage()}`}
            </Text>
          </XView>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: theme.fonts.bold }}>Platform</Text>
            <Text style={{ color: theme.colors.textAlt, fontFamily: MONO }}>
              {Platform.OS} {Platform.Version}
            </Text>
          </XView>
        </Card>

        {__DEV__ && (
          <>
            <SectionHeader title='Supporter override' />
            <Card style={{ gap: 10 }}>
              <XView style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: theme.fonts.bold }}>
                  Supporter override
                </Text>
                {isSupporter && <SupporterBadge />}
              </XView>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {devSupporterOverride
                  ? 'Forcing supporter status on. Bypasses RevenueCat.'
                  : 'Off. useIsSupporter reads real RevenueCat state.'}
              </Text>
              <XView style={{ justifyContent: 'space-between' }}>
                <Text>Current isSupporter:</Text>
                <Text style={{ fontFamily: theme.fonts.bold }}>
                  {String(isSupporter)}
                </Text>
              </XView>
              <XView style={{ justifyContent: 'space-between' }}>
                <Text>Current since:</Text>
                <Text style={{ fontFamily: theme.fonts.bold }}>
                  {supporterSince ? moment(supporterSince).format('ll') : '—'}
                </Text>
              </XView>
              {devSupporterOverride ? (
                <>
                  <XView style={{ justifyContent: 'space-between' }}>
                    <Text>Override since:</Text>
                    <DateTimePicker
                      value={new Date(devSupporterOverride)}
                      maximumDate={new Date()}
                      onChange={(_, date) => {
                        if (date) setPreferences({ devSupporterOverride: date })
                      }}
                    />
                  </XView>
                  <ActionButton
                    onPress={() =>
                      setPreferences({ devSupporterOverride: null })
                    }
                  >
                    Disable supporter override
                  </ActionButton>
                </>
              ) : (
                <>
                  <ActionButton
                    onPress={() =>
                      setPreferences({ devSupporterOverride: new Date() })
                    }
                  >
                    Enable as supporter (today)
                  </ActionButton>
                  <ActionButton
                    onPress={() =>
                      setPreferences({
                        devSupporterOverride: moment()
                          .subtract(2, 'years')
                          .toDate(),
                      })
                    }
                  >
                    Enable as supporter (2 years ago)
                  </ActionButton>
                </>
              )}
            </Card>

            <SectionHeader title='Supporter nudge' />
            <Card style={{ gap: 10 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                Force-show bypasses tenure, engagement, and cooldown gates so
                you can see the Home card immediately. Still respects
                !isSupporter.
              </Text>
              <XView style={{ justifyContent: 'space-between' }}>
                <Text>Force-show nudge:</Text>
                <Switch
                  value={devSupporterNudgeForceShow}
                  onValueChange={(value) =>
                    setPreferences({ devSupporterNudgeForceShow: value })
                  }
                />
              </XView>
              <XView style={{ justifyContent: 'space-between' }}>
                <Text>hideSupporterNudge:</Text>
                <Text style={{ fontFamily: theme.fonts.bold }}>
                  {String(hideSupporterNudge)}
                </Text>
              </XView>
              <XView style={{ justifyContent: 'space-between' }}>
                <Text>Last dismissed:</Text>
                <Text style={{ fontFamily: theme.fonts.bold }}>
                  {supporterNudgeDismissedAt
                    ? moment(supporterNudgeDismissedAt).format('lll')
                    : '—'}
                </Text>
              </XView>
              <ActionButton
                onPress={() => {
                  setPreferences({ supporterNudgeDismissedAt: null })
                  showDone('Nudge dismissal cleared')
                }}
              >
                Reset nudge dismissal
              </ActionButton>
            </Card>
          </>
        )}

        <SectionHeader title='Profile simulation' />
        <Card style={{ gap: 10 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            Keeps onboardingComplete=true but clears profile fields so the
            post-update prompt re-appears. Use this to validate the upgrade flow
            for existing users.
          </Text>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>hasCompletedProfileSetup:</Text>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {String(hasCompletedProfileSetup)}
            </Text>
          </XView>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>name:</Text>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {name ? name : '—'}
            </Text>
          </XView>
          <ActionButton
            onPress={() => {
              setPreferences({
                onboardingComplete: true,
                hasCompletedProfileSetup: false,
                name: '',
                pioneerStartDate: null,
                avatar: { type: 'none', value: '' },
              })
              showDone('Reset to pre-profile state')
            }}
          >
            Reset profile data (keep onboarded)
          </ActionButton>
        </Card>

        <SectionHeader title='Time rollover' />
        <Card style={{ gap: 10 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            Override the &quot;today&quot; the rollover system uses, then
            re-trigger the check. Lets you simulate opening the app on the 1st
            of next month without waiting for the calendar to flip. Only affects
            rollover — every other date in the app still uses the real clock.
          </Text>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>Pending rollovers:</Text>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {rollover.pending.length === 0
                ? 'none'
                : `${rollover.pending.length} (${rollover.totalMinutes}m)`}
            </Text>
          </XView>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>lastRolloverYearMonth:</Text>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {lastRolloverYearMonth ?? '—'}
            </Text>
          </XView>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>autoRolloverEnabled:</Text>
            <Switch
              value={autoRolloverEnabled}
              onValueChange={(value) =>
                setPreferences({ autoRolloverEnabled: value })
              }
            />
          </XView>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>Override &quot;today&quot;:</Text>
            <DateTimePicker
              value={
                devRolloverDateOverride
                  ? new Date(devRolloverDateOverride)
                  : new Date()
              }
              onChange={(_, date) => {
                if (date) setPreferences({ devRolloverDateOverride: date })
              }}
            />
          </XView>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {devRolloverDateOverride
              ? `Active. Using ${moment(devRolloverDateOverride).format('LL')} as today.`
              : 'Off. Using real clock.'}
          </Text>
          {devRolloverDateOverride && (
            <ActionButton
              onPress={() => {
                setPreferences({ devRolloverDateOverride: null })
                showDone('Date override cleared')
              }}
            >
              Clear date override
            </ActionButton>
          )}
          <ActionButton
            onPress={() => {
              setPreferences({ lastRolloverYearMonth: null })
              showDone('Marker cleared')
            }}
          >
            Clear rollover marker
          </ActionButton>
          <ActionButton
            onPress={() => {
              if (rollover.pending.length === 0) {
                toast.show('Nothing pending', {
                  message: 'No fractional minutes to roll over right now.',
                  native: true,
                })
                return
              }
              if (autoRolloverEnabled) {
                rollover.apply()
                showDone('Applied silently')
              } else {
                navigation.navigate('Rollover')
              }
            }}
          >
            Run rollover check now
          </ActionButton>
        </Card>

        <SectionHeader title={i18n.t('generateMockData')} />
        <Card style={{ gap: 5 }}>
          <ActionButton
            onPress={() => {
              generateContacts()
              showDone(i18n.t('generated'))
            }}
          >
            {i18n.t('contacts')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              generateServiceReports()
              showDone(i18n.t('generated'))
            }}
          >
            {i18n.t('serviceReports')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              generateServicePlans()
              showDone(i18n.t('generated'))
            }}
          >
            {i18n.t('servicePlans')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              generateOverdueFollowUps()
              showDone(i18n.t('generated'))
            }}
          >
            Overdue follow-ups
          </ActionButton>
        </Card>

        <SectionHeader title='Plan notifications' />
        <Card style={{ gap: 10 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            End-to-end checks for the day-plan notification feature. Requires
            iOS notification permission. Generated plans appear in the normal
            day-plan list and respect the same delete-cancels-notification
            wiring.
          </Text>
          <ActionButton onPress={scheduleTestNotificationIn10s}>
            Schedule test notification (10s)
          </ActionButton>
          <ActionButton onPress={generateImminentDayPlanWithNotification}>
            Generate plan with imminent notification (~2min)
          </ActionButton>
          <ActionButton onPress={cancelAllScheduledNotifications}>
            Cancel all scheduled
          </ActionButton>
          <XView style={{ justifyContent: 'space-between', marginTop: 5 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              Scheduled (OS queue)
            </Text>
            <IconButton
              icon={faRotate}
              color={theme.colors.text}
              onPress={async () => {
                const count = await refreshScheduledNotifications()
                toast.show(`${count} scheduled`, { message: '', native: true })
              }}
            />
          </XView>
          <JsonViewer
            label='Scheduled (OS queue)'
            value={scheduledNotifications}
            count={scheduledNotifications.length}
          />
        </Card>

        <SectionHeader title='Celebrations' />
        <Card style={{ gap: 10 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            Two halves of the month-goal celebration. The queue is the in-memory
            handoff AddTimeScreen.submit() uses to ask MonthSummary for
            fireworks on focus. celebratedTiers is the persisted record of which
            tiers fired for which month — once a tier is in here, MonthSummary
            stops firing the on-mount celebration for it. To verify
            focus-gating: queue a month, stay on a different tab, and confirm
            nothing fires until you navigate to that month.
          </Text>
          {(() => {
            const now = moment()
            const thisMonth = now.month()
            const thisYear = now.year()
            const prev = moment().subtract(1, 'month')
            const prevMonth = prev.month()
            const prevYear = prev.year()
            const thisKey = monthCelebrationKey(thisMonth, thisYear)
            const prevKey = monthCelebrationKey(prevMonth, prevYear)
            const pendingCount = Object.keys(celebrationQueue.pending).length
            const celebratedCount = Object.keys(celebratedTiers).length
            return (
              <>
                <XView style={{ justifyContent: 'space-between' }}>
                  <Text>Pending in queue:</Text>
                  <Text style={{ fontFamily: theme.fonts.bold }}>
                    {pendingCount}
                  </Text>
                </XView>
                <XView style={{ justifyContent: 'space-between' }}>
                  <Text>celebratedTiers months:</Text>
                  <Text style={{ fontFamily: theme.fonts.bold }}>
                    {celebratedCount}
                  </Text>
                </XView>
                <XView style={{ justifyContent: 'space-between' }}>
                  <Text>This month key:</Text>
                  <Text
                    style={{ color: theme.colors.textAlt, fontFamily: MONO }}
                  >
                    {thisKey}
                  </Text>
                </XView>
                <ActionButton
                  onPress={() => {
                    celebrationQueue.queue(thisMonth, thisYear)
                    showDone(`Queued ${thisKey}`)
                  }}
                >
                  {`Queue fireworks for this month (${now.format('MMM YYYY')})`}
                </ActionButton>
                <ActionButton
                  onPress={() => {
                    celebrationQueue.queue(prevMonth, prevYear)
                    showDone(`Queued ${prevKey}`)
                  }}
                >
                  {`Queue fireworks for previous month (${prev.format('MMM YYYY')})`}
                </ActionButton>
                <ActionButton
                  onPress={() => {
                    useCelebrationQueue.setState({ pending: {} })
                    showDone('Queue cleared')
                  }}
                >
                  Clear celebration queue
                </ActionButton>
                <ActionButton
                  onPress={() => {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { [thisKey]: _removed, ...rest } = celebratedTiers
                    setPreferences({ celebratedTiers: rest })
                    showDone(`Cleared ${thisKey} from celebratedTiers`)
                  }}
                >
                  Reset celebratedTiers for this month
                </ActionButton>
                <ActionButton
                  onPress={() =>
                    confirmDestructive('Reset all celebratedTiers', () => {
                      setPreferences({ celebratedTiers: {} })
                      showDone('All celebratedTiers cleared')
                    })
                  }
                >
                  Reset ALL celebratedTiers
                </ActionButton>
              </>
            )
          })()}
          <JsonViewer
            label='Celebration queue (pending)'
            value={celebrationQueue.pending}
            count={Object.keys(celebrationQueue.pending).length}
          />
          <JsonViewer
            label='celebratedTiers'
            value={celebratedTiers}
            count={Object.keys(celebratedTiers).length}
          />
        </Card>

        <SectionHeader title={i18n.t('dangerZone')} color={theme.colors.warn} />
        <Card style={{ gap: 5 }}>
          <ActionButton
            onPress={() =>
              confirmDestructive(i18n.t('forceDeleteContacts'), () => {
                _WARNING_forceDeleteContacts()
                showDone(i18n.t('deleted'))
              })
            }
          >
            {i18n.t('forceDeleteContacts')}
          </ActionButton>
          <ActionButton
            onPress={() =>
              confirmDestructive(i18n.t('deleteReports'), () => {
                _WARNING_forceDeleteServiceReports()
                showDone(i18n.t('deleted'))
              })
            }
          >
            {i18n.t('deleteReports')}
          </ActionButton>
          <ActionButton
            onPress={() =>
              confirmDestructive(i18n.t('deleteDayPlans'), () => {
                setServiceReports({ dayPlans: [] })
                showDone(i18n.t('deleted'))
              })
            }
          >
            {i18n.t('deleteDayPlans')}
          </ActionButton>
          <ActionButton
            onPress={() =>
              confirmDestructive(i18n.t('deleteRecurringPlans'), () => {
                setServiceReports({ recurringPlans: [] })
                showDone(i18n.t('deleted'))
              })
            }
          >
            {i18n.t('deleteRecurringPlans')}
          </ActionButton>
          <ActionButton
            onPress={() =>
              confirmDestructive(i18n.t('clearArchivedContacts'), () => {
                _WARNING_clearDeleted()
                showDone(i18n.t('deleted'))
              })
            }
          >
            {i18n.t('clearArchivedContacts')}
          </ActionButton>
          <ActionButton
            onPress={() =>
              confirmDestructive(i18n.t('deleteAllConversations'), () => {
                _WARNING_forceDeleteConversations()
                showDone(i18n.t('deleted'))
              })
            }
          >
            {i18n.t('deleteAllConversations')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              invalidateAllCache()
              showDone('Cache invalidated')
            }}
          >
            Invalidate time cache
          </ActionButton>
          <ActionButton
            onPress={() =>
              confirmDestructive('Reset all (fresh install)', () => {
                resetLocal()
                showDone('All data cleared — restart the app')
              })
            }
          >
            Reset all (fresh install)
          </ActionButton>
          <ActionButton
            onPress={() => {
              Alert.alert(
                'Reset all + wipe iCloud',
                'This wipes local data AND every witness-work file in iCloud — affecting all devices on this Apple ID. Cannot be undone.',
                [
                  { text: i18n.t('cancel'), style: 'cancel' },
                  {
                    text: i18n.t('delete'),
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await ICloudBridge.deleteAll()
                        await ICloudBridge.deleteAllBinaries()
                      } catch (e) {
                        toast.show('iCloud wipe failed', {
                          message: (e as Error).message,
                          native: true,
                        })
                      }
                      resetLocal()
                      showDone(
                        'All data cleared (local + iCloud) — restart the app'
                      )
                    },
                  },
                ]
              )
            }}
          >
            Reset all + wipe iCloud
          </ActionButton>
        </Card>

        <SectionHeader title={i18n.t('data')} />
        <JsonViewer
          label={i18n.t('preferences')}
          value={preferences}
          count={Object.keys(preferences).length}
        />
        <JsonViewer
          label={i18n.t('contacts')}
          value={contacts}
          count={contacts.length}
        />
        <JsonViewer
          label={i18n.t('serviceReports')}
          value={serviceReports}
          count={Object.keys(serviceReports).length}
        />
        <JsonViewer
          label='Conversations'
          value={conversations}
          count={conversations.length}
        />
        <JsonViewer
          label={i18n.t('dayPlans')}
          value={dayPlans}
          count={dayPlans.length}
        />
        <JsonViewer
          label={i18n.t('recurringPlans')}
          value={recurringPlans}
          count={recurringPlans.length}
        />
        <JsonViewer
          label={i18n.t('timeCache')}
          value={cache}
          count={cacheSize}
        />
      </KeyboardAwareScrollView>
    </View>
  )
}
