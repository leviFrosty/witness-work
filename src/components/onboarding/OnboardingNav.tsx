import { View, TouchableOpacity } from "react-native";
import { styles } from "./Onboarding.styles";
import { FontAwesome } from "@expo/vector-icons";
import MyText from "../MyText";

interface Props {
  noActions?: boolean;
  goBack: () => void;
  setOnboardingComplete: (val: boolean) => void;
}

const OnboardingNav = ({ noActions, goBack }: Props) => {
  return (
    <View style={styles.navContainer}>
      {!noActions ? (
        <TouchableOpacity hitSlop={20} style={styles.navBack} onPress={goBack}>
          <FontAwesome style={styles.chevronLeft} name="chevron-left" />
        </TouchableOpacity>
      ) : null}
      <MyText style={styles.navTitle}>JW Time</MyText>
    </View>
  );
};

export default OnboardingNav;
