import React, { useId, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Button, Text, TextInput, useTheme } from "react-native-paper";
import theme from "../lib/theme";
import useCallsStore, { Call } from "../stores/CallStore";
import { i18n } from "../translations";

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

  const { calls, addCall, updateCall, deleteCall, deleteAllCalls } =
    useCallsStore();

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
      <Button onPress={() => addCall(call)}>Save</Button>
      <Button onPress={() => deleteAllCalls()}>Delete All Calls</Button>
    </View>
  );
};

export default NewCallForm;
