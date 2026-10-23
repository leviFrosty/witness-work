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

/** Where the map draws coordinates right now, and its size in points. */
export type MapProjection = {
  project: (coordinate: Coordinate) => MapPoint
  size: MapSize
}

/** One pin on the Map: a Contact, or several drawn on top of each other. */
export type MapPinItem = {
  /**
   * The lead Contact's id, whether the pin stands for one Contact or a group,
   * so a pin that gathers or spreads keeps its marker.
   */
  key: string
  coordinate: Coordinate
  /** Most pressing first; the first leads a group. */
  members: ContactMarker[]
  /** Several Contacts in one pin. */
  group: boolean
  label: string
  color: string
  badge?: PinBadge
  /** The active Contact is here. */
  selected: boolean
  /** Select mode: every Contact here is picked. */
  checked: boolean
  /** Select mode: some, not all, of the Contacts here are picked. */
  partlyChecked: boolean
  dimmed: boolean
  zIndex: number
  /** Empty for a pin off screen; it's worked out once the pin is in view. */
  accessibilityLabel: string
  card: {
    placement: 'above' | 'below'
    line: CardLine | null
    title: string
  } | null
}

/** Pins closer than this on screen gather into one. */
export const GROUP_RADIUS = 22

export const PIN_LAYOUT_METRICS = {
  /** A card with two lines; one-line cards pass their own height. */
  cardHeight: MARKER_CARD_HEIGHT,
  singleCardHeight: MARKER_CARD_SINGLE_HEIGHT,
  /** From the pin's edge to the card, pointer included. */
  gap: MARKER_GAP + MARKER_POINTER,
  /** The pin's footprint other cards keep clear of. */
  pin: CONTACT_PIN_FOOTPRINT,
}

/**
 * Lays the Map's pins out for the current camera: pins that overlap gather into
 * a group, and cards go to the most pressing pins first (the selected one
 * before all), wherever they fit, up to `maxCards`. With the "due" lens on, or
 * some Contacts picked in Select mode, only those keep cards; the rest dim.
 * Without a `projection` (before the map has settled) every Contact is its own
 * pin and no cards show. Cards and screen reader labels are worked out only for
 * pins on screen, so a big map stays cheap to lay out.
 */
export function layoutContactPins({
  contacts,
  index,
  nowMs,
  detail,
  projection,
  activeId,
  checkedIds,
  dueLens,
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
  /** Select mode's picks; null outside Select mode. */
  checkedIds: ReadonlySet<string> | null
  dueLens: boolean
  maxCards: number
  /** Where cards may go, clear of the map's overlays. */
  cardBounds: Rect
  /** Controls over the map that cards keep clear of. */
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

  const anyChecked = !!checkedIds && checkedIds.size > 0
  const items: MapPinItem[] = groups.map((members) => {
    const lead = members[0]!
    const group = members.length > 1
    const picked = checkedIds
      ? members.filter((m) => checkedIds.has(m.id)).length
      : 0
    const checked = picked === members.length
    const due = members.some((m) => factsOf(m).due)
    return {
      key: lead.id,
      coordinate: lead.coordinate!,
      members,
      group,
      label: group ? String(members.length) : pinInitials(lead.name),
      color: lead.pinColor,
      badge: factsOf(lead).badge,
      selected: members.some((m) => m.id === activeId),
      checked,
      partlyChecked: picked > 0 && !checked,
      // In Select mode a pin with any picks stays bright.
      dimmed: (dueLens && !due) || (anyChecked && picked === 0),
      zIndex: ranked.length - rank.get(lead.id)!,
      accessibilityLabel: '',
      card: null,
    }
  })

  /** The card's lines and the pin's label, for a pin in view. */
  const describe = (item: MapPinItem) => {
    const lead = item.members[0]!
    const active = item.members.find((m) => m.id === activeId)
    const shown = active ?? lead
    const pickedHere = item.partlyChecked
      ? item.members.filter((m) => checkedIds?.has(m.id)).length
      : 0
    // A group picked in part says how much, so it doesn't read as unpicked.
    const line = item.partlyChecked
      ? {
          text: i18n.t('map_group_picked', {
            picked: pickedHere,
            count: item.members.length,
          }),
          tone: 'due' as const,
        }
      : contactCardLine(shown, index, detail, nowMs, factsOf(shown).followUp)
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
      item.checked && i18n.t('map_select_picked'),
    ]
      .filter(Boolean)
      .join(', ')
    return { line, title }
  }

  if (!projection) {
    // Before the map settles, nothing is known to be off screen.
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
  // A card goes only to a pin in the open: one under the cards or the header
  // would point at nothing the User can see.
  const inOpen = (point: MapPoint) =>
    point.x >= cardBounds.left &&
    point.y >= cardBounds.top &&
    point.x <= cardBounds.right &&
    point.y <= cardBounds.bottom
  const priority = (item: MapPinItem) =>
    item.selected ? 0 : item.checked || item.partlyChecked ? 1 : 2

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
      pinOnly: (item.dimmed && !item.selected) || !inOpen(point),
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
