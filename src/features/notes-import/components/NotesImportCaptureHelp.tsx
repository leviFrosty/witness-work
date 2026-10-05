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
}

/** Help Sheet section for the on-device capture inputs (ADR 0018). */
const NotesImportCaptureHelp = ({ voiceAvailable, photoAvailable }: Props) => {
  const theme = useTheme()
  if (!voiceAvailable && !photoAvailable) return null

  const rows: { icon: AppIcon; key: TranslationKey }[] = [
    ...(voiceAvailable
      ? [{ icon: MicIcon, key: 'notesImport_helpCaptureVoice' as const }]
      : []),
    ...(photoAvailable
      ? [{ icon: CameraIcon, key: 'notesImport_helpCapturePhoto' as const }]
      : []),
    { icon: SquarePenIcon, key: 'notesImport_helpCaptureReview' },
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
