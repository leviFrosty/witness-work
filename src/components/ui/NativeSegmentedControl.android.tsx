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

/** Material 3 single-choice segmented buttons, seeded from the accent color. */
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

  // Material's segments can neither shrink a label nor wrap it between words,
  // so at accessibility text sizes "Month" broke into "Mont / h". The same
  // choices show as chips there, which wrap onto as many rows as they need.
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
            // The seeded `surface` tints the unselected segments; let the
            // screen's own background show through instead.
            colors={{
              inactiveContainerColor: 'transparent',
              disabledInactiveContainerColor: 'transparent',
            }}
            modifiers={
              option.testID ? [testIDModifier(option.testID)] : undefined
            }
          >
            <SegmentedButton.Label>
              {/* Long translations wrap rather than truncate. */}
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
