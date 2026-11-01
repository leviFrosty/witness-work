import { analytics } from '@/lib/analytics'
import {
  CircleAlert as CircleAlertIcon,
  CircleCheck as CircleCheckIcon,
  Cloud as CloudIcon,
  CloudOff as CloudOffIcon,
  RotateCw as RotateCwIcon,
  Save as SaveIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Easing, View } from 'react-native'
import { Spinner } from 'tamagui'
import { formatRelative } from '@/lib/dates'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { platformSyncKey as syncKey } from '@/lib/syncCopy'
import {
  hasSyncTransport,
  syncTransport,
  usesGoogleDriveSync,
} from '@/lib/syncTransport'
import { connectGoogleDriveFromUser } from '@/app/sync/googleDriveConnect'
import { addReconnectListener } from '@/lib/http/online'
import { ICloudAccount, iCloudSync, RemotePeek } from '@/app/sync/iCloudSync'
import { SyncPayload } from '@/app/sync/payload'
import { usePreferences } from '@/stores/preferences'
import { FRESH_SETUP_PREFERENCES } from '@/lib/syncPreferencePolicy'
import { payloadReferencesPhotos } from '@/app/sync/photoReferences'
import { useProfile } from '@/stores/profile'
import useFeatureAccess from '@/hooks/useFeatureAccess'

interface Props {
  goBack: () => void
  goNext: () => void
}

type Probe =
  | { state: 'probing' }
  | { state: 'unavailable' }
  | { state: 'needsConnect' }
  | { state: 'noBackup' }
  | { state: 'incomplete' }
  | { state: 'offline' }
  | { state: 'found'; remote: SyncPayload; account: ICloudAccount }

const importType = () => (usesGoogleDriveSync() ? 'google_drive' : 'icloud')

type RestoreMode = 'replace' | 'merge'

const probeFromPeek = (peek: RemotePeek): Probe => {
  switch (peek.status) {
    case 'found':
      return { state: 'found', remote: peek.remote, account: peek.account }
    case 'none':
      return { state: 'noBackup' }
    case 'incomplete':
      return { state: 'incomplete' }
    case 'offline':
      return { state: 'offline' }
    case 'unavailable':
      return { state: 'unavailable' }
  }
}

const ICloudRestore = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { set } = usePreferences()
  const { set: setProfile } = useProfile()
  const { hasAccess: canEnableICloudSync } = useFeatureAccess('iCloudSync')
  const [probe, setProbe] = useState<Probe>({ state: 'probing' })

  const [search, setSearch] = useState(0)
  const [restoring, setRestoring] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const connectDrive = async () => {
    setConnecting(true)
    try {
      if (await connectGoogleDriveFromUser({ source: 'onboarding' }))
        setSearch((n) => n + 1)
    } finally {
      setConnecting(false)
    }
  }

  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (usePreferences.getState().syncProvider !== null) return
    usePreferences.setState({ syncProvider: 'platform' })
    return () => {
      const prefs = usePreferences.getState()
      if (prefs.syncProvider === 'platform' && !prefs.iCloudSyncEnabled)
        usePreferences.setState({ syncProvider: null })
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let running = false
    let again = false
    let found = false
    const run = async () => {
      if (running) {
        again = true
        return
      }
      running = true
      setProbe({ state: 'probing' })
      try {
        let next: Probe
        do {
          again = false
          next = !hasSyncTransport()
            ? { state: 'unavailable' }
            : !syncTransport().isAvailable()
              ? {
                  state: usesGoogleDriveSync() ? 'needsConnect' : 'unavailable',
                }
              : probeFromPeek(await iCloudSync.peekRemotePayload())
        } while (again && !cancelled && next.state !== 'found')
        if (cancelled) return
        found = next.state === 'found'
        setProbe(next)
      } finally {
        running = false
      }
    }
    const probeRemote = () =>
      void run().catch(() => {
        if (!cancelled) setProbe({ state: 'unavailable' })
        analytics.capture('import_failed', {
          import_type: importType(),
          source: 'onboarding',
          stage: 'probe',
          error_code: 'unexpected',
        })
      })
    probeRemote()

    const sub = syncTransport().addRemoteChangeListener(() => {
      if (!cancelled && !found) probeRemote()
    })

    const reconnectSub = addReconnectListener(() => {
      if (!cancelled && !found) probeRemote()
    })
    return () => {
      cancelled = true
      sub.remove()
      reconnectSub.remove()
    }
  }, [search])

  useEffect(() => {
    if (probe.state !== 'probing') {
      pulse.stopAnimation()
      pulse.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )
    loop.start()
    return () => {
      loop.stop()
    }
  }, [probe.state, pulse])

  useEffect(() => {
    analytics.capture('icloud_restore_probe_result', {
      source: 'onboarding',
      status: probe.state,
    })
  }, [probe.state])

  const handleRestore = () => {
    if (probe.state !== 'found' || restoring) return
    const { remote, account } = probe
    if (!iCloudSync.hasMeaningfulLocalData()) {
      restore(remote, account, 'replace')
      return
    }
    const properties = {
      source: 'onboarding',
      merge_offered: canEnableICloudSync,
    }

    const choose = (mode: RestoreMode) => () => {
      analytics.capture('icloud_restore_replace_confirmed', {
        ...properties,
        choice: mode,
      })
      restore(remote, account, mode)
    }
    Alert.alert(
      i18n.t(syncKey('iCloudRestoreReplaceConfirm_title')),
      i18n.t(
        canEnableICloudSync
          ? syncKey('iCloudRestoreReplaceConfirm_descriptionWithMerge')
          : syncKey('iCloudRestoreReplaceConfirm_description')
      ),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel',
        },
        ...(canEnableICloudSync
          ? [
              {
                text: i18n.t(syncKey('iCloudRestoreReplaceConfirm_merge')),
                onPress: choose('merge'),
              },
            ]
          : []),
        {
          text: i18n.t(syncKey('iCloudRestoreReplaceConfirm_replace')),
          style: 'destructive' as const,
          onPress: choose('replace'),
        },
      ]
    )
  }

  const restore = (
    remote: SyncPayload,
    account: ICloudAccount,
    mode: RestoreMode
  ) => {
    const startedAt = Date.now()
    setRestoring(true)
    analytics.capture('import_started', {
      import_type: importType(),
      source: 'onboarding',
      mode,
    })
    const failed = (errorCode: 'unexpected' | 'account_changed') => {
      setRestoring(false)
      analytics.capture('import_failed', {
        import_type: importType(),
        source: 'onboarding',
        stage: 'restore',
        error_code: errorCode,
        mode,
        elapsed_ms: Date.now() - startedAt,
      })
    }

    const sameAccount = () => {
      if (iCloudSync.confirmICloudAccount(account)) return true
      failed('account_changed')
      Alert.alert(i18n.t(syncKey('iCloudAccountChangedNotice_title')))
      setSearch((n) => n + 1)
      return false
    }
    const fail = () => {
      failed('unexpected')
      if (mode === 'merge')
        Alert.alert(i18n.t('error'), i18n.t(syncKey('iCloudOperationFailed')))
      else
        Alert.alert(
          i18n.t('importError_title'),
          i18n.t('importError_description')
        )
    }
    if (mode === 'merge') {
      if (!sameAccount()) return
      void merge(remote).then(
        () => finishRestore(remote, mode, startedAt),
        fail
      )
      return
    }

    requestAnimationFrame(() => {
      if (!sameAccount()) return
      try {
        iCloudSync.replaceLocalWithRemote(remote)
      } catch {
        fail()
        return
      }
      finishRestore(remote, mode, startedAt)
    })
  }

  const merge = async (remote: SyncPayload) => {
    iCloudSync.backfillUpdatedAtIfNeeded()

    iCloudSync.joinRemoteResetEpoch(remote)
    enableSync()
    await iCloudSync.pullAndMerge('onboarding-merge')
    if (
      usePreferences.getState().iCloudSyncIssue ||
      !(await iCloudSync.push('onboarding-merge'))
    )
      throw new Error('iCloud sync incomplete')
  }

  const enableSync = () => {
    if (!canEnableICloudSync) return
    const wasSyncEnabled = usePreferences.getState().iCloudSyncEnabled
    set({
      iCloudSyncEnabled: true,
      iCloudSyncSetByUser: true,
      iCloudSyncNeedsResolution: false,
      iCloudFreshSetup: false,
    })
    if (!wasSyncEnabled) {
      analytics.capture('icloud_sync_enabled_changed', {
        enabled: true,
        source: 'onboarding_restore',
      })
    }
  }

  const finishRestore = (
    remote: SyncPayload,
    mode: RestoreMode,
    startedAt: number
  ) => {
    analytics.capture('import_completed', {
      import_type: importType(),
      source: 'onboarding',
      mode,
      elapsed_ms: Date.now() - startedAt,
    })
    analytics.capture('onboarding_completed', {
      completion_method: 'icloud_restore',
    })

    set({
      onboardingComplete: true,
      onboardingStepId: null,
      hasCompletedMapOnboarding: true,
    })
    if (mode === 'replace') enableSync()
    setProfile({ hasCompletedProfileSetup: true })

    if (payloadReferencesPhotos(remote)) {
      analytics.capture('icloud_restore_images_prompted', {
        source: 'onboarding',
      })
      Alert.alert(
        i18n.t(syncKey('iCloudImagesRestorePrompt_title')),
        i18n.t(syncKey('iCloudImagesRestorePrompt_description')),
        [
          {
            text: i18n.t(syncKey('iCloudImagesRestorePrompt_skip')),
            style: 'cancel',
            onPress: () => {
              analytics.capture('icloud_restore_images_skipped', {
                source: 'onboarding',
              })
            },
          },
          {
            text: i18n.t(syncKey('iCloudImagesRestorePrompt_action')),
            onPress: async () => {
              usePreferences.setState({ iCloudSyncIncludeImages: true })
              analytics.capture('icloud_restore_images_requested', {
                source: 'onboarding',
              })
              await iCloudSync.pullImagesIfEnabled()
            },
          },
        ]
      )
    }
  }

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View style={{ flex: 1, paddingTop: 30 }}>
        <View
          style={{
            width: 64,
            height: 64,
            marginBottom: 20,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {}
          {probe.state === 'probing' && (
            <Animated.View
              pointerEvents='none'
              style={{
                position: 'absolute',
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: theme.colors.accentTranslucent,
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.45, 0],
                }),
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.35],
                    }),
                  },
                ],
              }}
            />
          )}
          <Animated.View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: theme.colors.accentTranslucent,
              opacity:
                probe.state === 'probing'
                  ? pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    })
                  : 1,
              transform: [
                {
                  scale:
                    probe.state === 'probing'
                      ? pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.94, 1],
                        })
                      : 1,
                },
              ],
            }}
          >
            <LucideIcon
              icon={CloudIcon}
              size={28}
              color={theme.colors.accent}
            />
          </Animated.View>
        </View>
        <Text
          accessibilityRole='header'
          style={[styles.stepTitle, { fontFamily: theme.fonts.bold }]}
        >
          {i18n.t(syncKey('iCloudRestoreTitle'))}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textAlt,
            marginTop: 8,
            marginBottom: 24,
            lineHeight: 20,
          }}
        >
          {i18n.t(syncKey('iCloudRestoreDescription'))}
        </Text>

        {probe.state === 'probing' && (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 16,
              paddingHorizontal: 16,
            }}
          >
            <Spinner color={theme.colors.textAlt} />
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t(syncKey('iCloudRestoreChecking'))}
            </Text>
          </Card>
        )}

        {probe.state === 'unavailable' && (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 16,
              paddingHorizontal: 16,
            }}
          >
            <LucideIcon
              icon={CircleAlertIcon}
              size={18}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: theme.colors.textAlt,
                lineHeight: 18,
              }}
            >
              {i18n.t(syncKey('iCloudRestoreUnavailable'))}
            </Text>
          </Card>
        )}

        {probe.state === 'needsConnect' && (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 16,
              paddingHorizontal: 16,
            }}
          >
            <LucideIcon
              icon={CloudIcon}
              size={18}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: theme.colors.textAlt,
                lineHeight: 18,
              }}
            >
              {i18n.t('googleDriveRestoreConnectDescription')}
            </Text>
          </Card>
        )}

        {probe.state === 'offline' && (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 16,
              paddingHorizontal: 16,
            }}
          >
            <LucideIcon
              icon={CloudOffIcon}
              size={18}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: theme.colors.textAlt,
                lineHeight: 18,
              }}
            >
              {i18n.t(syncKey('iCloudRestoreOffline'))}
            </Text>
          </Card>
        )}

        {probe.state === 'incomplete' && (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 16,
              paddingHorizontal: 16,
            }}
          >
            <LucideIcon
              icon={CircleAlertIcon}
              size={18}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: theme.colors.textAlt,
                lineHeight: 18,
              }}
            >
              {i18n.t(syncKey('iCloudRemoteNotReady_description'))}
            </Text>
          </Card>
        )}

        {probe.state === 'noBackup' && (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 16,
              paddingHorizontal: 16,
            }}
          >
            <LucideIcon
              icon={CircleCheckIcon}
              size={18}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: theme.colors.textAlt,
                lineHeight: 18,
              }}
            >
              {i18n.t(syncKey('iCloudRestoreNoBackup'))}
            </Text>
          </Card>
        )}

        {probe.state === 'found' && (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              paddingVertical: 16,
              paddingHorizontal: 16,
              gap: 12,
              borderWidth: 1,
              borderColor: theme.colors.accentTranslucent,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentTranslucent,
                marginTop: 2,
              }}
            >
              <LucideIcon
                icon={SaveIcon}
                size={16}
                color={theme.colors.accent}
              />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t(syncKey('iCloudRestoreFoundTitle'))}
              </Text>
              <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
                {i18n.t(syncKey('iCloudRestoreFoundSummary'), {
                  device:
                    probe.remote.deviceName ||
                    i18n.t(syncKey('iCloudAnotherDevice')),
                  relative: formatRelative(probe.remote.writtenAt),
                })}
              </Text>
              {canEnableICloudSync && (
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.textAlt,
                    marginTop: 4,
                    lineHeight: 16,
                  }}
                >
                  {i18n.t(syncKey('iCloudRestoreFoundSyncNote'))}
                </Text>
              )}
            </View>
          </Card>
        )}
      </View>

      <View style={{ gap: 10 }}>
        {probe.state === 'needsConnect' && (
          <ActionButton onPress={connectDrive} disabled={connecting}>
            {connecting ? (
              <Spinner color={theme.colors.textInverse} />
            ) : (
              i18n.t('googleDriveRestoreConnect')
            )}
          </ActionButton>
        )}
        {probe.state === 'found' && (
          <ActionButton onPress={handleRestore} disabled={restoring}>
            {restoring ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Spinner color={theme.colors.textInverse} />
                <Text
                  style={{
                    fontSize: theme.fontSize('lg'),
                    color: theme.colors.textInverse,
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {i18n.t(syncKey('iCloudRestoreRestoring'))}
                </Text>
              </View>
            ) : (
              i18n.t(
                canEnableICloudSync
                  ? syncKey('iCloudRestoreActionWithSync')
                  : syncKey('iCloudRestoreAction')
              )
            )}
          </ActionButton>
        )}
        {(probe.state === 'noBackup' ||
          probe.state === 'unavailable' ||
          probe.state === 'incomplete' ||
          probe.state === 'offline') && (
          <Button
            onPress={() => {
              setSearch((n) => n + 1)
            }}
            style={{
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 10,
            }}
          >
            <LucideIcon
              icon={RotateCwIcon}
              size={14}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                color: theme.colors.textAlt,
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t(syncKey('iCloudRestoreRetry'))}
            </Text>
          </Button>
        )}
        <Button
          onPress={() => {
            analytics.capture('onboarding_import_skipped', {
              import_type: importType(),
              status: probe.state,
            })
            set(FRESH_SETUP_PREFERENCES)
            goNext()
          }}
          style={{ alignSelf: 'center', paddingVertical: 10 }}
          disabled={restoring || connecting}
        >
          <Text
            style={{
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {probe.state === 'found'
              ? i18n.t(syncKey('iCloudRestoreSkip'))
              : i18n.t('continue')}
          </Text>
        </Button>
      </View>
    </Wrapper>
  )
}

export default ICloudRestore
