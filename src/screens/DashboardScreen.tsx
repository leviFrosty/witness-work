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
  ButtonGroup,
  Divider,
  Icon,
  Input,
  Layout,
  Text,
  useStyleSheet,
} from "@ui-kitten/components";
import React, { useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import useTimer from "../lib/userTimer";

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
const PlayIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="play" />;
const PauseIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="pause" />;
const StopIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="stop" />;

const DashboardScreen = ({ navigation }: HomeProps) => {
  const { play, pause, reset, formattedTime, hasStarted, isRunning } =
    useTimer();
  const debug = true;
  const [query, setQuery] = useState("");
  const { calls } = useCallsStore();
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

  const isInService = hasStarted || isRunning;

  return (
    <Layout style={styles.wrapper}>
      <View>
        <View style={{ flexDirection: "row" }}>
          {isInService && (
            <View style={{ flexDirection: "row", flexShrink: 1, gap: 5 }}>
              {isRunning ? (
                <Button accessoryLeft={PauseIcon} onPress={pause} />
              ) : (
                <Button accessoryLeft={PlayIcon} onPress={play} />
              )}
              <Button
                appearance="ghost"
                accessoryLeft={StopIcon}
                onPress={reset}
              />
            </View>
          )}
          <ScreenTitle
            title={isInService ? formattedTime : i18n.t("dashboard")}
            icon="cog"
            status={isInService ? "success" : "basic"}
            onIconPress={() => {
              navigation.navigate("Settings");
            }}
          />
        </View>

        {isInService ? (
          <React.Fragment>
            <Text>{i18n.t("youAreInService!")}</Text>
            <Text appearance="hint" category="c1">
              {i18n.t("stopTimeWillAutomaticallyAddToReport")}
            </Text>
          </React.Fragment>
        ) : (
          <Text style={{ margin: 5 }}>Weekly routine goes here...</Text>
        )}
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
            status="success"
            onPress={() => (isRunning ? pause() : play())}
          >
            {isRunning ? "Pause Timer" : "Start Timer"}
          </Button>
          <Button appearance="outline" status="warning" onPress={reset}>
            Stop timer
          </Button>
          <Button
            appearance="outline"
            status="success"
            onPress={() => navigation.navigate("ServiceRecordForm")}
          >
            Create Service Record
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
