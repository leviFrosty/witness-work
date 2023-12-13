import { createDrawerNavigator } from '@react-navigation/drawer'
import Header from '../components/layout/Header'
import Settings from './Settings'

import HomeTabStack from '../stacks/DashboardTabStack'

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
      <Drawer.Screen name='Dashboard' component={HomeTabStack} />
    </Drawer.Navigator>
  )
}
export default HomeScreen
