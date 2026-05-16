import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Category, CategoryTombstone } from '@/types/category'
import { hasMigratedFromAsyncStorage, MmkvStorage } from '@/stores/mmkv'

const initialState = {
  categories: [] as Category[],
  /**
   * Tombstones for deleted Categories. Populated by `deleteCategory` so iCloud
   * sync can propagate deletions across devices. Mirrors
   * `serviceReportStore.deletedServiceReports`.
   */
  deletedCategories: [] as CategoryTombstone[],
}

/**
 * Persisted store for user-defined `Category` records (replaces the legacy
 * `preferences.serviceReportTags` list). Categories are sync-aware: every
 * mutation stamps `updatedAt` so iCloud last-writer-wins merge can resolve
 * cross-device edits the same way it does for ServiceReports.
 *
 * The initial seed is populated by the one-time tag-to-category migration in
 * `src/app/App.tsx`; see `src/lib/categories.ts` for the transform.
 */
export const useCategories = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addCategory: (category: Category) =>
        set(({ categories }) => {
          const existing = categories.find((c) => c.id === category.id)
          if (existing) return {}
          return {
            categories: [...categories, { ...category, updatedAt: Date.now() }],
          }
        }),
      updateCategory: (category: Partial<Category> & { id: string }) =>
        set(({ categories }) => ({
          categories: categories.map((c) =>
            c.id === category.id
              ? { ...c, ...category, updatedAt: Date.now() }
              : c
          ),
        })),
      deleteCategory: (id: string) =>
        set(({ categories, deletedCategories }) => {
          const found = categories.find((c) => c.id === id)
          if (!found) return {}
          const now = Date.now()
          return {
            categories: categories.filter((c) => c.id !== id),
            deletedCategories: [
              ...deletedCategories.filter((t) => t.id !== id),
              { id, deletedAt: now },
            ],
          }
        }),
      _WARNING_forceDeleteCategories: () =>
        set({ categories: [], deletedCategories: [] }),
    })),
    {
      name: 'categories',
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : AsyncStorage
      ),
      version: 0,
    }
  )
)

export default useCategories
