import { useEffect } from 'react'
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import ContactRow from '@/features/contacts/components/ContactRow'
import ContactsScreen from '@/features/contacts/screens/ContactsScreen'
import MapScreen from '@/features/map/screens/MapScreen'
import type { MapContactRowRenderer } from '@/features/map/components/MapContactInspector'
import type { MapRouteActions } from '@/features/map/types/map'
import useDayRouteStopCount from '@/features/route-planning/hooks/useDayRouteStopCount'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import useOpenRouteBuilder from '@/hooks/useOpenRouteBuilder'
import useToday from '@/hooks/useToday'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'

import { usePreferences } from '@/stores/preferences'
import { HomeTabStackParamList } from '@/types/homeStack'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Contacts'>

/** Outside the component, so the Map gets the same function every render. */
const renderMapContactRow: MapContactRowRenderer = (props) => (
  <ContactRow {...props} showsDisclosure={false} showOpenInMenu />
)

/**
 * Today's route for the Map: how many stops it has and whose, a way to open it,
 * and Plan Route for Contacts picked on the Map.
 */
function useMapRouteActions(): MapRouteActions {
  const navigation = useNavigation<RootStackNavigation>()
  const { hasAccess } = useFeatureAccess('routePlanning')
  const openRoute = useOpenRouteBuilder('contacts_map')
  // The same day until midnight, so today's stops aren't worked out again on
  // every render.
  const today = useToday()
  const { count, stops } = useDayRouteStopCount(today)
  return {
    todayStopCount: count,
    todayContactIds: new Set(
      stops.flatMap((stop) => (stop.contactId ? [stop.contactId] : []))
    ),
    openTodayRoute: () => openRoute(),
    planRoute: (contactIds) =>
      navigation.navigate('TodayRoute', { addContactIds: contactIds }),
    maxStops: MAX_ROUTE_STOPS,
    supporter: hasAccess,
  }
}

/**
 * The Map with today's route lent to it. Rendered only while the Map shows, so
 * the list doesn't work out today's route.
 */
function ContactsMap(props: {
  contacts: Contact[]
  topInset: number
  onExplore: () => void
  onExploreEnd: () => void
}) {
  const routeActions = useMapRouteActions()
  return (
    <MapScreen
      {...props}
      renderContactRow={renderMapContactRow}
      routeActions={routeActions}
    />
  )
}

/** Composes the Map into Contacts without coupling the two feature tiers. */
export default function ContactsTabScreen({ route, navigation }: Props) {
  const requestedView = route.params?.view

  // A link to a workspace (e.g. Home's "Try the map") opens and remembers it,
  // then clears so the same link works again after switching back.
  useEffect(() => {
    if (!requestedView) return
    const { contactsView, set } = usePreferences.getState()
    if (requestedView !== contactsView) {
      set({ contactsView: requestedView })
    }
    navigation.setParams({ view: undefined })
  }, [navigation, requestedView])

  return (
    <ContactsScreen
      focusSearch={route.params?.focusSearch}
      onSearchFocused={() => navigation.setParams({ focusSearch: undefined })}
      renderMap={(props) => <ContactsMap {...props} />}
    />
  )
}
