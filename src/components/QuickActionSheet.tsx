import { Sheet, XStack } from 'tamagui'
import { usePreferences } from '../stores/preferences'
import { RootStackNavigation } from '../stacks/RootStack'
import { HomeTabStackNavigation } from '../stacks/HomeTabStack'
import * as Crypto from 'expo-crypto'
import XView from './layout/XView'
import { faIdCard } from '@fortawesome/free-regular-svg-icons'
import Text from './MyText'
import i18n, { TranslationKey } from '../lib/locales'
import { faClock, faTimes } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import IconButton from './IconButton'
import { View } from 'react-native'
import Button from './Button'
import { IconProp } from '@fortawesome/fontawesome-svg-core'

export type QuickActionSheetProps = {
  navigation: RootStackNavigation & HomeTabStackNavigation
  sheetOpen: boolean
  setSheetOpen: React.Dispatch<React.SetStateAction<boolean>>
}

type QuickActionOption = 'addTime' | 'addContact'

export default function QuickActionSheet({
  sheetOpen,
  setSheetOpen,
  navigation,
}: QuickActionSheetProps) {
  const { publisher } = usePreferences()
  const theme = useTheme()

  const handleQuickAction = (action: QuickActionOption): void => {
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
      snapPoints={[30]}
      onOpenChange={(o: boolean) => setSheetOpen(o)}
      dismissOnSnapToBottom
      animation='quick'
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <XStack ai='center' jc='space-between' px={20} pt={20} pb={5}>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
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
              <ActionButton
                text='addTime'
                icon={faClock}
                onPress={() => handleQuickAction('addTime')}
              />
            )}

            <ActionButton
              text='addContact'
              icon={faIdCard}
              onPress={() => handleQuickAction('addContact')}
            />
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}

function ActionButton(props: {
  onPress?: () => void
  text: TranslationKey
  icon: IconProp
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={props.onPress}
      style={{
        justifyContent: 'flex-start',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: theme.colors.accent,
        borderRadius: theme.numbers.borderRadiusSm,
      }}
    >
      <XView style={{ gap: 10 }}>
        <IconButton icon={props.icon} color={theme.colors.textInverse} />
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textInverse,
          }}
        >
          {i18n.t(props.text)}
        </Text>
      </XView>
    </Button>
  )
}
