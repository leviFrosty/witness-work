import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type InterestLevel =
  | "not-interested"
  | "little-interested"
  | "interested"
  | "hungry"
  | string;

export const interestLevels: InterestLevel[] = [
  "not-interested",
  "little-interested",
  "interested",
  "hungry",
];

export interface Call {
  id: string;
  name: string;
  interestLevel?: InterestLevel;
}

type CallsStore = {
  calls: Call[];
  addCall: (call: Call) => void;
  deleteCall: (callId: string) => void;
  updateCall: (updatedCall: Call) => void;
  deleteAllCalls: () => void;
};

const useCallsStore = create(
  persist<CallsStore>(
    (set) => ({
      calls: [],
      addCall: (newCall) => {
        set((state) => {
          const calls: Call[] = JSON.parse(JSON.stringify(state.calls));
          if (calls.map((o) => o.id).indexOf(newCall.id) === -1) {
            calls.push(newCall);
          }
          return { calls };
        });
      },
      deleteCall: (callId) => {
        set((state) => ({
          calls: state.calls.filter((o) => o.id !== callId),
        }));
      },
      updateCall: (updatedCall) => {
        set((state) => {
          const calls: Call[] = JSON.parse(JSON.stringify(state.calls));
          const index = calls.findIndex((o) => o.id === updatedCall.id);
          if (index === -1) {
            // Call not found.
            return { calls };
          }
          const existingCall = calls[index];
          // Overrides existing values
          const newCall = {
            ...existingCall,
            ...updatedCall,
          };
          calls[index] = newCall;
          return { calls };
        });
      },
      deleteAllCalls: () => set({ calls: [] }),
    }),
    {
      name: "callStore", // unique name
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useCallsStore;
