import React, { useState } from "react";
import { SafeAreaView } from "react-native";
import OnBoarding from "./src/components/onboarding/Onboarding";
import { styles } from "./App.styles";
import Home from "./src/screens/Home";
import { usePreferences } from "./src/stores/preferences";

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
  // const [onboardingComplete, setOnboardingComplete] = useState(false);
  const { onboardingComplete, set } = usePreferences();

  return (
    <SafeAreaView style={styles.container}>
      {onboardingComplete ? (
        <Home />
      ) : (
        <OnBoarding
          setOnboardingComplete={(c: boolean) => set({ onboardingComplete: c })}
        />
      )}
    </SafeAreaView>
  );
}
