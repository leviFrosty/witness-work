import { View } from 'react-native'
import { Host } from '@expo/ui'
import { Switch as ComposeSwitch } from '@expo/ui/jetpack-compose'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import type { SwitchProps } from '@/components/ui/Switch'

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

  const interactive = !!onValueChange && accessible !== false

  return (
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
