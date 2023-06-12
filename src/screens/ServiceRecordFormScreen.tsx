import {
  Button,
  ButtonGroup,
  Calendar,
  CheckBox,
  Divider,
  Icon,
  Input,
  Layout,
  Text,
  TopNavigation,
  TopNavigationAction,
  useStyleSheet,
} from "@ui-kitten/components";
import React, { useCallback, useRef, useState } from "react";
import appTheme from "../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ImageProps,
  Keyboard,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { TouchableWebElement } from "@ui-kitten/components/devsupport";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList } from "../stacks/ParamLists";
import { i18n } from "../lib/translations";
import useServiceRecordStore, {
  ServiceRecord,
  hourInMS,
  minuteInMS,
} from "../stores/ServiceRecord";
import { MomentDateService } from "@ui-kitten/moment";
import { Formik } from "formik";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import moment, { DurationInputArg1, DurationInputArg2 } from "moment";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import Card from "../components/Card";
import * as Haptics from "expo-haptics";

const DownArrowIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name={"arrow-down"} />;

type ServiceRecordFormProps = NativeStackScreenProps<
  HomeStackParamList,
  "ServiceRecordForm"
>;

const ServiceRecordFormScreen = ({ navigation }: ServiceRecordFormProps) => {
  const insets = useSafeAreaInsets();
  const startTime = useRef(moment());
  const [warningDismissed, setWarningDismissed] = useState(false);
  const { setRecord, deleteAllRecords } = useServiceRecordStore();

  const themedStyles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: 10,
      gap: 10,
      paddingLeft: appTheme.contentPaddingLeftRight,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingBottom: insets.bottom + 10,
    },
  });
  const styles = useStyleSheet(themedStyles);
  const formikRef = useRef<any>(null);

  const TopNavigationWithBackBottom = (): TouchableWebElement => (
    <TopNavigationAction
      icon={DownArrowIcon}
      onPress={() => navigation.goBack()}
    />
  );

  type TemporaryTime = {
    hours: number;
    minutes: number;
    time?: moment.Moment; // moment is used for easy time manipulation. When saved to storage, time value will be converted to MS.
  };

  type InitialValues = Omit<ServiceRecord, "time"> & TemporaryTime;

  const formikInitialValues: InitialValues = {
    id: uuidv4(),
    date: moment(),
    placements: 0,
    returnVisitOffset: 0,
    studyOffset: 0,
    time: startTime.current,
    videoPlacements: 0,
    minutes: 0,
    hours: 0,
    ldc: false,
  };

  const renderStudyLabel = useCallback(() => {
    return (
      <Text style={{ marginBottom: 3 }} appearance="hint" category="s2">
        {i18n.t("studies")}
      </Text>
    );
  }, []);
  const renderReturnVisitsLabel = useCallback(() => {
    return (
      <Text style={{ marginBottom: 3 }} appearance="hint" category="s2">
        {i18n.t("returnVisits")}
      </Text>
    );
  }, []);
  const renderPlacementsLabel = useCallback(() => {
    return (
      <Text style={{ marginBottom: 3 }} appearance="hint" category="s2">
        {i18n.t("placements")}
      </Text>
    );
  }, []);
  const renderVideoPlacementsLabel = useCallback(() => {
    return (
      <Text style={{ marginBottom: 3 }} appearance="hint" category="s2">
        {i18n.t("videoPlacements")}
      </Text>
    );
  }, []);

  return (
    <Layout style={styles.wrapper}>
      <TopNavigation
        alignment="center"
        accessoryLeft={TopNavigationWithBackBottom}
        title={i18n.t("newServiceEntry")}
      />
      <KeyboardAwareScrollView>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <React.Fragment>
            <Formik
              innerRef={formikRef}
              initialValues={formikInitialValues}
              onSubmit={(input, { setValues }) => {
                const { time, hours, minutes, ...values } = input;
                const quickTimeDiffInMilliseconds = moment(time).diff(
                  startTime.current,
                  "millisecond"
                );

                const manuallyAddedTimeInMilliseconds =
                  hours * hourInMS + minutes * minuteInMS;

                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success
                );

                setValues(formikInitialValues);

                setRecord({
                  ...values,
                  time:
                    quickTimeDiffInMilliseconds ||
                    manuallyAddedTimeInMilliseconds,
                });

                navigation.goBack();
              }}
            >
              {({ values, setValues, handleSubmit }) => {
                const handleQuickAddTimeChange = (
                  amount?: DurationInputArg1,
                  unit?: DurationInputArg2
                ) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setValues({
                    ...values,
                    hours: 0,
                    minutes: 0,
                    time: moment(startTime.current).add(amount, unit),
                  });
                };
                return (
                  <View style={{ gap: 10 }}>
                    <View style={{ gap: 10 }}>
                      <Text category="s1">{i18n.t("date")}</Text>
                      <Calendar
                        min={moment().subtract(3, "year")}
                        style={{
                          width: "100%",
                        }}
                        dateService={new MomentDateService(i18n.locale)}
                        max={moment()}
                        date={values.date}
                        onSelect={(date) => {
                          setValues({
                            ...values,
                            date,
                          });

                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light
                          );
                        }}
                      />
                    </View>
                    <Divider />
                    <View style={{ gap: 10 }}>
                      <Text category="s1">{i18n.t("activity")}</Text>
                      <Text appearance="hint" category="c2">
                        {i18n.t("quickSelectTime")}
                      </Text>
                      <View style={{ gap: 10 }}>
                        <ButtonGroup style={{ marginTop: -8 }}>
                          <Button
                            style={{
                              opacity: moment(startTime.current)
                                .add(30, "minute")
                                .isSame(values.time)
                                ? 1
                                : 0.7,
                            }}
                            onPress={() =>
                              handleQuickAddTimeChange(30, "minutes")
                            }
                          >
                            {i18n.t("30m")}
                          </Button>
                          <Button
                            style={{
                              opacity: moment(startTime.current)
                                .add(1, "hour")
                                .isSame(values.time)
                                ? 1
                                : 0.7,
                            }}
                            onPress={() => handleQuickAddTimeChange(1, "hour")}
                          >
                            {i18n.t("1hr")}
                          </Button>
                          <Button
                            style={{
                              opacity: moment(startTime.current)
                                .add(90, "minute")
                                .isSame(values.time)
                                ? 1
                                : 0.7,
                            }}
                            onPress={() =>
                              handleQuickAddTimeChange(90, "minutes")
                            }
                          >
                            {i18n.t("1andHalfHrs")}
                          </Button>
                          <Button
                            style={{
                              opacity: moment(startTime.current)
                                .add(2, "hour")
                                .isSame(values.time)
                                ? 1
                                : 0.7,
                            }}
                            onPress={() => handleQuickAddTimeChange(2, "hours")}
                          >
                            {i18n.t("2hrs")}
                          </Button>
                          <Button
                            style={{
                              opacity: moment(startTime.current)
                                .add(2, "hour")
                                .add(30, "minute")
                                .isSame(values.time)
                                ? 1
                                : 0.7,
                            }}
                            onPress={() =>
                              handleQuickAddTimeChange(150, "minutes")
                            }
                          >
                            {i18n.t("2andHalfHrs")}
                          </Button>
                        </ButtonGroup>
                        <Text appearance="hint" category="h6">
                          {i18n.t("OR")}
                        </Text>
                        <View style={{ flexDirection: "row", gap: 5 }}>
                          <Input
                            label={i18n.t("hours")}
                            keyboardType="number-pad"
                            value={values.hours.toString()}
                            onChangeText={(numberString) => {
                              let number: number;
                              if (Number.isNaN(parseInt(numberString))) {
                                number = 0;
                              } else {
                                number = parseInt(numberString);
                              }
                              setValues({
                                ...values,
                                time: moment(startTime.current), // reset quick time select when manually entering time
                                hours: number,
                              });
                            }}
                            style={{ flex: 1 }}
                          />
                          <Input
                            label={i18n.t("minutes")}
                            value={values.minutes.toString()}
                            onChangeText={(numberString) => {
                              let number: number;
                              if (Number.isNaN(parseInt(numberString))) {
                                number = 0;
                              } else {
                                number = parseInt(numberString);
                              }
                              setValues({
                                ...values,
                                time: moment(startTime.current), // reset quick time select when manually entering time
                                minutes: number,
                              });
                            }}
                            keyboardType="number-pad"
                            style={{ flex: 1 }}
                          />
                        </View>
                        <CheckBox
                          style={{ marginLeft: 5 }}
                          checked={values.ldc}
                          onChange={(checked) =>
                            setValues({
                              ...values,
                              ldc: checked,
                            })
                          }
                        >
                          {i18n.t("ldcTime")}
                        </CheckBox>
                      </View>
                      <Divider />
                      <View style={{ gap: 10 }}>
                        <View style={{ flexDirection: "row", gap: 5 }}>
                          <Input
                            style={{ flex: 1 }}
                            keyboardType="number-pad"
                            value={values.placements.toString()}
                            label={renderPlacementsLabel}
                            onChangeText={(numberString) => {
                              let number: number;
                              if (Number.isNaN(parseInt(numberString))) {
                                number = 0;
                              } else {
                                number = parseInt(numberString);
                              }
                              setValues({
                                ...values,
                                placements: number,
                              });
                            }}
                          />
                          <Input
                            style={{ flex: 1 }}
                            keyboardType="number-pad"
                            value={values.videoPlacements.toString()}
                            label={renderVideoPlacementsLabel}
                            placeholder="0"
                            onChangeText={(numberString) => {
                              let number: number;
                              if (Number.isNaN(parseInt(numberString))) {
                                number = 0;
                              } else {
                                number = parseInt(numberString);
                              }
                              setValues({
                                ...values,
                                videoPlacements: number,
                              });
                            }}
                          />
                        </View>
                        <View style={{ flexDirection: "row", gap: 5 }}>
                          <Input
                            style={{ flex: 1 }}
                            keyboardType="number-pad"
                            value={values.returnVisitOffset.toString()}
                            label={renderReturnVisitsLabel}
                            onChangeText={(numberString) => {
                              let number: number;
                              if (Number.isNaN(parseInt(numberString))) {
                                number = 0;
                              } else {
                                number = parseInt(numberString);
                              }
                              setValues({
                                ...values,
                                returnVisitOffset: number,
                              });
                            }}
                          />
                          <Input
                            style={{ flex: 1 }}
                            keyboardType="number-pad"
                            value={values.studyOffset.toString()}
                            label={renderStudyLabel}
                            onChangeText={(numberString) => {
                              let number: number;
                              if (Number.isNaN(parseInt(numberString))) {
                                number = 0;
                              } else {
                                number = parseInt(numberString);
                              }
                              setValues({
                                ...values,
                                studyOffset: number,
                              });
                            }}
                          />
                        </View>
                      </View>
                    </View>
                    {!warningDismissed && (
                      <Card status="warning">
                        <View
                          style={{ flexDirection: "column", gap: 5, flex: 1 }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              gap: 10,
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ flex: 1, flexWrap: "wrap" }}>
                              {i18n.t("serviceRecordFormWarning")}
                            </Text>
                            <Button
                              appearance="ghost"
                              size="small"
                              onPress={() => setWarningDismissed(true)}
                            >
                              Dismiss
                            </Button>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              gap: 10,
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{ flex: 1 }}
                              appearance="hint"
                              category="c1"
                            >
                              {i18n.t("serviceEntryNewVisitHelper")}
                            </Text>
                            <Button
                              style={{ flex: 1 }}
                              size="small"
                              appearance="outline"
                              onPress={() => {
                                navigation.popToTop();
                                navigation.navigate("VisitForm");
                              }}
                            >
                              {i18n.t("createNewVisitEntry")}
                            </Button>
                          </View>
                        </View>
                      </Card>
                    )}
                  </View>
                );
              }}
            </Formik>
          </React.Fragment>
        </TouchableWithoutFeedback>
      </KeyboardAwareScrollView>
      <Button onPress={() => formikRef.current?.handleSubmit()}>
        {i18n.t("addServiceEntry")}
      </Button>
    </Layout>
  );
};

export default ServiceRecordFormScreen;
