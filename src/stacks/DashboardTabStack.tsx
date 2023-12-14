import {
  createBottomTabNavigator,
  BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs'
import TabBar from '../components/TabBar'
import Map from '../screens/Map'
import HomeScreen from '../screens/Home'

export type HomeTabStackParamList = {
  Home: undefined
  Map: undefined
}

export type HomeTabStackNavigation =
  BottomTabNavigationProp<HomeTabStackParamList>

const HomeTabStack = () => {
  const Tab = createBottomTabNavigator<HomeTabStackParamList>()

  return (
    <Tab.Navigator
      initialRouteName='Home'
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ header: () => null }}
    >
      <Tab.Screen name='Home' component={HomeScreen} />
      <Tab.Screen name='Map' component={Map} />
    </Tab.Navigator>
  )
}

export default HomeTabStack
