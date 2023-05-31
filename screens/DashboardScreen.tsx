import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";
import {
  Button,
  FAB,
  IconButton,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../translations";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BottomSheet from "@gorhom/bottom-sheet";
import { useMemo, useRef, useState } from "react";
import Layout from "../components/Layout";
import { theme as appTheme } from "../lib/theme";
import { HomeStackParamList } from "../stacks/HomeStackScreen";

type HomeProps = NativeStackScreenProps<HomeStackParamList, "Dashboard">;

type Store = {
  name: string;
  setName: (input: string) => void;
};

export const useStore = create(
  persist<Store>(
    (set) => ({
      name: "",
      setName: (input) => set({ name: input }),
    }),
    {
      name: "example", // unique name
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

const DashboardScreen = ({ navigation }: HomeProps) => {
  const { name, setName } = useStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["3%", "98%"], []);
  const theme = useTheme();

  const styles = StyleSheet.create({
    contentContainer: {
      flex: 1,
      backgroundColor: theme.colors.inverseOnSurface,
    },
    fab: {
      position: "absolute",
      // marginBottom: 16,
      right: 30,
      bottom: 30,
    },
  });

  return (
    <Layout removeContentPadding>
      <View
        style={{
          flex: 1,
        }}
      >
        <View
          style={{
            flex: 1,
            paddingTop: appTheme.contentPaddingTop,
            paddingRight: appTheme.contentPaddingLeftRight,
            paddingLeft: appTheme.contentPaddingLeftRight,
          }}
        >
          <ScreenTitle
            title={i18n.t("dashboard")}
            icon={
              <IconButton
                icon="cog"
                iconColor={theme.colors.tertiary}
                size={25}
                onPress={() => navigation.navigate("Settings")}
              />
            }
          />
          <Text>Name from store: {name}</Text>
          <TextInput value={name} onChangeText={(text) => setName(text)} />
          <Button onPress={() => setSheetOpen(!sheetOpen)}>Toggle Sheet</Button>
        </View>
        {sheetOpen && (
          <BottomSheet
            ref={bottomSheetRef}
            index={1}
            snapPoints={snapPoints}
            onClose={() => setSheetOpen(false)}
            enablePanDownToClose={true}
            handleStyle={{
              backgroundColor: theme.colors.inversePrimary,
              borderTopLeftRadius: 15,
              borderTopRightRadius: 15,
            }}
          >
            <View style={styles.contentContainer}>
              <Text>Awesome 1 🎉</Text>
              <Text>Awesome 2 🎉</Text>
              <Text>Awesome 3🎉</Text>
              <Text>Awesome 4🎉</Text>
              <Text>Awesome 5🎉</Text>
            </View>
          </BottomSheet>
        )}
      </View>
      <FAB style={styles.fab} icon={sheetOpen ? "content-save" : "plus"} />
    </Layout>
  );
};

export default DashboardScreen;
