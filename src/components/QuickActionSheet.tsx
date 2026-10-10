import { X as XIcon } from 'lucide-react-native'
import { XStack } from 'tamagui'
import Sheet from '@/components/ui/Sheet'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import useSheetBottomInset from '@/hooks/useSheetBottomInset'
import IconButton from '@/components/ui/IconButton'
import { useEffect } from 'react'
import QuickActionMenu, {
  useQuickActionCount,
} from '@/components/QuickActionMenu'
import { refreshCurrentLocation } from '@/lib/currentLocation'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'

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
  const theme = useTheme()
  const sheetBottomInset = useSheetBottomInset()
  // Add Time and Log Trip come and go with the role and Mileage Tracking.
  const actionCount = useQuickActionCount()

  // Starts reading the location as the menu opens, so Log Visit's Nearby is
  // usually ready by the time it's picked. Never prompts.
  useEffect(() => {
    if (sheetOpen) void refreshCurrentLocation()
  }, [sheetOpen])

  return (
    <Sheet
      open={sheetOpen}
      modal
      snapPoints={[8 + 8 * actionCount]}
      onOpenChange={(o: boolean) => setSheetOpen(o)}
      dismissOnSnapToBottom
      transition='quick'
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame paddingBottom={sheetBottomInset}>
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
            <QuickActionMenu
              navigation={navigation}
              onAction={() => setSheetOpen(false)}
            />
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}
