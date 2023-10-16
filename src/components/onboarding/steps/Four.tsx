import React, { useEffect, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import * as Notifications from "expo-notifications";
import MyText from "../../MyText";

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
        <MyText style={styles.stepTitle}>You're all set!</MyText>
        <MyText style={styles.description}>
          {notificationsAllowed
            ? "JW Time will notify you each month to report your time and more!"
            : "You can opt-in to notifications in the settings later."}
        </MyText>
      </View>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => setOnboardingComplete(true)}
      >
        <MyText style={styles.actionButtonInner}>Complete Setup</MyText>
      </TouchableOpacity>
    </View>
  );
};

export default StepFour;
