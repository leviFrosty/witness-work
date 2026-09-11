import { Plus as PlusIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import AddHistoryActions from '@/features/contacts/components/AddHistoryActions'

interface Props {
  contactId: string
  navigation: Pick<RootStackNavigation, 'navigate' | 'replace'>
  foregroundColor?: string
}

export default function AddHistoryPopover({
  contactId,
  navigation,
  foregroundColor,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const color = foregroundColor ?? theme.colors.text
  return (
    <AnchoredPopover
      contentWidth={320}
      resolvePosition={({
        anchor,
        contentWidth,
        windowWidth,
        windowHeight,
      }) => {
        const top = Math.max(
          insets.top + 12,
          Math.min(
            anchor.y + anchor.height + 8,
            windowHeight - insets.bottom - 340
          )
        )
        return {
          left: Math.max(
            12,
            Math.min(
              anchor.x + anchor.width - contentWidth,
              windowWidth - contentWidth - 12
            )
          ),
          top,
          maxHeight: windowHeight - insets.bottom - top - 12,
        }
      }}
      renderTrigger={({ onPress, anchorRef, expanded }) => (
        <View ref={anchorRef} collapsable={false}>
          <Button
            noTransform
            onPress={onPress}
            accessibilityLabel={i18n.t('addToHistory')}
            accessibilityState={{ expanded }}
            style={{
              minHeight: 44,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              borderWidth: 1,
              borderColor: color,
              borderRadius: theme.numbers.borderRadiusSm,
            }}
          >
            <IconButton icon={PlusIcon} color={color} size='sm' />
            <Text style={{ color }}>{i18n.t('add')}</Text>
          </Button>
        </View>
      )}
    >
      {({ close }) => (
        <AddHistoryActions
          contactId={contactId}
          navigation={navigation}
          embedded
          onAction={close}
        />
      )}
    </AnchoredPopover>
  )
}
