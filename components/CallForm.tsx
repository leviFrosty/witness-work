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
  FlatList,
  FormControl,
  HStack,
  Heading,
  Input,
  Pressable,
  Select,
  Text,
  TextArea,
  useTheme,
} from "native-base";
import ScreenTitle from "./ScreenTitle";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Sheet } from "../screens/DashboardScreen";
import { BottomSheetScrollView, BottomSheetView } from "@gorhom/bottom-sheet";

type NewCallFormProps = {
  call: Call;
  setCall: React.Dispatch<React.SetStateAction<Call>>;
  sheet: Sheet;
  setSheet: React.Dispatch<React.SetStateAction<Sheet>>;
  handleSaveClick: () => void;
};

const CallForm: React.FC<NewCallFormProps> = ({
  handleSaveClick,
  call,
  setCall,
  sheet,
  setSheet,
}) => {
  const { calls } = useCallsStore();
  const [step, setStep] = useState(0);
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
    <BottomSheetView style={styles.wrapper}>
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
              onPress={() => setSheet({ ...sheet, isOpen: false })}
            />
          }
        />
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
        </Box>
        <Divider my="3" />
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
        <Divider my="3" />
        <Box>
          <Heading size="sm">{i18n.t("moreDetails")}</Heading>
          <FormControl>
            <FormControl.Label>{i18n.t("note")}</FormControl.Label>
            <TextArea
              h={20}
              autoCompleteType="off"
              value={call.note}
              onChangeText={(note) => setCall({ ...call, note })}
              blurOnSubmit={true}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="done"
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
      </Pressable>
    </BottomSheetView>
  );
};

export default CallForm;
