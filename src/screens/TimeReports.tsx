import { View, TouchableOpacity, Alert, ScrollView } from "react-native";
import MyText from "../components/MyText";
import useServiceReport from "../stores/serviceReport";
import theme from "../constants/theme";
import { ServiceReport } from "../types/serviceReport";
import moment from "moment";
import Section from "../components/inputs/Section";
import { FontAwesome } from "@expo/vector-icons";
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

const TimeReports = () => {
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

  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        flexGrow: 1,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{ padding: 20, paddingVertical: 30 }}>
        <MyText style={{ fontSize: 32, fontWeight: "700" }}>
          {i18n.t("allTimeEntries")}
        </MyText>
      </View>
      <ScrollView
        style={{ marginBottom: insets.bottom }}
        contentInset={{ top: 0, right: 0, bottom: insets.bottom + 30, left: 0 }}
      >
        <View style={{ gap: 40 }}>
          {!years.length && (
            <Card style={{ marginHorizontal: 20 }}>
              <MyText
                style={{
                  padding: 20,
                  fontSize: 16,
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t("noTimeEntriesYet")}
              </MyText>
              <ActionButton
                label={i18n.t("addTime")}
                action={() => navigation.navigate("Add Time")}
              />
            </Card>
          )}
          {years.map((year) => (
            <View key={year} style={{ gap: 25 }}>
              <MyText
                style={{
                  marginHorizontal: 20,
                  fontSize: 20,
                  fontWeight: "600",
                }}
              >
                {year}
              </MyText>
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
                        <MyText
                          style={{
                            marginHorizontal: 20,
                            fontSize: 14,
                            fontWeight: "500",
                            color: theme.colors.textAlt,
                          }}
                        >
                          {month}
                          {` - ${totalHours} ${i18n.t("hours")}`}
                        </MyText>
                        <View style={{ flexDirection: "row", gap: 5 }}>
                          <MyText
                            style={{
                              fontSize: 14,
                              fontWeight: "500",
                              color: theme.colors.textAlt,
                            }}
                          >
                            {i18n.t("standard")}: {nonLdcHours}
                          </MyText>
                          <MyText
                            style={{
                              fontSize: 14,
                              fontWeight: "500",
                              color: theme.colors.textAlt,
                            }}
                          >
                            {i18n.t("ldc")}: {ldcHours}
                          </MyText>
                        </View>
                      </View>
                      <Section>
                        <View style={{ gap: 20 }}>
                          {reportsByYearAndMonth[year][month]
                            .sort((a, b) =>
                              moment(a.date).unix() < moment(b.date).unix()
                                ? 1
                                : -1
                            )
                            .map((report) => (
                              <View
                                key={report.id}
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "space-between",
                                  marginRight: 20,
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
                                    <MyText
                                      style={{
                                        fontWeight: "600",
                                      }}
                                    >
                                      {`${moment(report.date).format("L")}`}
                                    </MyText>
                                    {report.ldc && (
                                      <View
                                        style={{
                                          flexDirection: "row",
                                          gap: 3,
                                          alignItems: "center",
                                        }}
                                      >
                                        <FontAwesome
                                          name="wrench"
                                          style={{
                                            color: theme.colors.textAlt,
                                          }}
                                        />
                                        <MyText
                                          style={{
                                            color: theme.colors.textAlt,
                                            flexDirection: "row",
                                            gap: 10,
                                          }}
                                        >
                                          {i18n.t("ldc")}
                                        </MyText>
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
                                      <MyText style={{ fontSize: 12 }}>
                                        {i18n.t("hours")}
                                      </MyText>
                                      <MyText
                                        style={{
                                          position: "absolute",
                                          left: 0,
                                          fontSize: 12,
                                        }}
                                      >
                                        {report.hours}
                                      </MyText>
                                    </View>
                                    <View
                                      style={{
                                        position: "relative",
                                        paddingLeft: 20,
                                      }}
                                    >
                                      <MyText
                                        style={{
                                          flexDirection: "row",
                                          fontSize: 12,
                                        }}
                                      >
                                        {i18n.t("minutes")}
                                      </MyText>
                                      <MyText
                                        style={{
                                          position: "absolute",
                                          left: 0,
                                          fontSize: 12,
                                        }}
                                      >
                                        {report.minutes}
                                      </MyText>
                                    </View>
                                  </View>
                                </View>
                                <TouchableOpacity
                                  onPress={() =>
                                    Alert.alert(
                                      i18n.t("deleteTime_title"),
                                      i18n.t("deleteTime_description"),
                                      [
                                        {
                                          text: i18n.t("cancel"),
                                          style: "cancel",
                                        },
                                        {
                                          text: i18n.t("delete"),
                                          style: "destructive",
                                          onPress: () => {
                                            deleteServiceReport(report.id);
                                          },
                                        },
                                      ]
                                    )
                                  }
                                >
                                  <FontAwesome
                                    style={{
                                      color: theme.colors.errorAlt,
                                      fontSize: 16,
                                    }}
                                    name="trash"
                                  />
                                </TouchableOpacity>
                              </View>
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
