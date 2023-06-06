import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlatList, ImageProps, StyleSheet, View } from "react-native";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../lib/translations";
import appTheme from "../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CallCard from "../components/CallCard";
import useCallsStore from "../stores/CallStore";
import { HomeStackParamList } from "../stacks/ParamLists";
import {
  Button,
  Divider,
  Icon,
  Input,
  Layout,
  Text,
} from "@ui-kitten/components";
import { useState } from "react";
import * as Haptics from "expo-haptics";
import useVisitsStore from "../stores/VisitStore";

type HomeProps = NativeStackScreenProps<HomeStackParamList, "Dashboard">;

export type Sheet = {
  isOpen: boolean;
  hasSaved: boolean;
};

const MagnifyIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="magnify" />;

const PlusIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="plus" />;

const DashboardScreen = ({ navigation }: HomeProps) => {
  const debug = true;
  const [query, setQuery] = useState("");
  const { calls, deleteAllCalls } = useCallsStore();
  const { deleteAllVisits } = useVisitsStore();
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      position: "relative",
      paddingTop: insets.top + 20,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
    },
    fab: {
      position: "absolute",
      paddingBottom: 90,
      paddingRight: 10,
    },
  });

  return (
    <Layout style={styles.wrapper}>
      <View>
        <ScreenTitle
          title={i18n.t("dashboard")}
          icon="cog"
          onIconPress={() => {
            navigation.navigate("Settings");
          }}
        />
        <Text style={{ margin: 5 }}>Weekly routine goes here...</Text>
      </View>
      <View style={{}}>
        <Text category="h4">{i18n.t("monthlyTotals")}</Text>
        <Text style={{ marginTop: 12, marginBottom: 12 }}>
          Monthly totals goes here...
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ marginBottom: 4 }} category="h4">
          Calls
        </Text>
        <Input
          value={query}
          onChangeText={(text) => setQuery(text)}
          placeholder="Search for a call..."
          accessoryRight={MagnifyIcon}
        />
        <FlatList
          data={calls}
          ItemSeparatorComponent={(props) => (
            <Divider style={{ marginVertical: 5 }} {...props} />
          )}
          renderItem={({ item }) => <CallCard call={item} />}
          keyExtractor={(item) => item.id}
        />
        {/* TODO: Filter options */}
        {/* Filter options: 
            - Upcoming Visit
            - Hunger Level
            - A -> Z
            -Proximity
            -Longest since visited 
        */}
      </View>
      {debug && (
        <Layout level="2" style={{ paddingVertical: 10, gap: 5 }} id="debug">
          <Text category="s1">Debug:</Text>
          <Button
            appearance="outline"
            status="warning"
            onPress={() => navigation.navigate("VisitForm")}
          >
            Open Visit Form
          </Button>
          <Button
            appearance="outline"
            status="danger"
            onPress={() => deleteAllCalls()}
          >
            Delete All Calls
          </Button>
          <Button
            appearance="outline"
            status="danger"
            onPress={() => deleteAllVisits()}
          >
            Delete All Visits
          </Button>
        </Layout>
      )}

      <Button
        style={{
          position: "absolute",
          bottom: 15,
          right: 10,
        }}
        accessoryLeft={PlusIcon}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("CallForm");
        }}
      ></Button>
    </Layout>
  );
};

export default DashboardScreen;
