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
import { usePreferences } from '@/stores/preferences'
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
