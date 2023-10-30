import { View, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import Text from "../../MyText";
import i18n from "../../../lib/locales";

interface Props {
  goNext: () => void;
}

const StepOne = ({ goNext }: Props) => {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.onboardingTitleWrapper}>
        <View style={styles.textContainer}>
          <Text style={styles.subTitle}>{i18n.t("welcomeTo")}</Text>
          <Text style={styles.title}>{i18n.t("jwTime")}</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={goNext}>
        <Text style={styles.actionButtonInner}>{i18n.t("getStarted")}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StepOne;
