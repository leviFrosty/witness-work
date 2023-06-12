import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList } from "../stacks/ParamLists";
import {
  Button,
  Divider,
  Layout,
  MenuItem,
  OverflowMenu,
  Text,
  TopNavigation,
  TopNavigationAction,
  useStyleSheet,
} from "@ui-kitten/components";
import { Alert, Share, StyleSheet, View } from "react-native";
import MonthReport, {
  MonthReportData,
  formatReportForSharing,
  parseForMonthReport,
} from "../components/MonthReport";
import { FlashList } from "@shopify/flash-list";
import useCallsStore from "../stores/CallStore";
import useServiceRecordStore from "../stores/ServiceRecord";
import useVisitsStore from "../stores/VisitStore";
import moment from "moment";
import React, { useMemo, useState } from "react";
import { i18n } from "../lib/translations";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appTheme from "../lib/theme";
import {
  ChevronLeft,
  ChevronRight,
  DeleteIcon,
  DotsIcon,
  Export,
  PlusIcon,
} from "../components/Icons";
import { TouchableWebElement } from "@ui-kitten/components/devsupport";
import * as Haptics from "expo-haptics";

type AnnualReportScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  "AnnualReport"
>;

const AnnualReportScreen = ({ route, navigation }: AnnualReportScreenProps) => {
  const { calls } = useCallsStore();
  const { records } = useServiceRecordStore();
  const { visits } = useVisitsStore();
  const { deleteAllRecords } = useServiceRecordStore();
  const year = route.params.year;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const insets = useSafeAreaInsets();

  const monthlyReports = useMemo((): MonthReportData[] => {
    const monthReports: MonthReportData[] = [];
    const maxMonth = moment().year() === year ? moment().month() + 1 : 12;
    for (let month = 0; month < maxMonth; month++) {
      monthReports.push(
        parseForMonthReport({
          calls,
          records,
          visits,
          month,
          year,
        })
      );
    }
    return monthReports.sort((a, b) => (a.month > b.month ? -1 : 1));
  }, [records, calls, visits]);

  const annualReport = useMemo(() => {
    const annualNumbers = monthlyReports.reduce(
      (total, report) => {
        return {
          hours: total.hours + report.hours,
          placements: total.placements + report.placements,
          videoPlacements: total.videoPlacements + total.videoPlacements,
          returnVisits: total.returnVisits + report.returnVisits,
          share: {},
        };
      },
      {
        hours: 0,
        placements: 0,
        videoPlacements: 0,
        returnVisits: 0,
        share: {},
      }
    );

    const yearDisplay = `${moment().year(year).format("YYYY")}`;
    const title = `${yearDisplay} ${i18n.t("serviceReport")}`;

    return {
      ...annualNumbers,
      share: {
        title,
        message: `${title}\n${formatReportForSharing(annualNumbers)}`,
      },
    };
  }, [monthlyReports, year]);

  const themeStyles = StyleSheet.create({
    wrapper: {
      flex: 1,
      position: "relative",
      paddingTop: insets.top,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
    },
    itemHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    buttons: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    item: {
      gap: 5,
    },
    warningMenuItem: {
      color: "color-danger-500",
    },
  });

  const styles = useStyleSheet(themeStyles);

  const handleRenderItem = (item: MonthReportData) => {
    return (
      <View style={styles.item}>
        <View style={styles.itemHeader}>
          <Text category="h6">{moment().month(item.month).format("MMMM")}</Text>
          <Button
            appearance="ghost"
            size="small"
            accessoryLeft={Export}
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              await Share.share({
                title: item.share?.title,
                message: item.share?.message || "",
              });
            }}
          />
        </View>
        <MonthReport report={item} hideArrow />
      </View>
    );
  };

  const TopNavigationWithBackBottom = (): TouchableWebElement => (
    <TopNavigationAction
      icon={ChevronLeft}
      onPress={() => navigation.goBack()}
    />
  );

  const renderMenuToggleButton = () => {
    return (
      <TopNavigationAction
        onPress={() => setIsMenuOpen(true)}
        icon={DotsIcon}
      />
    );
  };

  const renderRightNavActions = (): React.ReactElement => {
    return (
      <React.Fragment>
        <TopNavigationAction
          icon={PlusIcon}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.push("ServiceRecordForm");
          }}
        />
        <OverflowMenu
          onBackdropPress={() => setIsMenuOpen(false)}
          anchor={renderMenuToggleButton}
          visible={isMenuOpen}
        >
          <MenuItem
            title={i18n.t("shareAnnualReport")}
            accessoryLeft={Export}
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              await Share.share({
                title: annualReport.share?.title,
                message: annualReport.share?.message || "",
              });
            }}
          />
          <MenuItem
            style={styles.warningMenuItem}
            title={i18n.t("deleteAll")}
            accessoryLeft={DeleteIcon}
            onPress={() => {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning
              );
              Alert.alert(
                i18n.t("deleteAllServiceRecords"),
                i18n.t("deleteCaption"),
                [
                  {
                    text: i18n.t("cancel"),
                    style: "cancel",
                    onPress: () => {
                      setIsMenuOpen(false);
                    },
                  },
                  {
                    text: i18n.t("delete"),
                    style: "destructive",
                    // If the user confirmed, then we dispatch the action we blocked earlier
                    // This will continue the action that had triggered the removal of the screen
                    onPress: () => {
                      navigation.popToTop();
                      deleteAllRecords();
                    },
                  },
                ]
              );
            }}
          />
        </OverflowMenu>
      </React.Fragment>
    );
  };

  return (
    <Layout style={styles.wrapper}>
      <TopNavigation
        alignment="center"
        accessoryRight={renderRightNavActions}
        accessoryLeft={TopNavigationWithBackBottom}
        title={i18n.t("annualReport")}
      />
      <View style={styles.buttons}>
        <Button
          accessoryLeft={ChevronLeft}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.replace("AnnualReport", {
              year: year - 1,
              previouslyViewedYear: year,
            });
          }}
        />
        <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
          <Text style={{ flexShrink: 1 }} category="h3">
            {year}
          </Text>
        </View>
        <Button
          style={{
            opacity: year !== moment().year() ? 1 : 0,
          }}
          disabled={year === moment().year()}
          accessoryLeft={ChevronRight}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.replace("AnnualReport", {
              year: year + 1,
              previouslyViewedYear: year,
            });
          }}
        />
      </View>
      <FlashList
        data={monthlyReports}
        ListEmptyComponent={
          <Text category="c2">
            {i18n.t("thereAreNoMonthlyReportsAvailable")}
          </Text>
        }
        estimatedItemSize={113}
        ItemSeparatorComponent={(props) => (
          <Divider style={{ marginVertical: 10 }} {...props} />
        )}
        renderItem={({ item }) => handleRenderItem(item)}
        keyExtractor={(item, index) => `${item.month}-${index}`}
      />
    </Layout>
  );
};

export default AnnualReportScreen;
