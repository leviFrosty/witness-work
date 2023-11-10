import { Pressable, View } from "react-native";
import moment from "moment";
import { FontAwesome } from "@expo/vector-icons";
import useTheme from "../contexts/theme";
import Card from "./Card";
import Text from "./MyText";
import { FlashList } from "@shopify/flash-list";
import { hasServiceReportsForMonth } from "../lib/serviceReport";
import useServiceReport from "../stores/serviceReport";
import { usePreferences } from "../stores/preferences";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";
import i18n from "../lib/locales";

const Month = ({ month }: { month: number }) => {
  const theme = useTheme();
  const navigation = useNavigation<RootStackNavigation>();
  const { installedOn, publisher } = usePreferences();
  const currentMonth = moment().month();
  const isCurrentMonth = currentMonth === month;
  const monthHasPassed = currentMonth > month;
  const monthInFuture = currentMonth < month;
  const { serviceReports } = useServiceReport();
  const wentOutThisMonth = hasServiceReportsForMonth(serviceReports, month);
  const monthWasBeforeInstalled = month < moment(installedOn).month();

  const didNotGoOutInService = monthHasPassed && !wentOutThisMonth;
  const hasNotGoneOutTheCurrentMonth = isCurrentMonth && !wentOutThisMonth;

  return (
    <Pressable
      onPress={
        publisher === "publisher"
          ? undefined
          : () => navigation.navigate("Time Reports")
      }
      style={{
        gap: 5,
        backgroundColor: isCurrentMonth ? theme.colors.accent3 : undefined,
        borderRadius: theme.numbers.borderRadiusSm,
        padding: 7,
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors.backgroundLighter,
          padding: 8,
          borderRadius: theme.numbers.borderRadiusSm,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <FontAwesome
          style={{
            color: wentOutThisMonth
              ? theme.colors.accent
              : hasNotGoneOutTheCurrentMonth ||
                monthInFuture ||
                monthWasBeforeInstalled
              ? theme.colors.textAlt
              : theme.colors.error,
            fontSize: 15,
          }}
          name={
            !didNotGoOutInService
              ? "check"
              : monthWasBeforeInstalled
              ? "minus"
              : "times"
          }
        />
      </View>
      <Text
        style={{
          textAlign: "center",
          color: isCurrentMonth
            ? theme.colors.textInverse
            : theme.colors.textAlt,
        }}
      >
        {moment().month(month).format("MMM")}
      </Text>
    </Pressable>
  );
};

const MonthlyRoutine = () => {
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", marginLeft: 5 }}
      >
        {i18n.t("monthlyRoutine")}
      </Text>
      <Card>
        <FlashList
          horizontal
          initialScrollIndex={moment().month()}
          keyExtractor={(item) => item.toString()}
          estimatedItemSize={45}
          data={[...Array(12).keys()]}
          renderItem={({ item: month }) => {
            return <Month month={month} />;
          }}
          showsHorizontalScrollIndicator={false}
        />
      </Card>
    </View>
  );
};

export default MonthlyRoutine;
