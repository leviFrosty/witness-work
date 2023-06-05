import React from "react";
import ScreenTitle from "./ScreenTitle";
import { i18n } from "../lib/translations";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, View } from "react-native";
import appTheme from "../lib/theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList } from "../stacks/ParamLists";
import { Button, Layout, Text } from "@ui-kitten/components";
import useCallsStore from "../stores/CallStore";
import { useNavigation } from "@react-navigation/native";

type CallDetailsProps = NativeStackScreenProps<
  HomeStackParamList,
  "CallDetails"
>;

const CallDetailsScreen = ({ route }: CallDetailsProps) => {
  const callId = route.params.id;
  const insets = useSafeAreaInsets();
  const { calls, deleteCall } = useCallsStore();
  const navigation = useNavigation();

  const call = calls.find((c) => c.id === callId);

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: 10,
      paddingLeft: appTheme.contentPaddingLeftRight,
      paddingRight: appTheme.contentPaddingLeftRight,
    },
  });

  if (!call) {
    return (
      <Layout style={styles.wrapper}>
        <Text category="h1" status="danger">
          {i18n.t("error")}
        </Text>
        <Text category="s1">{i18n.t("callNotFound")}</Text>
        <Text category="label" style={{ marginVertical: 10 }}>
          {i18n.t("callNotFoundHelper")}
        </Text>
        <Button onPress={() => navigation.goBack()}>{i18n.t("goBack")}</Button>
      </Layout>
    );
  }

  return (
    <Layout style={styles.wrapper}>
      <ScreenTitle title={call.name || i18n.t("callDetails")} />
      <View>
        <Text category="s1">{i18n.t("address")}</Text>
        <Text></Text>
      </View>
      <Text>{call.id}</Text>
      <Text>{JSON.stringify(call)}</Text>
      <Button
        onPress={() => {
          deleteCall(call.id);
          navigation.goBack();
        }}
        status="danger"
      >
        Delete Call
      </Button>
    </Layout>
  );
};

export default CallDetailsScreen;
