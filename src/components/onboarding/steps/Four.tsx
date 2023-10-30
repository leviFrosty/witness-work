import React, { useEffect, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import * as Notifications from "expo-notifications";
import Text from "../../MyText";
import i18n from "../../../lib/locales";

interface Props {
  goNext: () => void;
  goBack: () => void;
}

const StepFour = ({ goNext, goBack }: Props) => {
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
      <OnboardingNav noActions goBack={goBack} />
      <View>
        <Text style={styles.stepTitle}>{i18n.t("youreAllSet")}</Text>
        <Text style={styles.description}>
          {notificationsAllowed
            ? i18n.t("youreAllSet_description")
            : i18n.t("optInNotificationsLater")}
        </Text>
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={goNext}>
        <Text style={styles.actionButtonInner}>{i18n.t("completeSetup")}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StepFour;
