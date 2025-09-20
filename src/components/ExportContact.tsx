import { Sheet } from 'tamagui'
import Button from '../components/Button'
import * as Clipboard from 'expo-clipboard'
import { Share, View } from 'react-native'
import IconButton from './IconButton'
import i18n from '../lib/locales'
import Text from './MyText'
import {
  faArrowUpFromBracket,
  faCopy,
  faTimes,
  faEye,
  faEyeSlash,
} from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import Haptics from '../lib/haptics'
import { useCallback, useState, useMemo } from 'react'
import useTheme from '../contexts/theme'
import useConversations from '../stores/conversationStore'
import { Contact } from '../types/contact'
import { Conversation } from '../types/conversation'
import * as FileSystem from 'expo-file-system'

export type ExportContactState = {
  open: boolean
  contact: Contact | undefined
}

interface ExportContactProps {
  sheet: ExportContactState
  setSheet: React.Dispatch<React.SetStateAction<ExportContactState>>
}

type ContactExport = {
  version: '1.0'
  type: 'witnesswork-contact'
  exportedAt: string
  contact: Contact
  conversations?: Conversation[]
}

const ExportContact = ({ sheet, setSheet }: ExportContactProps) => {
  const theme = useTheme()
  const { conversations } = useConversations()
  const { contact } = sheet
  const [includeConversations, setIncludeConversations] = useState(true)

  const contactConversations = useMemo(
    () =>
      contact
        ? conversations.filter(({ contact: { id } }) => id === contact.id)
        : [],
    [contact, conversations]
  )

  const generateExportData = useCallback(() => {
    if (!contact) return null

    const exportData: ContactExport = {
      version: '1.0',
      type: 'witnesswork-contact',
      exportedAt: moment().toISOString(),
      contact,
    }

    if (includeConversations && contactConversations.length > 0) {
      exportData.conversations = contactConversations.sort((a, b) =>
        moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
      )
    }

    return exportData
  }, [contact, contactConversations, includeConversations])

  const generateFileName = useCallback(() => {
    if (!contact) return 'contact.json'
    const sanitizedName = contact.name.replace(/[^a-zA-Z0-9]/g, '_')
    const timestamp = moment().format('YYYY-MM-DD')
    return `${sanitizedName}_${timestamp}.json`
  }, [contact])

  const handleAction = useCallback(
    async (action: 'copy' | 'share') => {
      const exportData = generateExportData()
      if (!exportData) return

      const jsonString = JSON.stringify(exportData, null, 2)

      switch (action) {
        case 'copy': {
          Haptics.success()
          await Clipboard.setStringAsync(jsonString)
          break
        }

        case 'share': {
          // Create temporary file for sharing
          const fileName = generateFileName()
          const fileUri = `${FileSystem.documentDirectory}${fileName}`

          try {
            await FileSystem.writeAsStringAsync(fileUri, jsonString)
            await Share.share({
              url: fileUri,
              title: i18n.t('exportContact'),
            })
            // Clean up temporary file
            await FileSystem.deleteAsync(fileUri, { idempotent: true })
          } catch (error) {
            console.error('Error sharing contact:', error)
            // Fallback to sharing JSON as text
            await Share.share({ message: jsonString })
          }
          break
        }
      }

      setSheet({ open: false, contact: undefined })
    },
    [generateExportData, generateFileName, setSheet]
  )

  if (!contact) {
    return null
  }

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(o: boolean) => setSheet({ ...sheet, open: o })}
      dismissOnSnapToBottom
      modal
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View style={{ padding: 30, gap: 15 }}>
          <View style={{ marginBottom: 20 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t('exportContact')} - {contact.name}
              </Text>

              <IconButton
                icon={faTimes}
                size='xl'
                onPress={() => setSheet({ open: false, contact: undefined })}
              />
            </View>
          </View>

          {contactConversations.length > 0 && (
            <View style={{ gap: 15 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t('options')}
              </Text>
              <Button
                onPress={() => setIncludeConversations(!includeConversations)}
                variant='outline'
                style={{
                  backgroundColor: includeConversations
                    ? theme.colors.accent3
                    : theme.colors.card,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <IconButton
                    icon={includeConversations ? faEye : faEyeSlash}
                    iconStyle={{
                      color: includeConversations
                        ? theme.colors.text
                        : theme.colors.textAlt,
                    }}
                  />
                  <Text style={{ color: theme.colors.text }}>
                    {includeConversations
                      ? i18n.t('includeConversationHistory')
                      : i18n.t('excludeConversationHistory')}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    ({contactConversations.length} {i18n.t('conversations')})
                  </Text>
                </View>
              </Button>
            </View>
          )}

          <View style={{ gap: 5 }}>
            <Button
              onPress={() => handleAction('copy')}
              variant='solid'
              style={{ backgroundColor: theme.colors.card }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <IconButton icon={faCopy} />
                <Text style={{ color: theme.colors.text }}>
                  {i18n.t('copyToClipboard')}
                </Text>
              </View>
            </Button>

            <Button
              onPress={() => handleAction('share')}
              variant='solid'
              style={{ backgroundColor: theme.colors.accent }}
            >
              <View
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
              >
                <IconButton
                  icon={faArrowUpFromBracket}
                  iconStyle={{ color: theme.colors.textInverse }}
                />
                <Text style={{ color: theme.colors.textInverse }}>
                  {i18n.t('shareContact')}
                </Text>
              </View>
            </Button>
          </View>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default ExportContact
