import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { StyleProp, useWindowDimensions, View, ViewStyle } from 'react-native'
import SelectMenu, { type SelectMenuItem } from '@/components/ui/SelectMenu'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import { inputLayout } from '@/components/ui/inputs/InputLayout'

export type SelectDataItem<T> = {
  label: string
  value: T

  systemImage?: SelectMenuItem['systemImage']
}
export type SelectData<T> = SelectDataItem<T>[]

export interface SelectProps<T> {
  data: T[]
  onChange: (item: T) => void

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

  const enlarged = useWindowDimensions().fontScale > 1
  const ValueText = enlarged ? WholeWordsText : Text

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
    systemImage: item.systemImage,
  }))

  return (
    <SelectMenu
      items={menuItems}
      accessibilityLabel={accessibilityLabel ?? selectedLabel ?? placeholder}
      accessibilityValue={selectedLabel ?? placeholder ?? ''}
      hoverRadius={theme.numbers.borderRadiusMd}
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
            paddingHorizontal: 12,
            borderRadius: theme.numbers.borderRadiusMd,
            minHeight: inputLayout.controlMinHeight,
            paddingVertical: enlarged ? 8 : undefined,
            gap: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
          style,
        ]}
      >
        <ValueText
          numberOfLines={enlarged ? undefined : 1}
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize('md'),
            flexShrink: 1,
          }}
        >
          {selectedLabel ?? placeholder ?? ''}
        </ValueText>
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
