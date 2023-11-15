import { View } from "react-native";
import { styles } from "../Onboarding.styles";
import Text from "../../MyText";
import i18n from "../../../lib/locales";
import Wrapper from "../../Wrapper";
import ActionButton from "../../ActionButton";

interface Props {
  goNext: () => void;
}

const StepOne = ({ goNext }: Props) => {
  return (
    <Wrapper
      style={{ flexGrow: 1, paddingVertical: 50, paddingHorizontal: 30 }}
    >
      <View style={styles.onboardingTitleWrapper}>
        <View style={styles.textContainer}>
          <Text style={styles.subTitle}>{i18n.t("welcomeTo")}</Text>
          <Text style={styles.title}>{i18n.t("jwTime")}</Text>
        </View>
      </View>
      <ActionButton onPress={goNext}>{i18n.t("getStarted")}</ActionButton>
    </Wrapper>
  );
};

export default StepOne;
