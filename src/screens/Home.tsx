import { createDrawerNavigator } from '@react-navigation/drawer'
import Header from '../components/layout/Header'
import Settings from './settings/Settings'
import { Dashboard } from './Dashboard'

const HomeScreen = () => {
  const Drawer = createDrawerNavigator()

  return (
    <Drawer.Navigator
      screenOptions={{
        header: ({ navigation }) => (
          <Header onPressLeftIcon={() => navigation.toggleDrawer()} />
        ),
      }}
      drawerContent={Settings}
      initialRouteName='Dashboard'
    >
      <Drawer.Screen name='Dashboard' component={Dashboard} />
    </Drawer.Navigator>
  )
}
export default HomeScreen
