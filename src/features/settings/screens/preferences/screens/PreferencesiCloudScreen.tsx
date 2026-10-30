import { openAppSettings } from '@/lib/openAppSettings'
import { payloadReferencesPhotos } from '@/app/sync/photoReferences'
import { analytics } from '@/lib/analytics'
import InfoPopover from '@/components/ui/InfoPopover'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, View } from 'react-native'
import { X as XIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '@/types/rootStack'
import { listSyncDevices } from '@/lib/syncDevices'
import IconButton from '@/components/ui/IconButton'
import Card from '@/components/ui/Card'
import Switch from '@/components/ui/Switch'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Text from '@/components/ui/MyText'
import Badge from '@/components/ui/Badge'
import SyncSupporterGate from '@/features/settings/components/sync/SyncSupporterGate'
import SupporterInfoSheet from '@/components/SupporterInfoSheet'
import useIsSupporter from '@/hooks/useIsSupporter'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { optionSyncKey, platformSyncKey, syncKey } from '@/lib/syncCopy'
import { usePreferences } from '@/stores/preferences'
import { dismissICloudAccountChangeNotice } from '@/lib/iCloudIdentity'
import {
  syncTransport as platformSyncTransport,
  usesGoogleDriveSync,
} from '@/lib/syncTransport'
import { isKnownOffline, useOnline } from '@/lib/http/online'
import { connectGoogleDriveFromUser } from '@/app/sync/googleDriveConnect'
import GoogleDriveAccountSection from '@/features/settings/components/sync/GoogleDriveAccountSection'
import { ICloudAccount, iCloudSync } from '@/app/sync/iCloudSync'
import FirstEnableSheet, {
  FirstEnableChoice,
} from '@/app/sync/components/FirstEnableSheet'
import { SyncPayload } from '@/app/sync/payload'
import { toast } from '@/stores/toasts'
import { formatDateTime } from '@/lib/dates'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import {
  buildICloudStatus,
  UPLOAD_GRACE_MS,
} from '@/features/settings/lib/iCloudStatus'
import { alignText } from '@/lib/direction'
import * as BuddiesKeychain from '../../../../../../modules/buddies-keychain'
import { fromB64u } from '@/lib/bytes'
import { accountSessions } from '@/lib/serverAccount'
import { signedInElsewhere } from '@/lib/serverAccount/accountDevices'
import {
  activeSyncTransport as syncTransport,
  addActiveAvailabilityListener,
  registeredCloudSyncTransport,
  usesCloudSync,
} from '@/lib/syncTransport/provider'
import {
  cloudSyncPause,
  type CloudSyncPause,
  prepareCloudSync,
  recheckCloudSyncPause,
  refreshCloudSyncStatus,
} from '@/app/sync/cloudSync'
import {
  currentSyncOption,
  dismissCloudSyncOffer,
  showsCloudSyncOffer,
  switchSyncOption,
  type SwitchFailure,
  type SyncOption,
} from '@/app/sync/syncOption'
import SyncOptionSection, {
  useOtherDevicesSignedIn,
} from '@/features/settings/components/sync/SyncOptionSection'

const formatOrDash = (ts: number | null): string =>
  ts ? formatDateTime(ts, { style: 'medium', withSeconds: true }) : '—'

/**
 * Whether the account has other signed-in devices: the mixed-fleet note on
 * iCloud/Drive (ADR 0030 §6). False without an account key or session.
 */
async function accountHasOtherDevices(): Promise<boolean> {
  if (!accountSessions.snapshot()) return false
  const seed = await BuddiesKeychain.peekRootSeed().catch(() => null)
  return seed ? signedInElsewhere(fromB64u(seed)) : false
}

/**
 * What to tell the User when a switch to `to` or Cloud Sync's turn-on can't
 * happen. Worded for `to`: the device is back on the option it left.
 */
const switchFailureMessage = (reason: SwitchFailure, to: SyncOption) => {
  const option = to === 'cloud' ? 'cloud' : 'platform'
  switch (reason) {
    case 'not_entitled':
      return i18n.t('cloudSyncNotEntitled')
    case 'disabled':
      return i18n.t('cloudSyncDisabled')
    case 'no_session':
      return i18n.t('cloudSyncNoSession')
    case 'offline':
      return i18n.t('iCloudSyncNowOffline_description')
    case 'incomplete':
      return i18n.t(optionSyncKey('iCloudRemoteNotReady_description', option))
    case 'unavailable':
      return i18n.t(optionSyncKey('iCloudUnavailable_description', option))
    case 'account_changed':
      return i18n.t('syncOption_accountChanged')
  }
}

/** Cloud Sync paused by the server, said calmly: nothing failed here. */
const showCloudSyncPaused = (pause: CloudSyncPause) =>
  Alert.alert(
    i18n.t('cloudSyncPaused_title'),
    i18n.t(
      pause === 'switch'
        ? 'iCloudStatusCloudSyncPaused'
        : 'cloudSyncNotEntitled'
    )
  )

/** A sync that didn't finish, unless Cloud Sync was paused meanwhile. */
const showSyncFailed = () => {
  const pause = cloudSyncPause()
  if (pause) showCloudSyncPaused(pause)
  else Alert.alert(i18n.t('error'), i18n.t(syncKey('iCloudOperationFailed')))
}

const PreferencesiCloudScreenInner = () => {
  const theme = useTheme()
  const {
    iCloudSyncEnabled,
    iCloudSyncIncludeImages,
    lastiCloudPushedAt,
    lastiCloudPulledAt,
    lastiCloudUploadedAt,
    iCloudUploadPendingSince,
    iCloudUploadIssue,
    lastiCloudRemoteWrittenAt,
    lastiCloudRemoteDeviceId,
    lastiCloudRemoteDeviceName,
    iCloudDeviceId,
    iCloudSyncIssue,
    iCloudSyncErrorCode,
    iCloudSyncPendingPush,
    iCloudSyncPausedForLapse,
    iCloudSyncNeedsResolution,
    iCloudAccountChangedAt,
    googleDriveNeedsReconnect,
    developerTools,
    cloudSyncConfig,
    cloudSyncEntitled,
    syncProvider,
    set,
  } = usePreferences()
  // Cloud Sync (ADR 0030) is offered once the server's switch is on; the
  // screen then picks between it, iCloud or Google Drive, and Off.
  // A device already on Cloud Sync keeps the choice while the server's switch
  // pauses it, so it can still move to iCloud, Google Drive, or Off.
  const cloudOffered =
    registeredCloudSyncTransport() !== null &&
    (cloudSyncConfig?.enabled === true || syncProvider === 'cloud')
  const option = currentSyncOption()
  const onCloud = option === 'cloud'
  const offer = usePreferences(showsCloudSyncOffer)
  const [switchingTo, setSwitchingTo] = useState<SyncOption | null>(null)
  const otherDevicesSignedIn = useOtherDevicesSignedIn(accountHasOtherDevices)
  // With Cloud Sync open to everyone the screen isn't gated, but iCloud and
  // Google Drive sync still are.
  const { isSupporter } = useIsSupporter()
  const [platformGateOpen, setPlatformGateOpen] = useState(false)
  // Android syncs through the connected Google Account's Drive (ADR 0019).
  const googleDrive = usesGoogleDriveSync() && syncProvider !== 'cloud'
  const [syncing, setSyncing] = useState(false)
  const [available, setAvailable] = useState(() =>
    syncTransport().isAvailable()
  )
  const [firstEnableSheetOpen, setFirstEnableSheetOpen] = useState(false)
  const [pendingRemote, setPendingRemote] = useState<SyncPayload | null>(null)
  // The Apple Account `pendingRemote` was read under.
  const [pendingAccount, setPendingAccount] = useState<ICloudAccount | null>(
    null
  )
  // Optimistic override for the enable switch. Lets the thumb flip immediately
  // on tap while the async enable flow (availability check, conflict sheet,
  // seed/pull) resolves in the background. Null when no flip is in flight.
  const [pendingEnable, setPendingEnable] = useState<boolean | null>(null)
  // Optimistic override for the image-sync switch — same pattern as
  // `pendingEnable` but scoped to the image toggle.
  const [pendingImagesEnable, setPendingImagesEnable] = useState<
    boolean | null
  >(null)
  const [migratingImages, setMigratingImages] = useState(false)
  // Re-renders when an unconfirmed upload passes its grace period, so the
  // status switches to "Uploading" without another preference change.
  const [now, setNow] = useState(() => Date.now())
  const online = useOnline()
  const navigation = useNavigation<RootStackNavigation>()
  const deviceCount = usePreferences(
    (state) =>
      listSyncDevices(state.iCloudSyncDevices, state.iCloudDeviceId).length
  )

  useEffect(() => {
    if (iCloudUploadPendingSince === null) return
    const remaining = iCloudUploadPendingSince + UPLOAD_GRACE_MS - Date.now()
    if (remaining <= 0) {
      setNow(Date.now())
      return
    }
    const timer = setTimeout(() => setNow(Date.now()), remaining)
    return () => clearTimeout(timer)
  }, [iCloudUploadPendingSince])

  // Keeps "Last synced 2 minutes ago" current while the screen is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // Cloud Sync's pause can end while the app stays open; opening the screen
  // asks again (at most once a minute), so its status and sync come back.
  useEffect(() => {
    if (onCloud) void refreshCloudSyncStatus()
  }, [onCloud])

  const showAccountChangedNotice =
    iCloudAccountChangedAt !== null && !iCloudSyncEnabled

  // Re-check availability on mount and whenever the identity changes.
  useEffect(() => {
    setAvailable(syncTransport().isAvailable())
    const sub = addActiveAvailabilityListener((e) => {
      setAvailable(e.available)
    })
    return () => sub.remove()
  }, [])

  /**
   * Completes the "enable sync" flow given the user's chosen collision
   * resolution from `FirstEnableSheet`. The auto-resolved branches (no remote /
   * fresh device) don't route through here — they use the shared
   * `applySeedEnable` / `applyPullEnable` helpers in `iCloudSync` so this
   * screen and the supporter auto-enable effect in `App.tsx` make the same
   * decisions.
   */
  const applyFirstEnableChoice = async (choice: FirstEnableChoice) => {
    // The sheet showed the data of the account it was opened under. After a
    // switch, every choice would carry that data, or this device's reset, into
    // the new account's iCloud; turning sync on again asks about that one.
    if (!pendingAccount || !iCloudSync.confirmICloudAccount(pendingAccount)) {
      analytics.capture('icloud_sync_first_enable_outcome', {
        choice,
        outcome: 'account_changed',
      })
      setPendingRemote(null)
      setPendingAccount(null)
      setPendingEnable(null)
      Alert.alert(
        i18n.t(syncKey('iCloudAccountChangedNotice_title')),
        i18n.t(syncKey('iCloudAccountChangedNotice_description'))
      )
      return
    }
    iCloudSync.backfillUpdatedAtIfNeeded()
    const wasEnabled = usePreferences.getState().iCloudSyncEnabled
    analytics.capture('icloud_sync_first_enable_chosen', { choice })
    // Before sync turns on: joining iCloud's newest reset generation makes the
    // pull merge with it instead of adopting it and replacing this device's
    // data.
    if (choice === 'merge' && pendingRemote)
      iCloudSync.joinRemoteResetEpoch(pendingRemote)
    if (choice !== 'keepLocal')
      set({
        iCloudSyncEnabled: true,
        iCloudSyncNeedsResolution: false,
        iCloudFreshSetup: false,
      })
    if (!wasEnabled) {
      analytics.capture('icloud_sync_enabled_changed', {
        enabled: true,
        source: 'settings',
      })
    }
    setSyncing(true)
    let shouldPromptForImages = false
    try {
      switch (choice) {
        case 'keepLocal':
          await iCloudSync.overwriteRemoteWithLocal()
          toast.success(i18n.t(syncKey('iCloudEnabledToastKeep')))
          break
        case 'useRemote':
          if (pendingRemote) {
            iCloudSync.replaceLocalWithRemote(pendingRemote)
            // Cloud Sync carries photos without asking (ADR 0040 §6).
            shouldPromptForImages =
              !usesCloudSync() && payloadReferencesPhotos(pendingRemote)
            toast.success(i18n.t(syncKey('iCloudEnabledToastRestored')))
          }
          break
        case 'merge':
          await iCloudSync.pullAndMerge('initial-enable-merge')
          if (
            usePreferences.getState().iCloudSyncIssue ||
            !(await iCloudSync.push('initial-enable-merge'))
          )
            throw new Error('iCloud sync incomplete')
          toast.success(i18n.t(syncKey('iCloudEnabledToastMerged')))
          break
      }
      analytics.capture('icloud_sync_first_enable_outcome', {
        choice,
        outcome: 'completed',
      })
    } catch {
      analytics.capture('icloud_sync_first_enable_outcome', {
        choice,
        outcome: 'failed',
      })
      showSyncFailed()
    } finally {
      setPendingRemote(null)
      setPendingAccount(null)
      setSyncing(false)
      setPendingEnable(null)
    }
    if (shouldPromptForImages) {
      Alert.alert(
        i18n.t(syncKey('iCloudImagesRestorePrompt_title')),
        i18n.t(syncKey('iCloudImagesRestorePrompt_description')),
        [
          {
            text: i18n.t(syncKey('iCloudImagesRestorePrompt_skip')),
            style: 'cancel',
          },
          {
            text: i18n.t(syncKey('iCloudImagesRestorePrompt_action')),
            onPress: async () => {
              usePreferences.setState({ iCloudSyncIncludeImages: true })
              await iCloudSync.pullImagesIfEnabled()
            },
          },
        ]
      )
    }
  }

  const handleToggle = async (next: boolean) => {
    if (!next) {
      Alert.alert(
        i18n.t(syncKey('iCloudSyncDisabled_title')),
        i18n.t(syncKey('iCloudDisableConfirm_description')),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t(syncKey('iCloudDisableConfirm_pause')),
            onPress: () => {
              set({ iCloudSyncEnabled: false, iCloudSyncSetByUser: true })
              analytics.capture('icloud_sync_enabled_changed', {
                enabled: false,
                source: 'settings',
              })
            },
          },
          {
            text: i18n.t(syncKey('iCloudDisableConfirm_removePhotos')),
            style: 'destructive',
            onPress: async () => {
              setSyncing(true)
              try {
                await iCloudSync.disableImageSync()
                await iCloudSync.clearCloudPhotos()
                set({ iCloudSyncEnabled: false, iCloudSyncSetByUser: true })
                analytics.capture('icloud_sync_cloud_photos_removed', {
                  source: 'disable_sync',
                  outcome: 'completed',
                })
              } catch {
                analytics.capture('icloud_sync_cloud_photos_removed', {
                  source: 'disable_sync',
                  outcome: 'failed',
                })
                Alert.alert(
                  i18n.t('error'),
                  i18n.t(syncKey('iCloudOperationFailed'))
                )
              } finally {
                setSyncing(false)
              }
            },
          },
        ]
      )
      return
    }
    set({ iCloudSyncSetByUser: true, iCloudAccountChangedAt: null })
    setPendingEnable(true)
    // Turning sync on is how Android users first connect Google Drive. Read
    // now: the option picker may have just chosen it.
    if (
      usesGoogleDriveSync() &&
      !usesCloudSync() &&
      !syncTransport().isAvailable() &&
      !(await connectGoogleDriveFromUser({ source: 'settings' }))
    ) {
      setPendingEnable(null)
      return
    }
    if (!syncTransport().isAvailable()) {
      setPendingEnable(null)
      Alert.alert(
        i18n.t(syncKey('iCloudUnavailable_title')),
        i18n.t(syncKey('iCloudUnavailable_description'))
      )
      return
    }

    setSyncing(true)
    const decision = await iCloudSync.resolveInitialEnable()

    // The `conflict` branch must not flip `syncing` off in a `finally` before
    // the sheet opens — the sheet itself owns the rest of the flow and will
    // clear `syncing` in its own `onChoose` / dismiss paths. Handle it first
    // and return so the try/finally below only scopes the headless branches.
    // `pendingEnable` also stays set so the switch reads "on" while the sheet
    // is up; it clears in `applyFirstEnableChoice` (on choose) or the sheet's
    // dismiss handler (on cancel).
    if (decision.outcome === 'conflict') {
      setPendingRemote(decision.remote)
      setPendingAccount(decision.account)
      setSyncing(false)
      analytics.capture('icloud_sync_first_enable_viewed')
      setFirstEnableSheetOpen(true)
      return
    }

    try {
      switch (decision.outcome) {
        case 'seed':
          await iCloudSync.applySeedEnable()
          toast.success(i18n.t(syncKey('iCloudEnabledToastSeeded')))
          break
        case 'pull':
          iCloudSync.applyPullEnable(decision.remote)
          toast.success(i18n.t(syncKey('iCloudEnabledToastRestored')))
          break
        case 'incomplete':
          // Part of the remote is still downloading (or from a newer app
          // version), so seeding or restoring now could overwrite it. Leave
          // sync off; toggling again re-checks.
          analytics.capture('icloud_sync_enable_deferred', {
            source: 'settings',
            reason: decision.reason,
          })
          Alert.alert(
            i18n.t(syncKey('iCloudRemoteNotReady_title')),
            i18n.t(syncKey('iCloudRemoteNotReady_description'))
          )
          break
        case 'unavailable':
          // We already checked `isAvailable()` above, so this is the identity
          // token flipping mid-peek or the container being unreadable
          // (iCloud Drive off for the app).
          Alert.alert(
            i18n.t(syncKey('iCloudUnavailable_title')),
            i18n.t(syncKey('iCloudUnavailable_description'))
          )
          break
      }
    } catch {
      showSyncFailed()
    } finally {
      setSyncing(false)
      setPendingEnable(null)
    }
  }

  /** Runs a switch between options, saying how it went. */
  const runSwitch = async (next: SyncOption, source: 'settings' | 'offer') => {
    setSwitchingTo(next)
    try {
      const result = await switchSyncOption(next, source)
      if (result.outcome === 'failed') {
        Alert.alert(
          i18n.t('syncOption_switchFailed_title'),
          switchFailureMessage(result.reason, next)
        )
        return
      }
      toast.success(
        i18n.t(
          next === 'cloud'
            ? 'syncOption_switchedCloud'
            : next === 'platform'
              ? platformSyncKey('syncOption_switchedPlatform')
              : 'syncOption_turnedOff'
        )
      )
    } finally {
      setSwitchingTo(null)
    }
  }

  /**
   * The option picker. From Off it turns sync on through the first-enable flow
   * (which asks Merge, Replace or Keep when both sides have data); between
   * Cloud Sync and iCloud/Drive it switches, merging this device's data into
   * the new option; to Off it pauses.
   */
  const handleSelect = async (
    next: SyncOption,
    source: 'settings' | 'offer' = 'settings'
  ) => {
    if (syncing || switchingTo || next === option) return
    if (next === 'platform' && !isSupporter) {
      setPlatformGateOpen(true)
      return
    }
    if (source === 'offer')
      analytics.capture('cloud_sync_offer_answered', { choice: 'switch' })
    if (option === 'off') {
      if (next === 'cloud') {
        setSwitchingTo('cloud')
        const prepared = await prepareCloudSync()
        setSwitchingTo(null)
        if (prepared.outcome !== 'ready') {
          Alert.alert(
            i18n.t('syncOption_switchFailed_title'),
            switchFailureMessage(
              prepared.outcome === 'not_entitled'
                ? 'not_entitled'
                : prepared.outcome === 'disabled'
                  ? 'disabled'
                  : 'no_session',
              'cloud'
            )
          )
          return
        }
      }
      // A choice made here answers the one-time offer too.
      set({
        syncProvider: next === 'cloud' ? 'cloud' : 'platform',
        cloudSyncOffer: 'dismissed',
      })
      await handleToggle(true)
      return
    }
    if (next === 'off') {
      if (option === 'platform') {
        await handleToggle(false)
        return
      }
      Alert.alert(
        i18n.t('cloudSyncTurnOff_title'),
        i18n.t('cloudSyncTurnOff_description'),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t('cloudSyncTurnOff_action'),
            style: 'destructive',
            onPress: () => void runSwitch('off', source),
          },
        ]
      )
      return
    }
    // Turning Drive on is how Android users connect a Google Account, from
    // Cloud Sync too (where `googleDrive` is false).
    if (
      next === 'platform' &&
      usesGoogleDriveSync() &&
      !platformSyncTransport().isAvailable() &&
      !(await connectGoogleDriveFromUser({ source: 'settings' }))
    )
      return
    if (source === 'offer') {
      void runSwitch(next, source)
      return
    }
    Alert.alert(
      i18n.t(
        next === 'cloud'
          ? 'syncOption_toCloud_title'
          : platformSyncKey('syncOption_toPlatform_title')
      ),
      i18n.t(
        next === 'cloud'
          ? platformSyncKey('syncOption_toCloud_description')
          : platformSyncKey('syncOption_toPlatform_description')
      ),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('syncOption_switchAction'),
          onPress: () => void runSwitch(next, source),
        },
      ]
    )
  }

  const handleFirstEnableChoice = (choice: FirstEnableChoice) => {
    setFirstEnableSheetOpen(false)
    // `FirstEnableSheet` calls `setOpen(false)` *before* `onChoose`, and our
    // setOpen handler rolls the optimistic switch back to null. Restore it
    // here so the switch stays visually on while `applyFirstEnableChoice`
    // does the async work; its finally clears the override.
    setPendingEnable(true)
    void applyFirstEnableChoice(choice)
  }

  const reconnectGoogleDrive = () => {
    Alert.alert(
      i18n.t('googleDriveReconnect'),
      i18n.t('googleDriveSyncNowReconnect_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('googleDriveConnectAction'),
          onPress: () =>
            void connectGoogleDriveFromUser({ source: 'reconnect' }),
        },
      ]
    )
  }

  const handleSyncNow = async () => {
    if (!iCloudSyncEnabled || syncing) return
    analytics.capture('icloud_sync_manual_started')
    // Nothing to try until the user reconnects or the connection returns;
    // say so instead of a generic failure, or a success that only wrote to
    // this device.
    if (googleDrive && usePreferences.getState().googleDriveNeedsReconnect) {
      analytics.capture('icloud_sync_manual_outcome', {
        outcome: 'needs_reconnect',
      })
      reconnectGoogleDrive()
      return
    }
    if (isKnownOffline()) {
      analytics.capture('icloud_sync_manual_outcome', { outcome: 'offline' })
      Alert.alert(
        i18n.t('iCloudSyncNowOffline_title'),
        i18n.t('iCloudSyncNowOffline_description')
      )
      return
    }
    setSyncing(true)
    // The user asked: skip any backoff from earlier failures.
    iCloudSync.resetPushBackoff()
    try {
      // Paused by the server: ask it again, and resume if it's back.
      const pause = await recheckCloudSyncPause()
      if (pause) {
        analytics.capture('icloud_sync_manual_outcome', { outcome: 'paused' })
        showCloudSyncPaused(pause)
        return
      }
      const merged = await iCloudSync.pullAndMerge('manual')
      const pullIssue = usePreferences.getState().iCloudSyncIssue
      const pushed = await iCloudSync.push('manual')
      // One look, without waiting for the upload: a failure iCloud already
      // reports (storage full) shouldn't read as "No new changes".
      if (pushed) await iCloudSync.checkUpload()
      if (
        pullIssue ||
        !pushed ||
        usePreferences.getState().iCloudSyncPendingPush ||
        usePreferences.getState().iCloudUploadIssue
      )
        throw new Error('iCloud sync incomplete')
      analytics.capture('icloud_sync_manual_outcome', {
        outcome: 'completed',
        merged,
      })
      toast.success(
        merged
          ? i18n.t(syncKey('iCloudManualSyncMerged'))
          : i18n.t(syncKey('iCloudManualSyncNoChanges'))
      )
    } catch {
      const prefs = usePreferences.getState()
      const errorCode = prefs.iCloudSyncErrorCode
      // The server paused Cloud Sync while this ran.
      const pause = cloudSyncPause()
      analytics.capture(
        'icloud_sync_manual_outcome',
        pause
          ? { outcome: 'paused' }
          : { outcome: 'failed', error_code: errorCode ?? 'none' }
      )
      if (pause) {
        showCloudSyncPaused(pause)
      } else if (googleDrive && prefs.googleDriveNeedsReconnect) {
        reconnectGoogleDrive()
      } else if (
        isKnownOffline() ||
        (errorCode === 'network' && syncTransport().writeConfirmsUpload)
      ) {
        Alert.alert(
          i18n.t('iCloudSyncNowOffline_title'),
          i18n.t('iCloudSyncNowOffline_description')
        )
      } else {
        Alert.alert(
          i18n.t('error'),
          i18n.t(
            prefs.iCloudUploadIssue === 'icloud-full' ||
              errorCode === 'storage-full'
              ? syncKey('iCloudStorageFullHelp')
              : errorCode === 'rate-limited' || errorCode === 'server-error'
                ? syncKey('iCloudSyncNowRateLimited')
                : syncKey('iCloudOperationFailed')
          )
        )
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleOpenSettings = () => {
    void openAppSettings()
  }

  const status = buildICloudStatus({
    enabled: iCloudSyncEnabled,
    available,
    // Cloud Sync's entitlement is the server's (ADR 0030).
    paused: onCloud ? cloudSyncEntitled === false : iCloudSyncPausedForLapse,
    pausedBySwitch: onCloud && cloudSyncConfig?.enabled === false,
    needsResolution: iCloudSyncNeedsResolution,
    issue: iCloudSyncIssue,
    uploadIssue: iCloudUploadIssue,
    pendingPush: iCloudSyncPendingPush,
    uploadPendingSince: iCloudUploadPendingSince,
    uploadConfirmationSupported:
      syncTransport().supportsUploadStatus() ||
      syncTransport().writeConfirmsUpload,
    needsReconnect: googleDrive && googleDriveNeedsReconnect,
    offline: online === false,
    errorCode: iCloudSyncErrorCode,
    networkErrorsMeanOffline: syncTransport().writeConfirmsUpload,
    lastPulledAt: lastiCloudPulledAt,
    lastPushedAt: lastiCloudPushedAt,
    lastUploadedAt: lastiCloudUploadedAt,
    now,
  })
  const storageFull =
    iCloudSyncEnabled && available && iCloudUploadIssue === 'icloud-full'

  /**
   * Handles photo transfer consent and an explicit shared-file cleanup choice.
   * The optimistic `pendingImagesEnable` state keeps the switch visually
   * responsive while `enableImageSync` / `disableImageSync` do their work.
   */
  const handleImagesToggle = (next: boolean) => {
    if (next) {
      Alert.alert(
        i18n.t(syncKey('iCloudImagesEnableConfirm_title')),
        i18n.t(syncKey('iCloudImagesEnableConfirm_description')),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t(syncKey('iCloudImagesEnableConfirm_action')),
            style: 'destructive',
            onPress: async () => {
              setPendingImagesEnable(true)
              setMigratingImages(true)
              toast.info(i18n.t(syncKey('iCloudImagesToastMigrating')))
              try {
                analytics.capture('icloud_sync_images_changed', {
                  enabled: true,
                  source: 'settings',
                })
                await iCloudSync.enableImageSync()
                // Surface migration result — imageSync returns counts but
                // `enableImageSync` awaits the first push internally. The
                // next foreground will retry any failures; for the toast we
                // can inspect bookkeeping to spot partial outcomes.
                const book = usePreferences.getState().iCloudImageSync ?? {}
                const entries = Object.values(book)
                const failed = entries.filter(
                  (e) => e.uploadedMtime == null && e.lastError
                ).length
                const uploaded = entries.filter(
                  (e) => e.uploadedMtime != null
                ).length
                if (failed > 0) {
                  toast.info(
                    i18n.t(syncKey('iCloudImagesToastMigratedPartial'), {
                      uploaded,
                      total: uploaded + failed,
                    })
                  )
                } else {
                  toast.success(
                    i18n.t(syncKey('iCloudImagesToastMigrated'), {
                      count: uploaded,
                    })
                  )
                }
                analytics.capture('icloud_sync_images_outcome', {
                  enabled: true,
                  outcome: 'completed',
                })
              } catch {
                analytics.capture('icloud_sync_images_outcome', {
                  enabled: true,
                  outcome: 'failed',
                })
                Alert.alert(
                  i18n.t('error'),
                  i18n.t(syncKey('iCloudOperationFailed'))
                )
              } finally {
                setMigratingImages(false)
                setPendingImagesEnable(null)
              }
            },
          },
        ]
      )
      return
    }

    Alert.alert(
      i18n.t(syncKey('iCloudImagesDisableConfirm_title')),
      i18n.t(syncKey('iCloudImagesDisableConfirm_description')),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t(syncKey('iCloudImagesDisableConfirm_action')),
          onPress: async () => {
            setPendingImagesEnable(false)
            setMigratingImages(true)
            try {
              await iCloudSync.disableImageSync()
              analytics.capture('icloud_sync_images_changed', {
                enabled: false,
                source: 'settings',
              })
              toast.info(i18n.t(syncKey('iCloudImagesToastPaused')))
            } finally {
              setMigratingImages(false)
              setPendingImagesEnable(null)
            }
          },
        },
        {
          text: i18n.t(syncKey('iCloudDisableConfirm_removePhotos')),
          style: 'destructive',
          onPress: async () => {
            setMigratingImages(true)
            try {
              await iCloudSync.disableImageSync()
              await iCloudSync.clearCloudPhotos()
              analytics.capture('icloud_sync_cloud_photos_removed', {
                source: 'images_toggle',
                outcome: 'completed',
              })
              toast.success(i18n.t(syncKey('iCloudImagesToastRemoved')))
            } catch {
              analytics.capture('icloud_sync_cloud_photos_removed', {
                source: 'images_toggle',
                outcome: 'failed',
              })
              Alert.alert(
                i18n.t('error'),
                i18n.t(syncKey('iCloudOperationFailed'))
              )
            } finally {
              setMigratingImages(false)
            }
          },
        },
      ]
    )
  }

  const handleOpenADP = () => {
    void Linking.openURL(
      'https://support.apple.com/guide/security/advanced-data-protection-for-icloud-sec973254c5f/web'
    )
  }

  const handleReset = () => {
    Alert.alert(
      i18n.t(syncKey('iCloudResetConfirm_title')),
      i18n.t(syncKey('iCloudResetConfirm_description')),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('reset'),
          style: 'destructive',
          onPress: async () => {
            setSyncing(true)
            try {
              analytics.capture('icloud_sync_reset_started')
              await iCloudSync.overwriteRemoteWithLocal()
              analytics.capture('icloud_sync_reset_outcome', {
                outcome: 'completed',
              })
              toast.success(i18n.t(syncKey('iCloudEnabledToastKeep')))
            } catch {
              analytics.capture('icloud_sync_reset_outcome', {
                outcome: 'failed',
              })
              Alert.alert(
                i18n.t('error'),
                i18n.t(syncKey('iCloudOperationFailed'))
              )
            } finally {
              setSyncing(false)
            }
          },
        },
      ]
    )
  }

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 30, paddingTop: 30, paddingBottom: 30 }}
      >
        <View
          style={{ gap: 6, paddingHorizontal: inputLayout.horizontalPadding }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexShrink: 1,
              }}
            >
              <Text
                style={{
                  flexShrink: 1,
                  fontSize: theme.fontSize('lg'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t('syncSettingsTitle')}
              </Text>
              <InfoPopover
                title={i18n.t('syncSettingsTitle')}
                description={i18n.t('twoSentences', {
                  first: i18n.t(
                    cloudOffered
                      ? platformSyncKey('syncSettings_description')
                      : syncKey('iCloudSync_description')
                  ),
                  second: i18n.t(syncKey('iCloudBetaNotice')),
                })}
              />
            </View>
            <Badge color={theme.colors.accentTranslucent}>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('xs'),
                  textTransform: 'uppercase',
                  color: theme.colors.accent,
                }}
              >
                {i18n.t('beta')}
              </Text>
            </Badge>
          </View>
          <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
            {i18n.t(
              cloudOffered
                ? 'syncSettings_summary'
                : syncKey('iCloudSync_summary')
            )}
          </Text>
        </View>

        {cloudOffered && (
          <SyncOptionSection
            option={
              pendingEnable && option === 'off'
                ? (syncProvider ?? 'cloud')
                : option
            }
            busy={switchingTo}
            onSelect={(next) => void handleSelect(next)}
            onSwitchFromOffer={() => void handleSelect('cloud', 'offer')}
            offer={offer}
            onDismissOffer={dismissCloudSyncOffer}
            otherDevicesSignedIn={otherDevicesSignedIn}
          />
        )}

        {showAccountChangedNotice && (
          <Card
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'flex-start',
              }}
            >
              <Text style={{ flexShrink: 1, color: theme.colors.text }}>
                {i18n.t(syncKey('iCloudAccountChangedNotice'))}
              </Text>
              <InfoPopover
                inline
                title={i18n.t(syncKey('iCloudAccountChangedNotice_title'))}
                description={i18n.t(
                  syncKey('iCloudAccountChangedNotice_description')
                )}
              />
            </View>
            <IconButton
              icon={XIcon}
              color={theme.colors.textAlt}
              onPress={dismissICloudAccountChangeNotice}
              accessibilityLabel={i18n.t('dismiss')}
            />
          </Card>
        )}

        <Section>
          {!cloudOffered && (
            <InputRowContainer
              label={i18n.t(syncKey('iCloudEnableLabel'))}
              controlWidth='auto'
              inlineAtLargeText
              style={{ justifyContent: 'space-between' }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                {syncing && (
                  <ActivityIndicator
                    size='small'
                    color={theme.colors.textAlt}
                  />
                )}
                <Switch
                  accessibilityLabel={i18n.t(syncKey('iCloudEnableLabel'))}
                  value={pendingEnable ?? iCloudSyncEnabled}
                  onValueChange={handleToggle}
                  disabled={syncing || pendingEnable !== null}
                />
              </View>
            </InputRowContainer>
          )}
          <InputRowContainer
            label={i18n.t(syncKey('iCloudStatusLabel'))}
            lastInSection
            style={{ justifyContent: 'space-between' }}
          >
            <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  textAlign: alignText('end'),
                }}
              >
                {status.text}
              </Text>
              {status.subtitle && (
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: 12,
                    textAlign: alignText('end'),
                  }}
                >
                  {status.subtitle}
                </Text>
              )}
            </View>
          </InputRowContainer>
          {storageFull && (
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                paddingTop: 4,
                paddingHorizontal: 12,
                paddingBottom: 16,
              }}
            >
              {i18n.t(syncKey('iCloudStorageFullHelp'))}
            </Text>
          )}
        </Section>

        {googleDrive && !onCloud && <GoogleDriveAccountSection />}

        {!googleDrive && !onCloud && !available && (
          <Section>
            <InputRowButton
              label={i18n.t(syncKey('iCloudOpenSettings'))}
              onPress={handleOpenSettings}
              lastInSection
            >
              <Text style={{ color: theme.colors.accent }}>
                {i18n.t('open')}
              </Text>
            </InputRowButton>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                paddingTop: 4,
                paddingHorizontal: 12,
                paddingBottom: 16,
              }}
            >
              {i18n.t(syncKey('iCloudOpenSettingsHelp'))}
            </Text>
          </Section>
        )}

        <View>
          <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
            {i18n.t(syncKey('iCloudPrivacyNote'))}
          </Text>
        </View>

        {iCloudSyncEnabled && developerTools && (
          <Section>
            <InputRowContainer
              label={i18n.t(syncKey('iCloudLastPushedLabel'))}
              style={{ justifyContent: 'space-between' }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  flexShrink: 1,
                  textAlign: alignText('end'),
                }}
              >
                {formatOrDash(lastiCloudPushedAt)}
              </Text>
            </InputRowContainer>
            <InputRowContainer
              label={i18n.t(syncKey('iCloudLastPulledLabel'))}
              style={{ justifyContent: 'space-between' }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  flexShrink: 1,
                  textAlign: alignText('end'),
                }}
              >
                {formatOrDash(lastiCloudPulledAt)}
              </Text>
            </InputRowContainer>
            <InputRowContainer
              label={i18n.t(syncKey('iCloudRemoteWrittenLabel'))}
              style={{ justifyContent: 'space-between' }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  flexShrink: 1,
                  textAlign: alignText('end'),
                }}
              >
                {formatOrDash(lastiCloudRemoteWrittenAt)}
              </Text>
            </InputRowContainer>
            <InputRowContainer
              label={i18n.t(syncKey('iCloudRemoteDeviceLabel'))}
              lastInSection
              style={{ justifyContent: 'space-between' }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  flexShrink: 1,
                  textAlign: alignText('end'),
                }}
              >
                {lastiCloudRemoteDeviceId &&
                iCloudDeviceId === lastiCloudRemoteDeviceId
                  ? i18n.t('iCloudDeviceIsThisDevice', {
                      device:
                        lastiCloudRemoteDeviceName ??
                        lastiCloudRemoteDeviceId.slice(0, 8),
                    })
                  : (lastiCloudRemoteDeviceName ??
                    (lastiCloudRemoteDeviceId
                      ? lastiCloudRemoteDeviceId.slice(0, 8)
                      : '—'))}
              </Text>
            </InputRowContainer>
          </Section>
        )}

        {iCloudSyncEnabled && (
          <Section>
            <InputRowButton
              label={i18n.t(syncKey('iCloudSyncNow'))}
              onPress={handleSyncNow}
              disabled={syncing}
              lastInSection
            >
              <Text style={{ color: theme.colors.accent }}>
                {syncing ? i18n.t(syncKey('iCloudSyncing')) : i18n.t('sync')}
              </Text>
            </InputRowButton>
          </Section>
        )}

        {iCloudSyncEnabled && (
          <Section>
            <InputRowButton
              label={i18n.t(syncKey('iCloudDevices'))}
              onPress={() => navigation.navigate('PreferencesiCloudDevices')}
              lastInSection
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text style={{ color: theme.colors.textAlt }}>
                  {deviceCount}
                </Text>
                <IconButton icon={ChevronForwardIcon} />
              </View>
            </InputRowButton>
          </Section>
        )}

        {iCloudSyncEnabled && !onCloud && (
          <View style={{ gap: 8 }}>
            <View
              style={{
                paddingHorizontal: inputLayout.horizontalPadding,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t(syncKey('iCloudImagesSectionTitle'))}
              </Text>
              <InfoPopover
                title={i18n.t(syncKey('iCloudImagesSectionTitle'))}
                description={i18n.t(syncKey('iCloudImagesInfoFooter'))}
              />
            </View>
            <Section>
              <InputRowContainer
                label={i18n.t(syncKey('iCloudImagesToggleLabel'))}
                controlWidth='auto'
                inlineAtLargeText
                style={{ justifyContent: 'space-between' }}
                lastInSection={googleDrive}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  {migratingImages && (
                    <ActivityIndicator
                      size='small'
                      color={theme.colors.textAlt}
                    />
                  )}
                  <Switch
                    accessibilityLabel={i18n.t(
                      syncKey('iCloudImagesToggleLabel')
                    )}
                    value={pendingImagesEnable ?? iCloudSyncIncludeImages}
                    onValueChange={handleImagesToggle}
                    disabled={migratingImages || pendingImagesEnable !== null}
                  />
                </View>
              </InputRowContainer>
              {/* Advanced Data Protection is Apple's; Drive has no equivalent. */}
              {!googleDrive && (
                <InputRowButton
                  label={i18n.t(syncKey('iCloudImagesLearnADP'))}
                  onPress={handleOpenADP}
                  lastInSection
                >
                  <Text style={{ color: theme.colors.accent }}>
                    {i18n.t('open')}
                  </Text>
                </InputRowButton>
              )}
            </Section>
            <View>
              <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
                {i18n.t(syncKey('iCloudImagesToggleSubtitle'))}
              </Text>
            </View>
          </View>
        )}

        {iCloudSyncEnabled && (
          <Section>
            <InputRowButton
              label={i18n.t(syncKey('iCloudReset'))}
              onPress={handleReset}
              disabled={syncing}
              lastInSection
            >
              <Text style={{ color: theme.colors.error }}>
                {i18n.t('reset')}
              </Text>
            </InputRowButton>
          </Section>
        )}
      </KeyboardAwareScrollView>
      <FirstEnableSheet
        open={firstEnableSheetOpen}
        setOpen={(open) => {
          setFirstEnableSheetOpen(open)
          if (!open) {
            analytics.capture('icloud_sync_first_enable_dismissed')
            setPendingRemote(null)
            setSyncing(false)
            // Dismiss without a choice = user cancelled. Roll the optimistic
            // switch back off. When a choice *is* made, `handleFirstEnableChoice`
            // closes the sheet directly (not via `setOpen`), so this branch
            // doesn't fire and `applyFirstEnableChoice` clears the override on
            // completion instead.
            setPendingEnable(null)
          }
        }}
        remote={pendingRemote}
        onChoose={handleFirstEnableChoice}
      />
      <SupporterInfoSheet
        open={platformGateOpen}
        setOpen={setPlatformGateOpen}
        featureKey='iCloudSync'
      />
    </Wrapper>
  )
}

const PreferencesiCloudScreen = () => (
  <SettingsInputLayout>
    <SyncSupporterGate>
      <PreferencesiCloudScreenInner />
    </SyncSupporterGate>
  </SettingsInputLayout>
)

export default PreferencesiCloudScreen
