import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import Asset from "./asset";
import moment from "moment";

export interface AnnualReportData
  extends Omit<MonthReportData, "studies" | "month"> {
  year: number;
}
export interface MonthReportData {
  hours: number;
  placements: number;
  videoPlacements: number;
  returnVisits: number;
  studies: number;
  month: number;
  year?: number;
  share?: {
    title: string;
    message: string;
  };
}

export const secondInMS = 1000;
export const minuteInMS = 60 * secondInMS;
export const hourInMS = 60 * minuteInMS;
export interface ServiceRecord extends Asset {
  date: moment.Moment;
  time: number; // while taking user input, time will be a moment. When stored, stored in milliseconds.
  ldc: boolean; // Whether time value was part of LDC service
  placements: number;
  videoPlacements: number;
  returnVisitOffset: number; // manually added by user. Adds to the calls.returnVisit total
  studyOffset: number; // manually added by user. Adds to the calls.study total
}

type ServiceRecordStore = {
  records: ServiceRecord[];
  setRecord: (newOrUpdated: ServiceRecord) => void;
  deleteRecord: (id: string) => void;
  deleteAllRecords: () => void;
};

const useServiceRecordStore = create(
  persist<ServiceRecordStore>(
    (set) => ({
      records: [],
      deleteRecord: (id) => {
        set((state) => ({
          records: state.records.filter((o) => o.id !== id),
        }));
      },
      setRecord: (newItemOrUpdates) => {
        set((state) => {
          const records: ServiceRecord[] = JSON.parse(
            JSON.stringify(state.records)
          );
          const index = records.findIndex((o) => o.id === newItemOrUpdates.id);
          if (index === -1) {
            // not found
            // pushing new item to list
            records.push({ createdAt: moment(), ...newItemOrUpdates });
          } else {
            // found
            const existing = records[index];
            // Overrides existing values
            const updated: ServiceRecord = {
              ...existing,
              lastUpdated: moment(),
              ...newItemOrUpdates,
            };
            records[index] = updated;
          }
          return { records };
        });
      },
      deleteAllRecords: () => set({ records: [] }),
    }),
    {
      name: "serviceRecordStore", // unique name
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useServiceRecordStore;
