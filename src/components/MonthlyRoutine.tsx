import { View, Text, FlatList } from "react-native";
import moment from "moment";
import { FontAwesome } from "@expo/vector-icons";
import theme from "../constants/theme";
import Card from "./Card";
import MyText from "./MyText";

const Month = ({ month }: { month: number }) => {
  const currentMonth = moment().month() === month;

  return (
    <View
      style={{
        gap: 5,
        backgroundColor: currentMonth ? theme.colors.accent3 : undefined,
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
          style={{ color: theme.colors.accent, fontSize: 15 }}
          name="check"
        />
      </View>
      <Text
        style={{
          textAlign: "center",
          color: currentMonth ? theme.colors.textInverse : theme.colors.textAlt,
        }}
      >
        {moment().month(month).format("MMM")}
      </Text>
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
        <FlatList
          horizontal
          initialScrollIndex={moment().month()}
          keyExtractor={(item) => item.toString()}
          getItemLayout={(_, index) => ({
            length: 45,
            offset: 45 * index,
            index,
          })}
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
