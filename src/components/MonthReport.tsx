import moment from "moment";
import { Call } from "../stores/CallStore";
import { ServiceRecord, hourInMS } from "../stores/ServiceRecord";
import { Visit } from "../stores/VisitStore";
import { StyleSheet, View } from "react-native";
import {
  Icon,
  IconElement,
  Layout,
  Text,
  useStyleSheet,
} from "@ui-kitten/components";
import { i18n } from "../lib/translations";
import appTheme from "../lib/theme";

export interface MonthReportData {
  hours: number;
  placements: number;
  videoPlacements: number;
  returnVisits: number;
  studies: number;
  month: number;
  year?: number;
  share?: {
    title: string;
    message: string;
  };
}

export const parseForMonthReport = ({
  calls,
  visits,
  records,
  month,
  year: yearFromProps,
}: {
  calls: Call[];
  visits: Visit[];
  records: ServiceRecord[];
  month: number; // pass from moment().month(), or moment(date).month() Valid values = 1-12
  year?: number;
}): MonthReportData => {
  const year = yearFromProps || moment().year();
  const isSameMonthAndYear = (date: moment.Moment) =>
    moment(date).month() === month &&
    (year
      ? moment(date).year() === year
      : moment(date).year() === moment().year());

  const visitsThisMonth = visits.filter((visit) =>
    isSameMonthAndYear(visit.date)
  );
  const recordsThisMonth = records.filter((record) =>
    isSameMonthAndYear(record.date)
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

  const automatedReturnVisits = calls.reduce((totalCount, call) => {
    const callVisits = visits.filter((v) => v.call.id === call.id);
    const callVisitsForMonth = callVisits.reduce((callCount, visit, index) => {
      if (index === 0) {
        return callCount + 0;
      } else {
        if (isSameMonthAndYear(visit.date)) {
          return callCount + 1;
        } else {
          return callCount + 0;
        }
      }
    }, 0);
    return totalCount + callVisitsForMonth;
  }, 0);

  const automatedStudies = calls.reduce((count, call) => {
    if (
      call.isStudy &&
      visitsThisMonth.filter((v) => v.call.id === call.id).length > 0
    ) {
      return count + 1;
    } else {
      return count;
    }
  }, 0);

  const placements = placementOffset + placementsThisMonth;
  const videoPlacements = videoPlacementOffset + videoPlacementsThisMonth;
  const studies = automatedStudies + studiesOffset;
  const returnVisits = automatedReturnVisits + returnVisitsOffset;

  const monthDisplay = month ? moment().month(month).format("MMMM") : "";
  const yearDisplay = year ? `, ${moment().year(year).format("YYYY")}` : "";
  const title = `${
    monthDisplay || yearDisplay ? `${monthDisplay}${yearDisplay} ` : ""
  }${i18n.t("serviceReport")}`;

  return {
    hours,
    placements,
    videoPlacements,
    returnVisits,
    studies,
    month,
    year,
    share: {
      title,
      message: `${title}\n${formatReportForSharing({
        hours,
        placements,
        returnVisits,
        studies,
        videoPlacements,
      })}`.trim(),
    },
  };
};

export const formatReportForSharing = ({
  hours,
  placements,
  videoPlacements,
  returnVisits,
  studies,
}: {
  hours: number;
  placements: number;
  videoPlacements: number;
  returnVisits: number;
  studies?: number;
}): string => {
  const json = JSON.stringify(
    {
      hours,
      placements,
      videoPlacements,
      returnVisits,
      studies: studies || undefined,
    },
    null,
    2
  );
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
  formattedJSON = formattedJSON.replace("returnVisits", i18n.t("returnVisits"));
  formattedJSON = formattedJSON.replace("studies", i18n.t("studies"));
  return formattedJSON.trim();
};

interface MonthReportProps {
  report: MonthReportData;
  hideArrow?: boolean;
}

const MonthReport: React.FC<MonthReportProps> = ({ report, hideArrow }) => {
  const { hours, placements, returnVisits, studies, videoPlacements } = report;
  const themeStyles = StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: "border-primary-color-1",
      borderRadius: appTheme.borderRadius,
      paddingTop: hideArrow ? 15 : 0,
      paddingHorizontal: 15,
      paddingBottom: 15,
      gap: 5,
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
    chevronRight: {
      marginTop: 10,
      height: 15,
      width: 15,
      color: "text-hint-color",
    },
  });
  const styles = useStyleSheet(themeStyles);

  const ChevronRight = (): IconElement => (
    <Icon style={styles.chevronRight} name={"chevron-right"} />
  );

  return (
    <Layout level="2" style={styles.container}>
      <View style={styles.header}>{!hideArrow && <ChevronRight />}</View>
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
