import { create } from 'zustand'
import type { KeyChangeStage } from '@/lib/accountKey/keyChangeRecord'

export const useKeyChangeStatus = create<{ stage: KeyChangeStage | null }>(
  () => ({ stage: null })
)
