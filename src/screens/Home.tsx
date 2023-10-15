import { View } from "react-native";
// import { usePreferences } from "../stores/preferences";
// import { Pressable } from "react-native";
import MonthlyRoutine from "../components/MonthlyRoutine";
import ServiceReport from "../components/ServiceReport";
import ContactsList from "../components/ContactsList";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// import * as Notifications from "expo-notifications";
// import { useEffect } from "react";

const Home = () => {
  // const { set } = usePreferences();
  const { bottom } = useSafeAreaInsets();

  // useEffect(() => {
  //   // const cancelAllNotifs = async () => {
  //   //   await Notifications.cancelAllScheduledNotificationsAsync();
  //   // };
  //   // cancelAllNotifs();
  //   // const scheduledNotifs = async () =>
  //   //   await Notifications.getAllScheduledNotificationsAsync();
  //   // scheduledNotifs().then((result) =>
  //   //   console.log("Scheduled Notifications\n", JSON.stringify(result, null, 2))
  //   // );
  // }, []);

  return (
    <KeyboardAwareScrollView
      automaticallyAdjustKeyboardInsets
      style={{
        flexGrow: 1,
        padding: 15,
        paddingBottom: bottom,
      }}
    >
      <View style={{ gap: 30 }}>
        <MonthlyRoutine />
        <ServiceReport />
        <ContactsList />
        {/* <Pressable onPress={() => set({ onboardingComplete: false })}>
          <MyText>Startup Screen</MyText>
        </Pressable> */}
      </View>
    </KeyboardAwareScrollView>
  );
};

export default Home;
