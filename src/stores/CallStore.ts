import AsyncStorage from "@react-native-async-storage/async-storage";
import { LatLng } from "react-native-maps";
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
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    coordinates?: LatLng;
  };
  note?: string;
  interestLevel?: InterestLevel;
  createdAt?: Date;
  lastUpdated?: Date;
}

type CallsStore = {
  calls: Call[];
  deleteCall: (callId: string) => void;
  setCall: (updatedCall: Call) => void;
  deleteAllCalls: () => void;
};

const useCallsStore = create(
  persist<CallsStore>(
    (set) => ({
      calls: [],
      deleteCall: (callId) => {
        set((state) => ({
          calls: state.calls.filter((o) => o.id !== callId),
        }));
      },
      setCall: (newCallOrCallUpdates) => {
        set((state) => {
          const calls: Call[] = JSON.parse(JSON.stringify(state.calls));
          const index = calls.findIndex(
            (o) => o.id === newCallOrCallUpdates.id
          );
          if (index === -1) {
            // call not found
            // pushing new call to list
            calls.push({ createdAt: new Date(), ...newCallOrCallUpdates });
          } else {
            // call found
            const existingCall = calls[index];
            // Overrides existing values
            const newCall: Call = {
              ...existingCall,
              lastUpdated: new Date(),
              ...newCallOrCallUpdates,
            };
            calls[index] = newCall;
          }
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
