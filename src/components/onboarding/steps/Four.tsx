import React, { useEffect, useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import * as Notifications from "expo-notifications";
import MyText from "../../MyText";
import i18n from "../../../locales";

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
        <MyText style={styles.stepTitle}>{i18n.t("youreAllSet")}</MyText>
        <MyText style={styles.description}>
          {notificationsAllowed
            ? i18n.t("youreAllSet_description")
            : i18n.t("optInNotificationsLater")}
        </MyText>
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={goNext}>
        <MyText style={styles.actionButtonInner}>
          {i18n.t("completeSetup")}
        </MyText>
      </TouchableOpacity>
    </View>
  );
};

export default StepFour;
