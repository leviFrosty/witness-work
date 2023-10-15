import { View, Text } from "react-native";
import { usePreferences } from "../stores/preferences";
import { Pressable } from "react-native";
import MonthlyRoutine from "../components/MonthlyRoutine";
import ServiceReport from "../components/ServiceReport";
import ContactsList from "../components/ContactsList";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Home = () => {
  const { set } = usePreferences();
  const { bottom } = useSafeAreaInsets();

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
        <Pressable onPress={() => set({ onboardingComplete: false })}>
          <Text>Startup Screen</Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollView>
  );
};

export default Home;
