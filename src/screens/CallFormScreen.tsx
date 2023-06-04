import React, { useContext, useState } from "react";
import {
  ImageProps,
  Keyboard,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import appTheme from "../lib/theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import useCallsStore, {
  InterestLevel,
  interestLevels,
} from "../stores/CallStore";
import ScreenTitle from "../components/ScreenTitle";
import { HomeStackParamList } from "../stacks/ParamLists";
import { HomeContext } from "../contexts/HomeStackContext";
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
} from "@ui-kitten/components";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type CallFormScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  "CallForm"
>;

const CallFormScreen: React.FC<CallFormScreenProps> = ({ navigation }) => {
  const [interestLevelIndex, setInterestLevelIndex] = useState<
    IndexPath | IndexPath[]
  >();
  const insets = useSafeAreaInsets();
  const { setCall, deleteAllCalls } = useCallsStore();
  const { newCallFromState, setCallState, newCallBase } =
    useContext(HomeContext);
  const [validation, setValidation] = useState<{
    [key: string]: any;
    name: boolean;
  }>({
    name: false,
  });

  const validate = () => {
    if (!newCallFromState.name) {
      setValidation({ ...validation, name: true });
    }
    console.log("result:", Object.values(validation).includes(true));
    console.log("actual values", Object.values(validation));
    if (!Object.values(validation).includes(true)) {
      handleSaveCall();
    }
  };

  const handleSaveCall = () => {
    setCall(newCallFromState);
    setCallState(newCallBase());
    navigation.goBack();
  };

  const styles = StyleSheet.create({
    wrapper: {
      height: "100%",
      paddingTop: insets.top + 10,
      paddingLeft: appTheme.contentPaddingLeftRight,
      paddingRight: appTheme.contentPaddingLeftRight,
    },
  });

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

  interface InterestLevelIconProps extends Partial<ImageProps> {
    name: string;
  }

  const InterestLevelIcon = (
    props?: InterestLevelIconProps
  ): React.ReactElement<ImageProps> => <Icon {...props} name={props?.name} />;

  return (
    <Layout style={styles.wrapper}>
      <Pressable onPress={() => Keyboard.dismiss()}>
        <ScreenTitle
          title={i18n.t("newCall")}
          category="h2"
          icon="close"
          onIconPress={() => navigation.goBack()}
        />
        <View>
          <Text category="h5">{i18n.t("personalInfo")}</Text>
          <Input
            label={i18n.t("name")}
            placeholder={i18n.t("enterName")}
            value={newCallFromState.name}
            status={validation.name ? "danger" : "basic"}
            onChangeText={(name) => setCallState({ ...newCallFromState, name })}
          />
        </View>
        <Divider style={{ marginTop: 10, marginBottom: 5 }} />
        <View>
          <Text category="h5">{i18n.t("address")}</Text>
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
        </View>
        <Divider style={{ marginTop: 10, marginBottom: 5 }} />
        <View>
          <Text category="h5">{i18n.t("moreDetails")}</Text>
          <Input
            label={i18n.t("note")}
            value={newCallFromState.note || ""}
            onChangeText={(note) => setCallState({ ...newCallFromState, note })}
          />
          <Select
            label={(evaProps) => (
              <Text {...evaProps}>{i18n.t("selectLanguage")}</Text>
            )}
            placeholder={i18n.t("language")}
            selectedIndex={interestLevelIndex}
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
        <Divider style={{ marginTop: 10, marginBottom: 10 }} />
        <Button onPress={() => validate()}>{i18n.t("save")}</Button>
        <Button onPress={() => deleteAllCalls()}>Delete All Call</Button>
      </Pressable>
    </Layout>
  );
};

export default CallFormScreen;
