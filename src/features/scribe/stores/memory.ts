import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import { SCRIBE_MEMORY_MAX_CHARS } from '@/features/scribe/lib/memory'

interface ScribeMemoryState {
  /** Off: the context sends no memory and `memory_update` is refused. */
  enabled: boolean
  /** One note a line (`lib/memory.ts`). */
  text: string
  updatedAt: number | null
}

/**
 * Scribe AI's memory (device-only MMKV, like the conversations): notes the
 * model keeps about how the User works, read into every new conversation's
 * context. The User sees and edits it in Settings → Scribe AI memory.
 */
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

/** Whether memory is on (Settings shows "Off" beside it). */
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
