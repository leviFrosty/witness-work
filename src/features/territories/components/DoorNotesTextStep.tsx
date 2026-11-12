import { Platform, View } from 'react-native'
import { ScanText as ScanTextIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import DoorNotesReaderNote, {
  NotesReaderLine,
} from '@/features/territories/components/DoorNotesReaderNote'
import TerritoryPill from '@/features/territories/components/TerritoryPill'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import type { NotesReader } from '@/features/territories/lib/scribeNotes'

const PASTE_HINT = Platform.select({
  ios: 'territories.notes.scanHintPhoto',
  android: 'territories.notes.scanHintAndroid',
  web: null,
} as const)

export default function DoorNotesTextStep({
  text,
  onChangeText,
  forStreet,
  scribe,
  nothingRead,
  reading,
  canScan,
  onScan,
  onRead,
}: {
  text: string
  onChangeText: (text: string) => void
  forStreet: boolean
  scribe: boolean
  nothingRead: NotesReader | null
  reading: boolean
  canScan: boolean
  onScan: () => void
  onRead: () => void
}) {
  const theme = useTheme()
  const pasteHint =
    !canScan && hasCapability('camera') && PASTE_HINT ? PASTE_HINT : null

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <TerritorySectionTitle
          info={i18n.t(
            scribe
              ? 'territories.notes.notes_infoScribe'
              : 'territories.notes.notes_info'
          )}
        >
          {i18n.t('territories.notes.notesLabel')}
        </TerritorySectionTitle>
        <View
          style={{
            borderRadius: inputLayout.sectionRadius,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.backgroundLighter,
            paddingHorizontal: 6,
            paddingVertical: 8,
          }}
        >
          <TextInput
            multiline
            value={text}
            onChangeText={onChangeText}
            placeholder={i18n.t(
              forStreet
                ? 'territories.notes.placeholderStreet'
                : 'territories.notes.placeholder'
            )}
            accessibilityLabel={i18n.t('territories.notes.notesLabel')}
            autoCapitalize='none'
            autoCorrect={false}
            spellCheck={false}
            textAlign='start'
            textAlignVertical='top'
            scrollEnabled={false}
            testID='notes-text'
            style={{
              minHeight: 220,
              fontSize: theme.fontSize('md'),
              lineHeight: 24,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: 'transparent',
            }}
          />
        </View>
        {canScan && (
          <TerritoryPill
            icon={ScanTextIcon}
            label={i18n.t('territories.notes.scanNotes')}
            onPress={onScan}
            testID='notes-scan'
          />
        )}
        <Text
          testID='notes-format-hint'
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            paddingHorizontal: 5,
          }}
        >
          {i18n.t('territories.notes.formatHint')}
        </Text>
        {pasteHint && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              paddingHorizontal: 5,
            }}
          >
            <LucideIcon
              icon={ScanTextIcon}
              size={16}
              color={theme.colors.textAlt}
              style={{ marginTop: 2 }}
            />
            <Text
              testID='notes-scan-hint'
              style={{
                flex: 1,
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t(pasteHint)}
            </Text>
          </View>
        )}
      </View>
      {nothingRead && (
        <View style={{ gap: 6 }}>
          <Text
            testID='notes-nothing-read'
            style={{ color: theme.colors.error, paddingHorizontal: 5 }}
          >
            {i18n.t('territories.notes.nothingRead')}
          </Text>
          <DoorNotesReaderNote reader={nothingRead} />
        </View>
      )}
      {scribe && !nothingRead && (
        <NotesReaderLine
          scribe
          text={i18n.t('territories.notes.scribeReads')}
          testID='notes-scribe-line'
        />
      )}
      <ActionButton
        disabled={!text.trim() || reading}
        loading={reading}
        onPress={onRead}
        testID='notes-read'
      >
        {i18n.t(
          scribe ? 'territories.notes.readWithScribe' : 'territories.notes.read'
        )}
      </ActionButton>
    </View>
  )
}
