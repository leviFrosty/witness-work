import QuidoneWheelPicker, {
  type PickerItem,
  type RenderOverlayProps,
} from '@quidone/react-native-wheel-picker'
import { StyleSheet, View } from 'react-native'

import useTheme from '@/contexts/theme'

const PICKER_HEIGHT = 216
const VISIBLE_ITEM_COUNT = 5
const ITEM_HEIGHT = PICKER_HEIGHT / VISIBLE_ITEM_COUNT

interface Props<T extends string | number> {
  data: ReadonlyArray<PickerItem<T>>
  value: T
  onValueChange: (value: T) => void
  testID?: string
}

interface SelectionOverlayProps extends RenderOverlayProps {
  borderColor: string
}

const SelectionOverlay = ({
  itemHeight,
  borderColor,
}: SelectionOverlayProps) => (
  <View pointerEvents='none' style={[StyleSheet.absoluteFill, styles.overlay]}>
    <View
      style={{
        height: itemHeight,
        alignSelf: 'stretch',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor,
      }}
    />
  </View>
)

/**
 * JavaScript-only wheel picker. It preserves the previous 216pt iOS wheel
 * layout without mounting UIPickerView, whose Fabric hit-testing race caused
 * Sentry JW-TIME-BK.
 */
const WheelPicker = <T extends string | number>({
  data,
  value,
  onValueChange,
  testID,
}: Props<T>) => {
  const theme = useTheme()

  return (
    <QuidoneWheelPicker
      data={data}
      value={value}
      width='100%'
      style={styles.picker}
      itemHeight={ITEM_HEIGHT}
      visibleItemCount={VISIBLE_ITEM_COUNT}
      enableScrollByTapOnItem
      testID={testID}
      itemTextStyle={{ color: theme.colors.text, fontSize: 21 }}
      renderOverlay={(props) => (
        <SelectionOverlay {...props} borderColor={theme.colors.border} />
      )}
      onValueChanging={({ item }) => onValueChange(item.value)}
    />
  )
}

const styles = StyleSheet.create({
  picker: {
    // Quidone's transformed, tappable rows intentionally render outside its
    // ScrollView. Clip them to the wheel so their hitboxes cannot cover sheet
    // actions after the selected row moves away from the first item.
    overflow: 'hidden',
  },
  overlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
})

export default WheelPicker
