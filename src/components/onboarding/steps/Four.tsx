import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import * as Notifications from "expo-notifications";
import Text from "../../MyText";
import i18n from "../../../lib/locales";
import Wrapper from "../../Wrapper";
import ActionButton from "../../ActionButton";

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
    <Wrapper
      style={{
        flexGrow: 1,
        paddingHorizontal: 30,
        paddingTop: 60,
        paddingBottom: 60,
        justifyContent: "space-between",
      }}
    >
      <OnboardingNav noActions goBack={goBack} />
      <View>
        <Text style={styles.stepTitle}>{i18n.t("youreAllSet")}</Text>
        <Text style={styles.description}>
          {notificationsAllowed
            ? i18n.t("youreAllSet_description")
            : i18n.t("optInNotificationsLater")}
        </Text>
      </View>
      <ActionButton onPress={goNext}>{i18n.t("completeSetup")}</ActionButton>
    </Wrapper>
  );
};

export default StepFour;
