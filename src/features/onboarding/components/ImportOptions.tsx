import {
  ArchiveRestore as ArchiveRestoreIcon,
  Cloud as CloudIcon,
  FileInput as FileInputIcon,
  FileText as FileTextIcon,
  KeyRound as KeyRoundIcon,
  UserRoundKey as UserRoundKeyIcon,
  NotebookPen as NotebookPenIcon,
  ScanQrCode as ScanQrCodeIcon,
} from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import useLibraryImagePicker from '@/hooks/useLibraryImagePicker'
import type { TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { usesGoogleDriveSync } from '@/lib/syncTransport'
import { canReadMytimeDb } from '@/features/mytime-import/lib/readMytimeDb'
import { useScribeAvailability, useScribePaperCapture } from '@/features/scribe'
import { pickScribePaperPages } from '@/features/scribe/components/pickScribePaperPages'
import { navigateToScribe } from '@/features/scribe/components/openScribe'
import { accountKeyReplaceable } from '@/app/account/accountKey'
import ImportOptionCard from '@/features/onboarding/components/ImportOptionCard'
import usePasskeySignInAvailable from '@/features/settings/hooks/usePasskeySignInAvailable'
import type { RootStackNavigation } from '@/types/rootStack'
import UseRecoveryKeySheet from '@/features/settings/components/account/UseRecoveryKeySheet'
import { completeOnboardingFromRestore } from '@/features/settings/lib/completeOnboardingFromRestore'
import { usePreferences } from '@/stores/preferences'

export type ImportType =
  | 'notes'
  | 'paper'
  | 'mytime'
  | 'icloud'
  | 'backup_json'
  | 'other_phone'
  | 'passkey'
  | 'recovery_key'

export type HostedImportType = Extract<
  ImportType,
  'mytime' | 'icloud' | 'backup_json'
>

export const SIGN_IN_TYPES: ImportType[] = [
  'passkey',
  'other_phone',
  'recovery_key',
]
export const RESTORE_TYPES: ImportType[] = ['icloud', 'backup_json']
export const IMPORT_TYPES: ImportType[] = ['notes', 'paper', 'mytime']

interface Props {
  source: 'onboarding' | 'settings'

  cloud: {
    titleKey: TranslationKey
    descKey: TranslationKey
    disabled?: boolean
    disabledNoteKey?: TranslationKey
  } | null
  backupRestoring: boolean

  include?: ImportType[]
  onSelect: (importType: HostedImportType) => void
}

export default function ImportOptions({
  source,
  cloud,
  backupRestoring,
  onSelect,
  include,
}: Props) {
  const shows = (importType: ImportType) =>
    include ? include.includes(importType) : importType !== 'recovery_key'
  const [recovering, setRecovering] = useState(false)
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const scribe = useScribeAvailability()
  const scribeShown = scribe.status !== 'hidden'
  const paper = useScribePaperCapture()
  const paperAvailable = scribeShown && paper.available
  const library = useLibraryImagePicker('scribe_paper')
  const passkeySignIn = usePasskeySignInAvailable()

  const fromPaper = async () => {
    const paperPages = await pickScribePaperPages(library.pick)
    if (!paperPages) return
    navigateToScribe(navigation, {
      route: 'ScribeConversation',
      params: { entry: source, paperPages },
    })
  }
  const select = (importType: ImportType) => {
    analytics.capture('import_type_selected', {
      import_type:
        importType === 'icloud' && usesGoogleDriveSync()
          ? 'google_drive'
          : importType,
      source,
    })
    if (importType === 'passkey')
      navigation.navigate('Sign In With Passkey', { entry: source })
    else if (importType === 'recovery_key') setRecovering(true)
    else if (importType === 'other_phone')
      navigation.navigate('Sign In With QR Code', { entry: source })
    else if (importType === 'notes')
      navigateToScribe(navigation, {
        route: 'ScribeConversation',
        params: { entry: source, focusComposer: true },
      })
    else if (importType === 'paper') void fromPaper()
    else onSelect(importType)
  }

  return (
    <View>
      {passkeySignIn && shows('passkey') && (
        <ImportOptionCard
          icon={UserRoundKeyIcon}
          color={theme.colors.accent}
          titleKey='onboardingPickUp_passkey'
          descKey='onboardingPickUp_passkeyDesc'
          onPress={() => select('passkey')}
        />
      )}
      {accountKeyReplaceable() && shows('other_phone') && (
        <ImportOptionCard
          icon={ScanQrCodeIcon}
          color={theme.colors.accent}
          titleKey='onboardingPickUp_otherPhone'
          descKey='onboardingPickUp_otherPhoneDesc'
          onPress={() => select('other_phone')}
        />
      )}
      {accountKeyReplaceable() && shows('recovery_key') && (
        <ImportOptionCard
          icon={KeyRoundIcon}
          color={theme.colors.accent}
          titleKey='onboardingPickUp_recoveryKey'
          descKey='onboardingPickUp_recoveryKeyDesc'
          onPress={() => select('recovery_key')}
        />
      )}
      {scribeShown && shows('notes') && (
        <ImportOptionCard
          icon={FileTextIcon}
          color={theme.colors.cyan}
          titleKey='onboardingPickUp_notes'
          descKey='onboardingPickUp_notesDesc'
          disabled={scribe.status === 'offline'}
          disabledNoteKey='scribe_offlineBadge'
          onPress={() => select('notes')}
        />
      )}
      {paperAvailable && shows('paper') && (
        <ImportOptionCard
          icon={NotebookPenIcon}
          color={theme.colors.orange}
          titleKey='onboardingPickUp_paper'
          descKey='onboardingPickUp_paperDesc'
          disabled={scribe.status === 'offline'}
          disabledNoteKey='scribe_offlineBadge'
          onPress={() => select('paper')}
        />
      )}
      {canReadMytimeDb && shows('mytime') && (
        <ImportOptionCard
          icon={FileInputIcon}
          color={theme.colors.indigo}
          titleKey='onboardingPickUp_mytime'
          descKey='onboardingPickUp_mytimeDesc'
          onPress={() => select('mytime')}
        />
      )}
      {cloud && shows('icloud') && (
        <ImportOptionCard
          icon={CloudIcon}
          color={theme.colors.purple}
          titleKey={cloud.titleKey}
          descKey={cloud.descKey}
          disabled={cloud.disabled}
          disabledNoteKey={cloud.disabledNoteKey}
          onPress={() => select('icloud')}
        />
      )}
      {shows('backup_json') && (
        <ImportOptionCard
          icon={ArchiveRestoreIcon}
          color={theme.colors.teal}
          titleKey='onboardingPickUp_backup'
          descKey='onboardingPickUp_backupDesc'
          disabled={backupRestoring}
          disabledNoteKey='onboardingPickUp_backupRestoring'
          onPress={() => select('backup_json')}
        />
      )}
      {library.host}
      {shows('recovery_key') && (
        <UseRecoveryKeySheet
          open={recovering}
          onClose={() => setRecovering(false)}
          onDone={() => setRecovering(false)}
          onRestored={() => {
            if (!usePreferences.getState().onboardingComplete)
              completeOnboardingFromRestore('account_backup')
          }}
        />
      )}
    </View>
  )
}
