import type { ContextMenuAction } from '@/components/ui/ContextMenu.types'
import i18n from '@/lib/locales'
import {
  SAVED_PLACE_KINDS,
  type SavedPlace,
  type SavedPlaceKind,
} from '@/features/route-planning/lib/routeBuilder'

export const SAVED_PLACE_SYMBOLS = {
  home: 'house',
  kingdomHall: 'building.2',
} as const satisfies Record<SavedPlaceKind, string>

export const savedPlaceLabel = (kind: SavedPlaceKind) =>
  i18n.t(kind === 'home' ? 'routeBuilder_home' : 'routeBuilder_kingdomHall')

/** A saved place as the route shows it: "Home", over its address. */
export const savedPlaceOnRoute = (
  kind: SavedPlaceKind,
  place: SavedPlace
): SavedPlace => ({
  ...place,
  title: savedPlaceLabel(kind),
  subtitle: place.title,
})

/**
 * Home and Kingdom Hall in a start or finish menu: picks the saved place, or
 * offers to save it first.
 */
export const savedPlaceActions = ({
  places,
  checked,
  onPick,
  onSet,
}: {
  places: Partial<Record<SavedPlaceKind, SavedPlace>>
  /** The saved place in use now. */
  checked?: SavedPlaceKind
  /** With the place as the route shows it (see `savedPlaceOnRoute`). */
  onPick: (kind: SavedPlaceKind, place: SavedPlace) => void
  onSet: (kind: SavedPlaceKind) => void
}): ContextMenuAction[] =>
  SAVED_PLACE_KINDS.map((kind) => {
    const place = places[kind]
    return place
      ? {
          id: `saved-${kind}`,
          title: savedPlaceLabel(kind),
          systemImage: SAVED_PLACE_SYMBOLS[kind],
          checked: checked === kind,
          onPress: () => onPick(kind, savedPlaceOnRoute(kind, place)),
        }
      : {
          id: `set-${kind}`,
          title: i18n.t('routeBuilder_setSavedPlace', {
            place: savedPlaceLabel(kind),
          }),
          systemImage: SAVED_PLACE_SYMBOLS[kind],
          onPress: () => onSet(kind),
        }
  })
