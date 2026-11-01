import { Host } from '@expo/ui'
import { Picker, Text } from '@expo/ui/swift-ui'
import {
  disabled as disabledModifier,
  pickerStyle,
  tag,
  type ModifierConfig,
} from '@expo/ui/swift-ui/modifiers'
import { usePreferences } from '@/stores/preferences'
import type { NativeSegmentedControlProps } from '@/components/ui/NativeSegmentedControl.types'

export default function NativeSegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  style,
  testID,
}: NativeSegmentedControlProps<T>) {
  const colorScheme = usePreferences((s) => s.colorScheme)

  const selection = options.findIndex((option) => option.key === value)
  const modifiers: ModifierConfig[] = [pickerStyle('segmented')]
  if (disabled) modifiers.push(disabledModifier())

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={colorScheme}
      ignoreSafeArea='all'
      style={style}
    >
      <Picker
        selection={selection}
        onSelectionChange={(index: number) => {
          const option = options[index]
          if (option) onChange(option.key)
        }}
        modifiers={modifiers}
        testID={testID}
      >
        {options.map((option, index) => (
          <Text
            key={option.key}
            testID={option.testID}
            modifiers={[tag(index)]}
          >
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  )
}
