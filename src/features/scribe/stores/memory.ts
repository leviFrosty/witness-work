import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import { SCRIBE_MEMORY_MAX_CHARS } from '@/features/scribe/lib/memory'

interface ScribeMemoryState {
  enabled: boolean

  text: string
  updatedAt: number | null
}

export const useScribeMemory = create<ScribeMemoryState>()(
  persist<ScribeMemoryState>(
    () => ({ enabled: true, text: '', updatedAt: null }),
    {
      name: 'scribe-memory',
      version: 1,
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
    }
  )
)

export const useScribeMemoryEnabled = (): boolean =>
  useScribeMemory((s) => s.enabled)

export function setScribeMemoryText(text: string, at = Date.now()): void {
  useScribeMemory.setState({
    text: text.slice(0, SCRIBE_MEMORY_MAX_CHARS),
    updatedAt: at,
  })
}

export function setScribeMemoryEnabled(enabled: boolean): void {
  useScribeMemory.setState({ enabled })
}
