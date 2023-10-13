import { View, Text } from "react-native";
import { usePreferences } from "../stores/preferences";
import { Pressable } from "react-native";
import Header from "../components/layout/Header";
import MonthlyRoutine from "../components/layout/MonthlyRoutine";

const Home = () => {
  const { set } = usePreferences();

  return (
    <View>
      <Header />
      <MonthlyRoutine />
      <Pressable onPress={() => set({ onboardingComplete: false })}>
        <Text>Startup Screen</Text>
      </Pressable>
    </View>
  );
};

export default Home;
