import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, combine, createJSONStorage } from "zustand/middleware";

const initialState = {
  hours: 0,
};

export const useServiceReport = create(
  persist(
    combine(initialState, (set) => ({
      set,
      // setHours: (hours: number) => set({ hours }),
    })),
    {
      name: "serviceReport",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
