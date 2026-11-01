import { useEffect } from 'react'
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import ContactRow from '@/features/contacts/components/ContactRow'
import ContactsScreen from '@/features/contacts/screens/ContactsScreen'
import MapScreen from '@/features/map/screens/MapScreen'
import type { MapContactRowRenderer } from '@/features/map/components/MapContactInspector'
import type { MapRouteActions } from '@/features/map/types/map'
import useDayRouteStopCount from '@/features/route-planning/hooks/useDayRouteStopCount'
import useOpenRouteBuilder from '@/hooks/useOpenRouteBuilder'
import useToday from '@/hooks/useToday'
import type { Contact } from '@/types/contact'

import { usePreferences } from '@/stores/preferences'
import { HomeTabStackParamList } from '@/types/homeStack'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Contacts'>

const renderMapContactRow: MapContactRowRenderer = (props) => (
  <ContactRow {...props} showsDisclosure={false} showOpenInMenu />
)

function useMapRouteActions(): MapRouteActions {
  const openRoute = useOpenRouteBuilder('contacts_map')

  const today = useToday()
  const { count } = useDayRouteStopCount(today)
  return {
    todayStopCount: count,
    openTodayRoute: () => openRoute(),
  }
}

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

export default function ContactsTabScreen({ route, navigation }: Props) {
  const requestedView = route.params?.view

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
