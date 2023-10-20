import { useEffect, useState } from "react";
import { View } from "react-native";
import StepOne from "./steps/One";
import StepTwo from "./steps/Two";
import StepThree from "./steps/Three";
import StepFour from "./steps/Four";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferences } from "../../stores/preferences";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../../stacks/RootStack";

const steps = [StepOne, StepTwo, StepThree, StepFour];

const OnBoarding = () => {
  const { set, onboardingComplete } = usePreferences();
  const navigation = useNavigation<RootStackNavigation>();
  const [onboardingStep, setOnboardingStep] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (onboardingComplete === false) {
      setOnboardingStep(0);
    }
  }, [onboardingComplete]);

  const goNext = () => {
    if (onboardingStep === steps.length - 1) {
      set({ onboardingComplete: true });
      navigation.navigate("Home");
      return;
    }
    setOnboardingStep(onboardingStep + 1);
  };

  const goBack = () => {
    if (onboardingStep === 0) {
      return;
    }
    setOnboardingStep(onboardingStep - 1);
  };

  const renderStep = () => {
    switch (onboardingStep) {
      case 0:
        return <StepOne goNext={goNext} />;
      case 1:
        return <StepTwo goBack={goBack} goNext={goNext} />;
      case 2:
        return <StepThree goBack={goBack} goNext={goNext} />;
      case 3:
        return <StepFour goNext={goNext} goBack={goBack} />;
    }
  };

  return (
    <View
      style={{
        flexGrow: 1,
        paddingTop: insets.top,
        paddingHorizontal: 20,
      }}
    >
      {renderStep()}
    </View>
  );
};

export default OnBoarding;
