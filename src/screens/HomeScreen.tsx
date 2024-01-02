import { createDrawerNavigator } from '@react-navigation/drawer'
import Header from '../components/layout/Header'
import SettingsScreen from './settings/SettingsScreen'
import { DashboardScreen } from './DashboardScreen'

const HomeScreen = () => {
  const Drawer = createDrawerNavigator()

  return (
    <Drawer.Navigator
      screenOptions={{
        header: ({ navigation }) => (
          <Header onPressLeftIcon={() => navigation.toggleDrawer()} />
        ),
      }}
      drawerContent={SettingsScreen}
      initialRouteName='Dashboard'
    >
      <Drawer.Screen name='Dashboard' component={DashboardScreen} />
    </Drawer.Navigator>
  )
}
export default HomeScreen
