import React, { useId, useState } from "react";
import { View, StyleSheet } from "react-native";
import appTheme from "../lib/theme";
import useCallsStore, {
  Call,
  InterestLevel,
  interestLevels,
} from "../stores/CallStore";
import { i18n } from "../lib/translations";
import {
  Button,
  FormControl,
  Heading,
  Input,
  Select,
  Text,
  useTheme,
} from "native-base";
import ScreenTitle from "./ScreenTitle";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Sheet } from "../screens/DashboardScreen";

type NewCallFormProps = {
  sheet: Sheet;
  setSheet: React.Dispatch<React.SetStateAction<Sheet>>;
  handleSaveClick: () => void;
};

const NewCallForm: React.FC<NewCallFormProps> = ({
  handleSaveClick,
  sheet,
  setSheet,
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
    title: {
      fontSize: 30,
    },
    chipContainer: {
      marginTop: 8,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
    },
  });

  return (
    <View style={styles.wrapper}>
      <ScreenTitle title={i18n.t("newCall")} size="md" />
      <Text>From state: {JSON.stringify(call)}</Text>
      <Text>From store: {JSON.stringify(calls)}</Text>
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
          onValueChange={(interestLevel) => setCall({ ...call, interestLevel })}
        >
          {interestLevels.map((interestLevel) => (
            <Select.Item
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

      <View style={styles.chipContainer}>
        {/* {interestLevels.map((interestLevel) => (
          <Chip
            icon={getInterestLevelIcon(
              interestLevel,
              call.interestLevel === interestLevel
            )}
            onPress={() => setCall({ ...call, interestLevel })}
            selected={call.interestLevel === interestLevel}
            mode="outlined"
            style={
              call.interestLevel === interestLevel && {
                backgroundColor: paperTheme.colors.secondaryContainer,
              }
            }
          >
            <Text style={{ fontSize: 14 }}>{i18n.t(interestLevel)}</Text>
          </Chip>
        ))} */}
      </View>
      <Button onPress={() => addCall(call)}>Save</Button>
      <Button onPress={() => deleteAllCalls()}>Delete All Calls</Button>
    </View>
  );
};

export default NewCallForm;
