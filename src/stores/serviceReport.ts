import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, combine, createJSONStorage } from "zustand/middleware";
import { ServiceReport } from "../types/serviceReport";

const initialState = {
  serviceReports: [] as ServiceReport[],
};

export const useServiceReport = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addServiceReport: (serviceReport: ServiceReport) =>
        set(({ serviceReports }) => {
          const foundCurrentServiceReport = serviceReports.find(
            (c) => c.id === serviceReport.id
          );

          if (foundCurrentServiceReport) {
            return {};
          }

          return {
            serviceReports: [...serviceReports, serviceReport],
          };
        }),
      deleteServiceReport: (id: string) =>
        set(({ serviceReports: serviceReport }) => {
          const foundServiceReport = serviceReport.find(
            (serviceReport) => serviceReport.id === id
          );
          if (!foundServiceReport) {
            return {};
          }

          return {
            serviceReports: serviceReport.filter(
              (serviceReport) => serviceReport.id !== id
            ),
          };
        }),
      updateServiceReport: (serviceReport: Partial<ServiceReport>) => {
        set(({ serviceReports }) => {
          return {
            serviceReports: serviceReports.map((c) => {
              if (c.id !== serviceReport.id) {
                return c;
              }
              return { ...c, ...serviceReport };
            }),
          };
        });
      },
      _WARNING_forceDeleteServiceReport: () => set({ serviceReports: [] }),
    })),
    {
      name: "serviceReports",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useServiceReport;
