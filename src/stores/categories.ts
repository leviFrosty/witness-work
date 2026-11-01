import { syncTimestamp } from '@/lib/syncClock'
import { stampPastTombstone, withoutTombstones } from '@/lib/syncTombstones'
import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { Category, CategoryTombstone } from '@/types/category'
import { PersistStorage } from '@/stores/mmkv'

const initialState = {
  categories: [] as Category[],

  deletedCategories: [] as CategoryTombstone[],
}

export const useCategories = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addCategory: (category: Category) =>
        set(({ categories, deletedCategories }) => {
          const existing = categories.find((c) => c.id === category.id)
          if (existing) return {}

          return {
            categories: [
              ...categories,
              {
                ...category,
                updatedAt: stampPastTombstone(deletedCategories, category.id),
              },
            ],
            deletedCategories: withoutTombstones(
              deletedCategories,
              new Set([category.id])
            ),
          }
        }),
      updateCategory: (category: Partial<Category> & { id: string }) =>
        set(({ categories }) => ({
          categories: categories.map((c) => {
            if (c.id !== category.id) return c

            if (c.builtin) {
              const {
                name: _dropName,
                builtin: _dropBuiltin,
                id: _dropId,
                ...rest
              } = category
              return { ...c, ...rest, updatedAt: syncTimestamp(c.updatedAt) }
            }
            return { ...c, ...category, updatedAt: syncTimestamp(c.updatedAt) }
          }),
        })),
      deleteCategory: (id: string) =>
        set(({ categories, deletedCategories }) => {
          const found = categories.find((c) => c.id === id)
          if (!found) return {}

          if (found.builtin) return {}
          const now = syncTimestamp(found.updatedAt)
          return {
            categories: categories.filter((c) => c.id !== id),
            deletedCategories: [
              ...deletedCategories.filter((t) => t.id !== id),
              {
                id,
                deletedAt: now,
                ...(found.legacyIds ? { legacyIds: found.legacyIds } : {}),
              },
            ],
          }
        }),
      _WARNING_forceDeleteCategories: () =>
        set({ categories: [], deletedCategories: [] }),
    })),
    {
      name: 'categories',
      storage: createJSONStorage(() => PersistStorage),
      version: 0,
      migrate: keepPersistedState,
    }
  )
)

export default useCategories
