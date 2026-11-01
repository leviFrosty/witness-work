import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'

const CHIP_HEIGHT = 32

const SavedViewChip = ({
  name,
  selected,
  edited,
  onPress,
  actions,
}: {
  name: string
  selected: boolean
  edited: boolean
  onPress?: () => void
  actions: ContextMenuEntries
}) => {
  const theme = useTheme()
  const color = selected ? theme.colors.accent : theme.colors.text

  return (
    <ContextMenu
      key={`${name}:${edited}`}
      onPress={onPress}
      actions={actions}
      accessibilityLabel={
        edited ? `${name}, ${i18n.t('savedViews_edited')}` : name
      }
      pointerEffect='highlight'
      hoverRadius={CHIP_HEIGHT / 2}
      fitContent
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: CHIP_HEIGHT,
          paddingHorizontal: 12,
          borderRadius: CHIP_HEIGHT / 2,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected
            ? theme.colors.accentTranslucent
            : theme.colors.backgroundLighter,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            maxWidth: 180,
            color,
            fontFamily: selected ? theme.fonts.semiBold : theme.fonts.medium,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {name}
        </Text>
        {edited && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: color,
            }}
          />
        )}
      </View>
    </ContextMenu>
  )
}

export default SavedViewChip
