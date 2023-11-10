import { View } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import Text from "../../MyText";
import i18n from "../../../lib/locales";
import PublisherTypeSelector from "../../PublisherTypeSelector";
import Wrapper from "../../Wrapper";
import ActionButton from "../../ActionButton";

interface Props {
  goBack: () => void;
  goNext: () => void;
}

const StepTwo = ({ goBack, goNext }: Props) => {
  return (
    <Wrapper
      style={{ flexGrow: 1, padding: 30, justifyContent: "space-between" }}
    >
      <OnboardingNav goBack={goBack} />
      <View style={styles.stepContentContainer}>
        <Text style={styles.stepTitle}>
          {i18n.t("whatTypePublisherAreYou")}
        </Text>
        <PublisherTypeSelector />
      </View>
      <ActionButton action={goNext} label={i18n.t("continue")} />
    </Wrapper>
  );
};

export default StepTwo;
