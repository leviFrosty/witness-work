import { Text, View } from "react-native";
import { useServiceReport } from "../stores/serviceReport";
import theme from "../constants/theme";
import ProgressBar from "./ProgressBar";
import { publisherHours } from "../constants/publisher";
import { usePreferences } from "../stores/preferences";
import {
  calculateHoursRemaining,
  calculateProgress,
} from "../lib/serviceReport";

const LeftCard = () => {
  const { publisher } = usePreferences();
  const { hours } = useServiceReport();
  const goalHours = publisherHours[publisher];
  const progress = calculateProgress({ hours, goalHours });

  const encouragementHourPhrase = () => {
    let phrases: string[] = [];

    if (progress < 0.6) {
      phrases = [
        "Keep going!",
        "You can do this.",
        "Never give up!",
        "Preach the word!",
        "Stay focused!",
        "Have faith!",
        "Stay strong!",
      ];
    }
    if (progress >= 0.6 && progress < 0.95) {
      phrases = [
        "One Step Closer!",
        "Almost there!",
        "Keep moving forward!",
        "Success on the horizon!",
        "Momentum is yours!",
        "Nearing achievement!",
        "You're closing in!",
        "Closer than ever!",
      ];
    }
    if (progress > 0.95) {
      phrases = [
        "You did it!",
        "Goal achieved!",
        "You nailed it!",
        "Congratulations!",
        "Triumph attained!",
        "Hats off to you!",
        "Mission complete!",
        "Success!",
      ];
    }

    const random = Math.floor(Math.random() * phrases.length);
    return phrases[random];
  };

  return (
    <View
      style={{
        flexDirection: "column",
        paddingHorizontal: 10,
        paddingVertical: 10,
        backgroundColor: theme.colors.background,
        borderRadius: theme.numbers.borderRadiusSm,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ProgressBar />
      </View>
      <View
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <View style={{ position: "relative" }}>
          <Text style={{ fontSize: 32, fontWeight: "700" }}>{hours}</Text>
          <Text
            style={{
              position: "absolute",
              right: -25,
              bottom: 0,
              fontSize: 12,
              color: theme.colors.textAlt,
              fontWeight: "600",
            }}
          >
            /{goalHours}
          </Text>
        </View>
        <Text style={{ fontWeight: "700" }}>{encouragementHourPhrase()}</Text>
        <View
          style={{
            borderRadius: theme.numbers.borderRadiusLg,
            backgroundColor: theme.colors.accentLight,
            paddingHorizontal: 25,
            paddingVertical: 5,
          }}
        >
          <Text style={{ fontSize: 10 }}>
            {calculateHoursRemaining({ hours, goalHours })} hours left
          </Text>
        </View>
        <Text style={{ fontSize: 8, color: theme.colors.textAlt }}>
          Goal is based on your publisher type
        </Text>
      </View>
    </View>
  );
};

const RightCard = () => {
  const encouragementStudiesPhrase = (studies: number) => {
    let phrases: string[] = [];

    if (studies === 0) {
      phrases = [
        "Keep going!",
        "Stay strong!",
        "Stay Positive!",
        "Grind on!",
        "Keep Searching!",
        "Stay Resilient!",
      ];
    }
    if (studies > 0 && studies <= 15) {
      phrases = [
        "Bravo!",
        "Well done!",
        "Amazing Job!",
        "Way to go!",
        "Victory Lap!",
        "Fantastic!",
        "Wow!",
      ];
    }
    if (studies > 15) {
      phrases = ["🤩🤯🎉"];
    }

    const random = Math.floor(Math.random() * phrases.length);
    return phrases[random];
  };

  const studies = 1;

  return (
    <View
      style={{
        flexDirection: "column",
        paddingHorizontal: 10,
        paddingVertical: 10,
        backgroundColor: theme.colors.background,
        borderRadius: theme.numbers.borderRadiusSm,
        flexGrow: 1,
      }}
    >
      <View
        style={{
          gap: 10,
          justifyContent: "center",
          alignItems: "center",
          flexGrow: 1,
        }}
      >
        <Text style={{ fontSize: 32, fontWeight: "700" }}>{studies}</Text>
        <Text style={{ fontWeight: "700" }}>
          {encouragementStudiesPhrase(studies)}
        </Text>
      </View>
      <Text style={{ fontSize: 8, color: theme.colors.textAlt }}>
        Based on contacts
      </Text>
    </View>
  );
};

const ServiceReport = () => {
  const { hours, set } = useServiceReport();

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", marginLeft: 5 }}>
        Service Report
      </Text>
      <View
        style={{
          borderRadius: theme.numbers.borderRadiusLg,
          backgroundColor: theme.colors.card,
          flexDirection: "row",
          gap: 15,
          padding: 10,
        }}
      >
        <View style={{ flexDirection: "column", gap: 5, flexGrow: 1 }}>
          <Text style={{ color: theme.colors.textAlt, fontWeight: "500" }}>
            Hours
          </Text>
          <LeftCard />
        </View>
        <View style={{ flexDirection: "column", gap: 5 }}>
          <Text style={{ color: theme.colors.textAlt, fontWeight: "500" }}>
            Studies
          </Text>
          <RightCard />
        </View>
      </View>
      {/* <Text>Hours: {hours}</Text>
      <Text onPress={() => set({ hours: -10 })}>Set Hours -10</Text>
      <Text onPress={() => set({ hours: 0 })}>Set Hours 0</Text>
      <Text onPress={() => set({ hours: 15 })}>Set Hours 15</Text>
      <Text onPress={() => set({ hours: 30 })}>Set Hours 30</Text>
      <Text onPress={() => set({ hours: 35 })}>Set Hours 35</Text>
      <Text onPress={() => set({ hours: 40 })}>Set Hours 40</Text>
      <Text onPress={() => set({ hours: 45 })}>Set Hours 45</Text>
      <Text onPress={() => set({ hours: 50 })}>Set Hours 50</Text>
      <Text onPress={() => set({ hours: 60 })}>Set Hours 60</Text>
      <Text onPress={() => set({ hours: 70 })}>Set Hours 70</Text> */}
    </View>
  );
};

export default ServiceReport;
