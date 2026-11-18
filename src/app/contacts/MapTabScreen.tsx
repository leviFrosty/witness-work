import { useEffect } from 'react'
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import ContactsScreen from '@/features/contacts/screens/ContactsScreen'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { HomeTabStackParamList } from '@/types/homeStack'
import { ContactsMap } from './ContactsTabScreen'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Map'>

export default function MapTabScreen({ navigation }: Props) {
  const { hasSidebar } = useAdaptiveLayout()

  useEffect(() => {
    if (!hasSidebar) navigation.navigate('Contacts', { view: 'map' })
  }, [hasSidebar, navigation])

  return (
    <ContactsScreen
      view='map'
      renderMap={(props) => <ContactsMap {...props} />}
    />
  )
}
