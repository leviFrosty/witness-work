import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, combine, createJSONStorage } from "zustand/middleware";
import { Publisher } from "../types/publisher";
import i18n from "../lib/locales";

export const contactSortOptions = [
  {
    label: i18n.t("recentConversation"),
    value: "recentConversation",
  },
  {
    label: i18n.t("alphabeticalAsc"),
    value: "az",
  },
  {
    label: i18n.t("alphabeticalDesc"),
    value: "za",
  },
  {
    label: i18n.t("bibleStudy"),
    value: "bibleStudy",
  },
];

const initialState = {
  publisher: "publisher" as Publisher,
  onboardingComplete: false,
  installedOn: new Date(),
  contactSort: "recentConversation",
};

export const usePreferences = create(
  persist(
    combine(initialState, (set) => ({
      set,
      setPublisher: (publisher: Publisher) => set({ publisher }),
      setContactSort: (contactSort: string) => set({ contactSort }),
    })),
    {
      name: "preferences",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
