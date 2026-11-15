import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { forBuild, type BuildEnvironment } from '@/constants/buildVariant'
import type { TranslationKey } from '@/lib/locales'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'

type LabDefinition = {
  title: TranslationKey
  description: TranslationKey
  icon?: AppIcon
}

export const LABS = {} satisfies Record<string, LabDefinition>

export type LabId = keyof typeof LABS

export const labDefaultOn = (environment: BuildEnvironment): boolean =>
  environment !== 'production'

const DEFAULT_ON = forBuild({
  development: labDefaultOn('development'),
  beta: labDefaultOn('beta'),
  production: labDefaultOn('production'),
})

type Choices = Partial<Record<string, boolean>>

export const resolveLab = (
  choices: Choices,
  id: string,
  defaultOn: boolean = DEFAULT_ON
): boolean => choices[id] ?? defaultOn

type LabsState = {
  choices: Choices
  set: (id: LabId, on: boolean) => void
}

export const useLabsStore = create<LabsState>()(
  persist(
    (set) => ({
      choices: {},
      set: (id, on) =>
        set((state) => ({ choices: { ...state.choices, [id]: on } })),
    }),
    {
      name: 'labs',
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
      partialize: ({ choices }) => ({ choices }),
    }
  )
)

export const labIds = (): LabId[] => Object.keys(LABS) as LabId[]

export const labDefinition = (id: LabId): LabDefinition =>
  (LABS as Record<string, LabDefinition>)[id]

export function useLab(id: LabId): boolean {
  return useLabsStore((state) => resolveLab(state.choices, id))
}

export function isLabOn(id: LabId): boolean {
  return resolveLab(useLabsStore.getState().choices, id)
}

export function setLab(id: LabId, on: boolean): void {
  useLabsStore.getState().set(id, on)
}
