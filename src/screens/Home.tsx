import { View, Text } from "react-native";
import { usePreferences } from "../stores/preferences";
import { Pressable } from "react-native";

const Home = () => {
  const { set } = usePreferences();

  return (
    <View>
      <Text>Home Screen!</Text>
      <Pressable onPress={() => set({ onboardingComplete: false })}>
        <Text>Startup Screen</Text>
      </Pressable>
    </View>
  );
};

export default Home;
