import { Icon, Layout, Text, useStyleSheet } from "@ui-kitten/components";
import React, { useMemo } from "react";
import { ImageProps, View } from "react-native";
import { i18n } from "../lib/translations";
import appTheme from "../lib/theme";
import useServiceRecordStore from "../stores/ServiceRecord";
import moment from "moment";
import { isSameMonthAndYear } from "./MonthReport";
import { StyleSheet } from "react-native";

const WeeklyActivityTicks: React.FC = () => {
  const { records } = useServiceRecordStore();

  const themeStyles = StyleSheet.create({
    wrapper: {
      gap: 5,
    },
    content: {
      gap: 10,
      borderRadius: appTheme.borderRadius,
      paddingHorizontal: 10,
      paddingVertical: 5,
      flexDirection: "row",
      justifyContent: "space-evenly",
      alignItems: "center",
    },
    checkLayout: {
      padding: 5,
      borderRadius: appTheme.borderRadius,
    },
    check: {
      height: 20,
      width: 20,
      color: "text-hint-color",
    },
    checkSuccess: {
      height: 20,
      width: 20,
      color: "color-success-500",
    },
    checkFailed: {
      height: 20,
      width: 20,
      color: "color-danger-500",
    },
  });
  const styles = useStyleSheet(themeStyles);

  const weekOfMonth = (m: moment.Moment) => {
    return m.week() - moment(m).startOf("month").week() + 1;
  };

  const weeklyReport = useMemo(() => {
    const firstWeekOfMonth = moment().startOf("month").week();
    const lastWeekOfMonth = moment().endOf("month").week();
    const recordsThisMonth = records.filter((record) =>
      isSameMonthAndYear(record.date, moment().month(), moment().year())
    );
    const weeksOfMonth = lastWeekOfMonth + 1 - firstWeekOfMonth;
    const recordsPerWeek = Array(weeksOfMonth)
      .fill(undefined)
      .map((_, index) => {
        const week = index + 1;
        const records = recordsThisMonth.filter(
          (r) => weekOfMonth(moment(r.date)) === week
        );
        return { week, records };
      });
    return {
      currentWeek: weekOfMonth(moment()),
      recordsPerWeek,
    };
  }, [records]);

  const CheckIcon = ({
    status,
  }: {
    status?: "success" | "failed";
  }): React.ReactElement<ImageProps> => (
    <Icon
      style={
        !status
          ? styles.check
          : status === "success"
          ? styles.checkSuccess
          : styles.checkFailed
      }
      name="check"
    />
  );

  return (
    <View style={styles.wrapper}>
      <Text appearance="hint" category="c2">
        {i18n.t("weeklyActivity")}
      </Text>
      <Layout level="2" style={styles.content}>
        {weeklyReport.recordsPerWeek.map(({ records, week }) => {
          const getStatus = () => {
            if (weeklyReport.currentWeek > week) {
              if (records.length > 0) {
                return "success";
              } else {
                return "failed";
              }
            } else {
              if (weeklyReport.currentWeek === week) {
                if (records.length > 0) {
                  return "success";
                } else {
                  return undefined;
                }
              }
            }
          };
          return (
            <Layout
              level={weeklyReport.currentWeek === week ? "3" : "2"}
              style={styles.checkLayout}
            >
              <CheckIcon key={week} status={getStatus()} />
            </Layout>
          );
        })}
      </Layout>
    </View>
  );
};

export default WeeklyActivityTicks;
