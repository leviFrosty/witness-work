import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'

export type HomeTabStackParamList = {
  Home: undefined
  Tools: undefined
  Month: { month?: number; year?: number }
  Year: { year?: number }
  Map: undefined
}

export type HomeTabStackNavigation =
  BottomTabNavigationProp<HomeTabStackParamList>
