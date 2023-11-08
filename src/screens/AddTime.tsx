import { View, Platform } from "react-native";
import { useState } from "react";
import Section from "../components/inputs/Section";
import InputRowContainer from "../components/inputs/InputRowContainer";
import theme from "../constants/theme";
import Text from "../components/MyText";
import ActionButton from "../components/ActionButton";
import useServiceReport from "../stores/serviceReport";
import * as Crypto from "expo-crypto";
import RNDateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import moment from "moment";
import { ServiceReport } from "../types/serviceReport";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import i18n from "../lib/locales";
import CheckboxWithLabel from "../components/inputs/CheckboxWithLabel";
import AndroidDateTimePicker from "../components/AndroidDateTimePicker";
import { Dropdown } from "react-native-element-dropdown";

const AddTime = () => {
  const navigation = useNavigation<RootStackNavigation>();
  const insets = useSafeAreaInsets();
  const [serviceReport, setServiceReport] = useState<ServiceReport>({
    id: Crypto.randomUUID(),
    hours: 0,
    minutes: 0,
    date: new Date(),
    ldc: false,
  });
  const setHours = (hours: number) => {
    setServiceReport({
      ...serviceReport,
      hours,
    });
  };
  const setMinutes = (minutes: number) => {
    setServiceReport({
      ...serviceReport,
      minutes,
    });
  };
  const handleDateChange = (_: DateTimePickerEvent, date: Date | undefined) => {
    if (!date) {
      return;
    }
    setServiceReport({
      ...serviceReport,
      date,
    });
  };
  const handleLdcTimeChange = (ldc: boolean) => {
    setServiceReport({
      ...serviceReport,
      ldc,
    });
  };
  const minuteOptions = [0, 15, 30, 45].map((value) => ({
    label: `${value}`,
    value,
  }));
  const hourOptions = [...Array(24).keys()].map((value) => ({
    label: `${value}`,
    value,
  }));
  const { addServiceReport } = useServiceReport();

  const submit = () => {
    addServiceReport(serviceReport);
    navigation.popToTop();
  };

  return (
    <View
      style={{
        flex: 1,
        flexGrow: 1,
        justifyContent: "space-between",
        marginBottom: insets.bottom + 30,
      }}
    >
      <View style={{ gap: 30 }}>
        <View style={{ padding: 25, gap: 5 }}>
          <Text style={{ fontSize: 32, fontFamily: "Inter_700Bold" }}>
            {i18n.t("addTime")}
          </Text>
          <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            {i18n.t("addTime_description")}
          </Text>
        </View>
        <Section>
          <InputRowContainer
            label={i18n.t("date")}
            justifyContent="space-between"
          >
            {Platform.OS !== "android" ? (
              <RNDateTimePicker
                maximumDate={moment().toDate()}
                value={serviceReport.date}
                onChange={handleDateChange}
              />
            ) : (
              <AndroidDateTimePicker
                value={serviceReport.date}
                onChange={handleDateChange}
                maximumDate={moment().toDate()}
              />
            )}
          </InputRowContainer>
          <InputRowContainer lastInSection>
            <CheckboxWithLabel
              label={i18n.t("ldcTime")}
              value={serviceReport.ldc!}
              setValue={handleLdcTimeChange}
            />
          </InputRowContainer>
        </Section>
        <Section>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <View style={{ width: "50%" }}>
              <InputRowContainer label={i18n.t("hours")} lastInSection>
                <View style={{ flex: 1 }}>
                  <Dropdown
                    data={hourOptions}
                    labelField={"label"}
                    valueField={"value"}
                    style={{
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      borderRadius: theme.numbers.borderRadiusSm,
                    }}
                    containerStyle={{
                      borderRadius: theme.numbers.borderRadiusSm,
                      backgroundColor: theme.colors.background,
                    }}
                    placeholder={serviceReport.hours.toString()}
                    onChange={({ value }) => setHours(value)}
                    value={serviceReport.hours.toString()}
                  />
                </View>
              </InputRowContainer>
            </View>

            <View style={{ width: "50%" }}>
              <InputRowContainer label={i18n.t("minutes")} lastInSection>
                <View style={{ flex: 1 }}>
                  <Dropdown
                    data={minuteOptions}
                    labelField={"label"}
                    valueField={"value"}
                    style={{
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      borderRadius: theme.numbers.borderRadiusSm,
                    }}
                    containerStyle={{
                      borderRadius: theme.numbers.borderRadiusSm,
                      backgroundColor: theme.colors.background,
                    }}
                    placeholder={serviceReport.minutes.toString()}
                    onChange={({ value }) => setMinutes(value)}
                    value={serviceReport.hours.toString()}
                  />
                </View>
              </InputRowContainer>
            </View>
          </View>
        </Section>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <ActionButton action={submit} label={i18n.t("submit")} />
      </View>
    </View>
  );
};

export default AddTime;
