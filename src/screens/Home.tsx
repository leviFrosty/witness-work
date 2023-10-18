import { View } from "react-native";
import MonthlyRoutine from "../components/MonthlyRoutine";
import ServiceReport from "../components/ServiceReport";
import ContactsList from "../components/ContactsList";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createDrawerNavigator } from "@react-navigation/drawer";
import Header from "../components/layout/Header";
import Settings from "./Settings";
import theme from "../constants/theme";

const Dashboard = () => {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flexGrow: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom }}
        automaticallyAdjustKeyboardInsets
        style={{
          flexGrow: 1,
          padding: 15,
        }}
      >
        <View style={{ gap: 30, paddingBottom: insets.bottom }}>
          <MonthlyRoutine />
          <ServiceReport />
          <ContactsList />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

const HomeScreen = () => {
  const Drawer = createDrawerNavigator();

  return (
    <Drawer.Navigator
      screenOptions={{
        header: ({ navigation }) => (
          <Header onPressLeftIcon={() => navigation.toggleDrawer()} />
        ),
      }}
      drawerContent={Settings}
    >
      <Drawer.Screen name="Dashboard" component={Dashboard} />
    </Drawer.Navigator>
  );
};
export default HomeScreen;
