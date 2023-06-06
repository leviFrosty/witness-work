import React from "react";
import { i18n } from "../lib/translations";
import {
  ImageProps,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import appTheme from "../lib/theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList } from "../stacks/ParamLists";
import { Button, Icon, IconElement, Layout, Text } from "@ui-kitten/components";
import useCallsStore, { Call } from "../stores/CallStore";
import { useNavigation } from "@react-navigation/native";
import TopNavBarWithBackButton from "../components/TopNavBarWithBackButton";
import { formatAddress } from "localized-address-format";
import * as Linking from "expo-linking";
import { getInterestLevelIcon } from "./CallFormScreen";
import useVisitsStore from "../stores/VisitStore";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CallDetailsProps = NativeStackScreenProps<
  HomeStackParamList,
  "CallDetails"
>;

const InterestLevelIcon = ({ name }: { name: string }): IconElement => (
  <Icon
    style={{ height: 15, width: 15, color: "#fff" }}
    name={getInterestLevelIcon(name)}
  />
);

const scheme = Platform.select({
  ios: "maps://0,0?q=",
  android: "geo:0,0?q=",
});

export const openLinkToCoordinatesOrAddress = (call: Call) => {
  if (
    call.address?.coordinates?.latitude &&
    call.address?.coordinates?.longitude
  ) {
    openLinkToCoordinate(call);
  } else {
    openLinkToAddress(call);
  }
};

export const openLinkToAddress = (call: Call) => {
  const line1 = call.address?.line1;
  const line2 = call.address?.line2;
  const city = call.address?.city;
  const state = call.address?.state;
  const postalCode = call.address?.postalCode;
  const country = call.address?.country;
  const rawAddress = `${line1}${line2 ? `,${line2}` : ""}${
    city ? `,${city}` : ""
  }${state ? `,${state}` : ""}${postalCode ? `,${postalCode}` : ""}${
    country ? `,${country}` : ""
  }`;
  const uriEncodedAddress = encodeURI(rawAddress);
  if (!uriEncodedAddress) {
    return;
  }

  const url = Platform.select({
    ios: `${scheme}${uriEncodedAddress}`,
    android: `${scheme}${uriEncodedAddress}`,
  });
  if (url) {
    Linking.openURL(url);
  }
};

export const openLinkToCoordinate = (call: Call) => {
  if (
    !call.address?.coordinates?.latitude &&
    !call.address?.coordinates?.longitude
  ) {
    return;
  }
  const addressLinkLabel = call.name;

  const latLng = `${call.address?.coordinates?.latitude},${call.address?.coordinates?.longitude}`;
  const url = Platform.select({
    ios: `${scheme}${addressLinkLabel}@${latLng}`,
    android: `${scheme}${latLng}(${addressLinkLabel})`,
  });
  if (url) {
    Linking.openURL(url);
  }
};

const CallDetailsScreen = ({ route }: CallDetailsProps) => {
  const callId = route.params.callId;
  const { calls, deleteCall } = useCallsStore();
  const { visits: visitsFromStorage } = useVisitsStore();
  const visits = visitsFromStorage.filter((v) => v.call.id === callId);
  const navigation = useNavigation();
  const call = calls.find((c) => c.id === callId);
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: 10,
      gap: 10,
      paddingLeft: appTheme.contentPaddingLeftRight,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingBottom: insets.bottom + 10,
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

  const OpenMapIcon = (
    props?: Partial<ImageProps>
  ): React.ReactElement<ImageProps> => <Icon {...props} name="map-marker" />;

  return (
    <Layout style={styles.wrapper}>
      <TopNavBarWithBackButton arrow="down" title={call.name} />
      <KeyboardAwareScrollView>
        {/* Add more options menu: */}
        {/* Menu contains:
        - Add visit
        - Edit call
        - Share Call
        - Delete call
        */}
        {Object.keys(call.address || {}).length !== 0 && (
          <View>
            <Text style={{ marginBottom: 5 }} category="s1">
              {i18n.t("address")}
            </Text>

            {call.address?.line1 && (
              <Pressable
                style={{ marginVertical: 10, gap: 10 }}
                hitSlop={5}
                onPress={() => openLinkToAddress(call)}
              >
                <Text style={{ marginBottom: 2 }} category="s2">
                  {i18n.t("streetAddress")}
                </Text>
                <Layout
                  level="2"
                  style={{
                    paddingVertical: 15,
                    paddingHorizontal: 10,
                    borderRadius: appTheme.borderRadius,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text>
                    {formatAddress({
                      addressLines: [
                        call.address?.line1 || "",
                        call.address?.line2 || "",
                      ],
                      locality: call.address?.city,
                      administrativeArea: call.address?.state,
                      postalCode: call.address?.postalCode,
                      postalCountry: call.address?.country || "US",
                    }).join("\n")}
                  </Text>
                  <Button
                    appearance="ghost"
                    accessoryRight={OpenMapIcon}
                    onPress={() => openLinkToAddress(call)}
                  />
                </Layout>
              </Pressable>
            )}

            {call?.address?.coordinates?.latitude &&
              call?.address?.coordinates?.longitude && (
                <React.Fragment>
                  <Text style={{ marginBottom: 2 }} category="s2">
                    {i18n.t("coordinates")}
                  </Text>
                  <Pressable
                    style={{ marginVertical: 10, gap: 10 }}
                    onPress={() => openLinkToCoordinate(call)}
                  >
                    <Layout
                      level="2"
                      style={{
                        paddingHorizontal: 10,
                        borderRadius: appTheme.borderRadius,
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text category="c1">{`${call?.address?.coordinates?.latitude}, ${call?.address?.coordinates?.longitude}`}</Text>
                      <Button
                        appearance="ghost"
                        accessoryRight={OpenMapIcon}
                        onPress={() => openLinkToCoordinate(call)}
                      />
                    </Layout>
                  </Pressable>
                </React.Fragment>
              )}
          </View>
        )}

        {call.interestLevel && (
          <View>
            <Text style={{ marginBottom: 5 }} category="s1">
              {i18n.t("interestLevel")}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <InterestLevelIcon name={call.interestLevel} />
              <Text>{i18n.t(call.interestLevel)}</Text>
            </View>
          </View>
        )}
        {/* TODO: add sections from visits here, display history of previous items */}
        <Text category="s1">Call Data</Text>
        <Text>{JSON.stringify(call, null, 2)}</Text>
        <Text category="s1">Corresponding Visits</Text>
        <Text>{JSON.stringify(visits, null, 2)}</Text>
        <Button
          onPress={() => {
            deleteCall(call.id);
            navigation.goBack();
          }}
          status="danger"
        >
          Delete Call
        </Button>
      </KeyboardAwareScrollView>
    </Layout>
  );
};

export default CallDetailsScreen;
