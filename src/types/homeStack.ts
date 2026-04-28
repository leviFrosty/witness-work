import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'

export type HomeTabStackParamList = {
  Home: undefined
  Contacts: undefined
  Tools: undefined
  Progress:
    | {
        month?: number
        year?: number
        tab?: 'month' | 'year' | 'allTime'
      }
    | undefined
  Schedule: { month: number; year: number } | undefined
  Map: undefined
}

export type HomeTabStackNavigation =
  BottomTabNavigationProp<HomeTabStackParamList>
