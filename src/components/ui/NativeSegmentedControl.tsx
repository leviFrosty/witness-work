import { Pressable, Text, View } from 'react-native'
import type { NativeSegmentedControlProps } from '@/components/ui/NativeSegmentedControl.types'

export default function NativeSegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  style,
  testID,
}: NativeSegmentedControlProps<T>) {
  return (
    <View
      accessibilityRole='radiogroup'
      testID={testID}
      style={[{ flexDirection: 'row' }, style]}
    >
      {options.map((option) => (
        <Pressable
          key={option.key}
          onPress={() => onChange(option.key)}
          disabled={disabled}
          accessibilityRole='radio'
          accessibilityState={{ checked: option.key === value, disabled }}
          testID={option.testID}
          style={{ flex: 1, alignItems: 'center', padding: 8 }}
        >
          <Text>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}
