import AsyncStorage from '@react-native-async-storage/async-storage';
import { produce } from 'immer';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const publisherTypeHasAnnualRequirement = (
  publisherType: PublisherType,
) => {
  switch (publisherType) {
    case 'circuitOverseer':
      return true;
    case 'regularPioneer':
      return true;
    case 'specialPioneer':
      return true;
    default:
      return false;
  }
};

export const publisherTypes = [
  'publisher',
  'auxiliaryPioneer',
  'circuitOverseer',
  'regularPioneer',
  'specialPioneer',
] as const;

export type PublisherType = (typeof publisherTypes)[number];

interface User {
  publisherType: PublisherType;
  monthlyTargetHours?: number;
}

type State = {
  user: User;
  language?: string;
};

type Action = {
  setUser: (input: User) => void;
  setLanguage: (input?: string) => void;
  resetAllSettings: () => void;
};

const initialState: State = {
  language: undefined,
  user: {
    publisherType: 'publisher',
  },
};

const useSettingStore = create(
  persist<State & Action>(
    set => ({
      ...initialState,
      setUser: input =>
        set(
          produce((state: State) => {
            state.user = input;
          }),
        ),
      setLanguage: input => set({ language: input }),
      resetAllSettings: () => set(initialState),
    }),
    {
      name: 'settingsStore', // unique name
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export default useSettingStore;
