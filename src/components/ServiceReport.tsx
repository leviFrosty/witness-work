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
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { getTotalStudiesCount } from "../lib/contacts";
import useContacts from "../stores/contactsStore";
import { FontAwesome } from "@expo/vector-icons";
import moment from "moment";
import LottieView from "lottie-react-native";
import * as Crypto from "expo-crypto";
import i18n from "../locales";

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
        i18n.t("phrasesFar.keepGoing"),
        i18n.t("phrasesFar.youCanDoThis"),
        i18n.t("phrasesFar.neverGiveUp"),
        i18n.t("phrasesFar.preachTheWord"),
        i18n.t("phrasesFar.stayFocused"),
        i18n.t("phrasesFar.haveFaith"),
        i18n.t("phrasesFar.stayStrong"),
      ];
    }
    if (progress >= 0.6 && progress < 0.95) {
      phrases = [
        i18n.t("phrasesClose.oneStepCloser"),
        i18n.t("phrasesClose.almostThere"),
        i18n.t("phrasesClose.keepMovingForward"),
        i18n.t("phrasesClose.successOnTheHorizon"),
        i18n.t("phrasesClose.momentumIsYours"),
        i18n.t("phrasesClose.nearingAchievement"),
        i18n.t("phrasesClose.youreClosingIn"),
        i18n.t("phrasesClose.closerThanEver"),
      ];
    }
    if (progress > 0.95) {
      phrases = [
        i18n.t("phrasesDone.youDidIt"),
        i18n.t("phrasesDone.goalAchieved"),
        i18n.t("phrasesDone.youNailedIt"),
        i18n.t("phrasesDone.congratulations"),
        i18n.t("phrasesDone.takeYourShoesOff"),
        i18n.t("phrasesDone.hatsOffToYou"),
        i18n.t("phrasesDone.missionComplete"),
        i18n.t("phrasesDone.success"),
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
              {hoursRemaining} {i18n.t("hoursLeft")}
            </MyText>
          </View>
          <MyText style={{ fontSize: 8, color: theme.colors.textAlt }}>
            {i18n.t("goalBasedOnPublisherType")}
          </MyText>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={{
          flexDirection: "column",
          paddingHorizontal: 10,
          paddingVertical: 10,
          borderBottomLeftRadius: theme.numbers.borderRadiusSm,
          borderBottomRightRadius: theme.numbers.borderRadiusSm,
          backgroundColor: theme.colors.accent,
          gap: 5,
        }}
        onPress={() => navigation.navigate("Add Time")}
      >
        <MyText
          style={{
            textAlign: "center",
            fontWeight: "700",
            fontSize: 18,
            color: theme.colors.textInverse,
          }}
        >
          {i18n.t("addTime")}
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
        i18n.t("phrasesStudiesNone.keepGoing"),
        i18n.t("phrasesStudiesNone.stayStrong"),
        i18n.t("phrasesStudiesNone.stayPositive"),
        i18n.t("phrasesStudiesNone.grindOn"),
        i18n.t("phrasesStudiesNone.keepSearching"),
        i18n.t("phrasesStudiesNone.stayResilient"),
      ];
    }
    if (studies > 0 && studies <= 15) {
      phrases = [
        i18n.t("phrasesStudiesDone.bravo"),
        i18n.t("phrasesStudiesDone.wellDone"),
        i18n.t("phrasesStudiesDone.amazingJob"),
        i18n.t("phrasesStudiesDone.wayToGo"),
        i18n.t("phrasesStudiesDone.victoryLap"),
        i18n.t("phrasesStudiesDone.fantastic"),
        i18n.t("phrasesStudiesDone.wow"),
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
        {i18n.t("basedOnContacts")}
      </MyText>
    </View>
  );
};

const CheckMarkAnimationComponent = ({ undoId }: { undoId?: string }) => {
  const { deleteServiceReport } = useServiceReport();
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
          width: 110,
          height: 110,
          backgroundColor: theme.colors.backgroundLighter,
        }}
        // Find more Lottie files at https://lottiefiles.com/featured
        source={require("./../assets/lottie/checkMark.json")}
      />
      {undoId && (
        <TouchableOpacity onPress={() => deleteServiceReport(undoId)}>
          <MyText
            style={{
              fontSize: 10,
              color: theme.colors.textAlt,
              textDecorationLine: "underline",
            }}
          >
            {i18n.t("undo")}
          </MyText>
        </TouchableOpacity>
      )}
    </View>
  );
};

const StandardPublisherTimeEntry = () => {
  const [undoId, setUndoId] = useState<string>();
  const { serviceReports, addServiceReport } = useServiceReport();
  const hasGoneOutInServiceThisMonth = hasServiceReportsForMonth(
    serviceReports,
    moment().month()
  );

  const handleSubmitDidService = () => {
    const id = Crypto.randomUUID();
    addServiceReport({
      date: new Date(),
      hours: 0,
      minutes: 0,
      id,
    });
    setUndoId(id);
  };

  return (
    <View>
      {hasGoneOutInServiceThisMonth ? (
        <View
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
        >
          <CheckMarkAnimationComponent undoId={undoId} />
        </View>
      ) : (
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
          onPress={handleSubmitDidService}
        >
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
              {i18n.t("sharedTheGoodNews")}
            </MyText>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

const ServiceReport = () => {
  const { publisher } = usePreferences();
  return (
    <View style={{ gap: 10 }}>
      <MyText style={{ fontSize: 14, fontWeight: "600", marginLeft: 5 }}>
        {i18n.t("serviceReport")}
      </MyText>
      <Card>
        <View style={{ flexDirection: "row", gap: 5 }}>
          <View style={{ flexDirection: "column", gap: 5, flexGrow: 1 }}>
            <MyText style={{ color: theme.colors.textAlt, fontWeight: "600" }}>
              {i18n.t("hours")}
            </MyText>
            {publisher === "publisher" ? (
              <StandardPublisherTimeEntry />
            ) : (
              <HourEntryCard />
            )}
          </View>
          <View style={{ flexDirection: "column", gap: 5 }}>
            <MyText style={{ color: theme.colors.textAlt, fontWeight: "600" }}>
              {i18n.t("studies")}
            </MyText>
            <RightCard />
          </View>
        </View>
      </Card>
    </View>
  );
};

export default ServiceReport;
