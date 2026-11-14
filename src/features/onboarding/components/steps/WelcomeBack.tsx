import { usePreferences } from '@/stores/preferences'
import { freshSetupPreferences } from '@/lib/syncPreferencePolicy'
import { analytics } from '@/lib/analytics'
import { View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useEffect, useState } from 'react'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import ImportOptions, {
  RESTORE_TYPES,
  SIGN_IN_TYPES,
  type HostedImportType,
} from '@/features/onboarding/components/ImportOptions'
import CloudSyncRestoreStatus from '@/features/onboarding/components/CloudSyncRestoreStatus'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import ICloudRestore from '@/features/onboarding/components/steps/iCloudRestore'
import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'
import { useBackupImport } from '@/app/sync/useBackupImport'
import { syncTransport, usesGoogleDriveSync } from '@/lib/syncTransport'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import useCloudSyncSupported from '@/hooks/useCloudSyncSupported'
import { syncKey } from '@/lib/syncCopy'
import { hasAccountKey } from '@/lib/serverAccount'
import { declineCloudSyncRestore } from '@/app/sync/cloudSyncRestore'
import useCloudSyncRestore from '@/features/onboarding/hooks/useCloudSyncRestore'

interface StepProps {
  goBack: () => void
  goNext: () => void
}

type Mode = 'choose' | 'icloud' | 'cloud_sync'

const useAccountKeyPresent = (active: boolean): boolean | null => {
  const [present, setPresent] = useState<boolean | null>(null)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    void hasAccountKey().then((value) => {
      if (!cancelled) setPresent(value)
    })
    return () => {
      cancelled = true
    }
  }, [active])
  return present
}

const SectionLabel = ({ children }: { children: string }) => {
  const theme = useTheme()
  return (
    <Text
      accessibilityRole='header'
      style={{
        fontSize: theme.fontSize('sm'),
        fontFamily: theme.fonts.semiBold,
        color: theme.colors.textAlt,
        marginTop: 28,
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  )
}

const WelcomeBack = ({ goBack, goNext }: StepProps) => {
  const theme = useTheme()
  const isFocused = useIsFocused()
  const [mode, setMode] = useState<Mode>('choose')
  const toChooser = () => {
    setMode('choose')
  }
  const choosing = isFocused && mode === 'choose'

  const cloudSyncSupported = useCloudSyncSupported()
  const icloudAvailable = usesGoogleDriveSync()
    ? cloudSyncSupported
    : syncTransport().isAvailable()
  const { importing, importBackup, unlockSheet } = useBackupImport({
    source: 'onboarding',
  })
  const accountKeyPresent = useAccountKeyPresent(choosing)
  const cloud = useCloudSyncRestore(choosing)
  const signedIn =
    accountKeyPresent === true && cloud.state.status !== 'no_account'
  const busy = importing || cloud.state.status === 'restoring'

  useEffect(() => {
    if (!choosing || accountKeyPresent === null) return
    analytics.capture('onboarding_welcome_back_viewed', {
      account_on_device: accountKeyPresent,
      icloud_available: icloudAvailable,
    })
  }, [choosing, accountKeyPresent, icloudAvailable])

  const restoreBackup = async () => {
    if (!(await importBackup())) return

    completeOnboardingFromRestore('backup_restore')
  }
  const selectRestore = (importType: HostedImportType) => {
    if (importType === 'backup_json') void restoreBackup()
    else if (importType === 'icloud') setMode('icloud')
  }

  if (mode === 'icloud') {
    return <ICloudRestore goBack={toChooser} goNext={goNext} />
  }
  if (mode === 'cloud_sync') {
    return <ICloudRestore provider='cloud' goBack={toChooser} goNext={goNext} />
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
      {unlockSheet}
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 30,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
          <Text
            accessibilityRole='header'
            style={[styles.stepTitle, { fontFamily: theme.fonts.bold }]}
          >
            {i18n.t('onboardingWelcomeBack_title')}
          </Text>
          {accountKeyPresent !== null && (
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.textAlt,
                marginBottom: 24,
                lineHeight: 20,
              }}
            >
              {i18n.t(
                signedIn
                  ? 'onboardingWelcomeBack_description'
                  : 'onboardingWelcomeBack_descriptionSignIn'
              )}
            </Text>
          )}

          {signedIn && (
            <CloudSyncRestoreStatus
              state={cloud.state}
              onRetry={cloud.retry}
              onRestore={(remote) => {
                if (!cloud.restore(remote)) setMode('cloud_sync')
              }}
            />
          )}
          {accountKeyPresent !== null && !signedIn && (
            <ImportOptions
              source='onboarding'
              cloud={null}
              backupRestoring={importing}
              onSelect={selectRestore}
              include={SIGN_IN_TYPES}
            />
          )}

          <SectionLabel>
            {i18n.t('onboardingWelcomeBack_otherWays')}
          </SectionLabel>
          <ImportOptions
            source='onboarding'
            cloud={
              hasSyncTransport()
                ? {
                    titleKey: syncKey('onboardingPickUp_icloud'),
                    descKey: syncKey('onboardingPickUp_icloudDesc'),
                    disabled: !icloudAvailable,
                    disabledNoteKey: syncKey(
                      'onboardingPickUp_icloudUnavailable'
                    ),
                  }
                : null
            }
            backupRestoring={importing}
            onSelect={selectRestore}
            include={RESTORE_TYPES}
          />
        </View>
      </KeyboardAwareScrollView>

      <Button
        disabled={busy}
        onPress={() => {
          analytics.capture('onboarding_step_skipped', {
            step_id: 'pickUpWhereLeftOff',
          })
          declineCloudSyncRestore()
          usePreferences
            .getState()
            .set(freshSetupPreferences(usePreferences.getState()))
          goNext()
        }}
        style={{
          alignSelf: 'center',
          minHeight: 44,
          justifyContent: 'center',
          paddingHorizontal: 16,
          marginTop: 12,
        }}
      >
        <Text
          style={{
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            textDecorationLine: 'underline',
          }}
        >
          {i18n.t('onboardingWelcomeBack_new')}
        </Text>
      </Button>
    </Wrapper>
  )
}

export default WelcomeBack
