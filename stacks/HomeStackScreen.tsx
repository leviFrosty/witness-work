import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PropsWithChildren } from "react";
import DashboardScreen from "../screens/DashboardScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { View } from "react-native";

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
      screenOptions={({ route }) => ({
        headerShown: route.name === "Settings",
      })}
    >
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
      <HomeStack.Screen name="Settings" component={SettingsScreen} />
    </HomeStack.Navigator>
  );
};

export default HomeStackScreen;
