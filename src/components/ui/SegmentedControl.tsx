import { ReactNode } from 'react'
import { View, ViewProps } from 'react-native'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import NativeSegmentedControl from '@/components/ui/NativeSegmentedControl'
import type {
  NativeSegmentedControlProps,
  NativeSegmentedOption,
} from '@/components/ui/NativeSegmentedControl.types'

export interface SegmentedOption<T extends string = string>
  extends NativeSegmentedOption<T> {
  /** Inline secondary text rendered after the label (e.g., "Save 20%"). */
  subLabel?: { text: string; color?: string }
  /** Trailing element rendered after label/subLabel (icon, badge, etc.). */
  trailing?: ReactNode
}

interface NativeVariantProps<T extends string>
  extends NativeSegmentedControlProps<T> {
  variant?: 'native'
}

interface PillVariantProps<T extends string>
  extends Omit<ViewProps, 'children'> {
  variant: 'pill'
  options: ReadonlyArray<SegmentedOption<T>>
  /** Currently-selected option key. `null`/`undefined` means no selection. */
  value: T | null | undefined
  onChange: (key: T) => void
  /** Compact sizing — used by paywall billing toggle. */
  size?: 'sm' | 'md'
}

export type SegmentedControlProps<T extends string = string> =
  | NativeVariantProps<T>
  | PillVariantProps<T>

/**
 * Segmented selector for a few mutually exclusive, plain-text choices.
 *
 * - `native` (default): the platform control, SwiftUI's segmented `Picker` on iOS
 *   and Material 3 segmented buttons on Android. Use it for every segmented
 *   choice it can draw.
 * - `pill`: hand-built, only for segments the native control can't show: inline
 *   secondary text (`subLabel`, like the paywall's "Save 20%") or a `trailing`
 *   badge.
 *
 * Many or long options (filter fields) belong in `ChoiceChips` instead.
 */
function SegmentedControl<T extends string = string>(
  props: SegmentedControlProps<T>
) {
  if (props.variant !== 'pill') return <NativeSegmentedControl {...props} />
  return <PillSegmentedControl {...props} />
}

function PillSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  style,
  ...props
}: PillVariantProps<T>) {
  const theme = useTheme()
  const radius = size === 'sm' ? 999 : theme.numbers.borderRadiusXl
  const labelFontSize = size === 'sm' ? 12 : 14

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: theme.colors.backgroundLighter,
          borderRadius: radius,
          padding: size === 'sm' ? 2 : 4,
          gap: size === 'sm' ? 2 : 4,
        },
        style,
      ]}
      {...props}
    >
      {options.map((opt) => {
        const active = opt.key === value
        return (
          <Button
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole='button'
            accessibilityState={{ selected: active }}
            testID={opt.testID}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: size === 'sm' ? 4 : 10,
              paddingHorizontal: size === 'sm' ? 10 : 16,
              borderRadius: radius,
              backgroundColor: active ? theme.colors.card : 'transparent',
              shadowColor: active ? theme.colors.shadow : 'transparent',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: active ? 0.15 : 0,
              shadowRadius: size === 'sm' ? 2 : 3,
            }}
          >
            <Text
              style={{
                fontSize: labelFontSize,
                color: active ? theme.colors.text : theme.colors.textAlt,
                fontFamily: active ? theme.fonts.semiBold : theme.fonts.regular,
              }}
            >
              {opt.label}
            </Text>
            {opt.subLabel && (
              <Text
                style={{
                  fontSize: Math.max(10, labelFontSize - 2),
                  fontFamily: theme.fonts.semiBold,
                  color: opt.subLabel.color ?? theme.colors.supporter,
                  letterSpacing: 0.3,
                }}
              >
                {opt.subLabel.text}
              </Text>
            )}
            {opt.trailing}
          </Button>
        )
      })}
    </View>
  )
}

export default SegmentedControl
