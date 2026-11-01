import type { LatLng } from 'react-native-maps'
import MapMarkerCard from '@/components/map/MapMarkerCard'
import useTheme from '@/contexts/theme'
import { CONTACT_PIN_FOOTPRINT } from '@/lib/mapMarkerMetrics'
import ContactMapPin from '@/features/map/components/ContactMapPin'
import { cardToneColor } from '@/features/map/lib/contactPins'
import type { MapPinItem } from '@/features/map/lib/mapPinLayout'

export default function ContactPinLayer({
  items,
  onPress,
  onDragStart,
  onDragEnd,
}: {
  items: MapPinItem[]

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
            key={`${item.key}|${item.badge ?? ''}|${avatar?.type ?? ''}:${avatar?.value ?? ''}`}
            identifier={item.group ? `group:${item.key}` : item.key}
            coordinate={item.coordinate}
            label={item.label}
            color={item.color}
            avatar={avatar}
            avatarBackground={item.members[0]!.avatarBackground}
            group={item.group}
            badge={item.badge}
            selected={item.selected}
            zIndex={item.zIndex}
            accessibilityLabel={item.accessibilityLabel}
            onPress={() => onPress(item)}
            draggable={!item.group}
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
