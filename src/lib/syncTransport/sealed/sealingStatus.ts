import { create } from 'zustand'
import type { SealingStatus } from '@/lib/syncTransport/sealed/sealedTransport'

export const useSealingStatus = create<{ status: SealingStatus | null }>(
  () => ({ status: null })
)

export const setSealingStatus = (status: SealingStatus | null) =>
  useSealingStatus.setState({ status })
