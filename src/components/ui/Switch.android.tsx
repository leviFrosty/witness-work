import { View } from 'react-native'
import { Host } from '@expo/ui'
import { Switch as ComposeSwitch } from '@expo/ui/jetpack-compose'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import type { SwitchProps } from '@/components/ui/Switch'

/** Material 3 switch, tinted with the app's accent color. */
export default function Switch({
  value = false,
  onValueChange,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  accessible,
  testID,
}: SwitchProps) {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  // A switch without a handler only mirrors its row's state, so taps and
  // TalkBack focus belong to the row that wraps it.
  const interactive = !!onValueChange && accessible !== false

  return (
    // Compose puts a label on a different node than the toggle, so TalkBack
    // reads the switch from this view and skips the Compose tree.
    <View
      testID={testID}
      pointerEvents={interactive ? 'auto' : 'none'}
      accessible={interactive}
      importantForAccessibility={interactive ? 'yes' : 'no-hide-descendants'}
      accessibilityRole='switch'
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => {
        if (!disabled) onValueChange?.(!value)
      }}
    >
      <Host
        matchContents
        colorScheme={colorScheme}
        importantForAccessibility='no-hide-descendants'
      >
        <ComposeSwitch
          value={value}
          enabled={!disabled}
          onCheckedChange={(checked) => onValueChange?.(checked)}
          colors={{
            checkedTrackColor: theme.colors.accent,
            checkedThumbColor: theme.colors.textInverse,
            checkedBorderColor: 'transparent',
            uncheckedTrackColor: theme.colors.border,
            uncheckedThumbColor: theme.colors.textAlt,
            uncheckedBorderColor: theme.colors.textAlt,
            // Material fades disabled parts to 38%.
            disabledCheckedTrackColor: `${theme.colors.accent}61`,
            disabledCheckedThumbColor: theme.colors.textInverse,
            disabledCheckedBorderColor: 'transparent',
            disabledUncheckedTrackColor: theme.colors.border,
            disabledUncheckedThumbColor: `${theme.colors.textAlt}61`,
            disabledUncheckedBorderColor: `${theme.colors.textAlt}61`,
          }}
        />
      </Host>
    </View>
  )
}
