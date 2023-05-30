import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import { View } from "react-native";
import { Text, TextInput } from "react-native-paper";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../translations";
import { getLocales } from "expo-localization";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState } from "react";

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
  const [nameFromState, setNameFromState] = useState("");

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ScreenTitle>
        {i18n.t("dashboard")} {i18n.t("home")} {i18n.t("returnVisits")}
      </ScreenTitle>
      <Text>Current locale: {i18n.locale}</Text>
      <Text>Device locale: {getLocales()[0].languageCode}</Text>
      <Text>Name from store: {name}</Text>
      <TextInput value={name} onChangeText={(text) => setName(text)} />
      <Text>Name from state: {nameFromState}</Text>
      <TextInput
        value={nameFromState}
        onChangeText={(text) => setNameFromState(text)}
      />
      <Text>URL: {process.env.SENTRY_DSN}</Text>
    </View>
  );
};

export default HomeScreen;
