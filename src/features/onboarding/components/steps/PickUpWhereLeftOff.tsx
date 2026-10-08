import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { FRESH_SETUP_PREFERENCES } from '@/lib/syncPreferencePolicy'
import { useNotesImportEnabled } from '@/hooks/useNotesImportEnabled'
import { analytics } from '@/lib/analytics'
import {
  ArchiveRestore as ArchiveRestoreIcon,
  Cloud as CloudIcon,
  FileInput as FileInputIcon,
  FileText as FileTextIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Wrapper from '@/components/ui/layout/Wrapper'
import Button from '@/components/ui/Button'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import MytimeImport from '@/features/onboarding/components/steps/MytimeImport'
import ICloudRestore from '@/features/onboarding/components/steps/iCloudRestore'
import { useNotesImportAvailability } from '@/features/notes-import/hooks/useNotesImportAvailability'
import { useBackupImport } from '@/hooks/useBackupImport'
import type { RootStackNavigation } from '@/types/rootStack'
import { syncTransport, usesGoogleDriveSync } from '@/lib/syncTransport'
import { hasSyncTransport } from '@/lib/syncTransport/platform'
import useCloudSyncSupported from '@/hooks/useCloudSyncSupported'
import { syncKey } from '@/lib/syncCopy'

interface StepProps {
  goBack: () => void
  goNext: () => void
}

type Mode = 'choose' | 'mytime' | 'icloud'

const OptionCard = ({
  icon,
  color,
  titleKey,
  descKey,
  disabled,
  disabledNoteKey,
  onPress,
}: {
  icon: AppIcon
  color: string
  titleKey: TranslationKey
  descKey: TranslationKey
  disabled?: boolean
  disabledNoteKey?: TranslationKey
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      noTransform
      style={{ marginBottom: 10, opacity: disabled ? 0.5 : 1 }}
    >
      <Card
        flexDirection='row'
        style={{ alignItems: 'center', gap: 14, paddingVertical: 14 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: color,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <LucideIcon icon={icon} size={18} color={theme.colors.textInverse} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t(titleKey)}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t(disabled && disabledNoteKey ? disabledNoteKey : descKey)}
          </Text>
        </View>
      </Card>
    </Button>
  )
}

/**
 * Onboarding "Pick up where you left off" chooser — replaces the separate
 * iCloud-restore and MyTime-import steps with one fork into Notes / MyTime /
 * iCloud / a backup file (decision 9). MyTime + iCloud reuse their existing
 * step components inline; iCloud is grayed when the device has no iCloud. The
 * Notes option navigates to the shared NotesImportComposer screen — the same
 * surface as Settings, not a one-off — whose import persists and resumes, so
 * the user can leave and come back; backing out returns here to keep going.
 * MyTime returns to the flow (`goNext`); iCloud restore completes onboarding on
 * its own. A backup file restores in place via the same flow as Settings →
 * Backup and, like iCloud, completes onboarding — the backup carries the
 * profile and preferences the remaining steps would set. "Start fresh" is the
 * primary action: most users have nothing to bring over.
 */
const PickUpWhereLeftOff = ({ goBack, goNext }: StepProps) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const isFocused = useIsFocused()
  const [mode, setMode] = useState<Mode>('choose')
  const toChooser = () => {
    setMode('choose')
  }
  // iOS needs iCloud signed in. Android connects Google Drive inside the
  // restore step, so it only needs Google Play services.
  const cloudSyncSupported = useCloudSyncSupported()
  const icloudAvailable = usesGoogleDriveSync()
    ? cloudSyncSupported
    : syncTransport().isAvailable()
  const notesImportEnabled = useNotesImportEnabled()
  const notesImport = useNotesImportAvailability()
  const { importing, importBackup } = useBackupImport({ source: 'onboarding' })

  useEffect(() => {
    if (!isFocused || mode !== 'choose') return
    analytics.capture('onboarding_import_options_viewed', {
      icloud_available: icloudAvailable,
      notes_available: notesImport.available,
    })
  }, [icloudAvailable, notesImport.available, isFocused, mode])
  const restoreBackup = async () => {
    if (!(await importBackup())) return
    analytics.capture('onboarding_completed', {
      completion_method: 'backup_restore',
    })
    // Same as iCloud restore: the restored profile replaces the remaining
    // steps, so don't re-prompt for profile or map setup afterwards.
    usePreferences.getState().set({
      onboardingComplete: true,
      onboardingStepId: null,
      hasCompletedMapOnboarding: true,
    })
    useProfile.getState().set({ hasCompletedProfileSetup: true })
  }
  const selectImport = (
    importType: 'notes' | 'mytime' | 'icloud' | 'backup_json'
  ) => {
    analytics.capture('import_type_selected', {
      import_type:
        importType === 'icloud' && usesGoogleDriveSync()
          ? 'google_drive'
          : importType,
      source: 'onboarding',
    })
    if (importType === 'notes')
      navigation.navigate('NotesImportComposer', { fromOnboarding: true })
    else if (importType === 'backup_json') void restoreBackup()
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
          <Text style={styles.stepTitle}>
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

          {notesImportEnabled && (
            <OptionCard
              icon={FileTextIcon}
              color={theme.colors.cyan}
              titleKey='onboardingPickUp_notes'
              descKey='onboardingPickUp_notesDesc'
              disabled={!notesImport.available}
              disabledNoteKey='notesImport_unavailable'
              onPress={() => selectImport('notes')}
            />
          )}
          <OptionCard
            icon={FileInputIcon}
            color={theme.colors.indigo}
            titleKey='onboardingPickUp_mytime'
            descKey='onboardingPickUp_mytimeDesc'
            onPress={() => selectImport('mytime')}
          />
          {hasSyncTransport() && (
            <OptionCard
              icon={CloudIcon}
              color={theme.colors.purple}
              titleKey={syncKey('onboardingPickUp_icloud')}
              descKey={syncKey('onboardingPickUp_icloudDesc')}
              disabled={!icloudAvailable}
              disabledNoteKey={syncKey('onboardingPickUp_icloudUnavailable')}
              onPress={() => selectImport('icloud')}
            />
          )}
          <OptionCard
            icon={ArchiveRestoreIcon}
            color={theme.colors.teal}
            titleKey='onboardingPickUp_backup'
            descKey='onboardingPickUp_backupDesc'
            disabled={importing}
            disabledNoteKey='onboardingPickUp_backupRestoring'
            onPress={() => selectImport('backup_json')}
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
          analytics.capture('onboarding_step_skipped', {
            step_id: 'pickUpWhereLeftOff',
          })
          usePreferences.getState().set(FRESH_SETUP_PREFERENCES)
          goNext()
        }}
      >
        {i18n.t('onboardingPickUp_skip')}
      </ActionButton>
    </Wrapper>
  )
}

export default PickUpWhereLeftOff
