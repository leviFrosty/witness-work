import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Easing, Platform, View } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import {
  faCheckCircle,
  faCircleExclamation,
  faCloud,
  faFloppyDisk,
} from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import { Spinner } from 'tamagui'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import Button from '../../Button'
import Card from '../../Card'
import useTheme from '../../../contexts/theme'
import i18n from '../../../lib/locales'
import * as ICloudBridge from '../../../../modules/icloud-bridge'
import { iCloudSync } from '../../../lib/sync/iCloudSync'
import { SyncPayload } from '../../../lib/sync/payload'
import { usePreferences } from '../../../stores/preferences'
import useFeatureAccess from '../../../hooks/useFeatureAccess'

interface Props {
  goBack: () => void
  goNext: () => void
}

type Probe =
  | { state: 'probing' }
  | { state: 'unavailable' } // iCloud account unavailable on this device
  | { state: 'noBackup' } // Available but nothing there yet
  | { state: 'found'; remote: SyncPayload }

/**
 * Whether the folded remote payload contains any image markers — i.e. the
 * source device had image sync on and would expect its companion devices to
 * download binaries. Used to gate the "also download photos?" prompt so we
 * don't show it for users whose remote payload is image-free.
 */
function remoteReferencesImages(remote: SyncPayload): boolean {
  for (const c of remote.contactStore.contacts ?? []) {
    const avatar = (c as { avatar?: { type?: string; value?: string } }).avatar
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
  if (
    profile?.type === 'image' &&
    typeof profile.value === 'string' &&
    profile.value.startsWith('icloud://')
  ) {
    return true
  }
  return false
}

/**
 * Offers a one-shot restore from iCloud during onboarding. Pulling is not gated
 * by supporter status — the user can import their data now and decide whether
 * to enable ongoing sync (which IS supporter-only) later. Skipping just
 * advances to the next onboarding step with no side effects.
 *
 * Not rendered on Android: iCloud is iOS-only. The parent step list hides this
 * step on non-iOS platforms.
 */
const ICloudRestore = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const { set } = usePreferences()
  const { hasAccess: canEnableICloudSync } = useFeatureAccess('iCloudSync')
  const [probe, setProbe] = useState<Probe>({ state: 'probing' })
  const [restoring, setRestoring] = useState(false)

  // Breathing animation for the cloud icon while probing. Runs only while
  // `probe.state === 'probing'` and stops cleanly when the state resolves.
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (Platform.OS !== 'ios' || !ICloudBridge.isAvailable()) {
        if (!cancelled) setProbe({ state: 'unavailable' })
        return
      }
      const remote = await iCloudSync.peekRemotePayload()
      if (cancelled) return
      if (!remote) {
        setProbe({ state: 'noBackup' })
      } else {
        setProbe({ state: 'found', remote })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

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

  const handleRestore = () => {
    if (probe.state !== 'found' || restoring) return
    setRestoring(true)
    // Defer the synchronous store replacement one frame so the spinner
    // actually paints before the setState cascade blocks the JS thread.
    requestAnimationFrame(() => {
      iCloudSync.replaceLocalWithRemote(probe.remote)
      // Mark onboarding complete — the user's restored publisher/profile/etc.
      // replaces the defaults they would've otherwise set in the remaining
      // steps.
      //
      // For supporters, also flip ongoing sync on and mark the choice as
      // user-set so `SupporterSyncDefault` doesn't second-guess it. The user
      // just explicitly picked "bring my data from iCloud" — keeping the two
      // sides in sync is the obvious follow-up, and requiring them to dig
      // into Settings to turn it on is friction with no upside.
      //
      // Non-supporters leave `iCloudSyncEnabled` off: ongoing sync is
      // supporter-gated, so enabling it here would be a dead write that the
      // Settings screen would refuse to expose anyway.
      //
      // Also force-set `hasCompletedProfileSetup` + `hasCompletedMapOnboarding`
      // so the main app doesn't re-prompt the user and overwrite their
      // restored name/avatar. (These sync as of the NON_SYNCABLE_PREFERENCE_KEYS
      // revision, but an older remote payload may not contain them.)
      set({
        onboardingComplete: true,
        hasCompletedProfileSetup: true,
        hasCompletedMapOnboarding: true,
        ...(canEnableICloudSync
          ? { iCloudSyncEnabled: true, iCloudSyncSetByUser: true }
          : {}),
      })

      // If the restored payload references images via iCloud markers, prompt
      // the user to also pull those photos down. Per-device consent means we
      // can't silently flip `iCloudSyncIncludeImages` on — the user must opt
      // in explicitly. See Q9 in docs/icloud-image-sync-plan.md.
      if (remoteReferencesImages(probe.remote)) {
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
    })
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
          {/* Breathing ring — only visible while probing. */}
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
            <FontAwesomeIcon
              icon={faCloud}
              size={28}
              color={theme.colors.accent}
            />
          </Animated.View>
        </View>
        <Text style={styles.stepTitle}>{i18n.t('iCloudRestoreTitle')}</Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textAlt,
            marginTop: 8,
            marginBottom: 24,
            lineHeight: 20,
          }}
        >
          {i18n.t('iCloudRestoreDescription')}
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
              {i18n.t('iCloudRestoreChecking')}
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
            <FontAwesomeIcon
              icon={faCircleExclamation}
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
              {i18n.t('iCloudRestoreUnavailable')}
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
            <FontAwesomeIcon
              icon={faCheckCircle}
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
              {i18n.t('iCloudRestoreNoBackup')}
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
              <FontAwesomeIcon
                icon={faFloppyDisk}
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
                {i18n.t('iCloudRestoreFoundTitle')}
              </Text>
              <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
                {i18n.t('iCloudRestoreFoundSummary', {
                  device:
                    probe.remote.deviceName || i18n.t('iCloudAnotherDevice'),
                  relative: moment(probe.remote.writtenAt).fromNow(),
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
                  {i18n.t('iCloudRestoreFoundSyncNote')}
                </Text>
              )}
            </View>
          </Card>
        )}
      </View>

      <View style={{ gap: 10 }}>
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
                  {i18n.t('iCloudRestoreRestoring')}
                </Text>
              </View>
            ) : (
              i18n.t(
                canEnableICloudSync
                  ? 'iCloudRestoreActionWithSync'
                  : 'iCloudRestoreAction'
              )
            )}
          </ActionButton>
        )}
        <Button
          onPress={goNext}
          style={{ alignSelf: 'center', paddingVertical: 10 }}
          disabled={restoring}
        >
          <Text
            style={{
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {probe.state === 'found'
              ? i18n.t('iCloudRestoreSkip')
              : i18n.t('continue')}
          </Text>
        </Button>
      </View>
    </Wrapper>
  )
}

export default ICloudRestore
