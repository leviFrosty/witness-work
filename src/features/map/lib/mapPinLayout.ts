import {
  estimateCardWidth,
  placeProjectedLabels,
  type MapSize,
  type ProjectedCandidate,
  type Rect,
} from '@/lib/mapLabels'
import {
  CONTACT_PIN_FOOTPRINT,
  MARKER_CARD_HEIGHT,
  MARKER_CARD_MAX_WIDTH,
  MARKER_CARD_SINGLE_HEIGHT,
  MARKER_GAP,
  MARKER_POINTER,
} from '@/lib/mapMarkerMetrics'
import i18n from '@/lib/locales'
import type { ConversationIndex } from '@/lib/conversationIndex'
import type { Coordinate } from '@/types/contact'
import type { MapCardDetail } from '@/types/map'
import type { ContactMarker } from '@/features/map/types/map'
import {
  contactCardLine,
  contactPinFacts,
  groupAccessibilityLabel,
  groupTitle,
  pinInitials,
  type CardLine,
  type ContactPinFacts,
  type PinBadge,
} from '@/features/map/lib/contactPins'
import {
  groupOverlappingPins,
  type MapPoint,
} from '@/features/map/lib/pinGeometry'

export type MapProjection = {
  project: (coordinate: Coordinate) => MapPoint
  size: MapSize
}

export type MapPinItem = {
  key: string
  coordinate: Coordinate

  members: ContactMarker[]

  group: boolean
  label: string
  color: string
  badge?: PinBadge

  selected: boolean
  zIndex: number

  accessibilityLabel: string
  card: {
    placement: 'above' | 'below'
    line: CardLine | null
    title: string
  } | null
}

export const GROUP_RADIUS = 22

export const PIN_LAYOUT_METRICS = {
  cardHeight: MARKER_CARD_HEIGHT,
  singleCardHeight: MARKER_CARD_SINGLE_HEIGHT,

  gap: MARKER_GAP + MARKER_POINTER,

  pin: CONTACT_PIN_FOOTPRINT,
}

export function layoutContactPins({
  contacts,
  index,
  nowMs,
  detail,
  projection,
  activeId,
  maxCards,
  cardBounds,
  avoid,
}: {
  contacts: ContactMarker[]
  index: ConversationIndex
  nowMs: number
  detail: MapCardDetail
  projection: MapProjection | null
  activeId: string | undefined
  maxCards: number

  cardBounds: Rect

  avoid?: Rect[]
}): MapPinItem[] {
  const facts = new Map<string, ContactPinFacts>(
    contacts.map((contact) => [
      contact.id,
      contactPinFacts(contact, index, nowMs),
    ])
  )
  const factsOf = (contact: ContactMarker) => facts.get(contact.id)!
  const ranked = [...contacts].sort(
    (a, b) => factsOf(a).urgency - factsOf(b).urgency
  )
  const rank = new Map(ranked.map((contact, i) => [contact.id, i]))
  const byRank = (a: ContactMarker, b: ContactMarker) =>
    rank.get(a.id)! - rank.get(b.id)!

  const groups: ContactMarker[][] = projection
    ? groupOverlappingPins(
        ranked.map((contact) => ({
          id: contact.id,
          contact,
          ...projection.project(contact.coordinate!),
        })),
        GROUP_RADIUS
      ).map((group) => group.map(({ contact }) => contact).sort(byRank))
    : ranked.map((contact) => [contact])

  const items: MapPinItem[] = groups.map((members) => {
    const lead = members[0]!
    const group = members.length > 1
    return {
      key: lead.id,
      coordinate: lead.coordinate!,
      members,
      group,
      label: group ? String(members.length) : pinInitials(lead.name),
      color: lead.pinColor,
      badge: factsOf(lead).badge,
      selected: members.some((m) => m.id === activeId),
      zIndex: ranked.length - rank.get(lead.id)!,
      accessibilityLabel: '',
      card: null,
    }
  })

  const describe = (item: MapPinItem) => {
    const lead = item.members[0]!
    const active = item.members.find((m) => m.id === activeId)
    const shown = active ?? lead
    const line = contactCardLine(
      shown,
      index,
      detail,
      nowMs,
      factsOf(shown).followUp
    )
    const title = !item.group
      ? lead.name
      : active
        ? i18n.t('map_group_withName', {
            name: active.name,
            more: item.members.length - 1,
          })
        : groupTitle(item.members)
    item.accessibilityLabel = [
      item.group ? groupAccessibilityLabel(item.members) : lead.name,
      line?.text,
    ]
      .filter(Boolean)
      .join(', ')
    return { line, title }
  }

  if (!projection) {
    for (const item of items) describe(item)
    return items
  }

  const { size } = projection
  const margin = PIN_LAYOUT_METRICS.pin
  const onScreen = (point: MapPoint) =>
    point.x >= -margin &&
    point.y >= -margin &&
    point.x <= size.width + margin &&
    point.y <= size.height + margin

  const inOpen = (point: MapPoint) =>
    point.x >= cardBounds.left &&
    point.y >= cardBounds.top &&
    point.x <= cardBounds.right &&
    point.y <= cardBounds.bottom
  const priority = (item: MapPinItem) => (item.selected ? 0 : 1)

  const shown = items
    .map((item) => ({ item, point: projection.project(item.coordinate) }))
    .filter(({ point }) => onScreen(point))
    .map(({ item, point }) => ({ item, point, ...describe(item) }))
    .sort(
      (a, b) =>
        priority(a.item) - priority(b.item) || b.item.zIndex - a.item.zIndex
    )
  const candidates: ProjectedCandidate[] = shown.map(
    ({ item, point, line, title }) => ({
      key: item.key,
      coordinate: item.coordinate,
      ...point,
      width: estimateCardWidth([line?.text ?? '', title], {
        max: MARKER_CARD_MAX_WIDTH,
      }),
      height: line
        ? PIN_LAYOUT_METRICS.cardHeight
        : PIN_LAYOUT_METRICS.singleCardHeight,
      pinOnly: !inOpen(point),
    })
  )
  const placements = placeProjectedLabels(
    candidates,
    size,
    PIN_LAYOUT_METRICS,
    { maxCards, bounds: cardBounds, avoid }
  )
  for (const { item, line, title } of shown) {
    const placement = placements.get(item.key) ?? 'none'
    if (placement !== 'none') item.card = { placement, line, title }
  }
  return items
}
