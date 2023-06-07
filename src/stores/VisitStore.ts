import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import Asset from "./assets";
import moment from "moment";

export const getCallMostRecentVisit = (visits: Visit[], callId?: string) => {
  if (!callId) {
    return undefined;
  }
  return visits
    ?.filter((v) => v.call.id === callId)
    .sort((a, b) => moment(b.date).valueOf() - moment(a.date).valueOf())
    .find((_, index) => index == 0);
};

export interface Visit extends Asset {
  call: {
    id: string;
  };
  date: moment.Moment; // includes time
  topic?: string; // display history on CallDetailsScreen
  note?: string; // display history on CallDetailsScreen
  placement?: string; // display history on CallDetailsScreen
  videoPlacement?: string;
  partners?: string;
  nextVisit?: {
    // display special card on CallDetails if nextVisit.date is in the future
    date: moment.Moment; // includes time
    notifyMe?: boolean; // true by default // TODO: add option to change notification before time eg... 12 hours before, 1 hour before
    linkTopic?: string;
    linkScripture?: string;
    linkNote?: string;
  };
  doNotIncludeInMonthlyReport?: boolean;
  doNotCountTowardsStudy?: boolean;
}

type VisitsStore = {
  visits: Visit[];
  deleteVisit: (visitId: string) => void;
  setVisit: (updatedVisit: Visit) => void;
  deleteAllVisits: () => void;
};

const useVisitsStore = create(
  persist<VisitsStore>(
    (set) => ({
      visits: [],
      deleteVisit: (callId) => {
        set((state) => ({
          visits: state.visits.filter((o) => o.id !== callId),
        }));
      },
      setVisit: (newItemOrUpdates) => {
        set((state) => {
          const visits: Visit[] = JSON.parse(JSON.stringify(state.visits));
          const index = visits.findIndex((o) => o.id === newItemOrUpdates.id);
          if (index === -1) {
            // not found
            // pushing new item to list
            visits.push({ createdAt: moment(), ...newItemOrUpdates });
          } else {
            // found
            const existing = visits[index];
            // Overrides existing values
            const updated: Visit = {
              ...existing,
              lastUpdated: moment(),
              ...newItemOrUpdates,
            };
            visits[index] = updated;
          }
          return { visits };
        });
      },
      deleteAllVisits: () => set({ visits: [] }),
    }),
    {
      name: "visitsStore", // unique name
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useVisitsStore;
