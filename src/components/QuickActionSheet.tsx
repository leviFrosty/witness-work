import {
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  IdCard as IdCardIcon,
  X as XIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { Sheet, XStack } from 'tamagui'
import usePublisher from '@/hooks/usePublisher'
import * as Crypto from 'expo-crypto'
import XView from '@/components/ui/layout/XView'
import Text from '@/components/ui/MyText'
import i18n, { TranslationKey } from '@/lib/locales'
import useTheme from '@/contexts/theme'
import IconButton from '@/components/ui/IconButton'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'

export type QuickActionSheetProps = {
  navigation: RootStackNavigation & HomeTabStackNavigation
  sheetOpen: boolean
  setSheetOpen: React.Dispatch<React.SetStateAction<boolean>>
}

type QuickActionOption = 'addTime' | 'addContact' | 'addPlan'

export default function QuickActionSheet({
  sheetOpen,
  setSheetOpen,
  navigation,
}: QuickActionSheetProps) {
  const { showsTimer } = usePublisher()
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
      case 'addPlan':
        navigation.navigate('PlanDay', {})
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
            noTransform
            onPress={() => setSheetOpen(false)}
            size={20}
            icon={XIcon}
            color={theme.colors.text}
          />
        </XStack>
        <Sheet.ScrollView contentContainerStyle={{ paddingTop: 10 }}>
          <View style={{ gap: 10, paddingHorizontal: 20 }}>
            {showsTimer && (
              <>
                <ActionButton
                  text='addTime'
                  icon={ClockIcon}
                  onPress={() => handleQuickAction('addTime')}
                />
              </>
            )}
            <ActionButton
              text='createPlan'
              icon={CalendarIcon}
              onPress={() => handleQuickAction('addPlan')}
            />
            <ActionButton
              text='addContact'
              icon={IdCardIcon}
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
  icon: AppIcon
}) {
  const theme = useTheme()
  return (
    <Button
      noTransform
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
