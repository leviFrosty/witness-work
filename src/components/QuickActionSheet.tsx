import { Sheet, XStack } from 'tamagui'
import ActionButton from './ActionButton'
import { usePreferences } from '../stores/preferences'
import { RootStackNavigation } from '../stacks/RootStack'
import { HomeTabStackNavigation } from '../stacks/HomeTabStack'
import * as Crypto from 'expo-crypto'
import XView from './layout/XView'
import { faIdCard } from '@fortawesome/free-regular-svg-icons'
import Text from './MyText'
import i18n from '../lib/locales'
import { faClock, faTimes } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import IconButton from './IconButton'
import { View } from 'react-native'

export type QuickActionSheetProps = {
  navigation: RootStackNavigation & HomeTabStackNavigation
  sheetOpen: boolean
  setSheetOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export default function QuickActionSheet({
  sheetOpen,
  setSheetOpen,
  navigation,
}: QuickActionSheetProps) {
  const { publisher } = usePreferences()
  const theme = useTheme()

  const handleQuickAction = (action: 'addTime' | 'addContact') => {
    setSheetOpen(false)
    switch (action) {
      case 'addTime':
        navigation.navigate('Add Time')
        break
      case 'addContact':
        navigation.navigate('Contact Form', { id: Crypto.randomUUID() })
        break
    }
  }

  return (
    <Sheet
      open={sheetOpen}
      modal
      snapPoints={[40]}
      onOpenChange={(o: boolean) => setSheetOpen(o)}
      dismissOnSnapToBottom
      animation='quick'
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <XStack ai='center' jc='space-between' px={20} pt={20} pb={10}>
          <Text
            style={{
              fontSize: theme.fontSize('2xl'),
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('quickAction')}
          </Text>
          <IconButton
            onPress={() => setSheetOpen(false)}
            size={20}
            icon={faTimes}
            color={theme.colors.text}
          />
        </XStack>
        <Sheet.ScrollView contentContainerStyle={{ paddingTop: 10 }}>
          <View style={{ gap: 10, paddingHorizontal: 20 }}>
            {publisher !== 'publisher' && (
              <ActionButton onPress={() => handleQuickAction('addTime')}>
                <XView style={{ gap: 10 }}>
                  <IconButton icon={faClock} color={theme.colors.textInverse} />
                  <Text
                    style={{
                      fontFamily: theme.fonts.bold,
                      color: theme.colors.textInverse,
                      fontSize: theme.fontSize('lg'),
                    }}
                  >
                    {i18n.t('addTime')}
                  </Text>
                </XView>
              </ActionButton>
            )}
            <ActionButton onPress={() => handleQuickAction('addContact')}>
              <XView style={{ gap: 10 }}>
                <IconButton icon={faIdCard} color={theme.colors.textInverse} />
                <Text
                  style={{
                    fontFamily: theme.fonts.bold,
                    color: theme.colors.textInverse,
                    fontSize: theme.fontSize('lg'),
                  }}
                >
                  {i18n.t('addContact')}
                </Text>
              </XView>
            </ActionButton>
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}
