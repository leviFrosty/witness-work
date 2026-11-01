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
import { tracking } from '@/lib/tracking'

export interface SegmentedOption<T extends string = string>
  extends NativeSegmentedOption<T> {
  subLabel?: { text: string; color?: string }

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

  value: T | null | undefined
  onChange: (key: T) => void

  size?: 'sm' | 'md' | 'field'

  fitContent?: boolean
  disabled?: boolean
}

export type SegmentedControlProps<T extends string = string> =
  | NativeVariantProps<T>
  | PillVariantProps<T>

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
  fitContent = false,
  disabled = false,
  style,
  ...props
}: PillVariantProps<T>) {
  const theme = useTheme()
  const field = size === 'field'
  const radius = field
    ? theme.numbers.borderRadiusMd
    : size === 'sm'
      ? 999
      : theme.numbers.borderRadiusXl
  const inset = size === 'sm' ? 2 : field ? 3 : 4
  const labelFontSize = field ? theme.fontSize('md') : size === 'sm' ? 12 : 14

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: theme.colors.backgroundLighter,
          borderRadius: radius,
          padding: inset,
          gap: size === 'sm' ? 2 : 4,
          opacity: disabled ? 0.5 : 1,
        },
        field && {
          minHeight: 44,
          borderWidth: 1,
          borderColor: theme.colors.border,
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
            disabled={disabled}
            accessibilityRole='button'
            accessibilityState={{ selected: active, disabled }}
            testID={opt.testID}
            style={{
              flex: fitContent ? undefined : 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,

              paddingVertical: field ? 0 : size === 'sm' ? 4 : 10,
              paddingHorizontal: field ? 12 : size === 'sm' ? 10 : 16,

              borderRadius: field ? radius - inset - 1 : radius,
              backgroundColor: active ? theme.colors.card : 'transparent',

              borderWidth: field ? 1 : 0,
              borderColor:
                field && active ? theme.colors.border : 'transparent',
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
                  letterSpacing: tracking(0.3),
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
