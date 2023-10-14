import { View, Pressable, Text, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import { registerForPushNotificationsAsync } from "../../../lib/notifications";
import MyText from "../../MyText";

interface Props {
  goBack: () => void;
  goNext: () => void;
  setOnboardingComplete: (val: boolean) => void;
}

const StepThree = ({ goBack, setOnboardingComplete, goNext }: Props) => {
  return (
    <View style={styles.stepContainer}>
      <OnboardingNav
        goBack={goBack}
        setOnboardingComplete={setOnboardingComplete}
      />
      <View>
        <MyText style={styles.stepTitle}>Never forget a return visit.</MyText>
        <MyText style={styles.description}>
          JW Time will notify you about upcoming visits and remind you to submit
          your service report. You can change this later in the settings.
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
          <MyText style={styles.actionButtonInner}>Allow notifications</MyText>
        </TouchableOpacity>
        <View style={{ alignItems: "center", marginTop: 15 }}>
          <Pressable hitSlop={10} onPress={goNext}>
            <MyText style={styles.navSkip}>Skip</MyText>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default StepThree;
