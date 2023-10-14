import { View, Text, ScrollView } from "react-native";
import { usePreferences } from "../stores/preferences";
import { Pressable } from "react-native";
import Header from "../components/layout/Header";
import MonthlyRoutine from "../components/MonthlyRoutine";
import ServiceReport from "../components/ServiceReport";
import ContactsList from "../components/ContactsList";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

const Home = () => {
  const { set } = usePreferences();

  return (
    <View style={{ gap: 20, flexGrow: 1 }}>
      <Header />
      <KeyboardAwareScrollView
        style={{
          flexGrow: 1,
          padding: 5,
        }}
      >
        <View style={{ gap: 30 }}>
          <ServiceReport />
          <MonthlyRoutine />
          <ContactsList />
          <Pressable onPress={() => set({ onboardingComplete: false })}>
            <Text>Startup Screen</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

export default Home;
