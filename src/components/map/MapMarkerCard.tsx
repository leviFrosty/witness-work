import { Platform, View } from 'react-native'
import { Marker } from 'react-native-maps'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useMarkerRedraw from '@/hooks/useMarkerRedraw'
import {
  MARKER_CARD_HEIGHT,
  MARKER_CARD_MAX_WIDTH,
  MARKER_CARD_SINGLE_HEIGHT,
  MARKER_GAP,
  MARKER_POINTER,
} from '@/lib/mapMarkerMetrics'
import type { Coordinate } from '@/types/contact'

export type CardPlacement = 'above' | 'below' | 'none'

export default function MapMarkerCard({
  id,
  coordinate,
  placement,
  eyebrow,
  eyebrowColor,
  title,
  selected,
  pin,
  zIndex,
  onPress,
}: {
  id: string
  coordinate: Coordinate
  placement: 'above' | 'below'
  eyebrow?: string

  eyebrowColor?: string
  title: string
  selected: boolean

  pin: number
  zIndex: number
  onPress: () => void
}) {
  const theme = useTheme()
  const marker = useMarkerRedraw(
    [
      placement,
      eyebrow,
      eyebrowColor,
      title,
      selected,
      theme.colors.accent,
      theme.colors.card,
      theme.colors.text,
      theme.colors.textInverse,
      theme.colors.border,
    ].join('|')
  )
  const above = placement === 'above'
  const cardColor = selected ? theme.colors.accent : theme.colors.card
  const textColor = selected ? theme.colors.textInverse : theme.colors.text
  const lineColor = selected
    ? theme.colors.textInverse
    : (eyebrowColor ?? theme.colors.accent)
  const cardHeight = eyebrow ? MARKER_CARD_HEIGHT : MARKER_CARD_SINGLE_HEIGHT
  const height = cardHeight + MARKER_POINTER

  const clearance = pin / 2 + MARKER_GAP

  const pointer = (
    <View
      style={{
        width: 10,
        height: 10,
        zIndex: 1,
        ...(above
          ? { marginTop: -MARKER_POINTER }
          : { marginBottom: -MARKER_POINTER }),
        transform: [{ rotate: '45deg' }],
        backgroundColor: cardColor,
        borderColor: theme.colors.border,

        ...(selected
          ? {}
          : above
            ? { borderRightWidth: 1, borderBottomWidth: 1 }
            : { borderLeftWidth: 1, borderTopWidth: 1 }),
      }}
    />
  )

  return (
    <Marker
      identifier={`${id}-card`}
      coordinate={coordinate}
      onPress={onPress}
      ref={marker.ref}
      tracksViewChanges={marker.tracksViewChanges}
      centerOffset={{ x: 0, y: ((above ? -1 : 1) * (height + clearance)) / 2 }}
      anchor={{ x: 0.5, y: above ? 1 : 0 }}
      zIndex={selected ? 1000 : zIndex}
      accessibilityLabel={
        Platform.OS === 'ios'
          ? [title, eyebrow].filter(Boolean).join(', ')
          : undefined
      }
      accessibilityElementsHidden={Platform.OS !== 'ios'}
      importantForAccessibility='no-hide-descendants'
      stopPropagation
    >
      <View
        collapsable={false}
        style={{ alignItems: 'center', height: height + clearance }}
      >
        {!above && <View style={{ height: clearance }} />}
        {!above && pointer}
        <View
          style={{
            height: cardHeight,
            maxWidth: MARKER_CARD_MAX_WIDTH,
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
          {!!eyebrow && (
            <Text
              maxFontSizeMultiplier={1}
              numberOfLines={1}
              style={{
                fontSize: 11,
                lineHeight: 14,
                fontFamily: theme.fonts.bold,
                color: lineColor,
              }}
            >
              {eyebrow}
            </Text>
          )}
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
