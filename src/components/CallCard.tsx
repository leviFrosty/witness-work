import React, { useContext, useMemo } from "react";
import { Call } from "../stores/CallStore";
import { Pressable, StyleSheet, View } from "react-native";
import { capitalizeEachWordInSentence } from "../lib/translations";
import { NavigationContext } from "@react-navigation/native";
import { Icon, IconElement, Text, useStyleSheet } from "@ui-kitten/components";
import * as Haptics from "expo-haptics";
import useVisitsStore from "../stores/VisitStore";
import moment from "moment";
import Card from "./Card";

interface CallCardProps {
  call: Call;
}
const CallCard: React.FC<CallCardProps> = ({ call }) => {
  const navigation = useContext(NavigationContext);
  const themedStyles = StyleSheet.create({
    chevronRight: { height: 25, width: 25, color: "text-hint-color" },
  });
  const styles = useStyleSheet(themedStyles);
  const { visits } = useVisitsStore();
  const callVisits = visits.filter((v) => v.call.id === call.id);

  const ChevronRight = (): IconElement => (
    <Icon style={styles.chevronRight} name={"chevron-right"} />
  );

  const timeSinceLastVisit = useMemo(() => {
    const mostRecentVisitMoment = callVisits
      ?.filter((v) => v.call.id === call.id)
      .sort((a, b) => moment(b.date).valueOf() - moment(a.date).valueOf())
      .find((_, index) => index == 0)?.date;
    if (!mostRecentVisitMoment) {
      return "";
    }
    return capitalizeEachWordInSentence(
      moment(mostRecentVisitMoment).fromNow()
    );
  }, [callVisits, call]);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        navigation?.navigate("CallDetails", { callId: call.id });
      }}
    >
      <Card>
        <View
          style={{
            flex: 1,
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <Text category="h6">{call.name}</Text>
          <Text appearance="hint" category="c1">
            {timeSinceLastVisit}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "column",
            justifyContent: "flex-start",
          }}
        >
          <ChevronRight />
        </View>
      </Card>
    </Pressable>
  );
};

export default CallCard;
