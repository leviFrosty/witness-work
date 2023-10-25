import { View, Pressable, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import { registerForPushNotificationsAsync } from "../../../lib/notifications";
import MyText from "../../MyText";
import i18n from "../../../lib/locales";

interface Props {
  goBack: () => void;
  goNext: () => void;
}

const StepThree = ({ goBack, goNext }: Props) => {
  return (
    <View style={styles.stepContainer}>
      <OnboardingNav goBack={goBack} />
      <View>
        <MyText style={styles.stepTitle}>
          {i18n.t("neverForgetAReturnVisit")}
        </MyText>
        <MyText style={styles.description}>
          {i18n.t("neverForgetAReturnVisit_description")}
        </MyText>
      </View>
      <View>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={async () => {
            registerForPushNotificationsAsync().then(() => {
              goNext();
            });
          }}
        >
          <MyText style={styles.actionButtonInner}>
            {i18n.t("allowNotifications")}
          </MyText>
        </TouchableOpacity>
        <View style={{ alignItems: "center", marginTop: 15 }}>
          <Pressable hitSlop={10} onPress={goNext}>
            <MyText style={styles.navSkip}>{i18n.t("skip")}</MyText>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default StepThree;
