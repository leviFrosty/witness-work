import { useNavigation } from '@react-navigation/native'
import type {
  ContextMenuAction,
  ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import { useTerritoryPrivacy } from '@/hooks/useTerritoryPrivacy'
import { analytics } from '@/lib/analytics'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useLeaveReceived from '@/features/territories/hooks/useLeaveReceived'
import useTerritoryActions from '@/features/territories/hooks/useTerritoryActions'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import {
  streetMenuItems,
  territoryMapTarget,
  territoryMenuItems,
  type StreetMenuItem,
  type TerritoryMenuItem,
} from '@/features/territories/lib/menuItems'
import { openTerritoryInMaps } from '@/features/territories/lib/openTerritory'
import { isReceivedLive } from '@/features/territories/lib/sharing'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'
import type { RootStackNavigation } from '@/types/rootStack'

type Entry = Omit<ContextMenuAction, 'id'>

const entries =
  <Item extends TerritoryMenuItem | StreetMenuItem>(
    surface: 'territory' | 'street',
    items: readonly Item[]
  ) =>
  (id: Item, entry: Entry) =>
    items.includes(id) && {
      ...entry,
      id,
      onPress: () => {
        analytics.capture('territory_menu_action', { surface, action: id })
        entry.onPress()
      },
    }

export function useTerritoryMenu(territory: Territory): ContextMenuEntries {
  const navigation = useNavigation<RootStackNavigation>()
  const privacy = useTerritoryPrivacy()
  const provider = usePreferences((state) => state.defaultNavigationMapProvider)
  const actions = useTerritoryActions()
  const leave = useLeaveReceived(territory)
  const territoryId = territory.id
  const items = territoryMenuItems(territory, { privacy })
  const map = territoryMapTarget(territory, privacy)

  const item = entries('territory', items)

  const leaveTitle = !isReceivedLive(territory)
    ? 'territories.share.removeFromList'
    : territory.received?.kind === 'handoff'
      ? 'territories.share.giveBack'
      : 'territories.share.leave'

  return [
    [
      item('map', {
        title: i18n.t(
          map?.kind === 'card'
            ? 'territories.menu.viewCard'
            : 'territories.menu.openMap'
        ),
        systemImage: map?.kind === 'card' ? 'photo' : 'map',
        onPress: () =>
          map?.kind === 'link'
            ? void openURL(map.url)
            : navigation.navigate('TerritoryMap', {
                territoryId,
                view: map?.kind === 'card' ? 'card' : undefined,
              }),
      }),
      item('directions', {
        title: i18n.t('directions'),
        systemImage: 'arrow.triangle.turn.up.right.diamond',
        onPress: () => openTerritoryInMaps(territory, provider),
      }),
      item('share', {
        title: i18n.t('territories.share.action'),
        systemImage: 'person.2',
        onPress: () => navigation.navigate('TerritoryShare', { territoryId }),
      }),
    ],
    [
      item('notes', {
        title: i18n.t('territories.notes.action'),
        systemImage: 'square.and.pencil',
        onPress: () => navigation.navigate('TerritoryNotes', { territoryId }),
      }),
      item('edit', {
        title: i18n.t('territories.editTitle'),
        systemImage: 'pencil',
        onPress: () => navigation.navigate('TerritoryForm', { territoryId }),
      }),
    ],
    [
      item('reopen', {
        title: i18n.t('territories.reopen'),
        systemImage: 'arrow.uturn.backward',
        onPress: () => actions.reopen(territory),
      }),
      item('checkOutAgain', {
        title: i18n.t('territories.checkOutAgain'),
        systemImage: 'arrow.clockwise',
        onPress: () => actions.requestCheckOutAgain(territory),
      }),
      item('return', {
        title: i18n.t('territories.finish'),
        systemImage: 'archivebox',
        onPress: () => actions.requestReturn(territory),
      }),
    ],
    [
      item('leave', {
        title: i18n.t(leaveTitle),
        systemImage:
          leaveTitle === 'territories.share.giveBack'
            ? 'arrow.uturn.backward'
            : 'person.badge.minus',
        onPress: leave,
        destructive: leaveTitle !== 'territories.share.giveBack',
      }),
      item('delete', {
        title: i18n.t('territories.delete'),
        systemImage: 'trash',
        onPress: () => actions.requestDelete(territory),
        destructive: true,
      }),
    ],
  ]
}

export function useStreetMenu() {
  const navigation = useNavigation<RootStackNavigation>()
  const privacy = useTerritoryPrivacy()
  const { buddiesAvailable } = useTerritorySharing()
  const actions = useTerritoryActions()

  return (
    territory: Territory,
    street: TerritoryStreet
  ): ContextMenuEntries => {
    const territoryId = territory.id
    const streetId = street.id
    const items = streetMenuItems(territory, street, {
      privacy,
      buddiesAvailable,
    })
    const map = territoryMapTarget(territory, privacy, streetId)
    const item = entries('street', items)

    return [
      [
        item('markWorked', {
          title: i18n.t('territories.markWorked'),
          systemImage: 'checkmark.circle',
          onPress: () => actions.setStreetWorked(territory, streetId, true),
        }),
        item('markNotWorked', {
          title: i18n.t('territories.markNotWorked'),
          systemImage: 'xmark.circle',
          onPress: () => actions.setStreetWorked(territory, streetId, false),
        }),
        item('map', {
          title: i18n.t(
            map?.kind === 'card'
              ? 'territories.menu.viewCard'
              : 'territories.menu.showOnMap'
          ),
          systemImage: map?.kind === 'card' ? 'photo' : 'map',
          onPress: () =>
            navigation.navigate('TerritoryMap', {
              territoryId,
              streetId: map?.kind === 'link' ? undefined : map?.streetId,
              view: map?.kind === 'card' ? 'card' : undefined,
            }),
        }),
      ],
      [
        item('share', {
          title: i18n.t('territories.share.action'),
          systemImage: 'person.2',
          onPress: () =>
            navigation.navigate('TerritoryShare', { territoryId, streetId }),
        }),
        item('handOff', {
          title: i18n.t('territories.share.handOffAction'),
          systemImage: 'hand.raised',
          onPress: () =>
            navigation.navigate('TerritoryHandoff', { territoryId, streetId }),
        }),
        item('notes', {
          title: i18n.t('territories.notes.action'),
          systemImage: 'square.and.pencil',
          onPress: () =>
            navigation.navigate('TerritoryNotes', { territoryId, streetId }),
        }),
        item('edit', {
          title: i18n.t('territories.editStreet'),
          systemImage: 'pencil',
          onPress: () =>
            navigation.navigate('TerritoryStreetForm', {
              territoryId,
              streetId,
            }),
        }),
      ],
      [
        item('delete', {
          title: i18n.t('territories.deleteStreet'),
          systemImage: 'trash',
          onPress: () => actions.requestDeleteStreet(territory, streetId),
          destructive: true,
        }),
      ],
    ]
  }
}
