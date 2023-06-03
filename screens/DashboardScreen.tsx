import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../lib/translations";
import BottomSheet from "@gorhom/bottom-sheet";
import { useMemo, useRef, useState } from "react";
import appTheme from "../lib/theme";
import { HomeStackParamList } from "../stacks/HomeStackScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NewCallForm from "../components/NewCallForm";
import { AlertDialog, Button, Fab, useTheme } from "native-base";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type HomeProps = NativeStackScreenProps<HomeStackParamList, "Dashboard">;

export type Sheet = {
  isOpen: boolean;
  hasSaved: boolean;
};

const DashboardScreen = ({ navigation }: HomeProps) => {
  const [fabOpen, setFabOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>({ isOpen: false, hasSaved: false });
  const [confirmClose, setConfirmClose] = useState(false);
  const [timeRunning, setTimerRunning] = useState(false);
  const cancelRef = useRef(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const snapPoints = useMemo(() => ["3%", "90%"], []);
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const onCancelClose = () => {
    setSheet({ ...sheet, isOpen: true });
    bottomSheetRef.current?.snapToIndex(1);
    setConfirmClose(false);
  };

  const onConfirmClosed = () => {
    bottomSheetRef.current?.snapToIndex(0);
    setSheet({ ...sheet, isOpen: false });
    setConfirmClose(false);
  };

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: insets.top + 25,
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
    <View style={styles.wrapper}>
      <ScreenTitle
        title={i18n.t("dashboard")}
        icon={
          <MaterialCommunityIcons
            name="cog"
            color={theme.colors.white}
            size={25}
            onPress={() => navigation.navigate("Settings")}
          />
        }
      />
      <Button onPress={() => setSheet({ ...sheet, isOpen: !sheet.isOpen })}>
        Toggle Sheet
      </Button>
      <AlertDialog
        leastDestructiveRef={cancelRef}
        isOpen={confirmClose}
        onClose={onCancelClose}
      >
        <AlertDialog.Content>
          <AlertDialog.CloseButton />
          <AlertDialog.Header>Delete Customer</AlertDialog.Header>
          <AlertDialog.Body>
            This will remove all data relating to Alex. This action cannot be
            reversed. Deleted data can not be recovered.
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button.Group space={2}>
              <Button
                variant="unstyled"
                colorScheme="coolGray"
                onPress={onCancelClose}
                ref={cancelRef}
              >
                Cancel
              </Button>
              <Button colorScheme="danger" onPress={onConfirmClosed}>
                Delete
              </Button>
            </Button.Group>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
      {sheet.isOpen && (
        <BottomSheet
          ref={bottomSheetRef}
          index={1}
          snapPoints={snapPoints}
          onClose={() => setConfirmClose(true)}
          enablePanDownToClose={true}
          handleStyle={{
            backgroundColor: theme.colors.primary[600],
            borderTopLeftRadius: 15,
            borderTopRightRadius: 15,
          }}
        >
          <NewCallForm
            handleSaveClick={() => setSheet({ ...sheet, hasSaved: true })}
            sheet={sheet}
            setConfirmClose={setConfirmClose}
          />
        </BottomSheet>
      )}
      <Fab
        renderInPortal={false}
        icon={<MaterialCommunityIcons name="plus" color={theme.colors.white} />}
      ></Fab>

      {/* <Portal>
        <FAB.Group
          open={fabOpen}
          style={styles.fab}
          visible={true}
          icon={
            sheet.isOpen ? "content-save" : fabOpen ? "account-box" : "plus"
          }
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
          onStateChange={({ open }) => {
            if (sheet.isOpen) {
              setFabOpen(false);
            } else {
              setFabOpen(open);
            }
          }}
          onPress={() => {
            if (sheet.isOpen) {
            } else if (fabOpen) {
              console.log("creating contact...");
              setSheet({
                ...sheet,
                isOpen: true,
              });
            }
          }}
        />
      </Portal> */}
    </View>
  );
};

export default DashboardScreen;
