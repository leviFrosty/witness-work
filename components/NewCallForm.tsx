import React, { useId, useState } from "react";
import { View, StyleSheet, Touchable, Pressable } from "react-native";
import {
  Button,
  Chip,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import theme from "../lib/theme";
import useCallsStore, {
  Call,
  InterestLevel,
  interestLevels,
} from "../stores/CallStore";
import { i18n } from "../translations";
import DropDown from "react-native-paper-dropdown";

type NewCallFormProps = {
  handleSaveClick: () => void;
};

const NewCallForm: React.FC<NewCallFormProps> = ({ handleSaveClick }) => {
  const id = useId();
  const paperTheme = useTheme();
  const [call, setCall] = useState<Call>({
    id,
    name: "",
  });
  const [showDropDown, setShowDropDown] = useState(false);
  const { calls, addCall, updateCall, deleteCall, deleteAllCalls } =
    useCallsStore();

  const getInterestLevelIcon = (
    interestLevel: InterestLevel,
    isSelected: boolean
  ) => {
    switch (interestLevel) {
      case "not-interested":
        return isSelected ? "hand-back-left" : "hand-back-left-outline";
      case "little-interested":
        return isSelected ? "hand-extended" : "hand-extended-outline";
      case "interested":
        return isSelected ? "hands-pray" : "hands-pray";
      case "hungry":
        return isSelected ? "silverware-fork-knife" : "silverware-fork-knife";
      default:
        return "help";
    }
  };

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      backgroundColor: paperTheme.colors.inverseOnSurface,
      paddingTop: 10,
      paddingRight: theme.contentPaddingLeftRight,
      paddingLeft: theme.contentPaddingLeftRight,
    },
    title: {
      fontSize: 30,
      color: paperTheme.colors.secondary,
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
      <Text style={styles.title}>{i18n.t("newCall")}</Text>
      <Text>From state: {JSON.stringify(call)}</Text>
      <Text>From store: {JSON.stringify(calls)}</Text>
      <TextInput
        label={i18n.t("name")}
        value={call.name}
        onChangeText={(name) => setCall({ ...call, name })}
      />
      <View style={styles.chipContainer}>
        {interestLevels.map((interestLevel) => (
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
        ))}
      </View>
      <Button onPress={() => addCall(call)}>Save</Button>
      <Button onPress={() => deleteAllCalls()}>Delete All Calls</Button>
    </View>
  );
};

export default NewCallForm;
