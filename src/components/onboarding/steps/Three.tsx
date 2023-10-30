import { View, Pressable, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import { registerForPushNotificationsAsync } from "../../../lib/notifications";
import Text from "../../MyText";
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
        <Text style={styles.stepTitle}>
          {i18n.t("neverForgetAReturnVisit")}
        </Text>
        <Text style={styles.description}>
          {i18n.t("neverForgetAReturnVisit_description")}
        </Text>
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
          <Text style={styles.actionButtonInner}>
            {i18n.t("allowNotifications")}
          </Text>
        </TouchableOpacity>
        <View style={{ alignItems: "center", marginTop: 15 }}>
          <Pressable hitSlop={10} onPress={goNext}>
            <Text style={styles.navSkip}>{i18n.t("skip")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default StepThree;
