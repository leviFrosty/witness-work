import { View, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import Text from "../../MyText";
import i18n from "../../../lib/locales";
import PublisherTypeSelector from "../../PublisherTypeSelector";

interface Props {
  goBack: () => void;
  goNext: () => void;
}

const StepTwo = ({ goBack, goNext }: Props) => {
  return (
    <View style={styles.stepContainer}>
      <OnboardingNav goBack={goBack} />
      <View style={styles.stepContentContainer}>
        <Text style={styles.stepTitle}>
          {i18n.t("whatTypePublisherAreYou")}
        </Text>
        <PublisherTypeSelector />
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={goNext}>
        <Text style={styles.actionButtonInner}>{i18n.t("continue")}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StepTwo;
