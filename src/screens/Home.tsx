import { View } from "react-native";
import { usePreferences } from "../stores/preferences";
import MonthlyRoutine from "../components/MonthlyRoutine";
import ServiceReport from "../components/ServiceReport";
import ContactsList from "../components/ContactsList";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useServiceReport from "../stores/serviceReport";
import MyText from "../components/MyText";
import { createDrawerNavigator } from "@react-navigation/drawer";
import Header from "../components/layout/Header";
import Settings from "./Settings";
import theme from "../constants/theme";

const Dashboard = () => {
  const { set } = usePreferences();
  const { bottom } = useSafeAreaInsets();
  const { _WARNING_forceDeleteServiceReport } = useServiceReport();

  return (
    <KeyboardAwareScrollView
      automaticallyAdjustKeyboardInsets
      style={{
        flexGrow: 1,
        padding: 15,
        paddingBottom: bottom,
        backgroundColor: theme.colors.background,
      }}
    >
      <View style={{ gap: 30 }}>
        <MonthlyRoutine />
        <ServiceReport />
        <MyText onPress={() => _WARNING_forceDeleteServiceReport()}>
          Debug: Delete All Service Reports
        </MyText>
        <MyText onPress={() => set({ onboardingComplete: false })}>
          Debug: Go to setup screen
        </MyText>

        <ContactsList />
      </View>
    </KeyboardAwareScrollView>
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
