import moment from "moment";
import { Call } from "../stores/CallStore";
import { ServiceRecord, hourInMS } from "../stores/ServiceRecord";
import { Visit } from "../stores/VisitStore";
import { Share, StyleSheet, View } from "react-native";
import { Button, Layout, Text, useStyleSheet } from "@ui-kitten/components";
import { i18n } from "../lib/translations";
import appTheme from "../lib/theme";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Export } from "./Icons";

export interface MonthReportData {
  hours: number;
  placements: number;
  videoPlacements: number;
  returnVisits: number;
  studies: number;
  month?: number;
  year?: number;
}

export const parseForMonthReport = ({
  calls,
  visits,
  records,
  month,
}: {
  calls: Call[];
  visits: Visit[];
  records: ServiceRecord[];
  month: number; // pass from moment().month(), or moment(date).month() Valid values = 1-12
}): MonthReportData => {
  const visitsThisMonth = visits.filter(
    (visits) => moment(visits.date).month() === month
  );
  const recordsThisMonth = records.filter(
    (record) => moment(record.date).month() === month
  );

  const timeInMS = recordsThisMonth.reduce(
    (add, record) => add + record.time,
    0
  );
  const hours = Math.floor(timeInMS / hourInMS);

  const placementOffset = recordsThisMonth.reduce(
    (count, record) => count + record.placements,
    0
  );
  const videoPlacementOffset = recordsThisMonth.reduce(
    (count, record) => count + record.videoPlacements,
    0
  );
  const returnVisitsOffset = recordsThisMonth.reduce(
    (count, record) => count + record.placements,
    0
  );

  const studiesOffset = recordsThisMonth.reduce(
    (count, record) => count + record.studyOffset,
    0
  );

  const placementsThisMonth = visitsThisMonth.reduce(
    (placementCount, visit) =>
      !visit.placement ? placementCount + 0 : placementCount + 1,
    0
  );

  const videoPlacementsThisMonth = visitsThisMonth.reduce(
    (placementCount, visit) =>
      !visit.videoPlacement ? placementCount + 0 : placementCount + 1,
    0
  );

  const automatedStudies = calls.reduce(
    (count, call) => (call.isStudy ? count + 1 : count + 0),
    0
  );

  const automatedReturnVisits = calls.reduce((totalCount, call) => {
    const callVisits = visits.filter((v) => v.call.id === call.id);
    const callVisitsForMonth = callVisits.reduce((callCount, visit, index) => {
      if (index === 0) {
        return callCount + 0;
      } else {
        if (moment(visit.date).month() === month) {
          return callCount + 1;
        } else {
          return callCount + 0;
        }
      }
    }, 0);
    return totalCount + callVisitsForMonth;
  }, 0);

  const placements = placementOffset + placementsThisMonth;
  const videoPlacements = videoPlacementOffset + videoPlacementsThisMonth;
  const studies = automatedStudies + studiesOffset;
  const returnVisits = automatedReturnVisits + returnVisitsOffset;

  return {
    hours,
    placements,
    videoPlacements,
    returnVisits,
    studies,
  };
};

interface MonthReportProps {
  report: MonthReportData;
}

const MonthReport: React.FC<MonthReportProps> = ({ report }) => {
  const {
    hours,
    placements,
    returnVisits,
    studies,
    videoPlacements,
    month,
    year,
  } = report;
  const navigation = useNavigation();
  const route = useRoute();
  const themeStyles = StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: "border-primary-color-2",
      borderRadius: appTheme.borderRadius,
      paddingHorizontal: 15,
      paddingBottom: 15,
    },
    header: {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    content: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    box: {
      gap: 10,
    },
    number: {
      textAlign: "center",
    },
  });
  const styles = useStyleSheet(themeStyles);

  const monthDisplay = month ? moment().month(month).format("MMMM") : "";
  const yearDisplay = year ? `, ${moment().year(year).format("YYYY")}` : "";
  const reportTitle = `${
    monthDisplay || yearDisplay ? `${monthDisplay}${yearDisplay} ` : ""
  }${i18n.t("serviceReport")}`;

  function formatReportJSONForSharing(json: string): string {
    const lines = json.split("\n");
    const formattedLines = lines.map((line) => line.trim());
    let formattedJSON = formattedLines.join("\n").replace(/["{},]/g, "");
    // TODO: change to regex
    formattedJSON = formattedJSON.replace("hours", i18n.t("hours"));
    formattedJSON = formattedJSON.replace("placements", i18n.t("placements"));
    formattedJSON = formattedJSON.replace(
      "videoPlacements",
      i18n.t("videoPlacements")
    );
    formattedJSON = formattedJSON.replace(
      "returnVisits",
      i18n.t("returnVisits")
    );
    formattedJSON = formattedJSON.replace("studies", i18n.t("studies"));
    return formattedJSON;
  }

  const formattedJSON = formatReportJSONForSharing(
    JSON.stringify(
      {
        hours,
        placements,
        videoPlacements,
        returnVisits,
        studies,
      },
      null,
      2
    )
  );

  return (
    <Layout level="2" style={styles.container}>
      <View style={styles.header}>
        <Button
          appearance="ghost"
          size="small"
          accessoryLeft={Export}
          onPress={async () =>
            await Share.share({
              title: reportTitle,
              message: `${reportTitle}\n${formattedJSON}`.trim(),
            })
          }
        />
      </View>
      <View style={styles.content}>
        <View style={styles.box}>
          <Text appearance="hint" category="c2">
            {i18n.t("hours")}
          </Text>
          <Text category="h6" style={styles.number}>
            {hours}
          </Text>
        </View>
        <View style={styles.box}>
          <Text appearance="hint" category="c2">
            {i18n.t("placements")}
          </Text>
          <Text category="h6" style={styles.number}>
            {placements}
          </Text>
        </View>
        <View style={styles.box}>
          <Text appearance="hint" category="c2">
            {i18n.t("videos")}
          </Text>
          <Text category="h6" style={styles.number}>
            {videoPlacements}
          </Text>
        </View>
        <View style={styles.box}>
          <Text appearance="hint" category="c2">
            {i18n.t("returnVisits")}
          </Text>
          <Text category="h6" style={styles.number}>
            {returnVisits}
          </Text>
        </View>
        <View style={styles.box}>
          <Text appearance="hint" category="c2">
            {i18n.t("studies")}
          </Text>
          <Text category="h6" style={styles.number}>
            {studies}
          </Text>
        </View>
      </View>
    </Layout>
  );
};

export default MonthReport;
