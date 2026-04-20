import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Switch, View } from 'react-native'
import moment from 'moment'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Wrapper from '../../../../components/layout/Wrapper'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import InputRowButton from '../../../../components/inputs/InputRowButton'
import Text from '../../../../components/MyText'
import IsSupporter from '../../../../components/IsSupporter'
import useTheme from '../../../../contexts/theme'
import i18n from '../../../../lib/locales'
import { usePreferences } from '../../../../stores/preferences'
import * as ICloudBridge from '../../../../../modules/icloud-bridge'
import { iCloudSync } from '../../../../lib/sync/iCloudSync'
import FirstEnableSheet, {
  FirstEnableChoice,
} from '../../../../components/sync/FirstEnableSheet'
import { SyncPayload } from '../../../../lib/sync/payload'
import { useToastController } from '@tamagui/toast'

const TIMESTAMP_FMT = 'MMM D, YYYY h:mm:ss A'

type StatusDisplay = { text: string; subtitle?: string }

const buildStatus = (
  enabled: boolean,
  available: boolean,
  lastiCloudPulledAt: number | null,
  lastiCloudPushedAt: number | null
): StatusDisplay => {
  if (!enabled) return { text: i18n.t('iCloudStatusDisabled') }
  if (!available) return { text: i18n.t('iCloudStatusUnavailable') }
  const mostRecent = Math.max(lastiCloudPulledAt ?? 0, lastiCloudPushedAt ?? 0)
  if (!mostRecent) return { text: i18n.t('iCloudStatusWaitingForFirstSync') }
  return {
    text: i18n.t('iCloudStatusLastSynced', {
      relative: moment(mostRecent).fromNow(),
    }),
    subtitle: moment(mostRecent).format(TIMESTAMP_FMT),
  }
}

const formatOrDash = (ts: number | null): string =>
  ts ? moment(ts).format(TIMESTAMP_FMT) : '—'

const PreferencesiCloudScreenInner = () => {
  const theme = useTheme()
  const {
    iCloudSyncEnabled,
    iCloudSyncIncludeImages,
    lastiCloudPushedAt,
    lastiCloudPulledAt,
    lastiCloudRemoteWrittenAt,
    lastiCloudRemoteDeviceId,
    lastiCloudRemoteDeviceName,
    iCloudDeviceId,
    developerTools,
    set,
  } = usePreferences()
  const [syncing, setSyncing] = useState(false)
  const [available, setAvailable] = useState(() => ICloudBridge.isAvailable())
  const [firstEnableSheetOpen, setFirstEnableSheetOpen] = useState(false)
  const [pendingRemote, setPendingRemote] = useState<SyncPayload | null>(null)
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
  const toast = useToastController()

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
    iCloudSync.backfillUpdatedAtIfNeeded()
    set({ iCloudSyncEnabled: true })
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
            shouldPromptForImages = remotePayloadReferencesImages(pendingRemote)
            toast.show(i18n.t('iCloudEnabledToastRestored'), { native: true })
          }
          break
        case 'merge':
          await iCloudSync.pullAndMerge('initial-enable-merge')
          await iCloudSync.push('initial-enable-merge')
          toast.show(i18n.t('iCloudEnabledToastMerged'), { native: true })
          break
      }
    } finally {
      setPendingRemote(null)
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

  /**
   * Returns true when the folded remote payload carries any image markers,
   * meaning the sender had image sync on. Drives the "also download photos?"
   * prompt — we don't bother showing it when the remote payload is image-free
   * (Q9 in the design doc).
   */
  const remotePayloadReferencesImages = (remote: SyncPayload): boolean => {
    for (const c of remote.contactStore.contacts ?? []) {
      const avatar = (c as { avatar?: { type?: string; value?: string } })
        .avatar
      if (
        avatar?.type === 'image' &&
        typeof avatar.value === 'string' &&
        avatar.value.startsWith('icloud://')
      ) {
        return true
      }
    }
    const profile = remote.preferencesStore?.values?.avatar as
      | { type?: string; value?: string }
      | undefined
    return (
      profile?.type === 'image' &&
      typeof profile.value === 'string' &&
      profile.value.startsWith('icloud://')
    )
  }

  const handleToggle = async (next: boolean) => {
    if (!next) {
      set({ iCloudSyncEnabled: false, iCloudSyncSetByUser: true })
      return
    }
    set({ iCloudSyncSetByUser: true })
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
      setSyncing(false)
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
        case 'unavailable':
          // We already early-returned on `!isAvailable()` above, so reaching
          // `unavailable` here means the iCloud identity token flipped out
          // between the availability check and the peek. Bail quietly — the
          // availability listener will update UI.
          break
      }
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
    try {
      const merged = await iCloudSync.pullAndMerge('manual')
      await iCloudSync.push('manual')
      toast.show(
        merged
          ? i18n.t('iCloudManualSyncMerged')
          : i18n.t('iCloudManualSyncNoChanges'),
        { native: true }
      )
    } finally {
      setSyncing(false)
    }
  }

  const handleOpenSettings = () => {
    void Linking.openSettings()
  }

  const status = buildStatus(
    iCloudSyncEnabled,
    available,
    lastiCloudPulledAt,
    lastiCloudPushedAt
  )

  /**
   * Handles the image-sync toggle. Both directions are destructive (enabling
   * copies photos to iCloud; disabling deletes them from iCloud) so both
   * surface a confirmation alert before the async flow runs. The optimistic
   * `pendingImagesEnable` state keeps the switch visually responsive while
   * `enableImageSync` / `disableImageSync` do their work.
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
          style: 'destructive',
          onPress: async () => {
            setPendingImagesEnable(false)
            setMigratingImages(true)
            try {
              await iCloudSync.disableImageSync()
              toast.show(i18n.t('iCloudImagesToastRemoved'), { native: true })
            } finally {
              setMigratingImages(false)
              setPendingImagesEnable(null)
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
              await ICloudBridge.deleteAll()
              set({ lastiCloudSyncAt: null })
              await iCloudSync.push('post-reset')
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
        <View style={{ paddingHorizontal: 15, gap: 6 }}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
            }}
          >
            {i18n.t('iCloudSync')}
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
            {i18n.t('iCloudSync_description')}
          </Text>
        </View>

        <Section>
          <InputRowContainer
            label={i18n.t('iCloudEnableLabel')}
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
                paddingRight: 15,
              }}
            >
              {i18n.t('iCloudOpenSettingsHelp')}
            </Text>
          </Section>
        )}

        <View style={{ paddingHorizontal: 15 }}>
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
          <View style={{ gap: 8 }}>
            <View style={{ paddingHorizontal: 15 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t('iCloudImagesSectionTitle')}
              </Text>
            </View>
            <Section>
              <InputRowContainer
                label={i18n.t('iCloudImagesToggleLabel')}
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
            <View style={{ paddingHorizontal: 15 }}>
              <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
                {i18n.t('iCloudImagesToggleSubtitle')}
              </Text>
            </View>
            <View style={{ paddingHorizontal: 15 }}>
              <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
                {i18n.t('iCloudImagesInfoFooter')}
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
  <IsSupporter feature='iCloudSync' fill>
    <PreferencesiCloudScreenInner />
  </IsSupporter>
)

export default PreferencesiCloudScreen
