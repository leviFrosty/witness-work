import { useState, type Dispatch, type SetStateAction } from 'react'
import type { NavigationState } from '@react-navigation/native'

export function rememberNavigation(
  _state: NavigationState | undefined,
  _path: string | undefined
) {}

export function restoredNavigation(_path: string): undefined {
  return undefined
}

export function useReloadState<T>(
  _name: string | null,
  initial: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  return useState(initial)
}

export function forgetReloadRestore() {}
