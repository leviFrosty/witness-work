import { View, TouchableOpacity } from "react-native";
import { styles } from "./Onboarding.styles";
import { FontAwesome } from "@expo/vector-icons";
import Text from "../MyText";
import i18n from "../../lib/locales";

interface Props {
  noActions?: boolean;
  goBack: () => void;
}

const OnboardingNav = ({ noActions, goBack }: Props) => {
  return (
    <View style={styles.navContainer}>
      {!noActions ? (
        <TouchableOpacity hitSlop={20} style={styles.navBack} onPress={goBack}>
          <FontAwesome style={styles.chevronLeft} name="chevron-left" />
        </TouchableOpacity>
      ) : null}
      <Text style={styles.navTitle}>{i18n.t("jwTime")}</Text>
    </View>
  );
};

export default OnboardingNav;
