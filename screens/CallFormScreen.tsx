import React, { useContext } from "react";
import { i18n } from "../lib/translations";
import {
  Box,
  Button,
  Divider,
  FormControl,
  HStack,
  Heading,
  Input,
  Pressable,
  Select,
  TextArea,
  View,
  useTheme,
} from "native-base";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Keyboard, StyleSheet } from "react-native";
import appTheme from "../lib/theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import useCallsStore, {
  InterestLevel,
  interestLevels,
} from "../stores/CallStore";
import ScreenTitle from "../components/ScreenTitle";
import { HomeStackParamList } from "../stacks/ParamLists";
import { HomeContext } from "../contexts/HomeStackContext";

type CallFormScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  "CallForm"
>;

const CallFormScreen: React.FC<CallFormScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { setCall } = useCallsStore();
  const { newCallFromState, setCallState, newCallBase } =
    useContext(HomeContext);

  const handleSaveCall = () => {
    setCall(newCallFromState);
    setCallState(newCallBase());
    navigation.goBack();
  };

  const styles = StyleSheet.create({
    wrapper: {
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

  return (
    <View style={styles.wrapper}>
      <Pressable onPress={() => Keyboard.dismiss()}>
        <ScreenTitle
          title={i18n.t("newCall")}
          size="md"
          icon={
            <Button
              backgroundColor={theme.colors.muted[700]}
              leftIcon={
                <MaterialCommunityIcons
                  name="close"
                  color={theme.colors.white}
                  size={15}
                />
              }
              onPress={() => navigation.goBack()}
            />
          }
        />
        <Box>
          <Heading size="sm">{i18n.t("personalInfo")}</Heading>
          <FormControl>
            <FormControl.Label>{i18n.t("name")}</FormControl.Label>
            <Input
              placeholder={i18n.t("enterName")}
              value={newCallFromState.name}
              onChangeText={(name) =>
                setCallState({ ...newCallFromState, name })
              }
            />
          </FormControl>
        </Box>
        <Divider my="3" />
        <Box>
          <Heading size="sm">{i18n.t("address")}</Heading>
          <FormControl>
            <FormControl.Label>{i18n.t("addressLine1")}</FormControl.Label>
            <Input
              value={newCallFromState.address?.line1}
              onChangeText={(line1) =>
                setCallState({
                  ...newCallFromState,
                  address: { ...newCallFromState.address, line1 },
                })
              }
            />
          </FormControl>
          <FormControl>
            <FormControl.Label>{i18n.t("addressLine2")}</FormControl.Label>
            <Input
              value={newCallFromState.address?.line2}
              onChangeText={(line2) =>
                setCallState({
                  ...newCallFromState,
                  address: { ...newCallFromState.address, line2 },
                })
              }
            />
          </FormControl>
          <HStack size={2} space={3}>
            <FormControl flex={1}>
              <FormControl.Label>{i18n.t("city")}</FormControl.Label>
              <Input
                value={newCallFromState.address?.city}
                onChangeText={(city) =>
                  setCallState({
                    ...newCallFromState,
                    address: { ...newCallFromState.address, city },
                  })
                }
              />
            </FormControl>
            <FormControl flex={1}>
              <FormControl.Label>{i18n.t("state")}</FormControl.Label>
              <Input
                value={newCallFromState.address?.state}
                onChangeText={(state) =>
                  setCallState({
                    ...newCallFromState,
                    address: { ...newCallFromState.address, state },
                  })
                }
              />
            </FormControl>
          </HStack>
        </Box>
        <Divider my="3" />
        <Box>
          <Heading size="sm">{i18n.t("moreDetails")}</Heading>
          <FormControl>
            <FormControl.Label>{i18n.t("note")}</FormControl.Label>
            <TextArea
              h={20}
              autoCompleteType="off"
              value={newCallFromState.note}
              onChangeText={(note) =>
                setCallState({ ...newCallFromState, note })
              }
              blurOnSubmit={true}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="done"
            />
          </FormControl>
          <FormControl>
            <FormControl.Label>{i18n.t("interestLevel")}</FormControl.Label>
            <Select
              selectedValue={newCallFromState.interestLevel}
              onValueChange={(interestLevel) =>
                setCallState({ ...newCallFromState, interestLevel })
              }
            >
              {interestLevels.map((interestLevel) => (
                <Select.Item
                  key={interestLevel}
                  leftIcon={
                    <MaterialCommunityIcons
                      name={getInterestLevelIcon(interestLevel)}
                      size={20}
                      color={theme.colors.white}
                    />
                  }
                  value={interestLevel}
                  label={i18n.t(interestLevel)}
                />
              ))}
            </Select>
          </FormControl>
        </Box>
        <Divider my="3" />
        <Button onPress={() => handleSaveCall()}>{i18n.t("save")}</Button>
      </Pressable>
    </View>
  );
};

export default CallFormScreen;
