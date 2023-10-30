import { View, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import DropDownPicker from "react-native-dropdown-picker";
import { useState } from "react";
import { usePreferences } from "../../../stores/preferences";
import { publisherHours, publishers } from "../../../constants/publisher";
import Text from "../../MyText";
import i18n from "../../../lib/locales";

interface Props {
  goBack: () => void;
  goNext: () => void;
}

const StepTwo = ({ goBack, goNext }: Props) => {
  // const [publisher, setPublisher] = useState<Publisher>("publisher");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([
    { label: i18n.t("publisher"), value: publishers[0] },
    { label: i18n.t("regularAuxiliary"), value: publishers[1] },
    { label: i18n.t("regularPioneer"), value: publishers[2] },
    { label: i18n.t("circuitOverseer"), value: publishers[3] },
    { label: i18n.t("specialPioneer"), value: publishers[4] },
  ]);

  const { publisher, setPublisher } = usePreferences();

  return (
    <View style={styles.stepContainer}>
      <OnboardingNav goBack={goBack} />
      <View style={styles.stepContentContainer}>
        <Text style={styles.stepTitle}>
          {i18n.t("whatTypePublisherAreYou")}
        </Text>
        <DropDownPicker
          open={open}
          value={publisher}
          items={items}
          setOpen={setOpen}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setValue={(val: any) => setPublisher(val())}
          setItems={setItems}
          style={styles.dropDownPicker}
          dropDownContainerStyle={styles.dropDownOptionsContainer}
          itemSeparatorStyle={styles.dropDownSeparatorStyles}
          itemSeparator={true}
        />
        <Text style={styles.description}>
          {publisher === publishers[0]
            ? i18n.t("noHourRequirement")
            : i18n.t("hourMonthlyRequirement", {
                count: publisherHours[publisher],
              })}
        </Text>
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={goNext}>
        <Text style={styles.actionButtonInner}>{i18n.t("continue")}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StepTwo;
