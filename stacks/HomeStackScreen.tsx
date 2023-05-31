import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PropsWithChildren } from "react";
import DashboardScreen from "../screens/DashboardScreen";
import SettingsScreen from "../screens/SettingsScreen";

interface HomeStackScreenProps {}

export type HomeStackParamList = {
  Dashboard: undefined;
  Settings: undefined;
};

const HomeStackScreen: React.FC<PropsWithChildren<HomeStackScreenProps>> = ({
  children,
}) => {
  const HomeStack = createNativeStackNavigator<HomeStackParamList>();
  return (
    <HomeStack.Navigator
      initialRouteName="Dashboard"
      screenOptions={{ headerShown: false }}
    >
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
      <HomeStack.Screen name="Settings" component={SettingsScreen} />
    </HomeStack.Navigator>
  );
};

export default HomeStackScreen;
