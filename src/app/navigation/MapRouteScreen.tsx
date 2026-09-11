import ContactRow from '@/features/contacts/components/ContactRow'
import MapScreen from '@/features/map/screens/MapScreen'

/** Compose the Contacts row into Map without coupling the two feature tiers. */
export default function MapRouteScreen() {
  return (
    <MapScreen
      renderContactRow={(props) => (
        <ContactRow {...props} showsDisclosure={false} />
      )}
    />
  )
}
