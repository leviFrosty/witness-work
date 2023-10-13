import { View, Pressable, Text } from "react-native";
import { styles } from "./Onboarding.styles";

interface Props {
  noActions?: boolean;
  goBack: () => void;
  setOnboardingComplete: (val: boolean) => void;
}

const OnboardingNav = ({ noActions, goBack, setOnboardingComplete }: Props) => {
  return (
    <View style={styles.navContainer}>
      {!noActions ? (
        <Text style={styles.navBack} onPress={goBack}>
          {"<"}
        </Text>
      ) : null}
      <Text style={styles.navTitle}>JW Time</Text>
    </View>
  );
};

export default OnboardingNav;
