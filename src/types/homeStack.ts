import type { NativeBottomTabNavigationProp } from '@react-navigation/bottom-tabs/unstable'

/** The Contacts tab's two workspaces. */
export type ContactsView = 'list' | 'map'

export type HomeTabStackParamList = {
  Home: undefined
  /** `view` opens a workspace and remembers it, e.g. the Map from Home. */
  Contacts: { view?: ContactsView; focusSearch?: boolean } | undefined
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
        /** `YYYY-MM-DD`; opens that day's sheet, e.g. from the Calendar widget. */
        date?: string
      }
    | undefined
  /** Only beside the iPad sidebar. */
  Settings: undefined
  /** Not a destination: opens the Quick Action menu instead. */
  QuickAction: undefined
}

export type HomeTabStackNavigation =
  NativeBottomTabNavigationProp<HomeTabStackParamList>
