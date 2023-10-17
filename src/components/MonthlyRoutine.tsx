import { View } from "react-native";
import moment from "moment";
import { FontAwesome } from "@expo/vector-icons";
import theme from "../constants/theme";
import Card from "./Card";
import MyText from "./MyText";
import { FlashList } from "@shopify/flash-list";
import { hasServiceReportsForMonth } from "../lib/serviceReport";
import useServiceReport from "../stores/serviceReport";

const Month = ({ month }: { month: number }) => {
  const currentMonth = moment().month();
  const isCurrentMonth = currentMonth === month;
  const monthHasPassed = currentMonth > month;
  const monthInFuture = currentMonth < month;
  const { serviceReports } = useServiceReport();
  const wentOutThisMonth = hasServiceReportsForMonth(serviceReports, month);

  const didNotGoOutInService = monthHasPassed && !wentOutThisMonth;
  const hasNotGoneOutTheCurrentMonth = isCurrentMonth && !wentOutThisMonth;
  return (
    <View
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
            color: didNotGoOutInService
              ? theme.colors.error
              : hasNotGoneOutTheCurrentMonth || monthInFuture
              ? theme.colors.textAlt
              : theme.colors.accent,
            fontSize: 15,
          }}
          name={didNotGoOutInService ? "times" : "check"}
        />
      </View>
      <MyText
        style={{
          textAlign: "center",
          color: isCurrentMonth
            ? theme.colors.textInverse
            : theme.colors.textAlt,
        }}
      >
        {moment().month(month).format("MMM")}
      </MyText>
    </View>
  );
};

const MonthlyRoutine = () => {
  return (
    <View style={{ gap: 10 }}>
      <MyText style={{ fontSize: 14, fontWeight: "600", marginLeft: 5 }}>
        Monthly Routine
      </MyText>
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
