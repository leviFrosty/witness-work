import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type SettingsStore = {
  language?: string;
  setLanguage: (input?: string) => void;
};

const useSettingStore = create(
  persist<SettingsStore>(
    (set) => ({
      language: undefined,
      setLanguage: (input) => set({ language: input }),
    }),
    {
      name: "settingsStore", // unique name
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useSettingStore;
