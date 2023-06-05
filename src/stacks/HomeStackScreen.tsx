import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PropsWithChildren, useState } from "react";
import DashboardScreen from "../screens/DashboardScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { Call } from "../stores/CallStore";
import CallFormScreen from "../screens/CallFormScreen";
import { HomeContext, newCallBase } from "../contexts/HomeStackContext";
import { HomeStackParamList } from "./ParamLists";
import CallDetailsScreen from "../components/CallDetailsScreen";

interface HomeStackScreenProps {}

const HomeStackScreen: React.FC<
  PropsWithChildren<HomeStackScreenProps>
> = () => {
  const HomeStack = createNativeStackNavigator<HomeStackParamList>();

  const [newCallFromState, setCallState] = useState<Call>(newCallBase());

  return (
    <HomeContext.Provider
      value={{ newCallFromState, setCallState, newCallBase }}
    >
      <HomeStack.Navigator
        initialRouteName="Dashboard"
        screenOptions={{
          headerShown: false,
        }}
      >
        <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
        <HomeStack.Screen name="Settings" component={SettingsScreen} />
        <HomeStack.Screen
          name="CallDetails"
          component={CallDetailsScreen}
          options={{
            presentation: "modal",
          }}
        />
        <HomeStack.Screen
          name="CallForm"
          component={CallFormScreen}
          options={{
            presentation: "modal",
          }}
        />
      </HomeStack.Navigator>
    </HomeContext.Provider>
  );
};

export default HomeStackScreen;
