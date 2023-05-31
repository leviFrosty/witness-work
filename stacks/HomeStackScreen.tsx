import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PropsWithChildren } from "react";
import HomeScreen from "../screens/HomeScreen";
import SettingsScreen from "../screens/SettingsScreen";

interface HomeStackScreenProps {}

export type HomeStackParamList = {
  Home: undefined;
  Settings: undefined;
};

const HomeStackScreen: React.FC<PropsWithChildren<HomeStackScreenProps>> = ({
  children,
}) => {
  const HomeStack = createNativeStackNavigator<HomeStackParamList>();
  return (
    <HomeStack.Navigator
      initialRouteName="Home"
      screenOptions={{ headerShown: false }}
    >
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Settings" component={SettingsScreen} />
    </HomeStack.Navigator>
  );
};

export default HomeStackScreen;
