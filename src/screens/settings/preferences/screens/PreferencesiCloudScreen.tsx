import { useEffect, useState } from 'react'
import { Alert, Switch, View } from 'react-native'
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

const headlineStatus = (
  enabled: boolean,
  available: boolean,
  lastiCloudPulledAt: number | null,
  lastiCloudPushedAt: number | null
): string => {
  if (!enabled) return i18n.t('iCloudStatusDisabled')
  if (!available) return i18n.t('iCloudStatusUnavailable')
  const mostRecent = Math.max(lastiCloudPulledAt ?? 0, lastiCloudPushedAt ?? 0)
  if (!mostRecent) return i18n.t('iCloudStatusWaitingForFirstSync')
  return moment(mostRecent).format(TIMESTAMP_FMT)
}

const formatOrDash = (ts: number | null): string =>
  ts ? moment(ts).format(TIMESTAMP_FMT) : '—'

const PreferencesiCloudScreenInner = () => {
  const theme = useTheme()
  const {
    iCloudSyncEnabled,
    lastiCloudPushedAt,
    lastiCloudPulledAt,
    lastiCloudRemoteWrittenAt,
    lastiCloudRemoteDeviceId,
    lastiCloudRemoteDeviceName,
    iCloudDeviceId,
    set,
  } = usePreferences()
  const [syncing, setSyncing] = useState(false)
  const [available, setAvailable] = useState(() => ICloudBridge.isAvailable())
  const [firstEnableSheetOpen, setFirstEnableSheetOpen] = useState(false)
  const [pendingRemote, setPendingRemote] = useState<SyncPayload | null>(null)
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
   * resolution. Called both from the auto-resolved path (fresh device) and the
   * first-enable sheet.
   */
  const finalizeEnable = async (
    choice: FirstEnableChoice | 'autoPull' | 'autoPush'
  ) => {
    iCloudSync.backfillUpdatedAtIfNeeded()
    set({ iCloudSyncEnabled: true })
    setSyncing(true)
    try {
      switch (choice) {
        case 'keepLocal':
          await iCloudSync.overwriteRemoteWithLocal()
          toast.show(i18n.t('iCloudEnabledToastKeep'), { native: true })
          break
        case 'useRemote':
          if (pendingRemote) {
            iCloudSync.replaceLocalWithRemote(pendingRemote)
            toast.show(i18n.t('iCloudEnabledToastRestored'), { native: true })
          }
          break
        case 'merge':
          await iCloudSync.pullAndMerge('initial-enable-merge')
          await iCloudSync.push('initial-enable-merge')
          toast.show(i18n.t('iCloudEnabledToastMerged'), { native: true })
          break
        case 'autoPull':
          if (pendingRemote) {
            iCloudSync.replaceLocalWithRemote(pendingRemote)
            toast.show(i18n.t('iCloudEnabledToastRestored'), { native: true })
          }
          break
        case 'autoPush':
          await iCloudSync.push('initial-enable-seed')
          toast.show(i18n.t('iCloudEnabledToastSeeded'), { native: true })
          break
      }
    } finally {
      setPendingRemote(null)
      setSyncing(false)
    }
  }

  const handleToggle = async (next: boolean) => {
    if (!next) {
      set({ iCloudSyncEnabled: false })
      return
    }
    if (!ICloudBridge.isAvailable()) {
      Alert.alert(
        i18n.t('iCloudUnavailable_title'),
        i18n.t('iCloudUnavailable_description')
      )
      return
    }

    setSyncing(true)
    // Look before leaping: peek at the remote file so we can decide whether
    // to ask the user anything or just proceed. A null result means either
    // no remote file yet (fresh iCloud) or a corrupt/unreadable payload —
    // in both cases the safe action is to seed from local.
    let remote: SyncPayload | null = null
    try {
      remote = await iCloudSync.peekRemotePayload()
    } finally {
      // Don't clear `syncing` yet — we're about to kick off the real work.
    }

    const localIsMeaningful = iCloudSync.hasMeaningfulLocalData()

    if (!remote) {
      // Nothing on iCloud — seed from this device.
      await finalizeEnable('autoPush')
      return
    }

    if (!localIsMeaningful) {
      // Fresh device discovering a prior backup — silent restore.
      setPendingRemote(remote)
      await finalizeEnable('autoPull')
      return
    }

    // Both sides populated — ask the user how to resolve.
    setPendingRemote(remote)
    setSyncing(false)
    setFirstEnableSheetOpen(true)
  }

  const handleFirstEnableChoice = (choice: FirstEnableChoice) => {
    setFirstEnableSheetOpen(false)
    void finalizeEnable(choice)
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
            <Switch
              value={iCloudSyncEnabled}
              onValueChange={handleToggle}
              disabled={syncing}
            />
          </InputRowContainer>
          <InputRowContainer
            label={i18n.t('iCloudStatusLabel')}
            lastInSection
            style={{ justifyContent: 'space-between' }}
          >
            <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
              {headlineStatus(
                iCloudSyncEnabled,
                available,
                lastiCloudPulledAt,
                lastiCloudPushedAt
              )}
            </Text>
          </InputRowContainer>
        </Section>

        {iCloudSyncEnabled && (
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
            >
              <Text style={{ color: theme.colors.accent }}>
                {syncing ? i18n.t('iCloudSyncing') : i18n.t('sync')}
              </Text>
            </InputRowButton>
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

        <View style={{ paddingHorizontal: 15 }}>
          <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
            {i18n.t('iCloudPrivacyNote')}
          </Text>
        </View>
      </KeyboardAwareScrollView>
      <FirstEnableSheet
        open={firstEnableSheetOpen}
        setOpen={(open) => {
          setFirstEnableSheetOpen(open)
          if (!open) {
            setPendingRemote(null)
            setSyncing(false)
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
