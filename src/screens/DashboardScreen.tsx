import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlatList, ImageProps, StyleSheet } from "react-native";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../lib/translations";
import appTheme from "../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CallCard from "../components/CallCard";
import useCallsStore from "../stores/CallStore";
import { HomeStackParamList } from "../stacks/ParamLists";
import { Button, Icon, Input, Layout, Text } from "@ui-kitten/components";
import { useState } from "react";

type HomeProps = NativeStackScreenProps<HomeStackParamList, "Dashboard">;

export type Sheet = {
  isOpen: boolean;
  hasSaved: boolean;
};

const MagnifyIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="magnify" />;

const DashboardScreen = ({ navigation }: HomeProps) => {
  const [query, setQuery] = useState("");
  const { calls } = useCallsStore();
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    wrapper: {
      paddingTop: insets.top + 20,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
    },
    fab: {
      position: "absolute",
      paddingBottom: 90,
      paddingRight: 10,
    },
    input: {
      paddingLeft: 15,
      paddingRight: 15,
    },
  });

  return (
    <Layout style={styles.wrapper}>
      <ScreenTitle title={i18n.t("dashboard")} icon="cog" />
      <Text style={{ margin: 5 }}>Weekly routine goes here...</Text>
      <Text category="h2">{i18n.t("monthlyTotals")}</Text>
      <Text style={{ marginTop: 12, marginBottom: 12 }}>
        Monthly totals goes here...
      </Text>
      <Text style={{ marginBottom: 4 }} category="h2">
        Calls
      </Text>
      <Button onPress={() => navigation.navigate("CallForm")}>
        Create Call
      </Button>
      <Input
        style={styles.input}
        value={query}
        onChangeText={(text) => setQuery(text)}
        placeholder="Search for a call..."
        accessoryRight={MagnifyIcon}
      />
      <FlatList
        data={calls}
        renderItem={({ item }) => <CallCard call={item} />}
        keyExtractor={(item) => item.id}
      />
    </Layout>
  );
};

export default DashboardScreen;
