import { Platform, View } from "react-native";
import Text from "./MyText";
import moment from "moment";
import {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import i18n from "../lib/locales";
import Button from "./Button";

type AndroidMode = "date" | "time";

interface Props {
  value: Date;
  onChange: (event: DateTimePickerEvent, date?: Date | undefined) => void;
  /**
   * Mode provides the first picker's mode. If you need both date and time, Native Android UI does not support this functionality.
   * Use the timeAndDate prop to enable two separate selectors.
   * These selectors edit the same incoming value (Date)
   * @example
   * <AndroidDateTimePicker
   *  value={date}
   *  onChange={handleDateChange}
   *  timeAndDate={true}
   * />
   * // value: 10/28/2023 10:00:00 AM
   * // First selector changes date -> 10/10/2023 10:00:00 AM
   * // Second selector changes time -> 10/10/2023 02:00:00 PM
   */
  mode?: AndroidMode;
  maximumDate?: Date | undefined;
  minimumDate?: Date | undefined;
  timeAndDate?: boolean;
}

const AndroidDateTimePicker = ({
  value,
  onChange,
  mode,
  maximumDate,
  minimumDate,
  timeAndDate,
}: Props) => {
  if (Platform.OS !== "android") {
    return null;
  }
  return (
    <View style={{ flexDirection: timeAndDate ? "column" : "row", gap: 10 }}>
      <Text style={{ fontFamily: "Inter_600SemiBold" }}>
        {moment(value).format(timeAndDate ? "LLL" : "LL")}
      </Text>
      <View style={{ flexDirection: "row", gap: 7 }}>
        <Button
          onPress={() => {
            DateTimePickerAndroid.open({
              mode,
              minimumDate,
              maximumDate,
              value,
              onChange,
            });
          }}
        >
          <Text
            style={{
              textDecorationLine: "underline",
            }}
          >
            {i18n.t("selectDate")}
          </Text>
        </Button>
        {timeAndDate && (
          <Button
            onPress={() => {
              DateTimePickerAndroid.open({
                mode: "time",
                minimumDate,
                maximumDate,
                value: value,
                onChange,
              });
            }}
          >
            <Text
              style={{
                textDecorationLine: "underline",
              }}
            >
              {i18n.t("selectTime")}
            </Text>
          </Button>
        )}
      </View>
    </View>
  );
};

export default AndroidDateTimePicker;
