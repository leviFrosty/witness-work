import { Platform, View } from 'react-native'
import { Image } from 'expo-image'
import { Marker, type MarkerDragStartEndEvent } from 'react-native-maps'
import {
  Check as CheckIcon,
  Clock as ClockIcon,
  Star as StarIcon,
} from 'lucide-react-native'
import { isRenderableImageValue } from '@/components/ui/Avatar'
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
import type { ProfileAvatar } from '@/types/avatar'
import type { Coordinate } from '@/types/contact'
import type { PinBadge } from '@/features/map/lib/contactPins'

const BADGE = 15
/** The staleness ring around a Contact's picture or emoji. */
const AVATAR_RING = 3

/**
 * A Contact on the Map: their picture or emoji ringed in their staleness color,
 * else a disc in that color with their initials, or a rounded square counting
 * the Contacts gathered there. A corner badge marks an overdue or today's
 * Follow-up, or a favorite. Selected, it gets an accent ring; in Select mode, a
 * check covers it once picked.
 */
export default function ContactMapPin({
  identifier,
  coordinate,
  label,
  color,
  avatar,
  avatarBackground,
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
  /** A single Contact's avatar; initials show when it's none. */
  avatar?: ProfileAvatar
  /** Behind an emoji avatar, as on the Contact's other avatars. */
  avatarBackground?: string | null
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
  const image =
    avatar?.type === 'image' && isRenderableImageValue(avatar.value)
      ? avatar.value
      : null
  const emoji = avatar?.type === 'emoji' && avatar.value ? avatar.value : null
  // A group shows its count, but keeps the lead's avatar mounted.
  const showAvatar = !!(image || emoji) && !group && !checked
  const marker = useMarkerRedraw(
    [
      label,
      color,
      image,
      emoji,
      avatarBackground,
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
  const avatarSize = DISC - AVATAR_RING * 2
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
            borderColor: showAvatar ? color : '#fff',
            borderWidth: showAvatar ? AVATAR_RING : 2,
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
              opacity: checked || showAvatar ? 0 : 1,
            }}
          >
            {label}
          </Text>
          {/* The parent keys the marker by its avatar, so these never swap. */}
          {image || emoji ? (
            <View
              collapsable={false}
              style={{
                position: 'absolute',
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: image
                  ? theme.colors.border
                  : (avatarBackground ?? theme.colors.accentBackground),
                opacity: showAvatar ? 1 : 0,
              }}
            >
              {image ? (
                <Image
                  source={{ uri: image }}
                  style={{ width: avatarSize, height: avatarSize }}
                  contentFit='cover'
                  cachePolicy='memory-disk'
                  // Android drew the marker's bitmap before the image landed.
                  onLoad={() => {
                    if (Platform.OS === 'android') marker.ref.current?.redraw()
                  }}
                />
              ) : (
                <Text
                  maxFontSizeMultiplier={1}
                  style={{ fontSize: avatarSize * 0.6 }}
                >
                  {emoji}
                </Text>
              )}
            </View>
          ) : null}
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
