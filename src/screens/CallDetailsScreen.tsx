import React, { useMemo, useState } from "react";
import { i18n } from "../lib/translations";
import {
  Alert,
  ImageProps,
  Platform,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import appTheme from "../lib/theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList } from "../stacks/ParamLists";
import {
  Button,
  Divider,
  Icon,
  IconElement,
  Layout,
  MenuItem,
  OverflowMenu,
  Text,
  TopNavigation,
  TopNavigationAction,
  useStyleSheet,
} from "@ui-kitten/components";
import useCallsStore, {
  Call,
  convertCallToReadableExport,
} from "../stores/CallStore";
import { formatAddress } from "localized-address-format";
import * as Linking from "expo-linking";
import { getInterestLevelIcon } from "./CallFormScreen";
import useVisitsStore, { getCallMostRecentVisit } from "../stores/VisitStore";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TouchableWebElement } from "@ui-kitten/components/devsupport";
import moment from "moment";
import CopyToClipBoardWithTooltip from "../components/CopyToClipboard";
import { Export } from "../components/Icons";

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

const DotsIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="dots-horizontal" />;

const MapMarkerIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="map-marker" />;

const EditIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="pencil" />;

const OpenMapIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="map-marker" />;
const AddIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="plus" />;
const DownArrowIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name={"arrow-down"} />;
const DeleteIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name={"delete"} />;

const CallDetailsScreen = ({ route, navigation }: CallDetailsProps) => {
  const callId = route.params.callId;
  const { calls, deleteCall } = useCallsStore();
  const { visits: visitsFromStorage } = useVisitsStore();
  const visits = visitsFromStorage.filter((v) => v.call.id === callId);
  const call = calls.find((c) => c.id === callId);
  const insets = useSafeAreaInsets();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const mostRecentVisit = getCallMostRecentVisit(visits, call?.id);
  const nextVisitIsSoon = moment(mostRecentVisit?.nextVisit?.date).isBetween(
    moment(),
    moment(new Date()).add(4, "days")
  );

  const themedStyles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: 10,
      gap: 10,
      paddingLeft: appTheme.contentPaddingLeftRight,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingBottom: insets.bottom + 10,
    },
    warningMenuItem: {},
    noteIcon: { height: 15, width: 15, color: "color-basic-100" },
    scriptureIcon: { height: 12, width: 12, color: "color-basic-100" },
    card: {
      paddingVertical: 15,
      paddingHorizontal: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: "color-primary-transparent-100",
      borderStyle: "solid",
      borderWidth: 1,
      borderColor: "color-primary-default-border",
      borderRadius: appTheme.borderRadius,
    },
    cardLowPadding: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: "color-primary-transparent-100",
      borderStyle: "solid",
      borderWidth: 1,
      borderColor: "color-primary-default-border",
      borderRadius: appTheme.borderRadius,
    },
    cardGreen: {
      paddingVertical: 10,
      paddingHorizontal: 15,
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: "color-success-transparent-100",
      borderStyle: "solid",
      borderWidth: 1,
      borderColor: "color-success-default-border",
      borderRadius: appTheme.borderRadius,
    },
  });

  const styles = useStyleSheet(themedStyles);

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

  const renderMenuToggleButton = () => {
    return (
      <TopNavigationAction
        onPress={() => setIsMenuOpen(true)}
        icon={DotsIcon}
      />
    );
  };

  const TopNavigationWithBackBottom = (): TouchableWebElement => (
    <TopNavigationAction
      icon={DownArrowIcon}
      onPress={() => navigation.goBack()}
    />
  );

  const renderRightNavActions = (): React.ReactElement => {
    return (
      <React.Fragment>
        <TopNavigationAction
          icon={AddIcon}
          onPress={() => navigation.replace("VisitForm", { callId: call.id })}
        />
        <OverflowMenu
          onBackdropPress={() => setIsMenuOpen(false)}
          anchor={renderMenuToggleButton}
          visible={isMenuOpen}
        >
          <MenuItem
            title={i18n.t("edit")}
            accessoryLeft={EditIcon}
            onPress={() => {
              setIsMenuOpen(false);
              navigation.replace("CallForm", { callId: call.id });
            }}
          />
          <MenuItem
            title={i18n.t("addVisit")}
            accessoryLeft={AddIcon}
            onPress={() => {
              setIsMenuOpen(false);
              navigation.replace("VisitForm", { callId: call.id });
            }}
          />
          <MenuItem
            title={i18n.t("share")}
            accessoryLeft={Export}
            onPress={async () =>
              await Share.share({
                title: i18n.t("shareCall"),
                message: convertCallToReadableExport(call, visits),
              })
            }
          />
          {call.address?.line1 || call.address?.coordinates?.latitude ? (
            <MenuItem
              title={i18n.t("navigateTo")}
              accessoryLeft={MapMarkerIcon}
              onPress={() => openLinkToCoordinatesOrAddress(call)}
            />
          ) : (
            <React.Fragment />
          )}
          <MenuItem
            style={styles.warningMenuItem}
            title={i18n.t("delete")}
            accessoryLeft={DeleteIcon}
            onPress={() => {
              Alert.alert(i18n.t("deleteCall"), i18n.t("deleteCaption"), [
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
                    deleteCall(call.id);
                  },
                },
              ]);
            }}
          />
        </OverflowMenu>
      </React.Fragment>
    );
  };

  const formattedAddress = useMemo(
    () =>
      formatAddress({
        addressLines: [call.address?.line1 || "", call.address?.line2 || ""],
        locality: call.address?.city,
        administrativeArea: call.address?.state,
        postalCode: call.address?.postalCode,
        postalCountry: call.address?.country || "US",
      }).join("\n"),
    [call]
  );

  const NoteIcon = (): IconElement => {
    return <Icon style={styles.noteIcon} name={"note"} />;
  };
  const ScriptureIcon = (): IconElement => {
    return (
      <Icon style={styles.scriptureIcon} name={"book-open-page-variant"} />
    );
  };
  const coordinatesDisplayValue = `${call?.address?.coordinates?.latitude}, ${call?.address?.coordinates?.longitude}`;

  const CoordinatesCard = (copyToClipboard: () => void) => {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={{ marginVertical: 10 }}
        onLongPress={copyToClipboard}
        onPress={() => openLinkToCoordinate(call)}
      >
        <Text style={{ marginBottom: 2 }} category="s2">
          {i18n.t("coordinates")}
        </Text>
        <Layout level="2" style={styles.cardLowPadding}>
          <Text category="c1">{coordinatesDisplayValue}</Text>
          <Button
            appearance="ghost"
            accessoryRight={OpenMapIcon}
            onPress={() => openLinkToCoordinate(call)}
          />
        </Layout>
      </TouchableOpacity>
    );
  };

  const AddressCard = (copyToClipboard: () => void) => {
    return (
      <TouchableOpacity
        style={{}}
        activeOpacity={0.8}
        hitSlop={5}
        onLongPress={copyToClipboard}
        onPress={() => openLinkToAddress(call)}
      >
        <Text style={{ marginBottom: 2 }} category="s2">
          {i18n.t("streetAddress")}
        </Text>
        <Layout level="2" style={styles.card}>
          <Text>{formattedAddress}</Text>
          <Button
            appearance="ghost"
            accessoryRight={OpenMapIcon}
            onPress={() => openLinkToAddress(call)}
          />
        </Layout>
      </TouchableOpacity>
    );
  };

  return (
    <Layout style={styles.wrapper}>
      <TopNavigation
        alignment="center"
        accessoryRight={renderRightNavActions}
        accessoryLeft={TopNavigationWithBackBottom}
        title={call.name}
      />
      <KeyboardAwareScrollView>
        {/* Add more options menu: */}
        {/* Menu contains:
        - Share Call
        */}
        {nextVisitIsSoon && (
          <React.Fragment>
            <View>
              <Text style={{ marginBottom: 5 }} category="h5">
                <React.Fragment>
                  {i18n.t("nextVisit")}
                  <Text status="success" category="h5">
                    {` ${moment(mostRecentVisit?.nextVisit?.date).fromNow()}`}
                  </Text>
                </React.Fragment>
              </Text>
              <View style={styles.cardGreen}>
                <View style={{ flexDirection: "column", gap: 5, flex: 1 }}>
                  <Text appearance="hint" category="c1">
                    {moment(mostRecentVisit?.nextVisit?.date).calendar()}
                  </Text>
                  {mostRecentVisit?.nextVisit?.linkTopic && (
                    <Text category="s1">
                      {mostRecentVisit?.nextVisit?.linkTopic}
                    </Text>
                  )}
                  {mostRecentVisit?.nextVisit?.linkScripture && (
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 5,
                        alignItems: "center",
                      }}
                    >
                      <ScriptureIcon />
                      <Text category="c1">
                        {mostRecentVisit?.nextVisit?.linkScripture}
                      </Text>
                    </View>
                  )}
                  {mostRecentVisit?.nextVisit?.linkNote && (
                    <React.Fragment>
                      <Divider style={{ marginVertical: 5 }} />
                      <Text appearance="hint" category="c1">
                        {i18n.t("note")}
                      </Text>
                      <Text>{mostRecentVisit?.nextVisit?.linkNote}</Text>
                    </React.Fragment>
                  )}
                </View>
              </View>
            </View>
            <Divider style={{ marginVertical: 10 }} />
          </React.Fragment>
        )}
        {Object.keys(call.address || {}).length !== 0 && (
          <React.Fragment>
            <View>
              <Text style={{ marginBottom: 5 }} category="s1">
                {i18n.t("address")}
              </Text>
              {call.address?.line1 && (
                <React.Fragment>
                  <CopyToClipBoardWithTooltip
                    component={AddressCard}
                    string={formattedAddress}
                  />
                </React.Fragment>
              )}
              {call?.address?.coordinates?.latitude &&
                call?.address?.coordinates?.longitude && (
                  <React.Fragment>
                    <CopyToClipBoardWithTooltip
                      component={CoordinatesCard}
                      string={coordinatesDisplayValue}
                    />
                  </React.Fragment>
                )}
            </View>
            <Divider style={{ marginVertical: 10 }} />
          </React.Fragment>
        )}
        {call.note && (
          <React.Fragment>
            <View>
              <Text style={{ marginBottom: 5 }} category="s1">
                {i18n.t("note")}
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View
                  style={{ flexDirection: "column", justifyContent: "center" }}
                >
                  <NoteIcon />
                </View>
                <CopyToClipBoardWithTooltip
                  component={(copy) => (
                    <Text onLongPress={copy}>{call.note}</Text>
                  )}
                  string={call.note}
                />
              </View>
            </View>
            <Divider style={{ marginVertical: 10 }} />
          </React.Fragment>
        )}
        {call.interestLevel && (
          <React.Fragment>
            <View>
              <Text style={{ marginBottom: 5 }} category="s1">
                {i18n.t("interestLevel")}
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <InterestLevelIcon name={call.interestLevel} />
                <CopyToClipBoardWithTooltip
                  component={(copy) => (
                    <Text onLongPress={copy}>
                      {i18n.t(call.interestLevel || "")}
                    </Text>
                  )}
                  string={i18n.t(call.interestLevel)}
                />
              </View>
            </View>
            <Divider style={{ marginVertical: 10 }} />
          </React.Fragment>
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
