import { useState } from "react";
import { View } from "react-native";
import StepOne from "./steps/One";
import StepTwo from "./steps/Two";
import StepThree from "./steps/Three";
import StepFour from "./steps/Four";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const steps = [StepOne, StepTwo, StepThree, StepFour];

interface Props {
  setOnboardingComplete: (val: boolean) => void;
}

const OnBoarding = ({ setOnboardingComplete }: Props) => {
  const [onboardingStep, setOnboardingStep] = useState(0);
  const insets = useSafeAreaInsets();

  const goNext = () => {
    if (onboardingStep === steps.length - 1) {
      setOnboardingComplete(true);
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
        return (
          <StepTwo
            goBack={goBack}
            goNext={goNext}
            setOnboardingComplete={setOnboardingComplete}
          />
        );
      case 2:
        return (
          <StepThree
            goBack={goBack}
            goNext={goNext}
            setOnboardingComplete={setOnboardingComplete}
          />
        );
      case 3:
        return (
          <StepFour
            goBack={goBack}
            setOnboardingComplete={setOnboardingComplete}
          />
        );
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
