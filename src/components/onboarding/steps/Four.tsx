import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import * as Notifications from "expo-notifications";

interface Props {
  goBack: () => void;
  setOnboardingComplete: (val: boolean) => void;
}

const StepFour = ({ goBack, setOnboardingComplete }: Props) => {
  const [notificationsAllowed, setNotificationsAllowed] =
    useState<boolean>(false);

  useEffect(() => {
    const fetchNotificationsSetting = async () => {
      const { granted } = await Notifications.getPermissionsAsync();
      setNotificationsAllowed(granted);
    };
    fetchNotificationsSetting();
  }, []);

  return (
    <View style={styles.stepContainer}>
      <OnboardingNav
        noActions
        goBack={goBack}
        setOnboardingComplete={setOnboardingComplete}
      />
      <View>
        <Text style={styles.stepTitle}>You're all set!</Text>
        <Text style={styles.description}>
          {notificationsAllowed
            ? "JW Time will notify you each month to report your time and more!"
            : "You can opt-in to notifications in the settings later."}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => setOnboardingComplete(true)}
      >
        <Text style={styles.actionButtonInner}>Complete Setup</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StepFour;
