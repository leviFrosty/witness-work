import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'

export type ContactsView = 'list' | 'map'

export type HomeTabStackParamList = {
  Home: undefined

  Contacts: { view?: ContactsView; focusSearch?: boolean } | undefined
  Tools: undefined
  Progress:
    | {
        month?: number
        year?: number
        tab?: 'month' | 'year' | 'allTime'
      }
    | undefined
  Schedule:
    | {
        month?: number
        year?: number

        date?: string
      }
    | undefined
  Settings: undefined

  Buddies: undefined
}

export type HomeTabStackNavigation =
  BottomTabNavigationProp<HomeTabStackParamList>
