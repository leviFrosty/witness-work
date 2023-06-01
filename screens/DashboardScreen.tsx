import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";
import { Button, FAB, IconButton, Portal, useTheme } from "react-native-paper";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../translations";
import BottomSheet from "@gorhom/bottom-sheet";
import { useMemo, useRef, useState } from "react";
import theme from "../lib/theme";
import { HomeStackParamList } from "../stacks/HomeStackScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NewCallForm from "../components/NewCallForm";

type HomeProps = NativeStackScreenProps<HomeStackParamList, "Dashboard">;

const DashboardScreen = ({ navigation }: HomeProps) => {
  const [fabOpen, setFabOpen] = useState(false);
  const [sheet, setSheet] = useState({ isOpen: false });
  const [timeRunning, setTimerRunning] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["3%", "90%"], []);
  const paperTheme = useTheme();
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: insets.top + 10,
      paddingRight: theme.contentPaddingLeftRight,
      paddingLeft: theme.contentPaddingLeftRight,
    },
    fab: {
      position: "absolute",
      paddingBottom: 90,
      paddingRight: 10,
    },
  });

  return (
    <View style={styles.wrapper}>
      <ScreenTitle
        title={i18n.t("dashboard")}
        icon={
          <IconButton
            icon="cog"
            iconColor={paperTheme.colors.tertiary}
            size={25}
            onPress={() => navigation.navigate("Settings")}
          />
        }
      />
      <Button onPress={() => setSheet({ isOpen: !sheet.isOpen })}>
        Toggle Sheet
      </Button>
      {sheet.isOpen && (
        <BottomSheet
          ref={bottomSheetRef}
          index={1}
          snapPoints={snapPoints}
          onClose={() => setSheet({ isOpen: false })}
          enablePanDownToClose={true}
          handleStyle={{
            backgroundColor: paperTheme.colors.inversePrimary,
            borderTopLeftRadius: 15,
            borderTopRightRadius: 15,
          }}
        >
          <NewCallForm />
        </BottomSheet>
      )}
      <Portal>
        <FAB.Group
          open={fabOpen}
          style={styles.fab}
          visible={true}
          icon={fabOpen ? "account-box" : "plus"}
          actions={[
            {
              icon: "movie",
              size: "small",
              label: i18n.t("quickAddVideoPlacement"),
              onPress: () => console.log("adding video placement..."),
            },
            {
              icon: "note-text",
              size: "small",
              label: i18n.t("quickAddPlacement"),
              onPress: () => console.log("adding normal placement"),
            },
            {
              icon: timeRunning ? "stop" : "timer",
              label: timeRunning ? i18n.t("stopTimer") : i18n.t("startTimer"),
              size: "medium",
              onPress: () => setTimerRunning(!timeRunning),
            },
            {
              icon: "clock",
              label: i18n.t("timeEntry"),
              size: "medium",
              onPress: () => {
                console.log("creating time entry...");
              },
            },
            {
              icon: "keyboard-return",
              label: i18n.t("returnVisit"),
              size: "medium",
              onPress: () => {
                console.log("creating return visit...");
              },
            },
          ]}
          onStateChange={({ open }) => setFabOpen(open)}
          onPress={() => {
            if (fabOpen) {
              console.log("creating contact...");
              setSheet({
                isOpen: true,
              });
            }
          }}
        />
      </Portal>
    </View>
  );
};

export default DashboardScreen;
