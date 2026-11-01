import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
} from 'react'
import type { View } from 'react-native'
import type { GestureType } from 'react-native-gesture-handler'

export type Rect = { x: number; y: number; width: number; height: number }

export type ReorderableEntry = {
  rect: Rect | null

  render: () => ReactNode
  movable: boolean

  locked: boolean
  removable: boolean
  resizable: boolean
  radius: number

  boxTop: number

  measure: () => void
}

export type WindowPoint = { absoluteX: number; absoluteY: number }

export type ReorderableContextValue = {
  editing: boolean

  draggedId: string | null
  resizingId: string | null
  containerRef: RefObject<View | null>
  register: (id: string, entry: ReorderableEntry) => () => void

  measured: (id: string) => void

  changed: () => void

  setResizing: (id: string | null) => void

  canLiftToEdit: boolean

  lift: {
    begin: () => void
    start: (id: string, at: WindowPoint) => void
    move: (at: WindowPoint) => void
    end: () => void

    lost: (id: string) => void
  }
}

export const ReorderableContext = createContext<ReorderableContextValue | null>(
  null
)

export type ReorderableItemContextValue = {
  liftGesture: () => GestureType | null

  liftLost: () => void

  measureBox: (box: View) => void
}

export const ReorderableItemContext =
  createContext<ReorderableItemContextValue | null>(null)

export const useReorderableEditing = () =>
  useContext(ReorderableContext)?.editing ?? false

export const useReorderableDragging = (id: string) =>
  useContext(ReorderableContext)?.draggedId === id

export const ReorderableGhostContext = createContext(false)

export const useInReorderableGhost = () => useContext(ReorderableGhostContext)
