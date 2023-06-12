import { i18n } from "../lib/translations";
import {
  Alert,
  Dimensions,
  ImageProps,
  Keyboard,
  StyleSheet,
  View,
} from "react-native";
import appTheme from "../lib/theme";
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  CheckBox,
  Datepicker,
  Divider,
  Icon,
  Input,
  Layout,
  Text,
  Toggle,
} from "@ui-kitten/components";
import TopNavBarWithBackButton from "../components/TopNavBarWithBackButton";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList } from "../stacks/ParamLists";
import useCallsStore, { Call } from "../stores/CallStore";
import React, { useRef, useState } from "react";
import { Formik } from "formik";
import useVisitsStore, { Visit } from "../stores/VisitStore";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import * as Yup from "yup";
import moment from "moment";
import { MomentDateService } from "@ui-kitten/moment";
import { TouchableWithoutFeedback } from "@ui-kitten/components/devsupport";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import RNDateTimePicker from "@react-native-community/datetimepicker";

type VisitFormScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  "VisitForm"
>;

const filter = (call: Call, query: string) =>
  call.name.toLowerCase().includes(query.toLowerCase());

const ContactIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="account-box" />;
const CalendarIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="calendar" />;
const NoteIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="note" />;
const HookIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="hook" />;
const HandIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="hand-extended" />;
const VideoIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="movie" />;
const ScriptureIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => (
  <Icon {...props} name="book-open-page-variant" />
);
const MultiplePersonIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => (
  <Icon {...props} name="account-multiple" />
);
const CloseIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="close" />;

const VisitFormScreen = ({ route, navigation }: VisitFormScreenProps) => {
  const callIdFromParams = route.params?.callId;
  const { calls, setCall } = useCallsStore();
  const [data, setData] = useState(calls);
  const formikRef = useRef<any>(null);
  const call = calls.find((c) => c.id === callIdFromParams);
  const { visits, setVisit } = useVisitsStore();
  const insets = useSafeAreaInsets();
  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: insets.top + 10,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
      paddingBottom: insets.bottom + 10,
    },
  });

  const renderOption = (call: Call, key: number) => {
    return (
      <AutocompleteItem
        style={{ minWidth: Dimensions.get("window").width - 20 }}
        key={key}
        title={call.name}
      />
    );
  };

  return (
    <Layout style={styles.wrapper}>
      <TopNavBarWithBackButton
        iconLeft={CloseIcon}
        onPressLeft={() =>
          Alert.alert(
            i18n.t("discardChanges"),
            i18n.t("unsavedChangesOnScreen"),
            [
              { text: i18n.t("dontLeave"), style: "cancel", onPress: () => {} },
              {
                text: i18n.t("discard"),
                style: "destructive",
                // If the user confirmed, then we dispatch the action we blocked earlier
                // This will continue the action that had triggered the removal of the screen
                onPress: () => navigation.goBack(),
              },
            ]
          )
        }
        title={i18n.t("newVisit")}
      />
      <KeyboardAwareScrollView>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Formik
            innerRef={formikRef}
            initialValues={{
              query: {
                id: callIdFromParams,
                name: call?.name ?? "",
              },
              visit: {
                id: uuidv4(),
                call: {
                  id: callIdFromParams ?? "",
                },
                date: moment(),
                time: new Date(),
                topic: "",
                note: "",
                placement: "",
                videoPlacement: "",
                doNotCountTowardsStudy: false,
                partners: "",
                nextVisit: {
                  date: moment().add(1, "week"),
                  time: new Date(),
                  notifyMe: true,
                  linkTopic: "",
                  linkScripture: "",
                  linkNote: "",
                },
              },
            }}
            validationSchema={Yup.object({
              visit: Yup.object({
                call: Yup.object({
                  id: Yup.string().required(),
                }),
              }),
            })}
            onSubmit={({ visit }) => {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );

              const {
                time,
                nextVisit: { time: nextVisitTime, ...nextVisit },
                ..._visit
              } = visit;

              const date = visit.date
                .hour(moment(time).hour())
                .minute(moment(time).minute());

              const nextVisitDate = nextVisit.date
                .hour(moment(nextVisitTime).hour())
                .minute(moment(nextVisitTime).minute());

              const withNextVisitDateTime: Visit = {
                ..._visit,
                date,
                nextVisit: {
                  ...nextVisit,
                  date: nextVisitDate,
                },
              };

              // check how many visits are tied to call
              // update call based on how many visits it has.
              if (call && !visit.doNotCountTowardsStudy) {
                const callVisits = visits.filter(
                  (v) => v.call.id === visit.call.id
                );
                const visitAmount =
                  callVisits.filter((v) => !v.doNotCountTowardsStudy).length +
                  1; // add one for current visit
                setCall({
                  ...call,
                  isStudy: visitAmount >= 4,
                  isReturnVisit: visitAmount > 1 && visitAmount < 4,
                });
              }

              setVisit(withNextVisitDateTime);
              navigation.popToTop();
              navigation.push("CallDetails", { callId: visit.call.id });
            }}
          >
            {({ values, handleBlur, setValues, errors, touched }) => {
              const onChangeText = (query: string) => {
                setValues({
                  ...values,
                  query: {
                    id: "",
                    name: query,
                  },
                  visit: {
                    ...values.visit,
                    call: {
                      id: "",
                    },
                  },
                });
                setData(calls.filter((item) => filter(item, query)));
              };

              const onSelect = (index: number) => {
                setValues({
                  ...values,
                  query: { id: data[index].id, name: data[index].name },
                  visit: {
                    ...values.visit,
                    call: {
                      id: data[index].id,
                    },
                  },
                });
              };

              return (
                <View style={{ gap: 10, paddingBottom: 30 }}>
                  <View style={{ gap: 10 }}>
                    <Text category="s1">{i18n.t("call")}</Text>
                    <Autocomplete
                      clearButtonMode="while-editing"
                      accessoryLeft={ContactIcon}
                      status={
                        touched.query && errors.visit?.call ? "danger" : "basic"
                      }
                      autoFocus={!values.query.id}
                      placeholder={i18n.t("searchForCall")}
                      value={values.query.name}
                      onBlur={handleBlur("query")}
                      onSelect={onSelect}
                      onChangeText={onChangeText}
                    >
                      {data.map(renderOption)}
                    </Autocomplete>
                    {touched.query && errors.visit?.call && (
                      <Text status="danger">{i18n.t("mustSelectCall")}</Text>
                    )}
                  </View>

                  <View style={{ gap: 10 }}>
                    <Text category="s1">{i18n.t("visitDetails")}</Text>
                    <Datepicker
                      accessoryRight={CalendarIcon}
                      label={i18n.t("date")}
                      dateService={new MomentDateService(i18n.locale)}
                      onBlur={() => handleBlur("visit.date")}
                      date={values.visit.date}
                      onSelect={(date) =>
                        setValues({
                          ...values,
                          visit: { ...values.visit, date },
                        })
                      }
                    />
                    <View
                      style={{
                        flexDirection: "column",
                        gap: 3,
                        alignItems: "flex-start",
                      }}
                    >
                      <Text appearance="hint" category="c2">
                        {i18n.t("time")}
                      </Text>
                      <RNDateTimePicker
                        style={{
                          marginLeft: -10,
                        }}
                        value={values.visit.time}
                        onChange={({ nativeEvent: { timestamp } }) => {
                          if (!timestamp) {
                            return;
                          }
                          setValues({
                            ...values,
                            visit: {
                              ...values.visit,
                              time: new Date(timestamp),
                            },
                          });
                        }}
                        mode="time"
                      />
                    </View>
                    <Input
                      accessoryLeft={HookIcon}
                      label={i18n.t("topic")}
                      autoFocus={!!values.query.id}
                      value={values.visit.topic}
                      placeholder={i18n.t("visitTopicPlaceholder")}
                      onChangeText={(topic) =>
                        setValues({
                          ...values,
                          visit: { ...values.visit, topic },
                        })
                      }
                    />
                    <Input
                      accessoryLeft={NoteIcon}
                      value={values.visit.note}
                      label={i18n.t("note")}
                      multiline
                      placeholder={i18n.t("visitNotePlaceholder")}
                      onChangeText={(note) =>
                        setValues({
                          ...values,
                          visit: { ...values.visit, note },
                        })
                      }
                    />
                    <Input
                      accessoryLeft={HandIcon}
                      label={i18n.t("placement")}
                      value={values.visit.placement}
                      placeholder={i18n.t("visitPlacementPlaceholder")}
                      onChangeText={(placement) =>
                        setValues({
                          ...values,
                          visit: { ...values.visit, placement },
                        })
                      }
                    />
                    <Input
                      accessoryLeft={VideoIcon}
                      label={i18n.t("videoPlacement")}
                      value={values.visit.videoPlacement}
                      placeholder={i18n.t("videoPlacementPlaceholder")}
                      onChangeText={(videoPlacement) =>
                        setValues({
                          ...values,
                          visit: { ...values.visit, videoPlacement },
                        })
                      }
                    />
                    <Input
                      accessoryLeft={MultiplePersonIcon}
                      label={i18n.t("partners")}
                      value={values.visit.partners}
                      placeholder={i18n.t("visitPartnersPlaceholder")}
                      caption={i18n.t("visitPartnersCaption")}
                      onChangeText={(partners) =>
                        setValues({
                          ...values,
                          visit: { ...values.visit, partners },
                        })
                      }
                    />
                  </View>

                  <Divider style={{ marginVertical: 10 }} />
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: "row" }}>
                      <View style={{ flex: 1 }}>
                        <Text category="s1">{i18n.t("nextVisit")}</Text>
                        <Text appearance="hint" category="c1">
                          {i18n.t("nextVisitHelperCaption")}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row" }}>
                        <Toggle
                          checked={values.visit.nextVisit.notifyMe}
                          onChange={(notifyMe) =>
                            setValues({
                              ...values,
                              visit: {
                                ...values.visit,
                                nextVisit: {
                                  ...values.visit.nextVisit,
                                  notifyMe,
                                },
                              },
                            })
                          }
                        >
                          {i18n.t("notifyMe")}
                        </Toggle>
                      </View>
                    </View>
                    <Datepicker
                      accessoryRight={CalendarIcon}
                      label={i18n.t("date")}
                      dateService={new MomentDateService(i18n.locale)}
                      onBlur={() => handleBlur("visit.nextVisit.date")}
                      date={values.visit.nextVisit.date}
                      onSelect={(date) =>
                        setValues({
                          ...values,
                          visit: {
                            ...values.visit,
                            nextVisit: {
                              ...values.visit.nextVisit,
                              date,
                            },
                          },
                        })
                      }
                    />
                    <View
                      style={{
                        flexDirection: "column",
                        gap: 3,
                        alignItems: "flex-start",
                      }}
                    >
                      <Text appearance="hint" category="c2">
                        {i18n.t("time")}
                      </Text>
                      <RNDateTimePicker
                        style={{
                          marginLeft: -10,
                        }}
                        value={values.visit.nextVisit.time}
                        onChange={({ nativeEvent: { timestamp } }) => {
                          if (!timestamp) {
                            return;
                          }
                          setValues({
                            ...values,
                            visit: {
                              ...values.visit,
                              nextVisit: {
                                ...values.visit.nextVisit,
                                time: new Date(timestamp),
                              },
                            },
                          });
                        }}
                        mode="time"
                      />
                    </View>
                    <Input
                      accessoryLeft={HookIcon}
                      label={i18n.t("visitLinkTopic")}
                      value={values.visit.nextVisit.linkTopic}
                      placeholder={i18n.t("visitLinkTopicPlaceholder")}
                      onChangeText={(linkTopic) =>
                        setValues({
                          ...values,
                          visit: {
                            ...values.visit,
                            nextVisit: {
                              ...values.visit.nextVisit,
                              linkTopic,
                            },
                          },
                        })
                      }
                    />
                    <Input
                      accessoryLeft={ScriptureIcon}
                      label={i18n.t("visitLinkScripture")}
                      value={values.visit.nextVisit.linkScripture}
                      placeholder={i18n.t("visitLinkScripturePlaceholder")}
                      onChangeText={(linkScripture) =>
                        setValues({
                          ...values,
                          visit: {
                            ...values.visit,
                            nextVisit: {
                              ...values.visit.nextVisit,
                              linkScripture,
                            },
                          },
                        })
                      }
                    />
                    <Input
                      accessoryLeft={NoteIcon}
                      value={values.visit.nextVisit.linkNote}
                      label={i18n.t("note")}
                      multiline
                      placeholder={i18n.t("visitNextVisitNotePlaceholder")}
                      onChangeText={(linkNote) =>
                        setValues({
                          ...values,
                          visit: {
                            ...values.visit,
                            nextVisit: {
                              ...values.visit.nextVisit,
                              linkNote,
                            },
                          },
                        })
                      }
                    />
                  </View>

                  <Divider style={{ marginVertical: 10 }} />
                  <View style={{ gap: 10 }}>
                    <Text category="s1">{i18n.t("moreOptions")}</Text>
                    <View style={{ marginHorizontal: 5, gap: 10 }}>
                      <CheckBox
                        checked={values.visit.doNotCountTowardsStudy}
                        onChange={(doNotCountTowardsStudy) =>
                          setValues({
                            ...values,
                            visit: { ...values.visit, doNotCountTowardsStudy },
                          })
                        }
                      >
                        {i18n.t("doNotCountTowardsStudy")}
                      </CheckBox>
                      <Text appearance="hint" category="c1">
                        {i18n.t("doNotCountTowardsStudyCaption")}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }}
          </Formik>
        </TouchableWithoutFeedback>
      </KeyboardAwareScrollView>
      <Button onPress={() => formikRef.current?.handleSubmit()}>
        {i18n.t("addVisit")}
      </Button>
    </Layout>
  );
};

export default VisitFormScreen;
