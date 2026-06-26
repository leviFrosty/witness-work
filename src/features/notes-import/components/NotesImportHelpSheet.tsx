import { Sheet } from 'tamagui'
import { View } from 'react-native'
import {
  faCircleCheck,
  faShareFromSquare,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import i18n from '@/lib/locales'
import type { TranslationKey } from '@/lib/locales'
import NotesImportDataHandling from '@/features/notes-import/components/NotesImportDataHandling'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
}

const STEP_KEYS: TranslationKey[] = [
  'notesImport_helpNotesStep1',
  'notesImport_helpNotesStep2',
  'notesImport_helpNotesStep3',
]

const INCLUDE_KEYS: TranslationKey[] = [
  'notesImport_helpInclude1',
  'notesImport_helpInclude2',
  'notesImport_helpInclude3',
  'notesImport_helpInclude4',
]

/**
 * Bottom sheet that explains how to get text out of Apple Notes and what's
 * useful to paste. Keeps the import screen itself visual — the step-by-step
 * detail lives here instead of as inline walls of text.
 */
const NotesImportHelpSheet = ({ open, setOpen }: Props) => {
  const theme = useTheme()

  const sectionTitle = (text: string) => (
    <Text
      style={{
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('lg'),
        color: theme.colors.text,
      }}
    >
      {text}
    </Text>
  )

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      dismissOnSnapToBottom
      modal
      snapPoints={[85]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <Sheet.ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40, gap: 22 }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('2xl'),
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t('notesImport_helpTitle')}
              </Text>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                  lineHeight: 20,
                }}
              >
                {i18n.t('notesImport_helpSubtitle')}
              </Text>
            </View>
            <IconButton
              noTransform
              icon={faTimes}
              size='xl'
              onPress={() => setOpen(false)}
              accessibilityLabel={i18n.t('close')}
            />
          </View>

          {/* Copy from Apple Notes — numbered steps. */}
          <View style={{ gap: 12 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <FontAwesomeIcon
                icon={faShareFromSquare}
                size={16}
                color={theme.colors.accent}
              />
              {sectionTitle(i18n.t('notesImport_helpNotesTitle'))}
            </View>
            {STEP_KEYS.map((key, i) => (
              <View
                key={key}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: theme.colors.accentTranslucent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.accent,
                      fontFamily: theme.fonts.bold,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {i + 1}
                  </Text>
                </View>
                <Text style={{ flex: 1, color: theme.colors.text }}>
                  {i18n.t(key)}
                </Text>
              </View>
            ))}
          </View>

          {/* What's helpful to include — bullet list. */}
          <View style={{ gap: 12 }}>
            {sectionTitle(i18n.t('notesImport_helpIncludeTitle'))}
            {INCLUDE_KEYS.map((key) => (
              <View
                key={key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <FontAwesomeIcon
                  icon={faCircleCheck}
                  size={15}
                  color={theme.colors.accent}
                  style={{ marginTop: 2 }}
                />
                <Text style={{ flex: 1, color: theme.colors.text }}>
                  {i18n.t(key)}
                </Text>
              </View>
            ))}
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                lineHeight: 20,
              }}
            >
              {i18n.t('notesImport_helpIncludeNote')}
            </Text>
          </View>

          <NotesImportDataHandling />

          <View style={{ gap: 10 }}>
            {sectionTitle(i18n.t('notesImport_helpUsageTitle'))}
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                lineHeight: 20,
              }}
            >
              {i18n.t('notesImport_helpUsageBody')}
            </Text>
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

export default NotesImportHelpSheet
