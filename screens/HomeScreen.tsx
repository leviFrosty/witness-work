import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import { StyleSheet, View } from "react-native";
import { Button, Text, TextInput, useTheme } from "react-native-paper";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../translations";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BottomSheet from "@gorhom/bottom-sheet";
import { useCallback, useMemo, useRef, useState } from "react";
import Layout from "./Layout";

type HomeProps = NativeStackScreenProps<RootStackParamList, "Home">;

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

const HomeScreen = ({ navigation }: HomeProps) => {
  const { name, setName } = useStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["3%", "98%"], []);
  const handleSheetChanges = useCallback((index: number) => {
    console.log("handleSheetChanges", index);
  }, []);
  const theme = useTheme();

  const styles = StyleSheet.create({
    contentContainer: {
      flex: 1,
      backgroundColor: theme.colors.inverseOnSurface,
    },
  });

  return (
    <Layout>
      <View
        style={{
          position: "relative",
          flex: 1,
        }}
      >
        <View>
          <ScreenTitle>{i18n.t("dashboard")}</ScreenTitle>
          <Text>Name from store: {name}</Text>
          <TextInput value={name} onChangeText={(text) => setName(text)} />
          <Button onPress={() => setSheetOpen(!sheetOpen)}>Toggle Sheet</Button>
        </View>
        {sheetOpen && (
          <BottomSheet
            ref={bottomSheetRef}
            index={1}
            snapPoints={snapPoints}
            onChange={handleSheetChanges}
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
    </Layout>
  );
};

export default HomeScreen;
