import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'

/** Which view the Contacts tab shows: the searchable list or the map. */
export type ContactsView = 'list' | 'map'

export type HomeTabStackParamList = {
  Home: undefined
  Contacts: { view?: ContactsView } | undefined
  Tools: undefined
  Progress:
    | {
        month?: number
        year?: number
        tab?: 'month' | 'year' | 'allTime'
      }
    | undefined
  Schedule: { month: number; year: number } | undefined
  Settings: undefined
}

export type HomeTabStackNavigation =
  BottomTabNavigationProp<HomeTabStackParamList>
