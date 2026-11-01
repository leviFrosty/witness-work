import { Host } from '@expo/ui'
import {
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose'
import {
  fillMaxWidth,
  testID as testIDModifier,
} from '@expo/ui/jetpack-compose/modifiers'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { usePreferences } from '@/stores/preferences'
import ChoiceChips from '@/components/ui/ChoiceChips'
import type { NativeSegmentedControlProps } from '@/components/ui/NativeSegmentedControl.types'

export default function NativeSegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  style,
  testID,
}: NativeSegmentedControlProps<T>) {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const largeText = useAccessibilityTextSize()

  if (largeText && !disabled) {
    return (
      <ChoiceChips
        options={options}
        value={value}
        onChange={onChange}
        style={style}
        testID={testID}
      />
    )
  }

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={colorScheme}
      seedColor={theme.colors.accent}
      style={style}
    >
      <SingleChoiceSegmentedButtonRow
        modifiers={[
          fillMaxWidth(),
          ...(testID ? [testIDModifier(testID)] : []),
        ]}
      >
        {options.map((option) => (
          <SegmentedButton
            key={option.key}
            selected={option.key === value}
            onClick={() => onChange(option.key)}
            enabled={!disabled}
            colors={{
              inactiveContainerColor: 'transparent',
              disabledInactiveContainerColor: 'transparent',
            }}
            modifiers={
              option.testID ? [testIDModifier(option.testID)] : undefined
            }
          >
            <SegmentedButton.Label>
              {}
              <Text maxLines={2} style={{ textAlign: 'center' }}>
                {option.label}
              </Text>
            </SegmentedButton.Label>
          </SegmentedButton>
        ))}
      </SingleChoiceSegmentedButtonRow>
    </Host>
  )
}
