import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'

const CHIP_HEIGHT = 32

/**
 * One Saved View in the Contacts chip row, styled like the staleness chips
 * below it. A small dot marks unsaved edits to the view being shown. Long-press
 * actions live in the row (`SavedViewsBar`).
 */
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
      // The native menu host keeps the width it first measured, so a renamed
      // or newly edited chip remounts to fit its new label.
      key={`${name}:${edited}`}
      onPress={onPress}
      actions={actions}
      accessibilityLabel={
        edited ? `${name}, ${i18n.t('savedViews_edited')}` : name
      }
      pointerEffect='highlight'
      hoverRadius={CHIP_HEIGHT / 2}
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
