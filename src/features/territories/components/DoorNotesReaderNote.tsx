import { View } from 'react-native'
import {
  Smartphone as SmartphoneIcon,
  Sparkles as SparklesIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { NotesReader } from '@/features/territories/lib/scribeNotes'

const readerText = (reader: NotesReader) => {
  if (reader.kind === 'scribe') return i18n.t('territories.notes.readByScribe')
  const device = i18n.t('territories.notes.readOnDevice')
  if (reader.reason === 'notOffered') return device
  return `${device} ${i18n.t(
    `territories.notes.readOnDeviceReason.${reader.reason}`
  )}`
}

export function NotesReaderLine({
  scribe,
  text,
  testID,
}: {
  scribe: boolean
  text: string
  testID: string
}) {
  const theme = useTheme()
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 5,
      }}
    >
      <LucideIcon
        icon={scribe ? SparklesIcon : SmartphoneIcon}
        size={15}
        color={scribe ? theme.colors.accent : theme.colors.textAlt}
        style={{ marginTop: 2 }}
      />
      <Text
        style={{
          flex: 1,
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {text}
      </Text>
    </View>
  )
}

export default function DoorNotesReaderNote({
  reader,
}: {
  reader: NotesReader
}) {
  return (
    <NotesReaderLine
      scribe={reader.kind === 'scribe'}
      text={readerText(reader)}
      testID={`notes-reader-${reader.kind}`}
    />
  )
}
