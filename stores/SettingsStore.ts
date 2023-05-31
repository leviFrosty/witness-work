import AsyncStorage from "@react-native-async-storage/async-storage";
import { ColorSchemeName } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type SettingsStore = {
  userPreferenceColorScheme: ColorSchemeName;
  setUserPreferenceColorScheme: (
    input: ColorSchemeName | typeof SYSTEM_PREFERENCE_KEY
  ) => void;
};

export const SYSTEM_PREFERENCE_KEY = "systemPreference";

const useSettingStore = create(
  persist<SettingsStore>(
    (set) => ({
      userPreferenceColorScheme: undefined,
      setUserPreferenceColorScheme: (input) => {
        if (input === SYSTEM_PREFERENCE_KEY) {
          set({ userPreferenceColorScheme: undefined });
        } else {
          set({ userPreferenceColorScheme: input });
        }
      },
    }),
    {
      name: "example", // unique name
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useSettingStore;
