import { X as XIcon } from 'lucide-react-native'
import React from 'react'
import { View } from 'react-native'
import { Sheet, XStack } from 'tamagui'
import { Contact } from '@/types/contact'
import useTheme from '@/contexts/theme'
import useSheetBottomInset from '@/hooks/useSheetBottomInset'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import { usePreferences } from '@/stores/preferences'
import moment from 'moment'
import { formatDate } from '@/lib/dates'
import useDismissContact, {
  type DismissOption,
  dismissOptions,
  testDismissOptions,
} from '@/hooks/useDismissContact'

interface DismissContactSheetProps {
  open: boolean
  setOpen: (open: boolean) => void
  contact: Contact | null
}

/**
 * Dismiss durations with a worked example of when the contact comes back — the
 * row's swipe-left destination. Menus offer the same durations as a Dismiss For
 * ▸ submenu. Dismissing is reversible, so a choice applies immediately.
 */
const DismissContactSheet: React.FC<DismissContactSheetProps> = ({
  open,
  setOpen,
  contact,
}) => {
  const theme = useTheme()
  const sheetBottomInset = useSheetBottomInset()
  const developerTools = usePreferences((s) => s.developerTools)
  const dismiss = useDismissContact()

  const handleDismiss = (option: DismissOption) => {
    if (!contact) return
    setOpen(false)
    void dismiss(contact, option)
  }

  return (
    <Sheet
      open={open}
      modal
      snapPoints={[80]}
      onOpenChange={setOpen}
      dismissOnSnapToBottom
      transition='quick'
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame paddingBottom={sheetBottomInset}>
        <XStack ai='center' jc='space-between' px={20} pt={20} pb={10}>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('dismissForLater')}
          </Text>
          <IconButton
            noTransform
            onPress={() => setOpen(false)}
            size={20}
            icon={XIcon}
            color={theme.colors.text}
          />
        </XStack>

        <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {contact && i18n.t('dismissContactHelp', { name: contact.name })}
          </Text>
        </View>

        <Sheet.ScrollView
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 75 }}
        >
          <View style={{ gap: 10, paddingHorizontal: 20, paddingBottom: 30 }}>
            {developerTools && (
              <>
                <View style={{ marginBottom: 10 }}>
                  <Text
                    style={{
                      fontSize: theme.fontSize('xs'),
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.textAlt,
                      textAlign: 'center',
                    }}
                  >
                    🧪 Developer Test Options
                  </Text>
                </View>
                {testDismissOptions.map((option) => {
                  const exampleDate = moment()
                    .add(option.duration, option.unit)
                    .format('LTS')

                  return (
                    <Button
                      noTransform
                      key={option.key}
                      onPress={() => handleDismiss(option)}
                      style={{
                        paddingVertical: 16,
                        paddingHorizontal: 20,
                        borderRadius: theme.numbers.borderRadiusSm,
                        borderColor: theme.colors.accent,
                        borderWidth: 2,
                        backgroundColor: theme.colors.accentTranslucent,
                      }}
                    >
                      <View style={{ gap: 4 }}>
                        <Text
                          style={{
                            fontSize: theme.fontSize('md'),
                            fontFamily: theme.fonts.semiBold,
                            color: theme.colors.accent,
                          }}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={{
                            fontSize: theme.fontSize('xs'),
                            color: theme.colors.textAlt,
                          }}
                        >
                          {option.example.replace('{date}', exampleDate)}
                        </Text>
                      </View>
                    </Button>
                  )
                })}
                <View style={{ height: 20 }} />
              </>
            )}
            {dismissOptions.map((option) => {
              const exampleDate = formatDate(
                moment().add(option.duration, option.unit),
                { style: 'medium' }
              )

              return (
                <Button
                  noTransform
                  key={option.key}
                  onPress={() => handleDismiss(option)}
                  style={{
                    paddingVertical: 16,
                    paddingHorizontal: 20,
                    borderRadius: theme.numbers.borderRadiusSm,
                    borderColor: theme.colors.border,
                    borderWidth: 1,
                    backgroundColor: theme.colors.backgroundLighter,
                  }}
                >
                  <View style={{ gap: 4 }}>
                    <Text
                      style={{
                        fontSize: theme.fontSize('md'),
                        fontFamily: theme.fonts.semiBold,
                        color: theme.colors.text,
                      }}
                    >
                      {option.isTestOption
                        ? option.label
                        : i18n.t(option.label as 'dismissFor1Week')}
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        color: theme.colors.textAlt,
                      }}
                    >
                      {option.isTestOption
                        ? option.example.replace('{date}', exampleDate)
                        : i18n.t(option.example as 'dismissExample', {
                            date: exampleDate,
                          })}
                    </Text>
                  </View>
                </Button>
              )
            })}
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

export default DismissContactSheet
