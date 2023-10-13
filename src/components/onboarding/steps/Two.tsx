import { View, Text, TouchableOpacity } from "react-native";
import { styles } from "../Onboarding.styles";
import OnboardingNav from "../OnboardingNav";
import DropDownPicker from "react-native-dropdown-picker";
import { useState } from "react";
import {
  Publisher,
  publisherHours,
  publishers,
} from "../../../types/publisher";
import { usePreferences } from "../../../stores/preferences";

interface Props {
  goBack: () => void;
  goNext: () => void;
  setOnboardingComplete: (val: boolean) => void;
}

const StepTwo = ({ goBack, setOnboardingComplete, goNext }: Props) => {
  // const [publisher, setPublisher] = useState<Publisher>("publisher");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([
    { label: "Publisher", value: publishers[0] },
    { label: "Regular Auxiliary", value: publishers[1] },
    { label: "Regular Pioneer", value: publishers[2] },
    { label: "Circuit Overseer", value: publishers[3] },
    { label: "Special Pioneer", value: publishers[4] },
  ]);

  const { publisher, setPublisher } = usePreferences();

  return (
    <View style={styles.stepContainer}>
      <OnboardingNav
        goBack={goBack}
        setOnboardingComplete={setOnboardingComplete}
      />
      <View style={styles.stepContentContainer}>
        <Text style={styles.stepTitle}>What type of publisher are you?</Text>
        <DropDownPicker
          open={open}
          value={publisher}
          items={items}
          setOpen={setOpen}
          setValue={(val: any) => setPublisher(val())}
          setItems={setItems}
          style={styles.dropDownPicker}
          dropDownContainerStyle={styles.dropDownOptionsContainer}
          itemSeparatorStyle={styles.dropDownSeparatorStyles}
          itemSeparator={true}
        />
        <Text style={styles.description}>
          {publisher === publishers[0]
            ? "No hour requirement"
            : `${publisherHours[publisher]} Hour Monthly Requirement`}
        </Text>
      </View>
      <TouchableOpacity style={styles.actionButton} onPress={goNext}>
        <Text style={styles.actionButtonInner}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StepTwo;
