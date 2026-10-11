import QuidoneWheelPicker, {
  type PickerItem,
  type RenderItemContainerProps,
  type RenderOverlayProps,
  usePickerItemHeight,
  useScrollContentOffset,
} from '@quidone/react-native-wheel-picker'
import {
  Animated,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  TouchableWithoutFeedback,
  View,
} from 'react-native'

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

/** The library's own row text. */
const WheelItem = (props: {
  value: string | number
  label?: string
  itemTextStyle: StyleProp<TextStyle>
}) => {
  const height = usePickerItemHeight()
  return (
    <Text style={[styles.item, { lineHeight: height }, props.itemTextStyle]}>
      {props.label ?? props.value}
    </Text>
  )
}

/**
 * The library's row container (its `PickerItemContainer`), plus a testID per
 * value (`<wheel testID>-<value>`) on the tappable row, the element screen
 * readers and tests see, so a test can pick a value that other numbers on
 * screen also show.
 */
const WheelItemContainer = <T extends string | number>({
  listRef,
  index,
  item,
  faces,
  renderItem,
  itemTextStyle,
  testID,
}: Omit<RenderItemContainerProps<PickerItem<T>>, 'key'> & {
  testID?: string
}) => {
  const offset = useScrollContentOffset()
  const height = usePickerItemHeight()
  const inputRange = faces.map((face) => height * (index + face.index))
  return (
    <TouchableWithoutFeedback
      testID={testID && `${testID}-${item.value}`}
      onPress={() => listRef.current?.scrollToIndex({ index, animated: true })}
    >
      <Animated.View
        style={{
          height,
          opacity: offset.interpolate({
            inputRange,
            outputRange: faces.map((face) => face.opacity),
            extrapolate: 'clamp',
          }),
          transform: [
            // translateY before rotateX, for the right transformation.
            {
              translateY: offset.interpolate({
                inputRange,
                outputRange: faces.map((face) => face.offsetY),
                extrapolate: 'extend',
              }),
            },
            {
              rotateX: offset.interpolate({
                inputRange,
                outputRange: faces.map((face) => `${face.deg}deg`),
                extrapolate: 'extend',
              }),
            },
            // Without this the rotation doesn't render on Android.
            { perspective: 1000 },
          ],
        }}
      >
        {renderItem({ item, index, itemTextStyle })}
      </Animated.View>
    </TouchableWithoutFeedback>
  )
}

/**
 * JavaScript-only wheel picker. It preserves the previous 216pt iOS wheel
 * layout without mounting UIPickerView, whose Fabric hit-testing race caused
 * Issue JW-TIME-BK.
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
      renderItem={({ item, itemTextStyle }) => (
        <WheelItem
          value={item.value}
          label={item.label}
          itemTextStyle={itemTextStyle}
        />
      )}
      renderItemContainer={({ key, ...props }) => (
        <WheelItemContainer key={key} {...props} testID={testID} />
      )}
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
  item: {
    textAlign: 'center',
    fontSize: 20,
  },
})

export default WheelPicker
