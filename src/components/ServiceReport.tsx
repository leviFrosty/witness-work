import { View, TouchableOpacity } from "react-native";
import { useServiceReport } from "../stores/serviceReport";
import theme from "../constants/theme";
import ProgressBar from "./ProgressBar";
import { publisherHours } from "../constants/publisher";
import { usePreferences } from "../stores/preferences";
import {
  calculateHoursRemaining,
  calculateProgress,
} from "../lib/serviceReport";
import Card from "./Card";
import MyText from "./MyText";
import Divider from "./Divider";

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
    <View>
      <TouchableOpacity
        style={{
          flexDirection: "column",
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderRadius: theme.numbers.borderRadiusSm,
          backgroundColor: theme.colors.backgroundLighter,
          gap: 5,
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
            <MyText style={{ fontSize: 32, fontWeight: "700" }}>{hours}</MyText>
            <MyText
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
            </MyText>
          </View>
          <MyText style={{ fontWeight: "700" }}>
            {encouragementHourPhrase()}
          </MyText>
          <View
            style={{
              borderRadius: theme.numbers.borderRadiusLg,
              backgroundColor: theme.colors.accentAlt,
              paddingHorizontal: 25,
              paddingVertical: 5,
            }}
          >
            <MyText style={{ fontSize: 10 }}>
              {calculateHoursRemaining({ hours, goalHours })} hours left
            </MyText>
          </View>
          <MyText style={{ fontSize: 8, color: theme.colors.textAlt }}>
            Goal is based on your publisher type
          </MyText>
        </View>
      </TouchableOpacity>
      <Divider borderStyle="dashed" />
      <TouchableOpacity
        style={{
          flexDirection: "column",
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderRadius: theme.numbers.borderRadiusSm,
          backgroundColor: theme.colors.backgroundLighter,
          gap: 5,
        }}
      >
        <MyText style={{ textAlign: "center", fontWeight: "700" }}>
          Add Time
        </MyText>
      </TouchableOpacity>
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

  const studies = 0;

  return (
    <TouchableOpacity
      style={{
        flexDirection: "column",
        paddingHorizontal: 10,
        paddingVertical: 10,
        backgroundColor: theme.colors.backgroundLighter,
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
        <MyText style={{ fontSize: 32, fontWeight: "700" }}>{studies}</MyText>
        <MyText
          style={{
            fontWeight: "700",
          }}
        >
          {encouragementStudiesPhrase(studies)}
        </MyText>
      </View>
      <MyText
        style={{
          fontSize: 8,
          color: theme.colors.textAlt,
          textAlign: "center",
        }}
      >
        Based on contacts
      </MyText>
    </TouchableOpacity>
  );
};

const ServiceReport = () => {
  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 5 }}>
        <View style={{ flexDirection: "column", gap: 5, flexGrow: 1 }}>
          <MyText style={{ color: theme.colors.textAlt, fontWeight: "600" }}>
            Hours
          </MyText>
          <LeftCard />
        </View>
        <View style={{ flexDirection: "column", gap: 5 }}>
          <MyText style={{ color: theme.colors.textAlt, fontWeight: "600" }}>
            Studies
          </MyText>
          <RightCard />
        </View>
      </View>
    </Card>
  );
};

export default ServiceReport;
