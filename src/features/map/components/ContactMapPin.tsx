import { View } from 'react-native'
import { Marker, type MarkerDragStartEndEvent } from 'react-native-maps'
import {
  Check as CheckIcon,
  Clock as ClockIcon,
  Star as StarIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useMarkerRedraw from '@/hooks/useMarkerRedraw'
import { getReadableTextColor } from '@/lib/color'
import {
  CONTACT_PIN_DISC as DISC,
  CONTACT_PIN_FRAME as FRAME,
  CONTACT_PIN_RING as RING,
} from '@/lib/mapMarkerMetrics'
import type { Coordinate } from '@/types/contact'
import type { PinBadge } from '@/features/map/lib/contactPins'

const BADGE = 15

/**
 * A Contact on the Map: a disc in the Contact's staleness color with their
 * initials, or a rounded square counting the Contacts gathered there. A corner
 * badge marks an overdue or today's Follow-up, or a favorite. Selected, it gets
 * an accent ring; in Select mode, a check covers it once picked.
 */
export default function ContactMapPin({
  identifier,
  coordinate,
  label,
  color,
  group,
  badge,
  selected,
  checked,
  partlyChecked,
  dimmed,
  zIndex,
  accessibilityLabel,
  draggable,
  onPress,
  onDragStart,
  onDragEnd,
}: {
  identifier: string
  coordinate: Coordinate
  /** Initials, or a group's count. */
  label: string
  color: string
  /** Several Contacts in one pin. */
  group?: boolean
  badge?: PinBadge
  selected: boolean
  checked?: boolean
  /** A group with only some of its Contacts picked: outlined, no check. */
  partlyChecked?: boolean
  dimmed?: boolean
  zIndex: number
  accessibilityLabel: string
  draggable?: boolean
  onPress: () => void
  onDragStart?: () => void
  onDragEnd?: (event: MarkerDragStartEndEvent) => void
}) {
  const theme = useTheme()
  const marker = useMarkerRedraw(
    [
      label,
      color,
      group,
      badge,
      selected,
      checked,
      partlyChecked,
      dimmed,
      theme.colors.accent,
      theme.colors.error,
      theme.colors.warn,
    ].join('|')
  )
  const badgeColor =
    badge === 'overdue'
      ? theme.colors.error
      : badge === 'today'
        ? theme.colors.accent
        : theme.colors.warn
  const ringSize = DISC + RING * 2
  const textColor = getReadableTextColor(color)

  // Every view stays mounted and unflattened (`collapsable={false}`), and
  // state changes only restyle them: Apple Maps doesn't redraw a marker whose
  // native views are added, removed or moved after it first draws, which left
  // a blank disc when a pin became selected.
  return (
    <Marker
      identifier={identifier}
      coordinate={coordinate}
      onPress={onPress}
      ref={marker.ref}
      tracksViewChanges={marker.tracksViewChanges}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={selected ? 900 : zIndex}
      accessibilityLabel={accessibilityLabel}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      stopPropagation
    >
      <View
        collapsable={false}
        style={{
          width: FRAME,
          height: FRAME,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: dimmed ? 0.35 : 1,
        }}
      >
        {/* Selected: a filled accent ring. Picked in Select mode: an outline. */}
        <View
          collapsable={false}
          style={{
            position: 'absolute',
            width: ringSize,
            height: ringSize,
            borderRadius: group ? 9 + RING : ringSize / 2,
            borderCurve: 'continuous',
            backgroundColor: selected ? theme.colors.accent : 'transparent',
            borderWidth: 2,
            borderColor:
              checked || partlyChecked ? theme.colors.accent : 'transparent',
          }}
        />
        <View
          collapsable={false}
          style={{
            width: DISC,
            height: DISC,
            borderRadius: group ? 9 : DISC / 2,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: color,
            borderWidth: 2,
            borderColor: '#fff',
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
          }}
        >
          <Text
            maxFontSizeMultiplier={1}
            numberOfLines={1}
            style={{
              fontSize: group || label.length < 2 ? 12 : 10,
              fontFamily: theme.fonts.bold,
              color: textColor,
              opacity: checked ? 0 : 1,
            }}
          >
            {label}
          </Text>
          <View
            collapsable={false}
            style={{
              position: 'absolute',
              opacity: checked ? 1 : 0,
            }}
          >
            <LucideIcon
              icon={CheckIcon}
              size={14}
              strokeWidth={3}
              color={textColor}
            />
          </View>
        </View>
        {/* The parent keys the marker by its badge, so the icon never swaps. */}
        <View
          collapsable={false}
          style={{
            position: 'absolute',
            top: (FRAME - DISC) / 2 - 5,
            // Physical: the badge sits on the disc's top-right in either
            // writing direction, like a notification badge.
            right: (FRAME - DISC) / 2 - 5,
            width: BADGE,
            height: BADGE,
            borderRadius: BADGE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: badgeColor,
            borderWidth: 1.5,
            borderColor: '#fff',
            opacity: badge && !checked ? 1 : 0,
          }}
        >
          <LucideIcon
            icon={badge === 'favorite' ? StarIcon : ClockIcon}
            size={8}
            strokeWidth={3}
            color={getReadableTextColor(badgeColor)}
            fill={
              badge === 'favorite' ? getReadableTextColor(badgeColor) : 'none'
            }
          />
        </View>
      </View>
    </Marker>
  )
}
