import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ImageProps, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
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
  useStyleSheet,
} from "@ui-kitten/components";
import React, { useMemo, useState } from "react";
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
  const debug = false;
  const [query, setQuery] = useState("");
  const { calls, deleteAllCalls } = useCallsStore();
  const { deleteAllVisits } = useVisitsStore();
  const insets = useSafeAreaInsets();

  const queriedCalls = useMemo(() => {
    return calls.filter((c) =>
      c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    );
  }, [calls, query]);

  const themeStyles = StyleSheet.create({
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
    actionCardWrapper: {},
  });

  const styles = useStyleSheet(themeStyles);

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
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ marginBottom: 4 }} category="h4">
          Calls
        </Text>
        <Layout level="2" style={{ gap: 10, flex: 1 }}>
          <Input
            value={query}
            onChangeText={(text) => setQuery(text)}
            placeholder="Search for a call..."
            accessoryRight={MagnifyIcon}
          />
          <FlashList
            data={queriedCalls || calls}
            ListEmptyComponent={
              query ? (
                <Text style={{ marginHorizontal: 5 }} appearance="hint">
                  <React.Fragment>
                    {i18n.t("noResultsForQuery")}"
                    <Text category="c2">{query}</Text>
                    "...
                  </React.Fragment>
                </Text>
              ) : undefined
            }
            ItemSeparatorComponent={(props) => (
              <Divider style={{ marginVertical: 5 }} {...props} />
            )}
            estimatedItemSize={60}
            renderItem={({ item }) => <CallCard call={item} />}
            keyExtractor={(item) => item.id}
          />
        </Layout>

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
        <Layout
          level="2"
          style={{
            paddingVertical: 10,
            gap: 5,
            borderRadius: appTheme.borderRadius,
          }}
          id="debug"
        >
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
