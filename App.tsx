import React, { useState } from "react";
import { SafeAreaView } from "react-native";
import OnBoarding from "./src/components/onboarding/Onboarding";
import { styles } from "./App.styles";
import Home from "./src/screens/Home";

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
