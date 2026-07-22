import {
  CircleCheck as CircleCheckIcon,
  Share as ShareIcon,
  X as XIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Sheet } from 'tamagui'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import i18n from '@/lib/locales'
import type { TranslationKey } from '@/lib/locales'
import NotesImportDataHandling from '@/features/notes-import/components/NotesImportDataHandling'
import { notesImportScheduleCopy } from '@/features/notes-import/lib/notesImportScheduleCopy'
import type { NotesImportPublicSchedule } from '@/features/notes-import/lib/notesImportUsage'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  schedule: NotesImportPublicSchedule | null
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
const NotesImportHelpSheet = ({ open, setOpen, schedule }: Props) => {
  const theme = useTheme()
  const scheduleCopy = schedule ? notesImportScheduleCopy(schedule) : null

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
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
        >
          {/* Keep section rhythm on a plain View instead of relying on the
              Tamagui ScrollView to forward content-container gap styles. */}
          <View style={{ gap: 32 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 8 }}>
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
                    fontSize: theme.fontSize('md'),
                    color: theme.colors.textAlt,
                    lineHeight: 21,
                  }}
                >
                  {i18n.t('notesImport_helpSubtitle')}
                </Text>
              </View>
              <IconButton
                noTransform
                icon={XIcon}
                size='xl'
                onPress={() => setOpen(false)}
                accessibilityLabel={i18n.t('close')}
              />
            </View>

            {/* Copy from Apple Notes — numbered steps. */}
            <View style={{ gap: 14 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <LucideIcon
                  icon={ShareIcon}
                  size={16}
                  color={theme.colors.accent}
                />
                {sectionTitle(i18n.t('notesImport_helpNotesTitle'))}
              </View>
              {STEP_KEYS.map((key, i) => (
                <View
                  key={key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
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

            {/* What's helpful to include — bullet list. */}
            <View style={{ gap: 14 }}>
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
                  <LucideIcon
                    icon={CircleCheckIcon}
                    size={15}
                    color={theme.colors.accent}
                    style={{ marginTop: 2 }}
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
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('md'),
                  lineHeight: 21,
                  marginTop: 2,
                }}
              >
                {i18n.t('notesImport_helpIncludeNote')}
              </Text>
            </View>

            <NotesImportDataHandling />

            {scheduleCopy && (
              <View style={{ gap: 10 }}>
                {sectionTitle(i18n.t('notesImport_helpUsageTitle'))}
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('md'),
                    lineHeight: 21,
                  }}
                >
                  {i18n.t('notesImport_helpImportUsageBody', scheduleCopy)}
                </Text>
              </View>
            )}
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

export default NotesImportHelpSheet
