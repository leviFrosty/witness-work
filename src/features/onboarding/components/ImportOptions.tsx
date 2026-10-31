import {
  ArchiveRestore as ArchiveRestoreIcon,
  Cloud as CloudIcon,
  FileInput as FileInputIcon,
  FileText as FileTextIcon,
  NotebookPen as NotebookPenIcon,
  ScanQrCode as ScanQrCodeIcon,
} from 'lucide-react-native'
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
import type { RootStackNavigation } from '@/types/rootStack'

export type ImportType =
  | 'notes'
  | 'paper'
  | 'mytime'
  | 'icloud'
  | 'backup_json'
  | 'other_phone'

/** The options whose destination depends on where the chooser is shown. */
export type HostedImportType = Extract<
  ImportType,
  'mytime' | 'icloud' | 'backup_json'
>

interface Props {
  source: 'onboarding' | 'settings'
  /** The sync option's copy and state, or null to leave it out. */
  cloud: {
    titleKey: TranslationKey
    descKey: TranslationKey
    disabled?: boolean
    disabledNoteKey?: TranslationKey
  } | null
  backupRestoring: boolean
  onSelect: (importType: HostedImportType) => void
}

/**
 * The places data can come in from: another phone, Notes and Paper (both read
 * by Scribe AI), MyTime, the device's sync, and a backup file. Onboarding's
 * "Pick up where you left off" and Settings → Import Data both list them.
 * Another phone, Notes and Paper open the same screens from either; the rest go
 * where the opener sends them.
 */
export default function ImportOptions({
  source,
  cloud,
  backupRestoring,
  onSelect,
}: Props) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const scribe = useScribeAvailability()
  const scribeShown = scribe.status !== 'hidden'
  const paper = useScribePaperCapture()
  const paperAvailable = scribeShown && paper.available
  const library = useLibraryImagePicker('scribe_paper')

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
    if (importType === 'other_phone')
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
      {accountKeyReplaceable() && (
        <ImportOptionCard
          icon={ScanQrCodeIcon}
          color={theme.colors.accent}
          titleKey='onboardingPickUp_otherPhone'
          descKey='onboardingPickUp_otherPhoneDesc'
          onPress={() => select('other_phone')}
        />
      )}
      {scribeShown && (
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
      {paperAvailable && (
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
      {canReadMytimeDb && (
        <ImportOptionCard
          icon={FileInputIcon}
          color={theme.colors.indigo}
          titleKey='onboardingPickUp_mytime'
          descKey='onboardingPickUp_mytimeDesc'
          onPress={() => select('mytime')}
        />
      )}
      {cloud && (
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
      <ImportOptionCard
        icon={ArchiveRestoreIcon}
        color={theme.colors.teal}
        titleKey='onboardingPickUp_backup'
        descKey='onboardingPickUp_backupDesc'
        disabled={backupRestoring}
        disabledNoteKey='onboardingPickUp_backupRestoring'
        onPress={() => select('backup_json')}
      />
      {library.host}
    </View>
  )
}
