import {
  Bell as BellIcon,
  BellRing as BellRingIcon,
  Braces as BracesIcon,
  CalendarClock as CalendarClockIcon,
  Cloud as CloudIcon,
  CloudOff as CloudOffIcon,
  Database as DatabaseIcon,
  FlaskConical as FlaskConicalIcon,
  HeartHandshake as HeartHandshakeIcon,
  KeyRound as KeyRoundIcon,
  PartyPopper as PartyPopperIcon,
  RefreshCcw as RefreshCcwIcon,
  RotateCw as RotateCwIcon,
  Smartphone as SmartphoneIcon,
  Trash2 as Trash2Icon,
  UserRound as UserRoundIcon,
  UsersRound as UsersRoundIcon,
} from 'lucide-react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import confirmDestructive from '@/lib/confirmDestructive'
import useTheme from '@/contexts/theme'
import { Alert, Platform, View } from 'react-native'
import Switch from '@/components/ui/Switch'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import TextInput from '@/components/ui/TextInput'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import useContacts from '@/stores/contactsStore'
import Card from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import XView from '@/components/ui/layout/XView'
import Constants from 'expo-constants'
import { hasMigratedFromAsyncStorage } from '@/stores/mmkv'
import useConversations from '@/stores/conversationStore'
import axios from 'axios'
import moment from 'moment'
import { useState } from 'react'
import { useToastController } from '@tamagui/toast'
import { RecurringPlanFrequencies } from '@/lib/serviceReport'
import { useTimeCache } from '@/stores/timeCache'
import { PREFERENCE_DEFAULTS, usePreferences } from '@/stores/preferences'
import { useProfile, PROFILE_DEFAULTS } from '@/stores/profile'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { mmkvStorage } from '@/stores/mmkv'
import DateTimePicker from '@/components/ui/DateTimePicker'
import SupporterBadge from '@/components/SupporterBadge'
import useIsSupporter from '@/hooks/useIsSupporter'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import { useRollover } from '@/features/service-reports/hooks/useRollover'
import * as ICloudBridge from '../../../modules/icloud-bridge/index'
import * as Notifications from 'expo-notifications'
import { splitDateAndStartTime } from '@/lib/normalizeDate'
import useCelebrationQueue from '@/features/service-reports/stores/celebrationQueue'
import { monthCelebrationKey } from '@/lib/achievementTier'
import { milestoneCelebrationKey } from '@/lib/milestones'
import apis from '@/constants/apis'
import useAccount from '@/hooks/useAccount'
import useCustomer from '@/hooks/useCustomer'
import { supporterSinceDate } from '@/lib/supporterSince'
import { getOrCreateInstallId } from '@/lib/installId'
import {
  clearAdoptedAccountId,
  getOrCreateAccountId,
  readAccountFile,
} from '@/lib/account'
import {
  decideAccountAction,
  type AccountAction,
  type AccountFile,
} from '@/lib/accountFile'
import {
  getNotesImportStatus,
  type NotesImportStatus,
} from '@/features/notes-import/lib/notesImportClient'
import {
  getNotesImportAuthSnapshot,
  runNotesImportAuthDiagnostics,
  runNotesImportAuthRepair,
  type NotesImportAuthDebugReport,
  type NotesImportAuthRepairReport,
} from '@/features/notes-import/lib/notesImportAppAttestRuntime'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import { clientImportCap } from '@/features/notes-import/lib/notesImportManagerLogic'
import {
  MONO,
  QuickTile,
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'

const DEFAULT_MOCK_CONTACT_COUNT = 30

const parseMockContactCount = (value: string) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MOCK_CONTACT_COUNT
}

/**
 * Middle-elide long opaque ids so rows stay one line; full value is selectable
 * via the JSON viewers.
 */
const shortId = (value: string | null | undefined): string =>
  !value
    ? '—'
    : value.length > 20
      ? `${value.slice(0, 8)}…${value.slice(-6)}`
      : value

/** Dev-tools destructive actions all share the same warning copy. */
const confirmDevAction = (title: string, onConfirm: () => void) =>
  confirmDestructive({
    title,
    description: 'This cannot be undone.',
    onConfirm,
  })

export default function ToolsScreen() {
  const buddiesDevOverride = useBuddies((state) => state.devOverride)
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
  const { categories, addCategory } = useCategories()
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
    devShowAppIconAlerts,
    supporterNudgeDismissedAt,
    hideSupporterNudge,
    devRolloverDateOverride,
    lastRolloverYearMonth,
    autoRolloverEnabled,
    celebratedTiers,
    celebratedMilestones,
    submittedReportMonths,
    set: setPreferences,
  } = preferences
  // Profile-shaped fields live in the dedicated Profile store after wave-3.
  const { hasCompletedProfileSetup, name, set: setProfile } = useProfile()
  const celebrationQueue = useCelebrationQueue()
  const { isSupporter, since: supporterSince } = useIsSupporter()
  const navigation = useNavigation<RootStackNavigation>()
  const rollover = useRollover()
  const [mockContactCountInput, setMockContactCountInput] = useState(
    `${DEFAULT_MOCK_CONTACT_COUNT}`
  )
  const mockContactCount = parseMockContactCount(mockContactCountInput)

  // --- Notes Import auth / usage / supporter-sync debug -----------------
  const { accountId, iCloudSharingAvailable } = useAccount()
  const { customer } = useCustomer()
  const entitled = supporterSinceDate(customer) !== null
  const notesImportCredits = useNotesImportManager((s) => s.credits)
  // Cheap MMKV/Keychain reads; recomputed per render so recent lifecycle state
  // changes are reflected immediately.
  const authSnapshot = getNotesImportAuthSnapshot()
  const [authBusy, setAuthBusy] = useState(false)
  const [authReport, setAuthReport] =
    useState<NotesImportAuthDebugReport | null>(null)
  const [repairReport, setRepairReport] =
    useState<NotesImportAuthRepairReport | null>(null)
  const [proxyProbe, setProxyProbe] = useState<{
    health: unknown
    status: NotesImportStatus | { error: string } | null
    probedAt: string
  } | null>(null)
  const [accountFileInspection, setAccountFileInspection] = useState<
    | { file: AccountFile | null; action: AccountAction; readAt: string }
    | { error: string }
    | null
  >(null)

  const runAuthDiagnostics = async () => {
    if (authBusy) return
    setAuthBusy(true)
    try {
      const report = await runNotesImportAuthDiagnostics()
      setAuthReport(report)
      toast.show(report.ok ? 'Auth diagnostics passed' : 'Auth step failed', {
        message: report.ok
          ? `${report.steps.length} steps ok`
          : (report.steps.find((s) => !s.ok)?.step ?? ''),
        native: true,
      })
    } finally {
      setAuthBusy(false)
    }
  }

  const runAuthRepair = async () => {
    if (authBusy) return
    setAuthBusy(true)
    try {
      const report = await runNotesImportAuthRepair()
      setRepairReport(report)
      const lastFailed = report.steps.filter((s) => !s.ok).pop()
      toast.show(
        report.ok
          ? report.keyRotated
            ? 'Repaired — key rotated'
            : 'Verified — key healthy'
          : 'Repair failed',
        {
          message: report.ok
            ? `${report.steps.length} steps`
            : `${lastFailed?.step ?? ''} ${lastFailed?.code ?? ''}`.trim(),
          native: true,
        }
      )
    } finally {
      setAuthBusy(false)
    }
  }

  const probeProxy = async () => {
    const [health, status] = await Promise.all([
      axios
        .get(apis.notesImportHealth, { timeout: 10_000 })
        .then((r) => r.data as unknown)
        .catch((e) => ({ error: (e as Error).message })),
      getNotesImportStatus().catch((e) => ({
        error: (e as Error).message,
      })),
    ])
    setProxyProbe({ health, status, probedAt: new Date().toISOString() })
  }

  const inspectAccountFile = async () => {
    try {
      const file = await readAccountFile()
      // The same pure decision AccountProvider's reconcile pass would make
      // right now — shows WHY the device is claiming/adopting/idle.
      const action = decideAccountAction({
        accountId: getOrCreateAccountId(),
        entitled,
        file,
      })
      setAccountFileInspection({
        file,
        action,
        readAt: new Date().toISOString(),
      })
    } catch (e) {
      // Rejection means iCloud unavailable (signed out / Drive disabled).
      setAccountFileInspection({ error: (e as Error).message })
    }
  }

  const showDone = (label: string) =>
    toast.show(label, { message: '', native: true })

  const generateContacts = async (count = DEFAULT_MOCK_CONTACT_COUNT) => {
    const { data } = await axios.get(
      'https://jsonplaceholder.typicode.com/users'
    )
    if (Array.isArray(data) && data.length > 0) {
      // customFields is id-keyed against contactsStore.customFieldDefs (see
      // customFieldsMigration.ts) — writing the raw company object would
      // produce label-keyed values that no renderer can resolve. Create defs
      // up-front and key by their ids. addCustomFieldDef returns the existing
      // def on label collision, so re-running stays a no-op for the def list.
      const companyDef = addCustomFieldDef('Company')
      const catchphraseDef = addCustomFieldDef('Catchphrase')
      const bsDef = addCustomFieldDef('BS')

      // Apple's default simulator location (San Francisco, near the Embarcadero).
      // Spread across ~7 miles so contacts cover most of SF rather than piling
      // up in one neighborhood. xmur3-style hash on the index gives a flatter
      // distribution than Math.imul(index, knuth) % 1000, which clusters badly
      // at low index counts.
      const SF_LAT = 37.785834
      const SF_LNG = -122.406417
      const SPREAD = 0.1
      const hashUnit = (n: number, salt: number) => {
        let h = ((n + 1) * salt) >>> 0
        h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0
        h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0
        h = (h ^ (h >>> 16)) >>> 0
        return (h % 10000) / 10000 - 0.5
      }

      // First N contacts hit explicit staleness buckets so every "age band" is
      // represented; remaining contacts get a deterministic pseudo-random age
      // up to ~3 years so the list isn't all clustered around one date.
      const stalenessBuckets: {
        value: number
        unit: moment.unitOfTime.DurationConstructor
      }[] = [
        { value: 0, unit: 'hours' },
        { value: 3, unit: 'days' },
        { value: 1, unit: 'weeks' },
        { value: 3, unit: 'weeks' },
        { value: 2, unit: 'months' },
        { value: 6, unit: 'months' },
        { value: 1, unit: 'years' },
        { value: 2, unit: 'years' },
      ]

      const nameCounts = new Map<string, number>()
      const nextContactName = (name: string, index: number) => {
        const baseName = name.trim() || `Generated Contact ${index + 1}`
        const countForName = nameCounts.get(baseName) ?? 0
        nameCounts.set(baseName, countForName + 1)
        return countForName === 0 ? baseName : `${baseName} ${countForName + 1}`
      }

      Array.from({ length: count }).forEach((_, index) => {
        const contact = data[index % data.length]
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
        const latSeed = hashUnit(index, 0x9e3779b1)
        const lngSeed = hashUnit(index, 0x85ebca6b)
        const createdAt =
          index < stalenessBuckets.length
            ? moment()
                .subtract(
                  stalenessBuckets[index].value,
                  stalenessBuckets[index].unit
                )
                .toDate()
            : moment()
                .subtract(
                  ((index * 1103515245 + 12345) % (3 * 365)) + 1,
                  'days'
                )
                .toDate()
        addContact({
          createdAt,
          id: `generated-${index}`,
          name: nextContactName(contact.name, index),
          address: {
            line1: contact.address.street,
            city: contact.address.city,
            zip: contact.address.zipcode,
          },
          coordinate: {
            latitude: SF_LAT + latSeed * SPREAD,
            longitude: SF_LNG + lngSeed * SPREAD,
          },
          email:
            typeof contact.email === 'string' && contact.email.includes('@')
              ? contact.email.replace('@', `+${index + 1}@`)
              : contact.email,
          customFields,
          phone: contact.phone,
          isFavorite: index < 2,
        })
      })

      Array.from({ length: count }).forEach((_, index) => {
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

  // Creates a single contact whose stripped JSON, even with zero conversations,
  // exceeds CONTACT_SHARE_LINK.MAX_URL_BYTES (4 KB) after gzip + base64. Lets us
  // exercise the "use file export" fallback path end-to-end. High-entropy
  // random values defeat gzip — a handful of KB of Math.random().toString(36)
  // reliably blows past the cap.
  const generateOversizedShareContact = () => {
    const randomString = (len: number) => {
      let s = ''
      while (s.length < len) s += Math.random().toString(36).slice(2)
      return s.slice(0, len)
    }

    const customFields: Record<string, string> = {}
    for (let i = 0; i < 30; i++) {
      const def = addCustomFieldDef(`Oversize Field ${i + 1}`)
      if (def) customFields[def.id] = randomString(1024)
    }

    addContact({
      createdAt: new Date(),
      id: `oversized-share-${Date.now()}`,
      name: 'Oversized share-link test contact',
      customFields,
    })
  }

  const generateServiceReports = () => {
    // Seed a handful of named Categories if none exist yet; dev fixtures
    // reference them by id so the generator exercises the new Category-keyed
    // path rather than legacy `tag` strings.
    const seedNames = ['Special', 'Campaign', 'Memorial', 'Convention']
    const ensureCategory = (name: string): string => {
      const existing = categories.find((c) => c.name === name)
      if (existing) return existing.id
      const id = `dev-cat-${name.toLowerCase()}`
      addCategory({ id, name, isCredit: false })
      return id
    }
    const seededIds: (string | undefined)[] = [
      ...seedNames.map(ensureCategory),
      undefined,
    ]
    let i = 0
    while (i < 1000) {
      const reportsForDay = (i * 2654435761) % 4
      for (let j = 0; j <= reportsForDay; j++) {
        const seed = i * 31 + j * 17
        const r = ((seed * 2654435761) % 1000) / 1000
        const hours = Math.floor(Math.pow(r, 2.5) * 17)
        const minutes = (seed * 7) % 12 === 0 ? 0 : ((seed * 7) % 12) * 5
        if (hours === 0 && minutes === 0) continue
        // LDC is now a builtin Category (`LDC_BUILTIN_CATEGORY_ID`); the
        // generator sprinkles LDC entries by setting categoryId on every
        // fifth seed slot.
        const isLdc = seed % 5 === 0
        addServiceReport({
          date: moment().subtract(i, 'day').toDate(),
          hours,
          id: `generated-${i}-${j}`,
          minutes,
          credit: isLdc ? true : seed % 3 === 0,
          categoryId: isLdc
            ? LDC_BUILTIN_CATEGORY_ID
            : seededIds[seed % seededIds.length],
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
    const { startTimeInMinutes } = splitDateAndStartTime(planStart)

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
      date: planStart,
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
    confirmDevAction('Cancel all scheduled notifications', async () => {
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
    setProfile({ ...PROFILE_DEFAULTS })
    mmkvStorage.clearAll()
    void AsyncStorage.clear()
  }

  const generateAllMockData = async () => {
    await generateContacts(mockContactCount)
    generateServiceReports()
    generateServicePlans()
    generateOverdueFollowUps()
    showDone(i18n.t('generated'))
  }

  const resetAll = () =>
    confirmDevAction('Reset all (fresh install)', () => {
      resetLocal()
      showDone('All data cleared — restart the app')
    })

  const resetAllAndWipeICloud = () =>
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
            showDone('All data cleared (local + iCloud) — restart the app')
          },
        },
      ]
    )

  const cacheSize = Object.keys(cache ?? {}).length

  // Month-goal celebrations key off the calendar month.
  const now = moment()
  const prevMonthMoment = moment().subtract(1, 'month')
  const thisMonthKey = monthCelebrationKey(now.month(), now.year())
  const prevMonthKey = monthCelebrationKey(
    prevMonthMoment.month(),
    prevMonthMoment.year()
  )
  const pendingCelebrations = Object.keys(celebrationQueue.pending).length

  // Service-year start = current year if we're past Sep 1, otherwise the prior
  // calendar year. Matches the Sep→Aug window used by YearMilestoneCard /
  // MilestoneProgressBar.
  const currentServiceYear = now.month() >= 8 ? now.year() : now.year() - 1
  const prevServiceYear = currentServiceYear - 1
  const currentYearKey = milestoneCelebrationKey(currentServiceYear)
  const prevYearKey = milestoneCelebrationKey(prevServiceYear)
  const currentMilestones = celebratedMilestones[currentYearKey] ?? []

  const clearCelebratedTier = (key: string) => {
    const { [key]: _removed, ...rest } = celebratedTiers
    setPreferences({ celebratedTiers: rest })
    showDone(`Cleared ${key} from celebratedTiers`)
  }

  const clearCelebratedMilestone = (key: string) => {
    const { [key]: _removed, ...rest } = celebratedMilestones
    setPreferences({ celebratedMilestones: rest })
    showDone(`Cleared ${key} from celebratedMilestones`)
  }

  const deleteRows: { label: string; onConfirm: () => void }[] = [
    {
      label: i18n.t('forceDeleteContacts'),
      onConfirm: _WARNING_forceDeleteContacts,
    },
    {
      label: i18n.t('clearArchivedContacts'),
      onConfirm: _WARNING_clearDeleted,
    },
    {
      label: i18n.t('deleteAllConversations'),
      onConfirm: _WARNING_forceDeleteConversations,
    },
    {
      label: i18n.t('deleteReports'),
      onConfirm: _WARNING_forceDeleteServiceReports,
    },
    {
      label: i18n.t('deleteDayPlans'),
      onConfirm: () => setServiceReports({ dayPlans: [] }),
    },
    {
      label: i18n.t('deleteRecurringPlans'),
      onConfirm: () => setServiceReports({ recurringPlans: [] }),
    },
  ]

  const onOff = (value: boolean) => (value ? 'On' : 'Off')

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
        contentContainerStyle={{ gap: 10, paddingTop: 30, paddingBottom: 300 }}
      >
        <View style={{ gap: 2, marginBottom: 6 }}>
          <Text
            style={{
              fontSize: theme.fontSize('4xl'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('developerTools')}
          </Text>
          <Text
            selectable
            style={{
              color: theme.colors.textAlt,
              fontFamily: MONO,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {`v${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${Platform.Version}`}
          </Text>
        </View>

        {/* ---- Quick actions: the handful of things reached for daily ---- */}
        <Card style={{ padding: 12, gap: 10 }}>
          <XView style={{ flexWrap: 'wrap', gap: 10 }}>
            <QuickTile
              icon={FlaskConicalIcon}
              label='Generate all mock data'
              caption={`${mockContactCount} contacts, reports, plans`}
              onPress={generateAllMockData}
            />
            <QuickTile
              icon={RefreshCcwIcon}
              label='Invalidate time cache'
              caption={`${cacheSize} entries`}
              tone='default'
              onPress={() => {
                invalidateAllCache()
                showDone('Cache invalidated')
              }}
            />
            <QuickTile
              icon={Trash2Icon}
              label='Reset all'
              caption='Fresh install'
              tone='destructive'
              onPress={resetAll}
            />
            <QuickTile
              icon={CloudOffIcon}
              label='Reset all + iCloud'
              caption='Every device on Apple ID'
              tone='destructive'
              onPress={resetAllAndWipeICloud}
            />
            {__DEV__ && (
              <QuickTile
                icon={HeartHandshakeIcon}
                label={devSupporterOverride ? 'Stop supporter' : 'Be supporter'}
                caption={`Override ${onOff(!!devSupporterOverride)}`}
                tone='default'
                onPress={() =>
                  setPreferences({
                    devSupporterOverride: devSupporterOverride
                      ? null
                      : new Date(),
                  })
                }
              />
            )}
            <QuickTile
              icon={BellRingIcon}
              label='Test notification'
              caption='Fires in 10s'
              tone='default'
              onPress={scheduleTestNotificationIn10s}
            />
          </XView>
        </Card>

        {/* ---- Data ---- */}
        <ToolSection
          title={i18n.t('generateMockData')}
          icon={DatabaseIcon}
          summary={`${contacts.length} contacts · ${conversations.length} convos`}
          defaultExpanded
        >
          <ToolList>
            <ToolRow
              label='Contact count'
              info='How many contacts the Contacts and Generate all actions create. Each gets conversations; the first few get Bible studies and upcoming follow-ups.'
              trailing={
                <TextInput
                  value={mockContactCountInput}
                  placeholder={`${DEFAULT_MOCK_CONTACT_COUNT}`}
                  onChangeText={(value) =>
                    setMockContactCountInput(value.replace(/[^0-9]/g, ''))
                  }
                  onBlur={() => {
                    setMockContactCountInput(`${mockContactCount}`)
                  }}
                  inputMode='numeric'
                  enterKeyHint='done'
                  selectTextOnFocus
                  textAlign='center'
                  maxLength={4}
                  style={{
                    width: 80,
                    minHeight: 36,
                    borderColor: theme.colors.border,
                    borderWidth: 1,
                    borderRadius: theme.numbers.borderRadiusSm,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    color: theme.colors.text,
                  }}
                />
              }
            />
            <ToolRow
              label={`${i18n.t('contacts')} (${mockContactCount})`}
              info='Pulls names and addresses from jsonplaceholder, scatters them across San Francisco, and spreads creation dates over ~3 years so every staleness band is represented.'
              onPress={async () => {
                await generateContacts(mockContactCount)
                showDone(i18n.t('generated'))
              }}
            />
            <ToolRow
              label={i18n.t('serviceReports')}
              info='~3 years of daily entries with seeded categories, LDC credit, and realistic gaps between days.'
              onPress={() => {
                generateServiceReports()
                showDone(i18n.t('generated'))
              }}
            />
            <ToolRow
              label={i18n.t('servicePlans')}
              info='3 weekly recurring plans plus day plans spread across the past two weeks and the coming weeks.'
              onPress={() => {
                generateServicePlans()
                showDone(i18n.t('generated'))
              }}
            />
            <ToolRow
              label='Overdue follow-ups'
              info='Four contacts whose follow-ups are 5h, 1d, 7d, and 20d overdue, mixing notify and topic combinations.'
              onPress={() => {
                generateOverdueFollowUps()
                showDone(i18n.t('generated'))
              }}
            />
            <ToolRow
              label='Oversized share contact'
              info='One contact whose share link exceeds the 4 KB URL cap, to exercise the file-export fallback.'
              onPress={() => {
                generateOversizedShareContact()
                showDone('Generated oversized share contact')
              }}
            />
          </ToolList>
        </ToolSection>

        <ToolSection
          title={i18n.t('dangerZone')}
          icon={Trash2Icon}
          tone='destructive'
          info='Targeted deletes. Each asks for confirmation and cannot be undone. Use Reset all at the top for a full fresh-install wipe.'
        >
          <ToolList>
            {deleteRows.map(({ label, onConfirm }) => (
              <ToolRow
                key={label}
                label={label}
                tone='destructive'
                onPress={() =>
                  confirmDevAction(label, () => {
                    onConfirm()
                    showDone(i18n.t('deleted'))
                  })
                }
              />
            ))}
          </ToolList>
        </ToolSection>

        {/* ---- App state ---- */}
        <ToolSection title='Buddies' icon={UsersRoundIcon}>
          <ToolList>
            {__DEV__ && (
              <ToolRow
                label='Show without the remote flag'
                trailing={
                  <Switch
                    value={buddiesDevOverride}
                    onValueChange={(value) => {
                      useBuddies.setState({ devOverride: value })
                    }}
                  />
                }
              />
            )}
            <ToolRow
              label='Reset Buddies onboarding'
              onPress={() => {
                useBuddies.setState({ onboardingComplete: false })
                showDone('Buddies onboarding reset')
              }}
            />
          </ToolList>
        </ToolSection>

        {__DEV__ && (
          <ToolSection
            title='Supporter'
            icon={HeartHandshakeIcon}
            summary={`isSupporter ${String(isSupporter)}`}
          >
            <ToolSubheading
              title='Override'
              info='When on, forces supporter status and bypasses RevenueCat. When off, useIsSupporter reads real RevenueCat state.'
            />
            <ToolList>
              <ToolRow
                label='isSupporter'
                value={String(isSupporter)}
                trailing={
                  isSupporter ? (
                    <XView style={{ gap: 8 }}>
                      <SupporterBadge />
                    </XView>
                  ) : undefined
                }
              />
              <ToolRow
                label='Since'
                value={
                  supporterSince ? moment(supporterSince).format('ll') : '—'
                }
              />
              {devSupporterOverride ? (
                <ToolRow
                  label='Override since'
                  trailing={
                    <DateTimePicker
                      value={new Date(devSupporterOverride)}
                      maximumDate={new Date()}
                      onChange={(_, date) => {
                        if (date) setPreferences({ devSupporterOverride: date })
                      }}
                    />
                  }
                />
              ) : null}
              {devSupporterOverride ? (
                <ToolRow
                  label='Disable override'
                  onPress={() => setPreferences({ devSupporterOverride: null })}
                />
              ) : (
                <ToolRow
                  label='Enable (since today)'
                  onPress={() =>
                    setPreferences({ devSupporterOverride: new Date() })
                  }
                />
              )}
              {devSupporterOverride ? null : (
                <ToolRow
                  label='Enable (since 2 years ago)'
                  onPress={() =>
                    setPreferences({
                      devSupporterOverride: moment()
                        .subtract(2, 'years')
                        .toDate(),
                    })
                  }
                />
              )}
            </ToolList>

            <ToolSubheading
              title='Home nudge'
              info='Force-show bypasses tenure, engagement, and cooldown gates so you can see the Home card immediately. Still respects !isSupporter.'
            />
            <ToolList>
              <ToolRow
                label='Force-show nudge'
                trailing={
                  <Switch
                    value={devSupporterNudgeForceShow}
                    onValueChange={(value) =>
                      setPreferences({ devSupporterNudgeForceShow: value })
                    }
                  />
                }
              />
              <ToolRow
                label='hideSupporterNudge'
                value={String(hideSupporterNudge)}
              />
              <ToolRow
                label='Last dismissed'
                value={
                  supporterNudgeDismissedAt
                    ? moment(supporterNudgeDismissedAt).format('lll')
                    : '—'
                }
              />
              <ToolRow
                label='Reset nudge dismissal'
                onPress={() => {
                  setPreferences({ supporterNudgeDismissedAt: null })
                  showDone('Nudge dismissal cleared')
                }}
              />
            </ToolList>
          </ToolSection>
        )}

        <ToolSection
          title='Time rollover'
          icon={CalendarClockIcon}
          info='Override the "today" the rollover system uses, then re-trigger the check. Lets you simulate opening the app on the 1st of next month without waiting for the calendar to flip. Only affects rollover — every other date in the app still uses the real clock.'
          summary={
            devRolloverDateOverride
              ? `Today = ${moment(devRolloverDateOverride).format('ll')}`
              : `${rollover.pending.length} pending`
          }
        >
          <ToolList>
            <ToolRow
              label='Pending rollovers'
              value={
                rollover.pending.length === 0
                  ? 'none'
                  : `${rollover.pending.length} (${rollover.totalMinutes}m)`
              }
            />
            <ToolRow
              label='lastRolloverYearMonth'
              value={lastRolloverYearMonth ?? '—'}
            />
            <ToolRow
              label='Auto rollover'
              trailing={
                <Switch
                  value={autoRolloverEnabled}
                  onValueChange={(value) =>
                    setPreferences({ autoRolloverEnabled: value })
                  }
                />
              }
            />
            <ToolRow
              label='Override "today"'
              info={
                devRolloverDateOverride
                  ? `Active. Using ${moment(devRolloverDateOverride).format('LL')} as today.`
                  : 'Off. Using real clock.'
              }
              trailing={
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
              }
            />
            <ToolRow
              label='Run rollover check now'
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
            />
            {devRolloverDateOverride ? (
              <ToolRow
                label='Clear date override'
                onPress={() => {
                  setPreferences({ devRolloverDateOverride: null })
                  showDone('Date override cleared')
                }}
              />
            ) : null}
            <ToolRow
              label='Clear rollover marker'
              onPress={() => {
                setPreferences({ lastRolloverYearMonth: null })
                showDone('Marker cleared')
              }}
            />
          </ToolList>
        </ToolSection>

        <ToolSection
          title='Celebrations'
          icon={PartyPopperIcon}
          summary={`${pendingCelebrations} queued`}
        >
          <ToolSubheading
            title='Month goal'
            info='The queue is the in-memory handoff AddTimeScreen.submit() uses to ask MonthSummary for fireworks on focus. celebratedTiers is the persisted record of which tiers fired for which month — once a tier is in here, MonthSummary stops firing the on-mount celebration for it. To verify focus-gating: queue a month, stay on a different tab, and confirm nothing fires until you navigate to that month.'
          />
          <ToolList>
            <ToolRow
              label='Pending in queue'
              value={`${pendingCelebrations}`}
            />
            <ToolRow
              label='celebratedTiers months'
              value={`${Object.keys(celebratedTiers).length}`}
            />
            <ToolRow label='This month key' value={thisMonthKey} />
            <ToolRow
              label={`Queue fireworks · ${now.format('MMM YYYY')}`}
              onPress={() => {
                celebrationQueue.queue(now.month(), now.year())
                showDone(`Queued ${thisMonthKey}`)
              }}
            />
            <ToolRow
              label={`Queue fireworks · ${prevMonthMoment.format('MMM YYYY')}`}
              onPress={() => {
                celebrationQueue.queue(
                  prevMonthMoment.month(),
                  prevMonthMoment.year()
                )
                showDone(`Queued ${prevMonthKey}`)
              }}
            />
            <ToolRow
              label='Clear celebration queue'
              onPress={() => {
                useCelebrationQueue.setState({ pending: {} })
                showDone('Queue cleared')
              }}
            />
            <ToolRow
              label='Reset this month’s tiers'
              onPress={() => clearCelebratedTier(thisMonthKey)}
            />
            <ToolRow
              label='Reset ALL celebratedTiers'
              tone='destructive'
              onPress={() =>
                confirmDevAction('Reset all celebratedTiers', () => {
                  setPreferences({ celebratedTiers: {} })
                  showDone('All celebratedTiers cleared')
                })
              }
            />
          </ToolList>
          <View style={{ gap: 8, paddingTop: 8 }}>
            <JsonViewer
              label='Celebration queue (pending)'
              value={celebrationQueue.pending}
              count={pendingCelebrations}
            />
            <JsonViewer
              label='celebratedTiers'
              value={celebratedTiers}
              count={Object.keys(celebratedTiers).length}
            />
          </View>

          <ToolSubheading
            title='Year milestones'
            info='Year-tab analogue of celebratedTiers. Resetting an entry replays the seal pulse + haptic (and, for the annual goal, fireworks) the next time the Year tab is focused with a hit milestone the user hasn’t been shown yet. Service years run Sep–Aug, keyed by the START year.'
          />
          <ToolList>
            <ToolRow
              label='celebratedMilestones years'
              value={`${Object.keys(celebratedMilestones).length}`}
            />
            <ToolRow label='Current service-year key' value={currentYearKey} />
            <ToolRow
              label='Celebrated this year'
              value={
                currentMilestones.length === 0
                  ? '—'
                  : currentMilestones.join(', ')
              }
            />
            <ToolRow
              label={`Reset ${currentServiceYear}–${currentServiceYear + 1}`}
              onPress={() => clearCelebratedMilestone(currentYearKey)}
            />
            <ToolRow
              label={`Reset ${prevServiceYear}–${prevServiceYear + 1}`}
              onPress={() => clearCelebratedMilestone(prevYearKey)}
            />
            <ToolRow
              label='Reset ALL celebratedMilestones'
              tone='destructive'
              onPress={() =>
                confirmDevAction('Reset all celebratedMilestones', () => {
                  setPreferences({ celebratedMilestones: {} })
                  showDone('All celebratedMilestones cleared')
                })
              }
            />
          </ToolList>
          <View style={{ paddingTop: 8 }}>
            <JsonViewer
              label='celebratedMilestones'
              value={celebratedMilestones}
              count={Object.keys(celebratedMilestones).length}
            />
          </View>
        </ToolSection>

        <ToolSection
          title='Profile & reports'
          icon={UserRoundIcon}
          summary={name ? name : 'No name'}
        >
          <ToolList>
            <ToolRow
              label='hasCompletedProfileSetup'
              value={String(hasCompletedProfileSetup)}
            />
            <ToolRow label='Name' value={name ? name : '—'} />
            <ToolRow
              label='Reset profile (keep onboarded)'
              info='Keeps onboardingComplete=true but clears profile fields so the post-update prompt re-appears. Use this to validate the upgrade flow for existing users.'
              onPress={() => {
                setPreferences({
                  onboardingComplete: true,
                  tenureStartDate: null,
                })
                setProfile({
                  hasCompletedProfileSetup: false,
                  name: '',
                  avatar: { type: 'none', value: '' },
                })
                showDone('Reset to pre-profile state')
              }}
            />
            <ToolRow
              label='Submitted months'
              value={
                submittedReportMonths.length === 0
                  ? '—'
                  : submittedReportMonths.join(', ')
              }
            />
            <ToolRow
              label='Clear submitted reports'
              info='submittedReportMonths drives the Home-screen "Submit <month>’s Report" reminder — it appears while the previous month’s YYYY-MM key is absent. Clearing brings the reminder (and the report screen’s submit CTA state) back.'
              onPress={() => {
                setPreferences({ submittedReportMonths: [] })
                showDone('Submitted reports cleared')
              }}
            />
          </ToolList>
        </ToolSection>

        <ToolSection
          title='Plan notifications'
          icon={BellIcon}
          info='End-to-end checks for the day-plan notification feature. Requires iOS notification permission. Generated plans appear in the normal day-plan list and respect the same delete-cancels-notification wiring.'
          summary={`${scheduledNotifications.length} in queue`}
        >
          <ToolList>
            <ToolRow
              label='Schedule test notification (10s)'
              onPress={scheduleTestNotificationIn10s}
            />
            <ToolRow
              label='Plan with imminent notification'
              info='Creates a day plan starting in 3 minutes with a 1-minute notify offset, so the notification fires in ~2 minutes. Deleting the plan through the normal UI cancels it.'
              onPress={generateImminentDayPlanWithNotification}
            />
            <ToolRow
              label='Refresh OS queue'
              trailing={
                <LucideIcon
                  icon={RotateCwIcon}
                  size={theme.fontSize('md')}
                  color={theme.colors.accent}
                />
              }
              onPress={async () => {
                const count = await refreshScheduledNotifications()
                toast.show(`${count} scheduled`, { message: '', native: true })
              }}
            />
            <ToolRow
              label='Cancel all scheduled'
              tone='destructive'
              onPress={cancelAllScheduledNotifications}
            />
          </ToolList>
          <View style={{ paddingTop: 8 }}>
            <JsonViewer
              label='Scheduled (OS queue)'
              value={scheduledNotifications}
              count={scheduledNotifications.length}
            />
          </View>
        </ToolSection>

        {/* ---- Integrations ---- */}
        <ToolSection
          title='Supporter sync'
          icon={CloudIcon}
          info='One account id per Apple ID, agreed via the account file in the iCloud container: the entitled device claims it, every other device adopts it (RevenueCat logIn), so Supporter status follows with no sign-in. Read the file to see the current claim and the reconcile action THIS device would take right now.'
          summary={shortId(accountId)}
        >
          <ToolList>
            <ToolRow label='Account id' value={shortId(accountId)} />
            <ToolRow
              label='Install id'
              value={shortId(getOrCreateInstallId())}
            />
            <ToolRow
              label='iCloud sharing'
              value={String(iCloudSharingAvailable)}
            />
            <ToolRow label='Entitled (RevenueCat)' value={String(entitled)} />
            <ToolRow
              label='isSupporter (effective)'
              value={String(isSupporter)}
            />
            <ToolRow
              label='Read iCloud account file'
              onPress={() => void inspectAccountFile()}
            />
            <ToolRow
              label='Clear adopted account id'
              tone='destructive'
              info='Falls back to this install’s id until the next reconcile pass.'
              onPress={() =>
                confirmDevAction('Clear adopted account id', () => {
                  clearAdoptedAccountId()
                  showDone('Adopted id cleared — falls back to install id')
                })
              }
            />
          </ToolList>
          <View style={{ paddingTop: 8 }}>
            <JsonViewer
              label='Account file + reconcile decision'
              value={accountFileInspection}
              count={accountFileInspection ? 1 : 0}
            />
          </View>
        </ToolSection>

        <ToolSection
          title='Notes Import'
          icon={KeyRoundIcon}
          summary={
            notesImportCredits
              ? notesImportCredits.remaining === null
                ? '∞ imports'
                : `${notesImportCredits.remaining}/${notesImportCredits.limit} imports`
              : undefined
          }
        >
          <ToolSubheading
            title='Auth & attestation'
            info='The auth module negotiates the worker protocol and serializes challenge → assertion → protected response per key. Diagnostics use the existing key through that same lane; they never generate, rotate, enroll, recover, or clear lifecycle state. Repair runs the attested no-op verify through the REAL protected path — if Apple refuses to sign with the stored key, it re-registers under the enrolled recovery credential and retries, rotating the key.'
          />
          <ToolList>
            <ToolRow
              label={authBusy ? 'Running…' : 'Run auth diagnostics'}
              disabled={authBusy}
              onPress={() => void runAuthDiagnostics()}
            />
            <ToolRow
              label={authBusy ? 'Running…' : 'Run attestation repair'}
              disabled={authBusy}
              onPress={() => void runAuthRepair()}
            />
            <ToolRow
              label='Probe /health + /status'
              onPress={() => void probeProxy()}
            />
            <ToolRow label='Proxy base' value={authSnapshot.baseUrl} />
            <ToolRow
              label='Dev bypass'
              value={String(authSnapshot.devBypassEnabled)}
            />
            <ToolRow
              label='App Attest supported'
              value={String(authSnapshot.appAttestSupported)}
            />
            <ToolRow
              label='Protocol'
              value={
                authSnapshot.negotiatedProtocolVersion
                  ? `v${authSnapshot.negotiatedProtocolVersion}`
                  : 'not negotiated'
              }
            />
            <ToolRow label='Active key' value={authSnapshot.activeKey} />
            <ToolRow
              label='Recovery token'
              value={authSnapshot.recoveryToken}
            />
            <ToolRow
              label='Recovery enrollment'
              value={authSnapshot.recoveryEnrollment}
            />
            <ToolRow
              label='Install identity'
              value={authSnapshot.installIdentity}
            />
            <ToolRow
              label='Account identity'
              value={authSnapshot.accountIdentity}
            />
            <ToolRow
              label='Pending lifecycle op'
              value={
                authSnapshot.pendingOperation
                  ? `${authSnapshot.pendingOperation.kind}/${authSnapshot.pendingOperation.stage}`
                  : 'none'
              }
            />
          </ToolList>
          <View style={{ gap: 8, paddingTop: 8 }}>
            <JsonViewer
              label='Auth snapshot (redacted)'
              value={authSnapshot}
              count={Object.keys(authSnapshot).length}
            />
            <JsonViewer
              label='Diagnostics report'
              value={authReport}
              count={authReport?.steps.length ?? 0}
            />
            <JsonViewer
              label='Repair report'
              value={repairReport}
              count={repairReport?.steps.length ?? 0}
            />
            <JsonViewer
              label='Proxy health / status'
              value={proxyProbe}
              count={proxyProbe ? 2 : 0}
            />
          </View>

          <ToolSubheading
            title='Usage & limits'
            info='The proxy meters by account id (1 credit per distinct source text; replays and refinements are free, refinements capped per import; Supporters unmetered). There is no read-only usage endpoint — these values come from the most recent kickoff/done response this session, so they’re empty until an import runs.'
          />
          <ToolList>
            <ToolRow
              label='Server isSupporter'
              value={
                notesImportCredits
                  ? String(notesImportCredits.isSupporter)
                  : '—'
              }
            />
            <ToolRow
              label='Imports remaining'
              value={
                notesImportCredits
                  ? notesImportCredits.remaining === null
                    ? '∞'
                    : `${notesImportCredits.remaining} / ${notesImportCredits.limit}`
                  : '—'
              }
            />
            <ToolRow
              label='Refinements remaining'
              value={
                notesImportCredits
                  ? `${notesImportCredits.refinements.remaining} / ${notesImportCredits.refinements.limit}`
                  : '—'
              }
            />
            <ToolRow
              label='Client concurrency cap'
              value={`${clientImportCap(isSupporter)}`}
            />
          </ToolList>
          <View style={{ paddingTop: 8 }}>
            <JsonViewer
              label='Last credits snapshot'
              value={notesImportCredits}
              count={notesImportCredits ? 1 : 0}
            />
          </View>
        </ToolSection>

        {/* ---- Device & raw data ---- */}
        <ToolSection title={i18n.t('metadata')} icon={SmartphoneIcon}>
          <ToolList>
            <ToolRow
              label={i18n.t('appVersion')}
              value={Constants.expoConfig?.version ?? i18n.t('versionUnknown')}
            />
            <ToolRow
              label='Platform'
              value={`${Platform.OS} ${Platform.Version}`}
            />
            <ToolRow
              label={i18n.t('migratedToMmkv')}
              value={`${hasMigratedFromAsyncStorage()}`}
            />
            {Platform.OS === 'ios' ? (
              <ToolRow
                label='Show app icon alerts'
                info='By default, app-icon changes (manual picks, seasonal rotation, supporter-lapse reverts) bypass the iOS "App Icon Updated" system alert via a patched private selector. Turn this on to use the public API instead — the alert fires on every change, useful for confirming a change landed when the icon doesn’t appear to update.'
                trailing={
                  <Switch
                    value={devShowAppIconAlerts}
                    onValueChange={(value) =>
                      setPreferences({ devShowAppIconAlerts: value })
                    }
                  />
                }
              />
            ) : null}
          </ToolList>
        </ToolSection>

        <ToolSection title={i18n.t('data')} icon={BracesIcon}>
          <View style={{ gap: 8, paddingTop: 8 }}>
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
          </View>
        </ToolSection>
      </KeyboardAwareScrollView>
    </View>
  )
}
