import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  SafeAreaView,
  Platform,
  Dimensions,
} from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import DropDownPicker from "react-native-dropdown-picker";

// async function schedulePushNotification() {
//   await Notifications.scheduleNotificationAsync({
//     content: {
//       title: "You have a return visit today!",
//       body: "John doe ",
//       data: { data: "goes here" },
//     },
//     trigger: { seconds: 6 },
//   });
// }

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      alert("Failed to get push token for push notification!");
      return;
    }
  } else {
    alert("Must use physical device for Push Notifications");
  }

  return token;
}

const publisherTypes = [
  "publisher",
  "regularAuxiliary",
  "regularPioneer",
  "circuitOverseer",
  "specialPioneer",
] as const;

type PublisherType = (typeof publisherTypes)[number];

const publisherTypeHours = {
  publisher: 0,
  regularAuxiliary: 30,
  regularPioneer: 50,
  circuitOverseer: 70,
  specialPioneer: 90,
};

export default function App() {
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [publisherType, setPublisherType] =
    useState<PublisherType>("publisher");
  const [open, setOpen] = useState(false);

  const [items, setItems] = useState([
    { label: "Publisher", value: publisherTypes[0] },
    { label: "Regular Auxiliary", value: publisherTypes[1] },
    { label: "Regular Pioneer", value: publisherTypes[2] },
    { label: "Circuit Overseer", value: publisherTypes[3] },
    { label: "Special Pioneer", value: publisherTypes[4] },
  ]);

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

  const Nav = ({ noActions }: { noActions?: boolean }) => {
    return (
      <View style={styles.navContainer}>
        {!noActions ? (
          <Text style={styles.navBack} onPress={goBack}>
            {"<"}
          </Text>
        ) : (
          <Text></Text>
        )}
        <Text style={styles.navTitle}>JW Time</Text>
        {!noActions ? (
          <Text
            style={styles.navSkip}
            onPress={() => setOnboardingComplete(true)}
          >
            Skip
          </Text>
        ) : (
          <Text></Text>
        )}
      </View>
    );
  };

  const StepOne = () => {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.onboardingTitleWrapper}>
          <View style={styles.textContainer}>
            <Text style={styles.subTitle}>Welcome to</Text>
            <Text style={styles.title}>JW Time</Text>
          </View>
        </View>
        <Pressable style={styles.actionButton} onPress={goNext}>
          <Text style={styles.actionButtonInner}>Get Started</Text>
        </Pressable>
      </View>
    );
  };

  const StepTwo = () => {
    return (
      <View style={styles.stepContainer}>
        <Nav />
        <View style={styles.stepContentContainer}>
          <Text style={styles.stepTitle}>What type of publisher are you?</Text>
          <DropDownPicker
            open={open}
            value={publisherType}
            items={items}
            setOpen={setOpen}
            setValue={setPublisherType}
            setItems={setItems}
            style={styles.dropDownPicker}
            dropDownContainerStyle={styles.dropDownOptionsContainer}
            itemSeparatorStyle={styles.dropDownSeparatorStyles}
            itemSeparator={true}
          />
          <Text style={styles.description}>
            {publisherType === publisherTypes[0]
              ? "No hour requirement"
              : `${publisherTypeHours[publisherType]} Hour Monthly Requirement`}
          </Text>
        </View>
        <Pressable style={styles.actionButton} onPress={goNext}>
          <Text style={styles.actionButtonInner}>Continue</Text>
        </Pressable>
      </View>
    );
  };

  const StepThree = () => {
    return (
      <View style={styles.stepContainer}>
        <Nav />
        <View>
          <Text style={styles.stepTitle}>Never forget a return visit.</Text>
          <Text style={styles.description}>
            JW Time will notify you about upcoming visits and remind you to
            submit your service report. You can change this later in the
            settings.
          </Text>
        </View>
        <View>
          <Pressable
            style={styles.actionButton}
            onPress={async () => {
              registerForPushNotificationsAsync().then(() => {
                setOnboardingStep(onboardingStep + 1);
              });
            }}
          >
            <Text style={styles.actionButtonInner}>Allow notifications</Text>
          </Pressable>
          <View style={{ alignItems: "center", marginTop: 15 }}>
            <Pressable
              hitSlop={10}
              onPress={() => setOnboardingStep(onboardingStep + 1)}
            >
              <Text style={styles.navSkip}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const StepFour = () => {
    return (
      <View style={styles.stepContainer}>
        <Nav noActions />
        <View>
          <Text style={styles.stepTitle}>You're all set!</Text>
          <Text style={styles.description}>
            JW Time will notify you each month to report your time and more!
          </Text>
        </View>
        <Pressable
          style={styles.actionButton}
          onPress={() => setOnboardingComplete(true)}
        >
          <Text style={styles.actionButtonInner}>Complete Setup</Text>
        </Pressable>
      </View>
    );
  };

  const steps = [StepOne, StepTwo, StepThree, StepFour];

  return (
    <SafeAreaView style={styles.container}>
      {steps[onboardingStep]()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    height: Dimensions.get("window").height,
    marginTop: 40,
    marginHorizontal: 30,
  },
  onboardingTitleWrapper: {
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "center",
  },
  textContainer: {
    marginBottom: 200,
  },
  subTitle: {
    fontSize: 25,
  },
  title: {
    fontSize: 75,
    lineHeight: 85,
    fontWeight: "700",
  },
  actionButton: {
    backgroundColor: "#1BD15D",
    borderRadius: 15,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonInner: {
    fontSize: 24,
    color: "#fff",
    fontWeight: "700",
  },
  navContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navBack: {
    color: "#9B9B9B",
    fontSize: 30,
  },
  navTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  navSkip: {
    color: "#9B9B9B",
    textDecorationLine: "underline",
  },
  stepContainer: {
    flexGrow: 1,
    position: "relative",
    flexDirection: "column",
    justifyContent: "space-between",
    marginBottom: 80,
  },
  stepTitle: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 20,
  },
  stepContentContainer: {
    marginRight: 60,
  },
  description: {
    fontSize: 12,
    fontWeight: "400",
    color: "#9B9B9B",
  },
  dropDownPicker: {
    backgroundColor: "#F8F8F6",
    borderColor: "#e2e2e1",
    marginBottom: 15,
  },
  dropDownOptionsContainer: {
    backgroundColor: "#F8F8F6",
    borderColor: "#e2e2e1",
  },
  dropDownSeparatorStyles: {
    backgroundColor: "#e2e2e1",
  },
});
