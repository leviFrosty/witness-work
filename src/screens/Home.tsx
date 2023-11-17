import { View } from "react-native";
import MonthlyRoutine from "../components/MonthlyRoutine";
import ServiceReport from "../components/ServiceReport";
import ContactsList from "../components/ContactsList";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createDrawerNavigator } from "@react-navigation/drawer";
import Header from "../components/layout/Header";
import Settings from "./Settings";
import useTheme from "../contexts/theme";
import { useEffect, useMemo } from "react";
import { useNavigation } from "@react-navigation/native";
import * as Updates from "expo-updates";
import * as Sentry from "sentry-expo";
import { RootStackNavigation } from "../stacks/RootStack";
import useConversations from "../stores/conversationStore";
import { upcomingFollowUpConversations } from "../lib/conversations";
import ApproachingConversations from "../components/ApproachingConversations";

const Dashboard = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { conversations } = useConversations();

  const now = useMemo(() => new Date(), []);

  const approachingConversations = useMemo(
    () =>
      upcomingFollowUpConversations({
        currentTime: now,
        conversations,
        withinNextDays: 1,
      }),
    [conversations, now]
  );

  const conversationsWithNotificationOrTopic = conversations.filter(
    (c) => c.followUp?.notifyMe || c.followUp?.topic
  );

  return (
    <View style={{ flexGrow: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
        automaticallyAdjustKeyboardInsets
        style={{
          flexGrow: 1,
          padding: 15,
          paddingBottom: insets.bottom,
        }}
      >
        <View style={{ gap: 30, paddingBottom: insets.bottom, flex: 1 }}>
          {!!approachingConversations.length && (
            <ApproachingConversations
              conversations={conversationsWithNotificationOrTopic}
            />
          )}
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
  const navigation = useNavigation<RootStackNavigation>();

  useEffect(() => {
    const checkForUpdate = async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          navigation.navigate("Update");
        }
      } catch (error) {
        Sentry.Native.captureException(error);
      }
    };
    if (!__DEV__) {
      checkForUpdate();
    }
  }, [navigation]);

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
