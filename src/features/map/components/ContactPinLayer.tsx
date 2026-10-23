import type { LatLng } from 'react-native-maps'
import MapMarkerCard from '@/components/map/MapMarkerCard'
import useTheme from '@/contexts/theme'
import { CONTACT_PIN_FOOTPRINT } from '@/lib/mapMarkerMetrics'
import ContactMapPin from '@/features/map/components/ContactMapPin'
import { cardToneColor } from '@/features/map/lib/contactPins'
import type { MapPinItem } from '@/features/map/lib/mapPinLayout'

/**
 * The Map's Contact pins and their cards, as children of the `MapView`. A
 * single Contact's pin drags to move them, outside Select mode.
 */
export default function ContactPinLayer({
  items,
  selecting,
  onPress,
  onDragStart,
  onDragEnd,
}: {
  items: MapPinItem[]
  selecting: boolean
  /** A pin or its card was tapped. */
  onPress: (item: MapPinItem) => void
  onDragStart: () => void
  onDragEnd: (contactId: string, coordinate: LatLng) => void
}) {
  const theme = useTheme()

  return (
    <>
      {items.map((item) => {
        const avatar = item.members[0]!.avatar
        return (
          <ContactMapPin
            // Keyed by the lead Contact, so a pin that gathers into a group or
            // spreads out restyles in place. A new badge (a Follow-up due, a
            // favorite) changes its icon, so it gets a fresh marker; see
            // ContactMapPin. So does a new avatar.
            key={`${item.key}|${item.badge ?? ''}|${avatar?.type ?? ''}:${avatar?.value ?? ''}`}
            // A group's identifier isn't a Contact's, so hovering it names no one.
            identifier={item.group ? `group:${item.key}` : item.key}
            coordinate={item.coordinate}
            label={item.label}
            color={item.color}
            avatar={avatar}
            avatarBackground={item.members[0]!.avatarBackground}
            group={item.group}
            badge={item.badge}
            selected={item.selected}
            checked={item.checked}
            partlyChecked={item.partlyChecked}
            dimmed={item.dimmed}
            zIndex={item.zIndex}
            accessibilityLabel={item.accessibilityLabel}
            onPress={() => onPress(item)}
            draggable={!item.group && !selecting}
            onDragStart={onDragStart}
            onDragEnd={(e) => onDragEnd(item.key, e.nativeEvent.coordinate)}
          />
        )
      })}
      {items.map((item) => {
        const card = item.card
        if (!card) return null
        return (
          <MapMarkerCard
            // iOS keeps a marker view's first size: a card that moves or
            // changes gets a fresh view, so it stays over its pin.
            key={`${item.key}|${card.placement}|${card.line?.text}|${card.title}`}
            id={item.key}
            coordinate={item.coordinate}
            placement={card.placement}
            eyebrow={card.line?.text}
            eyebrowColor={
              card.line
                ? cardToneColor(card.line.tone, theme.colors)
                : undefined
            }
            title={card.title}
            selected={item.selected}
            pin={CONTACT_PIN_FOOTPRINT}
            zIndex={100 + item.zIndex}
            onPress={() => onPress(item)}
          />
        )
      })}
    </>
  )
}
