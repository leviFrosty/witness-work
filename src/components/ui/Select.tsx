import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { StyleProp, View, ViewStyle } from 'react-native'
import SelectMenu from '@/components/ui/SelectMenu'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import { inputLayout, useInputLayout } from '@/components/ui/inputs/InputLayout'

export type SelectDataItem<T> = { label: string; value: T }
export type SelectData<T> = SelectDataItem<T>[]

export interface SelectProps<T> {
  data: T[]
  onChange: (item: T) => void
  /**
   * Currently selected value. Compared against item values via string coercion
   * so callers may pass either the raw value or its `.toString()`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
  placeholder?: string
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

const Select = <T,>({
  data,
  onChange,
  value,
  style,
  placeholder,
  accessibilityLabel,
}: SelectProps<T>) => {
  const theme = useTheme()
  const layout = useInputLayout()

  // Native menus key options by string id. Stringify both sides and map back to
  // the original item on selection so callers receive the untouched object.
  const items = data as unknown as SelectDataItem<unknown>[]
  const isSelected = (itemValue: unknown) => {
    if (itemValue === value) return true
    if (itemValue == null || value == null) return false
    return String(itemValue) === String(value)
  }
  const selectedLabel = items.find((i) => isSelected(i.value))?.label

  const menuItems = items.map((item) => ({
    id: String(item.value),
    label: item.label,
    selected: isSelected(item.value),
  }))

  return (
    <SelectMenu
      items={menuItems}
      accessibilityLabel={accessibilityLabel ?? selectedLabel ?? placeholder}
      accessibilityValue={selectedLabel ?? placeholder ?? ''}
      onSelect={(id) => {
        const item = items.find((i) => String(i.value) === id)
        if (item) onChange(item as unknown as T)
      }}
    >
      <View
        style={[
          {
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
            borderWidth: 1,
            paddingHorizontal: layout === 'drawer' ? 16 : 12,
            borderRadius: theme.numbers.borderRadiusMd,
            minHeight: inputLayout.controlMinHeight,
            gap: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
          style,
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize('md'),
            flexShrink: 1,
          }}
        >
          {selectedLabel ?? placeholder ?? ''}
        </Text>
        <LucideIcon
          icon={ChevronDownIcon}
          color={theme.colors.text}
          size={14}
        />
      </View>
    </SelectMenu>
  )
}

export default Select
