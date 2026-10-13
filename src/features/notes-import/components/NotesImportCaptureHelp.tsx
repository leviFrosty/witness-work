import {
  Camera as CameraIcon,
  Mic as MicIcon,
  SquarePen as SquarePenIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'

interface Props {
  voiceAvailable: boolean
  photoAvailable: boolean
  /** Ww-api reads chosen photos (Import from Paper, ADR 0025). */
  paperAvailable: boolean
}

/** Help Sheet section for the on-device capture inputs (ADR 0018). */
const NotesImportCaptureHelp = ({
  voiceAvailable,
  photoAvailable,
  paperAvailable,
}: Props) => {
  const theme = useTheme()
  if (!voiceAvailable && !photoAvailable && !paperAvailable) return null

  const cameraKey: TranslationKey | null = photoAvailable
    ? paperAvailable
      ? 'notesImport_helpCapturePhotoPaper'
      : 'notesImport_helpCapturePhoto'
    : paperAvailable
      ? 'notesImport_helpCapturePaper'
      : null

  const rows: { icon: AppIcon; key: TranslationKey }[] = [
    ...(voiceAvailable
      ? [{ icon: MicIcon, key: 'notesImport_helpCaptureVoice' as const }]
      : []),
    ...(cameraKey ? [{ icon: CameraIcon, key: cameraKey }] : []),
    {
      icon: SquarePenIcon,
      key: paperAvailable
        ? 'notesImport_helpCaptureReviewPaper'
        : 'notesImport_helpCaptureReview',
    },
  ]

  return (
    <View style={{ gap: 14 }}>
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
          color: theme.colors.text,
        }}
      >
        {i18n.t('notesImport_helpCaptureTitle')}
      </Text>
      {rows.map(({ icon, key }) => (
        <View
          key={key}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}
        >
          <LucideIcon
            icon={icon}
            size={15}
            color={theme.colors.accent}
            style={{ marginTop: 3 }}
          />
          <Text
            style={{
              flex: 1,
              color: theme.colors.text,
              fontSize: theme.fontSize('md'),
              lineHeight: 21,
            }}
          >
            {i18n.t(key)}
          </Text>
        </View>
      ))}
    </View>
  )
}

export default NotesImportCaptureHelp
