import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'

/** The Contacts tab's two workspaces. */
export type ContactsView = 'list' | 'map'

export type HomeTabStackParamList = {
  Home: undefined
  /** `view` opens a workspace and remembers it, e.g. the Map from Home. */
  Contacts: { view?: ContactsView; focusSearch?: boolean } | undefined
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
