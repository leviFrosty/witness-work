import { View, Pressable } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import { registerForPushNotificationsAsync } from "../../../lib/notifications";
import Text from "../../MyText";
import i18n from "../../../lib/locales";
import Wrapper from "../../Wrapper";
import ActionButton from "../../ActionButton";

interface Props {
  goBack: () => void;
  goNext: () => void;
}

const StepThree = ({ goBack, goNext }: Props) => {
  return (
    <Wrapper
      style={{ flexGrow: 1, padding: 30, justifyContent: "space-between" }}
    >
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
        <ActionButton
          action={async () => {
            registerForPushNotificationsAsync().then(() => {
              goNext();
            });
          }}
          label={i18n.t("allowNotifications")}
        />
        <View style={{ alignItems: "center", marginTop: 15 }}>
          <Pressable hitSlop={10} onPress={goNext}>
            <Text style={styles.navSkip}>{i18n.t("skip")}</Text>
          </Pressable>
        </View>
      </View>
    </Wrapper>
  );
};

export default StepThree;
