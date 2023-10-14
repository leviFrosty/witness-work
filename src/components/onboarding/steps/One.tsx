import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import MyText from "../../MyText";

interface Props {
  goNext: () => void;
}

const StepOne = ({ goNext }: Props) => {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.onboardingTitleWrapper}>
        <View style={styles.textContainer}>
          <MyText style={styles.subTitle}>Welcome to</MyText>
          <MyText style={styles.title}>JW Time</MyText>
        </View>
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={goNext}>
        <MyText style={styles.actionButtonInner}>Get Started</MyText>
      </TouchableOpacity>
    </View>
  );
};

export default StepOne;
