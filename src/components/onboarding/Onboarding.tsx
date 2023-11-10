import { useEffect, useState } from "react";
import { View } from "react-native";
import StepOne from "./steps/One";
import StepTwo from "./steps/Two";
import StepThree from "./steps/Three";
import StepFour from "./steps/Four";
import { usePreferences } from "../../stores/preferences";

const steps = [StepOne, StepTwo, StepThree, StepFour];

const OnBoarding = () => {
  const { set, onboardingComplete } = usePreferences();
  const [onboardingStep, setOnboardingStep] = useState(0);

  useEffect(() => {
    if (onboardingComplete === false) {
      setOnboardingStep(0);
    }
  }, [onboardingComplete]);

  const goNext = () => {
    if (onboardingStep === steps.length - 1) {
      set({ onboardingComplete: true });
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
      }}
    >
      {renderStep()}
    </View>
  );
};

export default OnBoarding;
