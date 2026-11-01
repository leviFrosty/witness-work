import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { useContacts } from '@/stores/contactsStore'
import { useConversations } from '@/stores/conversationStore'
import { useServiceReport } from '@/stores/serviceReport'
import { FRESH_SETUP_PREFERENCES } from '@/lib/syncPreferencePolicy'
import { analytics } from '@/lib/analytics'
import { View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useEffect, useState } from 'react'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import ImportOptions, {
  type HostedImportType,
} from '@/features/onboarding/components/ImportOptions'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import MytimeImport from '@/features/onboarding/components/steps/MytimeImport'
import ICloudRestore from '@/features/onboarding/components/steps/iCloudRestore'
import { useScribeAvailability, useScribePaperCapture } from '@/features/scribe'
import { useBackupImport } from '@/app/sync/useBackupImport'
import { syncTransport, usesGoogleDriveSync } from '@/lib/syncTransport'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import useCloudSyncSupported from '@/hooks/useCloudSyncSupported'
import { syncKey } from '@/lib/syncCopy'

interface StepProps {
  goBack: () => void
  goNext: () => void
}

type Mode = 'choose' | 'mytime' | 'icloud'

const useHasImportedData = (): boolean => {
  const hasContacts = useContacts((s) => s.contacts.length > 0)
  const hasVisits = useConversations((s) => s.conversations.length > 0)
  const hasTimeEntries = useServiceReport((s) =>
    Object.values(s.serviceReports).some((months) =>
      Object.values(months).some((entries) => entries.length > 0)
    )
  )
  const hasDayPlans = useServiceReport((s) => s.dayPlans.length > 0)
  return hasContacts || hasVisits || hasTimeEntries || hasDayPlans
}

const PickUpWhereLeftOff = ({ goBack, goNext }: StepProps) => {
  const theme = useTheme()
  const isFocused = useIsFocused()
  const [mode, setMode] = useState<Mode>('choose')
  const toChooser = () => {
    setMode('choose')
  }

  const cloudSyncSupported = useCloudSyncSupported()
  const icloudAvailable = usesGoogleDriveSync()
    ? cloudSyncSupported
    : syncTransport().isAvailable()
  const scribe = useScribeAvailability()
  const scribeShown = scribe.status !== 'hidden'
  const paper = useScribePaperCapture()
  const paperAvailable = scribeShown && paper.available
  const { importing, importBackup, unlockSheet } = useBackupImport({
    source: 'onboarding',
  })
  const hasImportedData = useHasImportedData()

  useEffect(() => {
    if (!isFocused || mode !== 'choose') return
    analytics.capture('onboarding_import_options_viewed', {
      icloud_available: icloudAvailable,
      notes_available: scribe.status === 'available',
      paper_available: paperAvailable,
    })
  }, [icloudAvailable, scribe.status, paperAvailable, isFocused, mode])
  const restoreBackup = async () => {
    if (!(await importBackup())) return
    analytics.capture('onboarding_completed', {
      completion_method: 'backup_restore',
    })

    usePreferences.getState().set({
      onboardingComplete: true,
      onboardingStepId: null,
      hasCompletedMapOnboarding: true,
    })
    useProfile.getState().set({ hasCompletedProfileSetup: true })
  }
  const selectImport = (importType: HostedImportType) => {
    if (importType === 'backup_json') void restoreBackup()
    else setMode(importType)
  }

  if (mode === 'mytime') {
    return <MytimeImport goBack={toChooser} goNext={goNext} />
  }
  if (mode === 'icloud') {
    return <ICloudRestore goBack={toChooser} goNext={goNext} />
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
            {i18n.t('onboardingPickUp_title')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t('onboardingPickUp_description')}
          </Text>

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
            onSelect={selectImport}
          />
        </View>
      </KeyboardAwareScrollView>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginVertical: 16,
        }}
      >
        <View
          style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }}
        />
        <Text style={{ color: theme.colors.textAlt }}>{i18n.t('or')}</Text>
        <View
          style={{ flex: 1, height: 1, backgroundColor: theme.colors.border }}
        />
      </View>
      <ActionButton
        disabled={importing}
        onPress={() => {
          if (!hasImportedData)
            analytics.capture('onboarding_step_skipped', {
              step_id: 'pickUpWhereLeftOff',
            })

          usePreferences.getState().set(FRESH_SETUP_PREFERENCES)
          goNext()
        }}
      >
        {hasImportedData ? i18n.t('continue') : i18n.t('onboardingPickUp_skip')}
      </ActionButton>
    </Wrapper>
  )
}

export default PickUpWhereLeftOff
