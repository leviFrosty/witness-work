import { View, Alert, ScrollView } from "react-native";
import Text from "../components/MyText";
import useServiceReport from "../stores/serviceReport";
import useTheme from "../contexts/theme";
import { ServiceReport } from "../types/serviceReport";
import moment from "moment";
import Section from "../components/inputs/Section";
import {
  ldcHoursForSpecificMonth,
  nonLdcHoursForSpecificMonth,
  totalHoursForSpecificMonth,
} from "../lib/serviceReport";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Card from "../components/Card";
import ActionButton from "../components/ActionButton";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";
import i18n from "../lib/locales";
import IconButton from "../components/IconButton";
import { faPersonDigging } from "@fortawesome/free-solid-svg-icons";
import { Swipeable } from "react-native-gesture-handler";
import Haptics from "../lib/haptics";
import SwipeableDelete from "../components/swipeableActions/Delete";

const TimeReports = () => {
  const theme = useTheme();
  const { serviceReports, deleteServiceReport } = useServiceReport();
  const navigation = useNavigation<RootStackNavigation>();
  const insets = useSafeAreaInsets();

  // Group service reports by year and then by month
  const reportsByYearAndMonth: {
    [year: string]: { [month: string]: ServiceReport[] };
  } = {};
  serviceReports.forEach((report) => {
    const yearKey = moment(report.date).format("YYYY");
    const monthKey = moment(report.date).format("MMMM YYYY");

    if (!reportsByYearAndMonth[yearKey]) {
      reportsByYearAndMonth[yearKey] = {};
    }

    if (!reportsByYearAndMonth[yearKey][monthKey]) {
      reportsByYearAndMonth[yearKey][monthKey] = [];
    }

    reportsByYearAndMonth[yearKey][monthKey].push(report);
  });

  // Convert the object keys to an array of years
  const years = Object.keys(reportsByYearAndMonth).sort(
    (a, b) => parseInt(b) - parseInt(a)
  );

  const handleSwipeOpen = (
    direction: "left" | "right",
    swipeable: Swipeable,
    report: ServiceReport
  ) => {
    if (direction === "right") {
      Alert.alert(
        i18n.t("deleteTime_title"),
        i18n.t("deleteTime_description"),
        [
          {
            text: i18n.t("cancel"),
            style: "cancel",
            onPress: () => swipeable.reset(),
          },
          {
            text: i18n.t("delete"),
            style: "destructive",
            onPress: () => {
              swipeable.reset();
              deleteServiceReport(report.id);
            },
          },
        ]
      );
    }
  };

  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        flexGrow: 1,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{ padding: 20, paddingVertical: 30 }}>
        <Text style={{ fontSize: 32, fontFamily: "Inter_700Bold" }}>
          {i18n.t("allTimeEntries")}
        </Text>
      </View>
      <ScrollView
        style={{ marginBottom: insets.bottom }}
        contentInset={{ top: 0, right: 0, bottom: insets.bottom + 30, left: 0 }}
      >
        <View style={{ gap: 40 }}>
          {!years.length && (
            <Card style={{ marginHorizontal: 20 }}>
              <Text
                style={{
                  padding: 20,
                  fontSize: 16,
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t("noTimeEntriesYet")}
              </Text>
              <ActionButton onPress={() => navigation.navigate("Add Time")}>
                {i18n.t("addTime")}
              </ActionButton>
            </Card>
          )}
          {years.map((year) => (
            <View key={year} style={{ gap: 25 }}>
              <Text
                style={{
                  marginHorizontal: 20,
                  fontSize: 20,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {year}
              </Text>
              {Object.keys(reportsByYearAndMonth[year])
                .sort(
                  (a, b) =>
                    moment(b, "MMMM YYYY").unix() -
                    moment(a, "MMMM YYYY").unix()
                )
                .map((month) => {
                  const totalHours = totalHoursForSpecificMonth(
                    reportsByYearAndMonth[year][month],
                    moment(month, "MMMM YYYY").month(),
                    parseInt(year)
                  );
                  const ldcHours = ldcHoursForSpecificMonth(
                    reportsByYearAndMonth[year][month],
                    moment(month, "MMMM YYYY").month(),
                    parseInt(year)
                  );
                  const nonLdcHours = nonLdcHoursForSpecificMonth(
                    reportsByYearAndMonth[year][month],
                    moment(month, "MMMM YYYY").month(),
                    parseInt(year)
                  );

                  return (
                    <View style={{ gap: 5 }} key={month}>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          justifyContent: "space-between",
                          marginRight: 20,
                        }}
                      >
                        <Text
                          style={{
                            marginHorizontal: 20,
                            fontSize: 14,
                            fontFamily: "Inter_500Medium",
                            color: theme.colors.textAlt,
                          }}
                        >
                          {month}
                          {` - ${totalHours} ${i18n.t("hours")}`}
                        </Text>
                        <View style={{ flexDirection: "row", gap: 5 }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontFamily: "Inter_500Medium",
                              color: theme.colors.textAlt,
                            }}
                          >
                            {i18n.t("standard")}: {nonLdcHours}
                          </Text>
                          <Text
                            style={{
                              fontSize: 14,
                              fontFamily: "Inter_500Medium",
                              color: theme.colors.textAlt,
                            }}
                          >
                            {i18n.t("ldc")}: {ldcHours}
                          </Text>
                        </View>
                      </View>
                      <Section>
                        <View style={{ gap: 10 }}>
                          {reportsByYearAndMonth[year][month]
                            .sort((a, b) =>
                              moment(a.date).unix() < moment(b.date).unix()
                                ? 1
                                : -1
                            )
                            .map((report) => (
                              <Swipeable
                                key={report.id}
                                onSwipeableWillOpen={() => Haptics.light()}
                                containerStyle={{
                                  backgroundColor: theme.colors.background,
                                  marginRight: 20,
                                  borderRadius: theme.numbers.borderRadiusSm,
                                }}
                                renderRightActions={() => (
                                  <SwipeableDelete
                                    size="xs"
                                    style={{ flexDirection: "row" }}
                                  />
                                )}
                                onSwipeableOpen={(direction, swipeable) =>
                                  handleSwipeOpen(direction, swipeable, report)
                                }
                              >
                                <View
                                  style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    backgroundColor: theme.colors.card,
                                    padding: 15,
                                    borderRadius: theme.numbers.borderRadiusSm,
                                    gap: 10,
                                  }}
                                >
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      flexGrow: 1,
                                    }}
                                  >
                                    <View
                                      style={{ flexDirection: "row", gap: 10 }}
                                    >
                                      <Text
                                        style={{
                                          fontFamily: "Inter_600SemiBold",
                                        }}
                                      >
                                        {`${moment(report.date).format("L")}`}
                                      </Text>
                                      {report.ldc && (
                                        <View
                                          style={{
                                            flexDirection: "row",
                                            gap: 3,
                                            alignItems: "center",
                                          }}
                                        >
                                          <IconButton icon={faPersonDigging} />
                                          <Text
                                            style={{
                                              color: theme.colors.textAlt,
                                              flexDirection: "row",
                                              gap: 10,
                                            }}
                                          >
                                            {i18n.t("ldc")}
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                    <View
                                      style={{
                                        flexDirection: "row",
                                        gap: 10,
                                        flexGrow: 1,
                                        justifyContent: "flex-end",
                                        alignItems: "center",
                                      }}
                                    >
                                      <View
                                        style={{
                                          position: "relative",
                                          paddingLeft: 20,
                                        }}
                                      >
                                        <Text style={{ fontSize: 12 }}>
                                          {i18n.t("hours")}
                                        </Text>
                                        <Text
                                          style={{
                                            position: "absolute",
                                            left: 0,
                                            fontSize: 12,
                                          }}
                                        >
                                          {report.hours}
                                        </Text>
                                      </View>
                                      <View
                                        style={{
                                          position: "relative",
                                          paddingLeft: 20,
                                          alignItems: "center",
                                        }}
                                      >
                                        <Text
                                          style={{
                                            flexDirection: "row",
                                            fontSize: 12,
                                          }}
                                        >
                                          {i18n.t("minutes")}
                                        </Text>
                                        <Text
                                          style={{
                                            position: "absolute",
                                            left: 0,
                                            fontSize: 12,
                                          }}
                                        >
                                          {report.minutes}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                </View>
                              </Swipeable>
                            ))}
                        </View>
                      </Section>
                    </View>
                  );
                })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};
export default TimeReports;
