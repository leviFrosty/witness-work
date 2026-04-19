import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { Sheet } from 'tamagui'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import Text from './MyText'
import { SelectDataItem, SelectProps } from './Select'

const SelectWheel = <T,>({
  data,
  onChange,
  value,
  style,
  placeholder,
}: SelectProps<T>) => {
  const theme = useTheme()
  const [open, setOpen] = useState(false)

  // Mirror Select.tsx: stringify both sides for matching, then map back to
  // the original item before invoking onChange so callers stay agnostic.
  const items = data as unknown as SelectDataItem<unknown>[]
  const stringValue =
    value === undefined || value === null ? undefined : String(value)
  const selectedLabel = items.find(
    (i) => String(i.value) === stringValue
  )?.label

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <View
          style={[
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
              borderWidth: 1,
              paddingHorizontal: 10,
              borderRadius: theme.numbers.borderRadiusSm,
              minHeight: 40,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
            style,
          ]}
        >
          <Text
            numberOfLines={1}
            style={{ color: theme.colors.text, fontSize: 14, flexShrink: 1 }}
          >
            {selectedLabel ?? placeholder ?? ''}
          </Text>
          <FontAwesomeIcon
            icon={faChevronDown}
            color={theme.colors.text}
            size={12}
          />
        </View>
      </Pressable>

      <Sheet
        open={open}
        modal
        snapPointsMode='fit'
        onOpenChange={setOpen}
        dismissOnSnapToBottom
        animation='quick'
      >
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Handle />
        <Sheet.Frame backgroundColor={theme.colors.background}>
          <Picker
            selectedValue={stringValue}
            onValueChange={(next) => {
              const item = items.find((i) => String(i.value) === String(next))
              if (item) onChange(item as unknown as T)
            }}
            itemStyle={{ color: theme.colors.text }}
          >
            {items.map((item) => (
              <Picker.Item
                key={String(item.value)}
                label={item.label}
                value={String(item.value)}
                color={theme.colors.text}
              />
            ))}
          </Picker>
        </Sheet.Frame>
      </Sheet>
    </>
  )
}

export default SelectWheel
