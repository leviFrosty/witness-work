import { payloadReferencesPhotos } from '@/app/sync/photoReferences'
import { analytics } from '@/lib/analytics'
import InfoPopover from '@/components/ui/InfoPopover'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, View } from 'react-native'
import {
  ChevronRight as ChevronRightIcon,
  X as XIcon,
} from 'lucide-react-native'
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
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import Text from '@/components/ui/MyText'
import Badge from '@/components/ui/Badge'
import IsSupporter from '@/components/IsSupporter'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { dismissICloudAccountChangeNotice } from '@/lib/iCloudIdentity'
import * as ICloudBridge from '../../../../../../modules/icloud-bridge/index'
import { ICloudAccount, iCloudSync } from '@/app/sync/iCloudSync'
import FirstEnableSheet, {
  FirstEnableChoice,
} from '@/app/sync/components/FirstEnableSheet'
import { SyncPayload } from '@/app/sync/payload'
import { useToastController } from '@tamagui/toast'
import { formatDateTime } from '@/lib/dates'
import SettingsInputLayout from '@/features/settings/components/shared/SettingsInputLayout'
import {
  buildICloudStatus,
  UPLOAD_GRACE_MS,
} from '@/features/settings/lib/iCloudStatus'

const formatOrDash = (ts: number | null): string =>
  ts ? formatDateTime(ts, { style: 'medium', withSeconds: true }) : '—'

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
    iCloudSyncPendingPush,
    iCloudSyncPausedForLapse,
    iCloudSyncNeedsResolution,
    iCloudAccountChangedAt,
    developerTools,
    set,
  } = usePreferences()
  const [syncing, setSyncing] = useState(false)
  const [available, setAvailable] = useState(() => ICloudBridge.isAvailable())
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
  const toast = useToastController()
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

  const showAccountChangedNotice =
    iCloudAccountChangedAt !== null && !iCloudSyncEnabled
  useEffect(() => {
    if (showAccountChangedNotice)
      analytics.capture('icloud_account_changed_notice_viewed')
  }, [showAccountChangedNotice])

  // Re-check iCloud availability on mount and whenever the identity changes.
  useEffect(() => {
    setAvailable(ICloudBridge.isAvailable())
    const sub = ICloudBridge.addAvailabilityChangeListener((e) => {
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
        i18n.t('iCloudAccountChangedNotice_title'),
        i18n.t('iCloudAccountChangedNotice_description')
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
          toast.show(i18n.t('iCloudEnabledToastKeep'), { native: true })
          break
        case 'useRemote':
          if (pendingRemote) {
            iCloudSync.replaceLocalWithRemote(pendingRemote)
            shouldPromptForImages = payloadReferencesPhotos(pendingRemote)
            toast.show(i18n.t('iCloudEnabledToastRestored'), { native: true })
          }
          break
        case 'merge':
          await iCloudSync.pullAndMerge('initial-enable-merge')
          if (
            usePreferences.getState().iCloudSyncIssue ||
            !(await iCloudSync.push('initial-enable-merge'))
          )
            throw new Error('iCloud sync incomplete')
          toast.show(i18n.t('iCloudEnabledToastMerged'), { native: true })
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
      Alert.alert(i18n.t('error'), i18n.t('iCloudOperationFailed'))
    } finally {
      setPendingRemote(null)
      setPendingAccount(null)
      setSyncing(false)
      setPendingEnable(null)
    }
    if (shouldPromptForImages) {
      Alert.alert(
        i18n.t('iCloudImagesRestorePrompt_title'),
        i18n.t('iCloudImagesRestorePrompt_description'),
        [
          { text: i18n.t('iCloudImagesRestorePrompt_skip'), style: 'cancel' },
          {
            text: i18n.t('iCloudImagesRestorePrompt_action'),
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
        i18n.t('iCloudSyncDisabled_title'),
        i18n.t('iCloudDisableConfirm_description'),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t('iCloudDisableConfirm_pause'),
            onPress: () => {
              set({ iCloudSyncEnabled: false, iCloudSyncSetByUser: true })
              analytics.capture('icloud_sync_enabled_changed', {
                enabled: false,
                source: 'settings',
              })
            },
          },
          {
            text: i18n.t('iCloudDisableConfirm_removePhotos'),
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
                Alert.alert(i18n.t('error'), i18n.t('iCloudOperationFailed'))
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
    if (!ICloudBridge.isAvailable()) {
      setPendingEnable(null)
      Alert.alert(
        i18n.t('iCloudUnavailable_title'),
        i18n.t('iCloudUnavailable_description')
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
          toast.show(i18n.t('iCloudEnabledToastSeeded'), { native: true })
          break
        case 'pull':
          iCloudSync.applyPullEnable(decision.remote)
          toast.show(i18n.t('iCloudEnabledToastRestored'), { native: true })
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
            i18n.t('iCloudRemoteNotReady_title'),
            i18n.t('iCloudRemoteNotReady_description')
          )
          break
        case 'unavailable':
          // We already checked `isAvailable()` above, so this is the identity
          // token flipping mid-peek or the container being unreadable
          // (iCloud Drive off for the app).
          Alert.alert(
            i18n.t('iCloudUnavailable_title'),
            i18n.t('iCloudUnavailable_description')
          )
          break
      }
    } catch {
      Alert.alert(i18n.t('error'), i18n.t('iCloudOperationFailed'))
    } finally {
      setSyncing(false)
      setPendingEnable(null)
    }
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

  const handleSyncNow = async () => {
    if (!iCloudSyncEnabled) return
    setSyncing(true)
    analytics.capture('icloud_sync_manual_started')
    try {
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
      toast.show(
        merged
          ? i18n.t('iCloudManualSyncMerged')
          : i18n.t('iCloudManualSyncNoChanges'),
        { native: true }
      )
    } catch {
      analytics.capture('icloud_sync_manual_outcome', { outcome: 'failed' })
      Alert.alert(
        i18n.t('error'),
        i18n.t(
          usePreferences.getState().iCloudUploadIssue === 'icloud-full'
            ? 'iCloudStorageFullHelp'
            : 'iCloudOperationFailed'
        )
      )
    } finally {
      setSyncing(false)
    }
  }

  const handleOpenSettings = () => {
    void Linking.openSettings()
  }

  const status = buildICloudStatus({
    enabled: iCloudSyncEnabled,
    available,
    paused: iCloudSyncPausedForLapse,
    needsResolution: iCloudSyncNeedsResolution,
    issue: iCloudSyncIssue,
    uploadIssue: iCloudUploadIssue,
    pendingPush: iCloudSyncPendingPush,
    uploadPendingSince: iCloudUploadPendingSince,
    uploadConfirmationSupported: ICloudBridge.supportsUploadStatus(),
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
        i18n.t('iCloudImagesEnableConfirm_title'),
        i18n.t('iCloudImagesEnableConfirm_description'),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t('iCloudImagesEnableConfirm_action'),
            style: 'destructive',
            onPress: async () => {
              setPendingImagesEnable(true)
              setMigratingImages(true)
              toast.show(i18n.t('iCloudImagesToastMigrating'), {
                native: true,
              })
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
                  toast.show(
                    i18n.t('iCloudImagesToastMigratedPartial', {
                      uploaded,
                      total: uploaded + failed,
                    }),
                    { native: true }
                  )
                } else {
                  toast.show(
                    i18n.t('iCloudImagesToastMigrated', { count: uploaded }),
                    { native: true }
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
                Alert.alert(i18n.t('error'), i18n.t('iCloudOperationFailed'))
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
      i18n.t('iCloudImagesDisableConfirm_title'),
      i18n.t('iCloudImagesDisableConfirm_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('iCloudImagesDisableConfirm_action'),
          onPress: async () => {
            setPendingImagesEnable(false)
            setMigratingImages(true)
            try {
              await iCloudSync.disableImageSync()
              analytics.capture('icloud_sync_images_changed', {
                enabled: false,
                source: 'settings',
              })
              toast.show(i18n.t('iCloudImagesToastPaused'), { native: true })
            } finally {
              setMigratingImages(false)
              setPendingImagesEnable(null)
            }
          },
        },
        {
          text: i18n.t('iCloudDisableConfirm_removePhotos'),
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
              toast.show(i18n.t('iCloudImagesToastRemoved'), { native: true })
            } catch {
              analytics.capture('icloud_sync_cloud_photos_removed', {
                source: 'images_toggle',
                outcome: 'failed',
              })
              Alert.alert(i18n.t('error'), i18n.t('iCloudOperationFailed'))
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
      i18n.t('iCloudResetConfirm_title'),
      i18n.t('iCloudResetConfirm_description'),
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
              toast.show(i18n.t('iCloudEnabledToastKeep'), { native: true })
            } catch {
              analytics.capture('icloud_sync_reset_outcome', {
                outcome: 'failed',
              })
              Alert.alert(i18n.t('error'), i18n.t('iCloudOperationFailed'))
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
                {i18n.t('iCloudSync')}
              </Text>
              <InfoPopover
                title={i18n.t('iCloudSync')}
                description={`${i18n.t('iCloudSync_description')} ${i18n.t('iCloudBetaNotice')}`}
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
            {i18n.t('iCloudSync_summary')}
          </Text>
        </View>

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
                {i18n.t('iCloudAccountChangedNotice')}
              </Text>
              <InfoPopover
                inline
                title={i18n.t('iCloudAccountChangedNotice_title')}
                description={i18n.t('iCloudAccountChangedNotice_description')}
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
          <InputRowContainer
            label={i18n.t('iCloudEnableLabel')}
            controlWidth='auto'
            style={{ justifyContent: 'space-between' }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              {syncing && (
                <ActivityIndicator size='small' color={theme.colors.textAlt} />
              )}
              <Switch
                value={pendingEnable ?? iCloudSyncEnabled}
                onValueChange={handleToggle}
                disabled={syncing || pendingEnable !== null}
              />
            </View>
          </InputRowContainer>
          <InputRowContainer
            label={i18n.t('iCloudStatusLabel')}
            lastInSection
            style={{ justifyContent: 'space-between' }}
          >
            <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  textAlign: 'right',
                }}
              >
                {status.text}
              </Text>
              {status.subtitle && (
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: 12,
                    textAlign: 'right',
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
              {i18n.t('iCloudStorageFullHelp')}
            </Text>
          )}
        </Section>

        {!available && (
          <Section>
            <InputRowButton
              label={i18n.t('iCloudOpenSettings')}
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
              {i18n.t('iCloudOpenSettingsHelp')}
            </Text>
          </Section>
        )}

        <View>
          <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
            {i18n.t('iCloudPrivacyNote')}
          </Text>
        </View>

        {iCloudSyncEnabled && developerTools && (
          <Section>
            <InputRowContainer
              label={i18n.t('iCloudLastPushedLabel')}
              style={{ justifyContent: 'space-between' }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  flexShrink: 1,
                  textAlign: 'right',
                }}
              >
                {formatOrDash(lastiCloudPushedAt)}
              </Text>
            </InputRowContainer>
            <InputRowContainer
              label={i18n.t('iCloudLastPulledLabel')}
              style={{ justifyContent: 'space-between' }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  flexShrink: 1,
                  textAlign: 'right',
                }}
              >
                {formatOrDash(lastiCloudPulledAt)}
              </Text>
            </InputRowContainer>
            <InputRowContainer
              label={i18n.t('iCloudRemoteWrittenLabel')}
              style={{ justifyContent: 'space-between' }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  flexShrink: 1,
                  textAlign: 'right',
                }}
              >
                {formatOrDash(lastiCloudRemoteWrittenAt)}
              </Text>
            </InputRowContainer>
            <InputRowContainer
              label={i18n.t('iCloudRemoteDeviceLabel')}
              lastInSection
              style={{ justifyContent: 'space-between' }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  flexShrink: 1,
                  textAlign: 'right',
                }}
              >
                {lastiCloudRemoteDeviceName ??
                  (lastiCloudRemoteDeviceId
                    ? lastiCloudRemoteDeviceId.slice(0, 8)
                    : '—')}
                {lastiCloudRemoteDeviceId &&
                iCloudDeviceId === lastiCloudRemoteDeviceId
                  ? ` (${i18n.t('iCloudThisDevice')})`
                  : ''}
              </Text>
            </InputRowContainer>
          </Section>
        )}

        {iCloudSyncEnabled && (
          <Section>
            <InputRowButton
              label={i18n.t('iCloudSyncNow')}
              onPress={handleSyncNow}
              lastInSection
            >
              <Text style={{ color: theme.colors.accent }}>
                {syncing ? i18n.t('iCloudSyncing') : i18n.t('sync')}
              </Text>
            </InputRowButton>
          </Section>
        )}

        {iCloudSyncEnabled && (
          <Section>
            <InputRowButton
              label={i18n.t('iCloudDevices')}
              onPress={() => navigation.navigate('PreferencesiCloudDevices')}
              lastInSection
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text style={{ color: theme.colors.textAlt }}>
                  {deviceCount}
                </Text>
                <IconButton icon={ChevronRightIcon} />
              </View>
            </InputRowButton>
          </Section>
        )}

        {iCloudSyncEnabled && (
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
                {i18n.t('iCloudImagesSectionTitle')}
              </Text>
              <InfoPopover
                title={i18n.t('iCloudImagesSectionTitle')}
                description={i18n.t('iCloudImagesInfoFooter')}
              />
            </View>
            <Section>
              <InputRowContainer
                label={i18n.t('iCloudImagesToggleLabel')}
                controlWidth='auto'
                style={{ justifyContent: 'space-between' }}
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
                    value={pendingImagesEnable ?? iCloudSyncIncludeImages}
                    onValueChange={handleImagesToggle}
                    disabled={migratingImages || pendingImagesEnable !== null}
                  />
                </View>
              </InputRowContainer>
              <InputRowButton
                label={i18n.t('iCloudImagesLearnADP')}
                onPress={handleOpenADP}
                lastInSection
              >
                <Text style={{ color: theme.colors.accent }}>
                  {i18n.t('open')}
                </Text>
              </InputRowButton>
            </Section>
            <View>
              <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
                {i18n.t('iCloudImagesToggleSubtitle')}
              </Text>
            </View>
          </View>
        )}

        {iCloudSyncEnabled && (
          <Section>
            <InputRowButton
              label={i18n.t('iCloudReset')}
              onPress={handleReset}
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
    </Wrapper>
  )
}

const PreferencesiCloudScreen = () => (
  <SettingsInputLayout>
    <IsSupporter feature='iCloudSync' fill>
      <PreferencesiCloudScreenInner />
    </IsSupporter>
  </SettingsInputLayout>
)

export default PreferencesiCloudScreen
