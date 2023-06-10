import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { PropsWithChildren } from "react";
import DashboardScreen from "../screens/DashboardScreen";
import SettingsScreen from "../screens/SettingsScreen";
import CallFormScreen from "../screens/CallFormScreen";
import { HomeStackParamList } from "./ParamLists";
import CallDetailsScreen from "../screens/CallDetailsScreen";
import VisitFormScreen from "../screens/VisitFormScreen";
import ServiceRecordFormScreen from "../screens/ServiceRecordFormScreen";

interface HomeStackScreenProps {}

const HomeStackScreen: React.FC<
  PropsWithChildren<HomeStackScreenProps>
> = () => {
  const HomeStack = createNativeStackNavigator<HomeStackParamList>();
  return (
    <HomeStack.Navigator
      initialRouteName="Dashboard"
      screenOptions={{
        headerShown: false,
      }}
    >
      <HomeStack.Screen name="Dashboard" component={DashboardScreen} />
      <HomeStack.Screen name="Settings" component={SettingsScreen} />
      <HomeStack.Screen
        name="VisitForm"
        component={VisitFormScreen}
        options={{
          presentation: "fullScreenModal",
          gestureEnabled: false,
        }}
      />
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
          presentation: "fullScreenModal",
        }}
      />
      <HomeStack.Screen
        name="ServiceRecordForm"
        component={ServiceRecordFormScreen}
        options={{
          presentation: "modal",
        }}
      />
    </HomeStack.Navigator>
  );
};

export default HomeStackScreen;
