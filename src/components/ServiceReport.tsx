import { View, TouchableOpacity } from "react-native";
import { useServiceReport } from "../stores/serviceReport";
import theme from "../constants/theme";
import ProgressBar from "./ProgressBar";
import { publisherHours } from "../constants/publisher";
import { usePreferences } from "../stores/preferences";
import {
  calculateHoursRemaining,
  calculateProgress,
  getTotalHoursForCurrentMonth,
  hasServiceReportsForMonth,
} from "../lib/serviceReport";
import Card from "./Card";
import MyText from "./MyText";
import Divider from "./Divider";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { getTotalStudiesCount } from "../lib/contacts";
import useContacts from "../stores/contactsStore";
import { FontAwesome } from "@expo/vector-icons";
import moment from "moment";
import LottieView from "lottie-react-native";
import * as Crypto from "expo-crypto";

const HourEntryCard = () => {
  const { publisher } = usePreferences();
  const { serviceReports } = useServiceReport();
  const navigation = useNavigation<RootStackNavigation>();
  const goalHours = publisherHours[publisher];
  const hours = useMemo(
    () => getTotalHoursForCurrentMonth(serviceReports),
    [serviceReports]
  );
  const progress = useMemo(
    () => calculateProgress({ hours, goalHours }),
    [hours, goalHours]
  );

  const encouragementHourPhrase = useCallback((progress: number) => {
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
  }, []);

  const [encouragementPhrase, setEncouragementPhrase] = useState(
    encouragementHourPhrase(progress)
  );

  useEffect(() => {
    setEncouragementPhrase(encouragementHourPhrase(progress));
  }, [encouragementHourPhrase, progress]);

  const hoursRemaining = useMemo(
    () => calculateHoursRemaining({ hours, goalHours }),
    [hours, goalHours]
  );

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
        onPress={() => navigation.navigate("Time Reports")}
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
          <MyText style={{ fontWeight: "700" }}>{encouragementPhrase}</MyText>
          <View
            style={{
              borderRadius: theme.numbers.borderRadiusLg,
              backgroundColor: theme.colors.accentAlt,
              paddingHorizontal: 25,
              paddingVertical: 5,
            }}
          >
            <MyText style={{ fontSize: 10 }}>
              {hoursRemaining} hours left
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
        onPress={() => navigation.navigate("Add Time")}
      >
        <MyText style={{ textAlign: "center", fontWeight: "700" }}>
          Add Time
        </MyText>
      </TouchableOpacity>
    </View>
  );
};

const RightCard = () => {
  const { contacts } = useContacts();
  const studies = useMemo(() => getTotalStudiesCount(contacts), [contacts]);
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
  const [encouragementPhrase, setEncouragementPhrase] = useState(
    encouragementStudiesPhrase(studies)
  );

  useEffect(() => {
    setEncouragementPhrase(encouragementStudiesPhrase(studies));
  }, [studies]);
  return (
    <View
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
          {encouragementPhrase}
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
    </View>
  );
};

const CheckMarkAnimationComponent = () => {
  const ref = useRef<LottieView>(null);
  return (
    <View
      style={{
        backgroundColor: theme.colors.backgroundLighter,
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
      }}
    >
      <LottieView
        onLayout={() => ref.current?.play()}
        loop={false}
        ref={ref}
        style={{
          width: 125,
          height: 125,
          backgroundColor: theme.colors.backgroundLighter,
        }}
        // Find more Lottie files at https://lottiefiles.com/featured
        source={require("./../assets/lottie/checkMark.json")}
      />
    </View>
  );
};

const StandardPublisherTimeEntry = () => {
  const { serviceReports, addServiceReport } = useServiceReport();
  const hasGoneOutInServiceThisMonth = hasServiceReportsForMonth(
    serviceReports,
    moment().month()
  );
  return (
    <TouchableOpacity
      style={{
        backgroundColor: hasGoneOutInServiceThisMonth
          ? theme.colors.backgroundLighter
          : theme.colors.accent,
        borderColor: theme.colors.border,
        paddingVertical: hasGoneOutInServiceThisMonth ? 5 : 46,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: theme.numbers.borderRadiusSm,
      }}
      onPress={() =>
        addServiceReport({
          date: new Date(),
          hours: 0,
          minutes: 0,
          id: Crypto.randomUUID(),
        })
      }
    >
      {hasGoneOutInServiceThisMonth ? (
        <CheckMarkAnimationComponent />
      ) : (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <FontAwesome
            name="square-o"
            style={{ color: theme.colors.textInverse, fontSize: 25 }}
          />
          <MyText
            style={{
              color: theme.colors.textInverse,
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            {"Shared the\nGood News"}
          </MyText>
        </View>
      )}
    </TouchableOpacity>
  );
};

const ServiceReport = () => {
  const { publisher } = usePreferences();
  return (
    <View style={{ gap: 10 }}>
      <MyText style={{ fontSize: 14, fontWeight: "600", marginLeft: 5 }}>
        Service Report
      </MyText>
      <Card>
        <View style={{ flexDirection: "row", gap: 5 }}>
          <View style={{ flexDirection: "column", gap: 5, flexGrow: 1 }}>
            <MyText style={{ color: theme.colors.textAlt, fontWeight: "600" }}>
              Hours
            </MyText>
            {publisher === "publisher" ? (
              <StandardPublisherTimeEntry />
            ) : (
              <HourEntryCard />
            )}
          </View>
          <View style={{ flexDirection: "column", gap: 5 }}>
            <MyText style={{ color: theme.colors.textAlt, fontWeight: "600" }}>
              Studies
            </MyText>
            <RightCard />
          </View>
        </View>
      </Card>
    </View>
  );
};

export default ServiceReport;
