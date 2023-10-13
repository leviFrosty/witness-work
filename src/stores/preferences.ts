import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, combine, createJSONStorage } from "zustand/middleware";
import { Publisher } from "../types/publisher";

const initialState = {
  publisher: "publisher" as Publisher,
  onboardingComplete: false,
};

export const usePreferences = create(
  persist(
    combine(initialState, (set) => ({
      set,
      setPublisher: (publisher: Publisher) => set({ publisher }),
    })),
    {
      name: "preferences",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
