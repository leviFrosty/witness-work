import { View, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import MyText from "../../MyText";
import i18n from "../../../locales";

interface Props {
  goNext: () => void;
}

const StepOne = ({ goNext }: Props) => {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.onboardingTitleWrapper}>
        <View style={styles.textContainer}>
          <MyText style={styles.subTitle}>{i18n.t("hello")}</MyText>
          <MyText style={styles.title}>{i18n.t("welcomeTo")}</MyText>
        </View>
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={goNext}>
        <MyText style={styles.actionButtonInner}>{i18n.t("getStarted")}</MyText>
      </TouchableOpacity>
    </View>
  );
};

export default StepOne;
