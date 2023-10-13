import React, { useState } from "react";
import { StyleSheet, SafeAreaView, Dimensions, View, Text } from "react-native";
import OnBoarding from "./src/components/onboarding/Onboarding";

// async function schedulePushNotification() {
//   await Notifications.scheduleNotificationAsync({
//     content: {
//       title: "You have a return visit today!",
//       body: "John doe ",
//       data: { data: "goes here" },
//     },
//     trigger: { seconds: 6 },
//   });
// }

export default function App() {
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const Home = () => {
    return (
      <View>
        <Text>Home Screen!</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {onboardingComplete ? (
        <Home />
      ) : (
        <OnBoarding setOnboardingComplete={setOnboardingComplete} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    height: Dimensions.get("window").height,
    marginTop: 40,
    marginHorizontal: 25,
  },
});
