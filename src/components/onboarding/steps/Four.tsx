import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";

interface Props {
  goBack: () => void;
  setOnboardingComplete: (val: boolean) => void;
}

const StepFour = ({ goBack, setOnboardingComplete }: Props) => {
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
          JW Time will notify you each month to report your time and more!
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
