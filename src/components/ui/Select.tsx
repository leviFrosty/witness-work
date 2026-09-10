import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { StyleProp, View, ViewStyle } from 'react-native'
import { MenuView, MenuAction } from '@react-native-menu/menu'
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

  // UIMenu keys actions by string id. Stringify both sides and map back to
  // the original item on selection so callers receive the untouched object.
  const items = data as unknown as SelectDataItem<unknown>[]
  const isSelected = (itemValue: unknown) => {
    if (itemValue === value) return true
    if (itemValue == null || value == null) return false
    return String(itemValue) === String(value)
  }
  const selectedLabel = items.find((i) => isSelected(i.value))?.label

  const actions: MenuAction[] = items.map((item) => ({
    id: String(item.value),
    title: item.label,
    state: isSelected(item.value) ? 'on' : 'off',
  }))

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const item = items.find((i) => String(i.value) === nativeEvent.event)
        if (item) onChange(item as unknown as T)
      }}
    >
      <View
        accessible
        accessibilityRole='button'
        accessibilityLabel={accessibilityLabel ?? selectedLabel ?? placeholder}
        accessibilityValue={{ text: selectedLabel ?? placeholder ?? '' }}
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
    </MenuView>
  )
}

export default Select
