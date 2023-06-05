import React, { useContext, useEffect, useRef, useState } from "react";
import {
  ImageProps,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import appTheme from "../lib/theme";
import MapView, { Callout, Marker, Region } from "react-native-maps";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import useCallsStore, {
  InterestLevel,
  interestLevels,
} from "../stores/CallStore";
import { HomeStackParamList } from "../stacks/ParamLists";
import { HomeContext } from "../contexts/HomeStackContext";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { i18n } from "../lib/translations";
import {
  Button,
  Divider,
  Icon,
  IndexPath,
  Input,
  Layout,
  Select,
  SelectItem,
  Text,
  useStyleSheet,
  useTheme,
} from "@ui-kitten/components";
import TopNavBarWithBackButton from "../components/TopNavBarWithBackButton";
import * as Location from "expo-location";

type CallFormScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  "CallForm"
>;

const CallFormScreen: React.FC<CallFormScreenProps> = ({ navigation }) => {
  const themedStyles = StyleSheet.create({
    wrapper: {
      height: "100%",
      paddingLeft: appTheme.contentPaddingLeftRight,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingBottom: 50,
    },
    map: {
      height: "100%",
      width: "100%",
    },
    successBadge: {
      flexDirection: "row",
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: appTheme.borderRadius,
      backgroundColor: "color-success-900",
      alignItems: "center",
    },
  });

  const styles = useStyleSheet(themedStyles);
  const [interestLevelIndex, setInterestLevelIndex] = useState<
    IndexPath | IndexPath[]
  >(new IndexPath(0));
  const [useAddressLine2, setUseAddressLine2] = useState(false);
  const [hasManuallyRemovedPin, setHasManuallyRemovedPin] = useState(false);
  const { setCall } = useCallsStore();
  const { newCallFromState, setCallState, newCallBase } =
    useContext(HomeContext);
  const [validation, setValidation] = useState<{
    [key: string]: any;
    name: boolean;
  }>({
    name: false,
  });

  useEffect(() => {
    setCallState({
      ...newCallFromState,
      // @ts-ignore
      interestLevel: interestLevels[interestLevelIndex.row],
    });
  }, []);

  const validate = () => {
    if (!newCallFromState.name) {
      setValidation({ ...validation, name: true });
    }
    if (!Object.values(validation).includes(true)) {
      handleSaveCall();
    }
  };

  const handleSaveCall = () => {
    setCall(newCallFromState);
    setCallState(newCallBase());
    navigation.goBack();
  };

  const getInterestLevelIcon = (interestLevel: InterestLevel) => {
    switch (interestLevel) {
      case "not-interested":
        return "hand-back-left";
      case "little-interested":
        return "hand-extended";
      case "interested":
        return "hands-pray";
      case "hungry":
        return "silverware-fork-knife";
      default:
        return "help";
    }
  };

  const [location, setLocation] = useState<Location.LocationObject>();
  const [errorMsg, setErrorMsg] = useState("");
  const mapRef = useRef<MapView>(null);
  const [showMap, setShowMap] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    (async () => {
      if (!location) {
        try {
          const lastLocation = await Location.getLastKnownPositionAsync();
          if (lastLocation) {
            setLocation(lastLocation);
          }
        } catch (err) {
          setErrorMsg(JSON.stringify(err));
        }
      }
    })();
  }, []);

  const fitToCoordinates = () => {
    if (hasPin()) {
      mapRef.current?.fitToCoordinates([
        {
          latitude: newCallFromState.address!.coordinates!.latitude,
          longitude: newCallFromState.address!.coordinates!.longitude,
        },
      ]);
    }
  };

  const handleToggleMap = () => {
    if (
      newCallFromState.address?.coordinates === undefined &&
      !hasManuallyRemovedPin
    ) {
      addPinFromCurrentLocation();
    }
    setShowMap(!showMap);
  };

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setErrorMsg("Permission to access location was denied");
          return;
        }

        const _location = await Location.getCurrentPositionAsync({});
        setLocation(_location);
      } catch (err) {
        setErrorMsg(JSON.stringify(err));
      }
    })();
  }, []);

  const removePin = () => {
    setHasManuallyRemovedPin(true);
    setCallState({
      ...newCallFromState,
      address: {
        ...newCallFromState,
        coordinates: undefined,
      },
    });
  };

  const addPinFromCurrentLocation = () => {
    if (location) {
      setCallState({
        ...newCallFromState,
        address: {
          ...newCallFromState.address,
          coordinates: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
        },
      });
    }
  };

  const hasPin = () => {
    if (
      newCallFromState.address?.coordinates?.latitude &&
      newCallFromState.address?.coordinates?.longitude
    ) {
      return true;
    }
    return false;
  };

  const initialMapView: Region | undefined = location?.coords && {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
  };

  interface InterestLevelIconProps extends Partial<ImageProps> {
    name: string;
  }

  const InterestLevelIcon = (
    props?: InterestLevelIconProps
  ): React.ReactElement<ImageProps> => <Icon {...props} name={props?.name} />;

  const PlusIcon = (
    props?: Partial<ImageProps>
  ): React.ReactElement<ImageProps> => <Icon {...props} name="plus" />;

  const MinusIcon = (
    props?: Partial<ImageProps>
  ): React.ReactElement<ImageProps> => <Icon {...props} name="minus" />;

  const CheckIcon = (): React.ReactElement<ImageProps> => (
    <Icon style={{ height: 20, width: 20, color: "#00E096" }} name="check" />
  );

  return (
    <Layout style={styles.wrapper}>
      <TopNavBarWithBackButton arrow="down" title={i18n.t("newCall")} />
      <KeyboardAwareScrollView>
        <Pressable onPress={() => Keyboard.dismiss()}>
          <View style={{ gap: 8 }}>
            <Text style={{ marginBottom: 2 }} category="s1">
              {i18n.t("personalInfo")}
            </Text>
            <Input
              label={i18n.t("name")}
              placeholder={i18n.t("enterName")}
              value={newCallFromState.name}
              status={validation.name ? "danger" : "basic"}
              onChangeText={(name) =>
                setCallState({ ...newCallFromState, name })
              }
            />
          </View>
          <Divider style={{ margin: 12 }} />
          <View style={{ gap: 8 }}>
            <Text style={{ marginBottom: 2 }} category="s1">
              {i18n.t("address")}
            </Text>
            <Input
              label={i18n.t("addressLine1")}
              value={newCallFromState.address?.line1 || ""}
              onChangeText={(line1) =>
                setCallState({
                  ...newCallFromState,
                  address: { ...newCallFromState.address, line1 },
                })
              }
            />
            {useAddressLine2 && (
              <Input
                label={i18n.t("addressLine2")}
                value={newCallFromState.address?.line2 || ""}
                onChangeText={(line2) =>
                  setCallState({
                    ...newCallFromState,
                    address: { ...newCallFromState.address, line2 },
                  })
                }
              />
            )}
            <View style={{ flexDirection: "row" }}>
              <View style={{ flexShrink: 1 }}>
                {!useAddressLine2 ? (
                  <Button
                    appearance="outline"
                    size="small"
                    onPress={() => setUseAddressLine2(true)}
                    accessoryLeft={PlusIcon}
                  >
                    {i18n.t("addLine")}
                  </Button>
                ) : (
                  <Button
                    appearance="outline"
                    size="small"
                    onPress={() => {
                      setCallState({
                        ...newCallFromState,
                        address: {
                          ...newCallFromState.address,
                          line2: undefined,
                        },
                      });
                      setUseAddressLine2(false);
                    }}
                    accessoryLeft={MinusIcon}
                  >
                    {i18n.t("removeLine")}
                  </Button>
                )}
              </View>

              <View style={{ flexGrow: 1 }} />
            </View>

            <View style={{ flexDirection: "row", gap: 3 }}>
              <Input
                style={{ flex: 1 }}
                label={i18n.t("city")}
                value={newCallFromState.address?.city || ""}
                onChangeText={(city) =>
                  setCallState({
                    ...newCallFromState,
                    address: { ...newCallFromState.address, city },
                  })
                }
              />
              <Input
                style={{ flex: 1 }}
                label={i18n.t("state")}
                value={newCallFromState.address?.state || ""}
                onChangeText={(state) =>
                  setCallState({
                    ...newCallFromState,
                    address: { ...newCallFromState.address, state },
                  })
                }
              />
            </View>

            <View style={{ flexDirection: "row", gap: 3 }}>
              <Input
                style={{ flex: 1 }}
                label={i18n.t("postalCode")}
                keyboardType="number-pad"
                value={newCallFromState.address?.postalCode || ""}
                onChangeText={(postalCode) =>
                  setCallState({
                    ...newCallFromState,
                    address: { ...newCallFromState.address, postalCode },
                  })
                }
              />
              <Input
                style={{ flex: 1 }}
                label={i18n.t("country")}
                value={newCallFromState.address?.country || ""}
                onChangeText={(country) =>
                  setCallState({
                    ...newCallFromState,
                    address: { ...newCallFromState.address, country },
                  })
                }
              />
            </View>

            {showMap && location && !errorMsg && (
              <View style={{ marginVertical: 10 }}>
                <View
                  style={{
                    width: "100%",
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text category="s1">{i18n.t("map")}</Text>
                  {newCallFromState.address?.coordinates?.latitude &&
                    newCallFromState.address?.coordinates?.longitude && (
                      <Button
                        appearance="ghost"
                        size="tiny"
                        onPress={removePin}
                      >
                        {i18n.t("removePin")}
                      </Button>
                    )}
                </View>

                <Text appearance="hint" category="c1">
                  {i18n.t("newCallMovePinDescription")}
                </Text>
                <View style={{ height: 300, width: "100%", marginTop: 5 }}>
                  <MapView
                    initialRegion={initialMapView}
                    style={styles.map}
                    ref={mapRef}
                  >
                    {newCallFromState.address?.coordinates?.latitude &&
                      newCallFromState.address?.coordinates?.longitude && (
                        <Marker
                          coordinate={{
                            latitude:
                              newCallFromState.address?.coordinates?.latitude,
                            longitude:
                              newCallFromState.address.coordinates?.longitude,
                          }}
                          draggable
                          onDragEnd={(e) =>
                            setCallState({
                              ...newCallFromState,
                              address: {
                                ...newCallFromState.address,
                                coordinates: e.nativeEvent.coordinate,
                              },
                            })
                          }
                        >
                          <Callout>
                            <Layout
                              style={{
                                height: "100%",
                                width: "100%",
                                paddingVertical: 5,
                                paddingHorizontal: 15,
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: appTheme.borderRadius,
                              }}
                            >
                              <Text
                                category="s1"
                                style={{
                                  backgroundColor:
                                    theme["background-basic-color-1"],
                                }}
                              >
                                {newCallFromState.name || "New Call"}
                              </Text>
                            </Layout>
                          </Callout>
                        </Marker>
                      )}
                  </MapView>
                </View>
                {!hasPin() && (
                  <Button onPress={addPinFromCurrentLocation}>
                    {i18n.t("addPin")}
                  </Button>
                )}
                {hasPin() && (
                  <Button appearance="ghost" onPress={fitToCoordinates}>
                    {i18n.t("fitViewToPin")}
                  </Button>
                )}
              </View>
            )}
            {errorMsg && (
              <Text category="h6" status="danger">
                {`${i18n.t("error")}: ${errorMsg}`}
              </Text>
            )}
            <Button
              appearance={showMap ? "outline" : "ghost"}
              onPress={handleToggleMap}
            >
              {showMap ? i18n.t("hideMap") : i18n.t("pinOnMap")}
            </Button>
            {!showMap && hasPin() && (
              <View style={styles.successBadge}>
                <CheckIcon />
                <Text style={{ marginLeft: 8 }} category="s1">
                  {i18n.t("pinAddedToCall")}
                </Text>
              </View>
            )}
          </View>
          <Divider style={{ margin: 12 }} />
          <View style={{ gap: 8 }}>
            <Text style={{ marginBottom: 2 }} category="s1">
              {i18n.t("moreDetails")}
            </Text>
            <Input
              label={i18n.t("note")}
              multiline={true}
              value={newCallFromState.note || ""}
              onChangeText={(note) =>
                setCallState({ ...newCallFromState, note })
              }
            />
            <Select
              label={(evaProps) => (
                <Text {...evaProps}>{i18n.t("selectLanguage")}</Text>
              )}
              placeholder={i18n.t("language")}
              selectedIndex={interestLevelIndex}
              // @ts-ignore
              value={i18n.t(interestLevels[interestLevelIndex.row])}
              onSelect={(index) => setInterestLevelIndex(index)}
            >
              {interestLevels.map((interestLevel) => (
                <SelectItem
                  key={interestLevel}
                  accessoryLeft={(props) => (
                    <InterestLevelIcon
                      {...props}
                      name={getInterestLevelIcon(interestLevel)}
                    />
                  )}
                  title={i18n.t(interestLevel)}
                />
              ))}
            </Select>
          </View>
          <Divider style={{ margin: 12 }} />
        </Pressable>
      </KeyboardAwareScrollView>
      <Button onPress={() => validate()}>{i18n.t("save")}</Button>
    </Layout>
  );
};

export default CallFormScreen;
