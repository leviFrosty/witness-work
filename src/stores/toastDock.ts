import { useEffect } from 'react'
import { create } from 'zustand'

type ToastDockState = { height: number }

export const useToastDockHeight = create<ToastDockState>(() => ({ height: 0 }))

export function useToastDock(height: number) {
  useEffect(() => {
    useToastDockHeight.setState({ height })
    return () => useToastDockHeight.setState({ height: 0 })
  }, [height])
}
