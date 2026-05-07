import { ReactNode } from 'react'
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import useTheme from '../contexts/theme'
import Button from './Button'
import Text from './MyText'

export type SegmentedVariant = 'glass' | 'pill' | 'bordered'

export type SegmentedSize = 'sm' | 'md'

export interface SegmentedOption<T extends string = string> {
  key: T
  label: string
  /** Inline secondary text rendered after the label (e.g., "Save 20%"). */
  subLabel?: { text: string; color?: string }
  /** Trailing element rendered after label/subLabel (icon, badge, etc.). */
  trailing?: ReactNode
}

export interface SegmentedControlProps<T extends string = string>
  extends Omit<ViewProps, 'children'> {
  variant?: SegmentedVariant
  options: ReadonlyArray<SegmentedOption<T>>
  /** Currently-selected option key. `null`/`undefined` means no selection. */
  value: T | null | undefined
  onChange: (key: T) => void
  /** Compact sizing — used by paywall billing toggle. */
  size?: SegmentedSize
  /** Wrap items onto multiple rows. Only meaningful for `bordered`. */
  wrap?: boolean
  /** Override the per-item base style. */
  itemStyle?: ViewStyle
  /** Additional style applied to the active item on top of `itemStyle`. */
  activeItemStyle?: ViewStyle
}

/**
 * Unified segmented selector. Three visual treatments:
 *
 * - `glass` (default) — liquid-glass pill used as a primary tab control
 *   (ProgressScreen). BlurView backdrop + accent-translucent active fill.
 * - `pill` — solid backgroundLighter container with shadowed active card. Used by
 *   PaywallScreen for tier and billing-cadence toggles.
 * - `bordered` — independent bordered chips, with optional wrapping. Used by
 *   filter UIs where the option set is large or multi-row.
 *
 * Per-option extras: `subLabel` (inline secondary text) and `trailing`
 * (badge/icon node). Per-instance overrides via `itemStyle` / `activeItemStyle`
 * follow `Card`'s extensibility pattern.
 */
function SegmentedControl<T extends string = string>({
  variant = 'glass',
  options,
  value,
  onChange,
  size = 'md',
  wrap = false,
  itemStyle,
  activeItemStyle,
  style,
  ...props
}: SegmentedControlProps<T>) {
  const theme = useTheme()

  if (variant === 'glass') {
    return (
      <GlassContainer style={style} {...props}>
        {options.map((opt) => {
          const active = opt.key === value
          return (
            <Button
              key={opt.key}
              noTransform
              onPress={() => onChange(opt.key)}
              style={[
                {
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                  margin: 4,
                  borderRadius: 999,
                  backgroundColor: active
                    ? theme.colors.accentTranslucent
                    : 'transparent',
                },
                itemStyle,
                active ? activeItemStyle : undefined,
              ]}
            >
              <SegmentedLabel
                label={opt.label}
                subLabel={opt.subLabel}
                trailing={opt.trailing}
                fontSize={theme.fontSize('sm')}
                color={active ? theme.colors.accent : theme.colors.textAlt}
                fontFamily={active ? theme.fonts.semiBold : theme.fonts.medium}
              />
            </Button>
          )
        })}
      </GlassContainer>
    )
  }

  if (variant === 'pill') {
    const containerRadius = size === 'sm' ? 999 : theme.numbers.borderRadiusXl
    const itemRadius = size === 'sm' ? 999 : theme.numbers.borderRadiusXl
    const itemPaddingV = size === 'sm' ? 4 : 10
    const itemPaddingH = size === 'sm' ? 10 : 16
    const labelFontSize = size === 'sm' ? 12 : 14
    const containerPadding = size === 'sm' ? 2 : 4
    const containerGap = size === 'sm' ? 2 : 4

    return (
      <View
        style={[
          {
            flexDirection: 'row',
            backgroundColor: theme.colors.backgroundLighter,
            borderRadius: containerRadius,
            padding: containerPadding,
            gap: containerGap,
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
              style={[
                {
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: itemPaddingV,
                  paddingHorizontal: itemPaddingH,
                  borderRadius: itemRadius,
                  backgroundColor: active ? theme.colors.card : 'transparent',
                  shadowColor: active ? theme.colors.shadow : 'transparent',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: active ? 0.15 : 0,
                  shadowRadius: size === 'sm' ? 2 : 3,
                },
                itemStyle,
                active ? activeItemStyle : undefined,
              ]}
            >
              <SegmentedLabel
                label={opt.label}
                subLabel={opt.subLabel}
                trailing={opt.trailing}
                fontSize={labelFontSize}
                color={active ? theme.colors.text : theme.colors.textAlt}
                fontFamily={active ? theme.fonts.semiBold : theme.fonts.regular}
              />
            </Button>
          )
        })}
      </View>
    )
  }

  // bordered
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          flexWrap: wrap ? 'wrap' : 'nowrap',
          gap: 8,
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
            noTransform
            onPress={() => onChange(opt.key)}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: size === 'sm' ? 6 : 8,
                borderRadius: theme.numbers.borderRadiusSm,
                borderWidth: 1,
                borderColor: active ? theme.colors.accent : theme.colors.border,
                backgroundColor: active
                  ? theme.colors.accentTranslucent
                  : theme.colors.backgroundLighter,
              },
              itemStyle,
              active ? activeItemStyle : undefined,
            ]}
          >
            <SegmentedLabel
              label={opt.label}
              subLabel={opt.subLabel}
              trailing={opt.trailing}
              fontSize={theme.fontSize('sm')}
              color={active ? theme.colors.accent : theme.colors.text}
              fontFamily={active ? theme.fonts.semiBold : theme.fonts.regular}
            />
          </Button>
        )
      })}
    </View>
  )
}

interface GlassContainerProps extends Omit<ViewProps, 'children'> {
  children: ReactNode
}

const GlassContainer = ({ children, style, ...props }: GlassContainerProps) => {
  const theme = useTheme()
  const isDark = theme.colors.background === '#121212'
  return (
    <View
      style={[
        {
          height: 40,
          borderRadius: 999,
          borderCurve: 'continuous',
          overflow: 'hidden',
          flexDirection: 'row',
          alignItems: 'stretch',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        style,
      ]}
      {...props}
    >
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={40}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents='none'
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.card, opacity: 0.45 },
        ]}
      />
      {children}
    </View>
  )
}

interface SegmentedLabelProps {
  label: string
  subLabel?: SegmentedOption['subLabel']
  trailing?: ReactNode
  fontSize: number
  color: string
  fontFamily: string
}

const SegmentedLabel = ({
  label,
  subLabel,
  trailing,
  fontSize,
  color,
  fontFamily,
}: SegmentedLabelProps) => {
  const theme = useTheme()
  return (
    <>
      <Text style={{ fontSize, color, fontFamily }}>{label}</Text>
      {subLabel && (
        <Text
          style={{
            fontSize: Math.max(10, fontSize - 2),
            fontFamily: theme.fonts.semiBold,
            color: subLabel.color ?? theme.colors.supporter,
            letterSpacing: 0.3,
          }}
        >
          {subLabel.text}
        </Text>
      )}
      {trailing}
    </>
  )
}

export default SegmentedControl
