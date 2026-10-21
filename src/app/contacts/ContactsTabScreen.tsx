import { useEffect } from 'react'
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import ContactRow from '@/features/contacts/components/ContactRow'
import ContactsScreen from '@/features/contacts/screens/ContactsScreen'
import MapScreen from '@/features/map/screens/MapScreen'
import type { MapContactRowRenderer } from '@/features/map/components/MapContactInspector'

import { usePreferences } from '@/stores/preferences'
import { HomeTabStackParamList } from '@/types/homeStack'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Contacts'>

/** Outside the component, so the Map gets the same function every render. */
const renderMapContactRow: MapContactRowRenderer = (props) => (
  <ContactRow {...props} showsDisclosure={false} showOpenInMenu />
)

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
      renderMap={({ topInset, onExplore, contacts }) => (
        <MapScreen
          contacts={contacts}
          topInset={topInset}
          onExplore={onExplore}
          renderContactRow={renderMapContactRow}
        />
      )}
    />
  )
}
