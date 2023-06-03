import React, { useId, useState } from "react";
import { View, StyleSheet, Keyboard } from "react-native";
import appTheme from "../lib/theme";
import useCallsStore, {
  Call,
  InterestLevel,
  interestLevels,
} from "../stores/CallStore";
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
  useTheme,
} from "native-base";
import ScreenTitle from "./ScreenTitle";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Sheet } from "../screens/DashboardScreen";

type NewCallFormProps = {
  sheet: Sheet;
  setConfirmClose: React.Dispatch<React.SetStateAction<boolean>>;
  handleSaveClick: () => void;
};

const NewCallForm: React.FC<NewCallFormProps> = ({
  handleSaveClick,
  sheet,
  setConfirmClose,
}) => {
  const id = useId();
  const [call, setCall] = useState<Call>({
    id,
    name: "",
  });
  const { calls, addCall, updateCall, deleteCall, deleteAllCalls } =
    useCallsStore();
  const theme = useTheme();

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

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: 10,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
      backgroundColor: theme.colors.dark[50],
    },
  });

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
              onPress={() => setConfirmClose(true)}
            />
          }
        />
        {/* <Text>From state: {JSON.stringify(call)}</Text>
        <Text>From store: {JSON.stringify(calls)}</Text> */}
        <Divider my="2" />
        <Box>
          <Heading size="sm">{i18n.t("personalInfo")}</Heading>
          <FormControl>
            <FormControl.Label>{i18n.t("name")}</FormControl.Label>
            <Input
              placeholder={i18n.t("enterName")}
              value={call.name}
              onChangeText={(name) => setCall({ ...call, name })}
            />
          </FormControl>
          <FormControl>
            <FormControl.Label>{i18n.t("interestLevel")}</FormControl.Label>
            <Select
              selectedValue={call.interestLevel}
              onValueChange={(interestLevel) =>
                setCall({ ...call, interestLevel })
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
        <Divider my="5" />
        <Box>
          <Heading size="sm">{i18n.t("address")}</Heading>
          <FormControl>
            <FormControl.Label>{i18n.t("addressLine1")}</FormControl.Label>
            <Input
              value={call.address?.line1}
              onChangeText={(line1) =>
                setCall({ ...call, address: { ...call.address, line1 } })
              }
            />
          </FormControl>
          <FormControl>
            <FormControl.Label>{i18n.t("addressLine2")}</FormControl.Label>
            <Input
              value={call.address?.line2}
              onChangeText={(line2) =>
                setCall({ ...call, address: { ...call.address, line2 } })
              }
            />
          </FormControl>
          <HStack size={2} space={3}>
            <FormControl flex={1}>
              <FormControl.Label>{i18n.t("city")}</FormControl.Label>
              <Input
                value={call.address?.city}
                onChangeText={(city) =>
                  setCall({ ...call, address: { ...call.address, city } })
                }
              />
            </FormControl>
            <FormControl flex={1}>
              <FormControl.Label>{i18n.t("state")}</FormControl.Label>
              <Input
                value={call.address?.state}
                onChangeText={(state) =>
                  setCall({ ...call, address: { ...call.address, state } })
                }
              />
            </FormControl>
          </HStack>
        </Box>
        <Divider my="5" />
        <Box>
          <Heading size="sm">{i18n.t("moreDetails")}</Heading>
          <FormControl>
            <FormControl.Label>{i18n.t("note")}</FormControl.Label>
            <TextArea
              h={20}
              autoCompleteType="off"
              value={call.note}
              onChangeText={(note) => setCall({ ...call, note })}
              // blurOnSubmit={true}
              // onSubmitEditing={() => Keyboard.dismiss()}
              // returnKeyType="done"
            />
          </FormControl>
        </Box>
        <Button onPress={() => addCall(call)}>Save</Button>
        <Button onPress={() => deleteAllCalls()}>Delete All Calls</Button>
      </Pressable>
    </View>
  );
};

export default NewCallForm;
