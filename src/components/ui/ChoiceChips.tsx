import { useId, useState } from 'react'
import { ScrollView, View, ViewProps } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import useTheme from '@/contexts/theme'
import { flowScrollX, isRtlLayout } from '@/lib/direction'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'

export interface ChoiceChip<T extends string = string> {
  key: T
  label: string
  /** Drawn before the label, in the label's colour. */
  icon?: AppIcon
  testID?: string
}

export interface ChoiceChipsProps<T extends string = string>
  extends Omit<ViewProps, 'children'> {
  options: ReadonlyArray<ChoiceChip<T>>
  value: T | null | undefined
  onChange: (key: T) => void
  /**
   * `scroll` keeps the chips on one swipeable row of pills, like the Contacts
   * filters, for a short control that shouldn't grow with the option count.
   */
  layout?: 'wrap' | 'scroll'
  /**
   * Scroll only: the parent's horizontal padding. The row bleeds through it to
   * the parent's edges, so a chip cut off there shows there's more, and the
   * first and last chips still line up with the content around it.
   */
  bleed?: number
  /** Scroll only: what the row sits on, for the fades at its edges. */
  fadeColor?: string
}

/** How far the edge fades reach into the row. */
const FADE_WIDTH = 40

/**
 * Single-choice bordered chips that wrap onto as many rows as they need, or
 * scroll along one. For option sets too large or too long for a segmented
 * control, such as filter fields.
 */
export default function ChoiceChips<T extends string = string>({
  options,
  value,
  onChange,
  layout = 'wrap',
  bleed = 0,
  fadeColor,
  style,
  ...props
}: ChoiceChipsProps<T>) {
  const pill = layout === 'scroll'
  const chips = options.map((opt) => (
    <Chip
      key={opt.key}
      option={opt}
      active={opt.key === value}
      pill={pill}
      onPress={() => onChange(opt.key)}
    />
  ))

  if (pill) {
    return (
      <ChipScroller
        bleed={bleed}
        fadeColor={fadeColor}
        style={style}
        {...props}
      >
        {chips}
      </ChipScroller>
    )
  }

  return (
    <View
      accessibilityRole='radiogroup'
      style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}
      {...props}
    >
      {chips}
    </View>
  )
}

function Chip<T extends string>({
  option: opt,
  active,
  pill,
  onPress,
}: {
  option: ChoiceChip<T>
  active: boolean
  pill: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={onPress}
      accessibilityRole='radio'
      accessibilityState={{ checked: active }}
      testID={opt.testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: pill ? 14 : 12,
        paddingVertical: 8,
        // Grows with large text sizes instead of clipping the label.
        minHeight: pill ? 36 : undefined,
        borderRadius: pill ? 999 : theme.numbers.borderRadiusSm,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        backgroundColor: active
          ? theme.colors.accentTranslucent
          : theme.colors.backgroundLighter,
      }}
    >
      {opt.icon && (
        <LucideIcon
          icon={opt.icon}
          size={16}
          color={active ? theme.colors.accent : theme.colors.textAlt}
        />
      )}
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize('sm'),
          color: active ? theme.colors.accent : theme.colors.text,
          fontFamily: active ? theme.fonts.semiBold : theme.fonts.regular,
        }}
      >
        {opt.label}
      </Text>
    </Button>
  )
}

/**
 * One swipeable row. Each edge fades out while chips hide past it, so the row
 * reads as scrollable even when the cut falls between two chips.
 */
function ChipScroller({
  bleed,
  fadeColor,
  style,
  children,
  ...props
}: Omit<ViewProps, 'children'> & {
  bleed: number
  fadeColor?: string
  children: React.ReactNode
}) {
  const theme = useTheme()
  const color = fadeColor ?? theme.colors.background
  const [viewport, setViewport] = useState(0)
  const [content, setContent] = useState(0)
  const [offset, setOffset] = useState(0)
  const scrolled = flowScrollX(offset, content, viewport, isRtlLayout())
  const fadeStart = scrolled > 1
  const fadeEnd = scrolled < content - viewport - 1

  return (
    <View style={[{ marginHorizontal: -bleed }, style]} {...props}>
      <ScrollView
        horizontal
        accessibilityRole='radiogroup'
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContent(width)}
        onScroll={(e) => setOffset(e.nativeEvent.contentOffset.x)}
        contentContainerStyle={{
          paddingHorizontal: bleed,
          gap: 8,
          alignItems: 'center',
        }}
      >
        {children}
      </ScrollView>
      {fadeStart && <EdgeFade side='start' color={color} />}
      {fadeEnd && <EdgeFade side='end' color={color} />}
    </View>
  )
}

function EdgeFade({ side, color }: { side: 'start' | 'end'; color: string }) {
  // `useId` adds colons, which `url(#…)` doesn't take.
  const id = `chipFade${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  // Solid at the row's edge, clear toward the middle. RN mirrors `start` and
  // `end` in RTL, but not the gradient.
  const onLeft = (side === 'start') !== isRtlLayout()
  const fromEdge = onLeft ? ['1', '0'] : ['0', '1']
  return (
    <View
      pointerEvents='none'
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        ...(side === 'start' ? { start: 0 } : { end: 0 }),
        width: FADE_WIDTH,
      }}
    >
      <Svg width='100%' height='100%'>
        <Defs>
          <LinearGradient id={id} x1='0' y1='0' x2='1' y2='0'>
            <Stop offset='0' stopColor={color} stopOpacity={fromEdge[0]} />
            <Stop offset='1' stopColor={color} stopOpacity={fromEdge[1]} />
          </LinearGradient>
        </Defs>
        <Rect width='100%' height='100%' fill={`url(#${id})`} />
      </Svg>
    </View>
  )
}
