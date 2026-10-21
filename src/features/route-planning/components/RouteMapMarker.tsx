import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'
import { Marker } from 'react-native-maps'
import { Flag as FlagIcon, Play as PlayIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import type { Coordinate } from '@/types/contact'

// Pins and their cards are separate markers: a pin never changes size, so it
// always sits exactly on its coordinate, and a card can come and go or move
// above or below without disturbing it. Fixed sizes (labels don't scale with
// Dynamic Type) let Apple Maps, which only offsets from a view's center, put
// each card just clear of its pin.
export const MARKER_PIN = 26
export const MARKER_CARD_HEIGHT = 38
/** Space between a card's pointer and its pin. */
export const MARKER_GAP = 7
/** The pointer pokes this far out of the card toward the pin. */
const POINTER = 5
const CARD_MAX_WIDTH = 132

/** Where a stop's card sits: over the pin, under it, or not at all. */
export type CardPlacement = 'above' | 'below' | 'none'

/** Android draws marker views as bitmaps; redraw for a moment after a change. */
const useRedrawAfterChange = (signature: string) => {
  const [redraw, setRedraw] = useState(true)
  const [seen, setSeen] = useState(signature)
  if (seen !== signature) {
    setSeen(signature)
    setRedraw(true)
  }
  useEffect(() => {
    if (!redraw) return
    const timer = setTimeout(() => setRedraw(false), 500)
    return () => clearTimeout(timer)
  }, [redraw])
  return Platform.OS === 'android' ? redraw : false
}

/** A stop's numbered pin on the route map, or the start's or finish's. */
export function RouteMapPin({
  id,
  coordinate,
  position,
  end,
  selected,
  zIndex,
  accessibilityLabel,
  onPress,
}: {
  id: string
  coordinate: Coordinate
  /** 1-based stop number, for a stop. */
  position?: number
  /** The start's or finish's pin, for an end of the route. */
  end?: 'start' | 'finish'
  selected: boolean
  zIndex: number
  accessibilityLabel: string
  onPress: () => void
}) {
  const theme = useTheme()
  const tracksViewChanges = useRedrawAfterChange(
    [position, end, selected, theme.colors.accent].join('|')
  )
  const isEnd = position == null

  return (
    <Marker
      identifier={id}
      coordinate={coordinate}
      onPress={onPress}
      tracksViewChanges={tracksViewChanges}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={selected ? 900 : zIndex}
      accessibilityLabel={accessibilityLabel}
      stopPropagation
    >
      <View
        style={{
          width: MARKER_PIN,
          height: MARKER_PIN,
          borderRadius: MARKER_PIN / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isEnd ? '#fff' : theme.colors.accent,
          borderWidth: 2,
          borderColor: isEnd ? theme.colors.accent : '#fff',
        }}
      >
        {isEnd ? (
          <LucideIcon
            icon={end === 'finish' ? FlagIcon : PlayIcon}
            size={12}
            color={theme.colors.accent}
          />
        ) : (
          <Text
            maxFontSizeMultiplier={1}
            style={{
              fontSize: 12,
              fontFamily: theme.fonts.bold,
              color: '#fff',
            }}
          >
            {position}
          </Text>
        )}
      </View>
    </Marker>
  )
}

/**
 * The card beside a pin: when you'd be there and the stop's name, pointing at
 * its pin from above or below.
 */
export function RouteMapCard({
  id,
  coordinate,
  placement,
  time,
  title,
  selected,
  late,
  zIndex,
  onPress,
}: {
  id: string
  coordinate: Coordinate
  placement: 'above' | 'below'
  time: string
  title: string
  selected: boolean
  /** Arriving after the stop's set time. */
  late?: boolean
  zIndex: number
  onPress: () => void
}) {
  const theme = useTheme()
  const tracksViewChanges = useRedrawAfterChange(
    [placement, time, title, selected, late, theme.colors.accent].join('|')
  )
  const above = placement === 'above'
  const cardColor = selected ? theme.colors.accent : theme.colors.card
  const textColor = selected ? theme.colors.textInverse : theme.colors.text
  const timeColor = selected
    ? theme.colors.textInverse
    : late
      ? theme.colors.warnText
      : theme.colors.accent
  const height = MARKER_CARD_HEIGHT + POINTER
  // From the pin's center to the pointer's tip.
  const clearance = MARKER_PIN / 2 + MARKER_GAP

  const pointer = (
    <View
      style={{
        width: 10,
        height: 10,
        zIndex: 1,
        ...(above ? { marginTop: -POINTER } : { marginBottom: -POINTER }),
        transform: [{ rotate: '45deg' }],
        backgroundColor: cardColor,
        borderColor: theme.colors.border,
        // Physical sides: the rotated square's outlined corner is the tip,
        // which points at the pin in either direction.
        ...(selected
          ? {}
          : above
            ? // eslint-disable-next-line no-restricted-syntax
              { borderRightWidth: 1, borderBottomWidth: 1 }
            : // eslint-disable-next-line no-restricted-syntax
              { borderLeftWidth: 1, borderTopWidth: 1 }),
      }}
    />
  )

  return (
    <Marker
      identifier={`${id}-card`}
      coordinate={coordinate}
      onPress={onPress}
      tracksViewChanges={tracksViewChanges}
      // A clear spacer toward the pin keeps the anchor on the view's edge,
      // which Google Maps needs; a tap there picks the same stop.
      centerOffset={{ x: 0, y: ((above ? -1 : 1) * (height + clearance)) / 2 }}
      anchor={{ x: 0.5, y: above ? 1 : 0 }}
      zIndex={selected ? 1000 : zIndex}
      // The pin carries the stop's name and time for screen readers.
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      stopPropagation
    >
      <View style={{ alignItems: 'center', height: height + clearance }}>
        {!above && <View style={{ height: clearance }} />}
        {!above && pointer}
        <View
          style={{
            height: MARKER_CARD_HEIGHT,
            maxWidth: CARD_MAX_WIDTH,
            paddingHorizontal: 8,
            justifyContent: 'center',
            borderRadius: 10,
            borderCurve: 'continuous',
            backgroundColor: cardColor,
            borderWidth: selected ? 0 : 1,
            borderColor: theme.colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
          }}
        >
          <Text
            maxFontSizeMultiplier={1}
            numberOfLines={1}
            style={{
              fontSize: 11,
              lineHeight: 14,
              fontFamily: theme.fonts.bold,
              color: timeColor,
            }}
          >
            {time}
          </Text>
          <Text
            maxFontSizeMultiplier={1}
            numberOfLines={1}
            style={{
              fontSize: 11,
              lineHeight: 14,
              fontFamily: theme.fonts.semiBold,
              color: textColor,
            }}
          >
            {title}
          </Text>
        </View>
        {above && pointer}
        {above && <View style={{ height: clearance }} />}
      </View>
    </Marker>
  )
}
