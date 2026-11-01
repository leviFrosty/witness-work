import QuidoneWheelPicker, {
  type PickerItem,
  type RenderItemContainerProps,
  type RenderOverlayProps,
  usePickerItemHeight,
  useScrollContentOffset,
} from '@quidone/react-native-wheel-picker'
import { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  type AccessibilityActionEvent,
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

  accessibilityLabel: string
  testID?: string
}

const useScreenReaderEnabled = () => {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (mounted) setEnabled(on)
    })
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setEnabled
    )
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])
  return enabled
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

            { perspective: 1000 },
          ],
        }}
      >
        {renderItem({ item, index, itemTextStyle })}
      </Animated.View>
    </TouchableWithoutFeedback>
  )
}

const WheelPicker = <T extends string | number>({
  data,
  value,
  onValueChange,
  accessibilityLabel,
  testID,
}: Props<T>) => {
  const theme = useTheme()
  const screenReader = useScreenReaderEnabled()

  const index = Math.max(
    data.findIndex((item) => item.value === value),
    0
  )
  const selected = data[index]

  const onAccessibilityAction = ({
    nativeEvent: { actionName },
  }: AccessibilityActionEvent) => {
    if (actionName !== 'increment' && actionName !== 'decrement') return
    const next = data[index + (actionName === 'increment' ? 1 : -1)]
    if (next) onValueChange(next.value)
  }

  return (
    <View>
      <View
        accessibilityElementsHidden={screenReader}
        importantForAccessibility={
          screenReader ? 'no-hide-descendants' : 'auto'
        }
      >
        <QuidoneWheelPicker
          data={data}
          value={value}
          width='100%'
          style={styles.picker}
          itemHeight={ITEM_HEIGHT}
          visibleItemCount={VISIBLE_ITEM_COUNT}
          enableScrollByTapOnItem
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
      </View>
      <View
        accessible
        accessibilityRole='adjustable'
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={
          selected && { text: selected.label ?? String(selected.value) }
        }
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        pointerEvents='none'
        style={StyleSheet.absoluteFill}
        testID={testID}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  picker: {
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
