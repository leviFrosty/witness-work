import { View, Pressable, Text } from "react-native";
import { styles } from "../Onboarding.styles";

interface Props {
  goNext: () => void;
}

const StepOne = ({ goNext }: Props) => {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.onboardingTitleWrapper}>
        <View style={styles.textContainer}>
          <Text style={styles.subTitle}>Welcome to</Text>
          <Text style={styles.title}>JW Time</Text>
        </View>
      </View>
      <Pressable style={styles.actionButton} onPress={goNext}>
        <Text style={styles.actionButtonInner}>Get Started</Text>
      </Pressable>
    </View>
  );
};

export default StepOne;
