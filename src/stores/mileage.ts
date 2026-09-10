import { create } from 'zustand'
import { combine, createJSONStorage, persist } from 'zustand/middleware'
import {
  GuardedAsyncStorage,
  hasMigratedFromAsyncStorage,
  MmkvStorage,
} from '@/stores/mmkv'
import {
  MileageCategory,
  MileageData,
  MileageEntry,
  MileageVehicle,
} from '@/types/mileage'
import {
  MileageValidationError,
  validateMileageEntry,
  validateMileageVehicle,
} from '@/lib/mileage'

export const initialMileageState: MileageData = {
  vehicles: [],
  categories: [],
  entries: [],
  deletedVehicles: [],
  deletedCategories: [],
  deletedEntries: [],
}

export const useMileage = create(
  persist(
    combine(initialMileageState, (set) => ({
      set,
      addVehicle: (vehicle: MileageVehicle) =>
        set((state) => {
          if (state.vehicles.some((item) => item.id === vehicle.id)) return {}
          validateMileageVehicle(vehicle)
          const now = Date.now()
          return {
            vehicles: [
              ...state.vehicles,
              {
                ...vehicle,
                name: vehicle.name.trim(),
                createdAt: now,
                updatedAt: now,
              },
            ],
          }
        }),
      updateVehicle: (patch: Partial<MileageVehicle> & { id: string }) =>
        set((state) => ({
          vehicles: state.vehicles.map((item) => {
            if (item.id !== patch.id) return item
            const next = {
              ...item,
              ...patch,
              createdAt: item.createdAt,
              updatedAt: Date.now(),
            }
            validateMileageVehicle(next)
            return { ...next, name: next.name.trim() }
          }),
        })),
      archiveVehicle: (id: string) =>
        set((state) => ({
          vehicles: state.vehicles.map((item) =>
            item.id === id
              ? { ...item, archivedAt: Date.now(), updatedAt: Date.now() }
              : item
          ),
        })),
      restoreVehicle: (id: string) =>
        set((state) => ({
          vehicles: state.vehicles.map((item) =>
            item.id === id
              ? { ...item, archivedAt: undefined, updatedAt: Date.now() }
              : item
          ),
        })),
      deleteVehicle: (id: string) =>
        set((state) => {
          if (!state.vehicles.some((item) => item.id === id)) return {}
          const now = Date.now()
          if (state.entries.some((item) => item.vehicleId === id))
            return {
              vehicles: state.vehicles.map((item) =>
                item.id === id
                  ? { ...item, archivedAt: now, updatedAt: now }
                  : item
              ),
            }
          return {
            vehicles: state.vehicles.filter((item) => item.id !== id),
            deletedVehicles: [
              ...state.deletedVehicles.filter((item) => item.id !== id),
              { id, deletedAt: now },
            ],
          }
        }),
      addCategory: (category: MileageCategory) =>
        set((state) => {
          if (state.categories.some((item) => item.id === category.id))
            return {}
          if (!category.name.trim()) throw new MileageValidationError('name')
          const now = Date.now()
          return {
            categories: [
              ...state.categories,
              {
                ...category,
                name: category.name.trim(),
                createdAt: now,
                updatedAt: now,
              },
            ],
          }
        }),
      updateCategory: (patch: Partial<MileageCategory> & { id: string }) =>
        set((state) => ({
          categories: state.categories.map((item) => {
            if (item.id !== patch.id) return item
            const next = {
              ...item,
              ...patch,
              createdAt: item.createdAt,
              updatedAt: Date.now(),
            }
            if (!next.name.trim()) throw new MileageValidationError('name')
            return { ...next, name: next.name.trim() }
          }),
        })),
      archiveCategory: (id: string) =>
        set((state) => ({
          categories: state.categories.map((item) =>
            item.id === id
              ? { ...item, archivedAt: Date.now(), updatedAt: Date.now() }
              : item
          ),
        })),
      restoreCategory: (id: string) =>
        set((state) => ({
          categories: state.categories.map((item) =>
            item.id === id
              ? { ...item, archivedAt: undefined, updatedAt: Date.now() }
              : item
          ),
        })),
      deleteCategory: (id: string) =>
        set((state) => {
          if (!state.categories.some((item) => item.id === id)) return {}
          const now = Date.now()
          if (state.entries.some((item) => item.categoryId === id))
            return {
              categories: state.categories.map((item) =>
                item.id === id
                  ? { ...item, archivedAt: now, updatedAt: now }
                  : item
              ),
            }
          return {
            categories: state.categories.filter((item) => item.id !== id),
            deletedCategories: [
              ...state.deletedCategories.filter((item) => item.id !== id),
              { id, deletedAt: now },
            ],
          }
        }),
      addEntry: (entry: MileageEntry) =>
        set((state) => {
          if (state.entries.some((item) => item.id === entry.id)) return {}
          const valid = validateMileageEntry(entry, state)
          const now = Date.now()
          return {
            entries: [
              ...state.entries,
              { ...valid, createdAt: now, updatedAt: now },
            ],
          }
        }),
      updateEntry: (patch: Partial<MileageEntry> & { id: string }) =>
        set((state) => ({
          entries: state.entries.map((item) =>
            item.id === patch.id
              ? validateMileageEntry(
                  {
                    ...item,
                    ...patch,
                    createdAt: item.createdAt,
                    updatedAt: Date.now(),
                  },
                  state
                )
              : item
          ),
        })),
      deleteEntry: (id: string) =>
        set((state) => {
          if (!state.entries.some((item) => item.id === id)) return {}
          return {
            entries: state.entries.filter((item) => item.id !== id),
            deletedEntries: [
              ...state.deletedEntries.filter((item) => item.id !== id),
              { id, deletedAt: Date.now() },
            ],
          }
        }),
    })),
    {
      name: 'mileage',
      version: 0,
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : GuardedAsyncStorage
      ),
    }
  )
)

export default useMileage
