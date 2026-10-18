import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
} from 'react'
import type { View } from 'react-native'
import type { GestureType } from 'react-native-gesture-handler'

export type Rect = { x: number; y: number; width: number; height: number }

/** What a `ReorderableItem` tells its container about itself. */
export type ReorderableEntry = {
  /** The item's content, in the container's coordinates. */
  rect: Rect | null
  /** Draws the item again for the copy under the finger while it's dragged. */
  render: () => ReactNode
  movable: boolean
  /** Rests while editing; it can't be moved, removed or moved onto. */
  locked: boolean
  removable: boolean
  resizable: boolean
  radius: number
  /** How far below the item's top its box starts (`ReorderableItemBox`). */
  boxTop: number
  /** Measures the item again. */
  measure: () => void
}

/** A touch in window coordinates, as gesture events give it. */
export type WindowPoint = { absoluteX: number; absoluteY: number }

export type ReorderableContextValue = {
  editing: boolean
  /** The item under the finger, if one is being dragged. */
  draggedId: string | null
  resizingId: string | null
  containerRef: RefObject<View | null>
  register: (id: string, entry: ReorderableEntry) => () => void
  /** The item at `id` has a new rect. */
  measured: (id: string) => void
  /** An item's badge, handle or lock came or went. */
  changed: () => void
  /** A resize handle is held (`id`) or let go (`null`). */
  setResizing: (id: string | null) => void
  /** Holding an item outside edit mode starts editing (`onLiftToEdit`). */
  canLiftToEdit: boolean
  /** An item's own lift gesture, outside edit mode. */
  lift: {
    /** A finger touched down; the lift may follow. */
    begin: () => void
    start: (id: string, at: WindowPoint) => void
    move: (at: WindowPoint) => void
    end: () => void
    /**
     * The lift gesture on `id` went away mid-drag (its view remounted for edit
     * mode), so it will never end; drop the item where it is.
     */
    lost: (id: string) => void
  }
}

export const ReorderableContext = createContext<ReorderableContextValue | null>(
  null
)

export type ReorderableItemContextValue = {
  /** A new gesture that lifts the item outside edit mode, or null. */
  liftGesture: () => GestureType | null
  /** Call when a view with a lift gesture unmounts. */
  liftLost: () => void
  /** Finds how far below the item's top `box` starts. */
  measureBox: (box: View) => void
}

export const ReorderableItemContext =
  createContext<ReorderableItemContextValue | null>(null)

/**
 * Whether the reorderable screen around this component is being edited, e.g. to
 * turn off a section's own long-press menu while it jiggles. False outside a
 * `ReorderableContainer`.
 */
export const useReorderableEditing = () =>
  useContext(ReorderableContext)?.editing ?? false

/** Whether the item `id` is the one under the finger. */
export const useReorderableDragging = (id: string) =>
  useContext(ReorderableContext)?.draggedId === id

/**
 * True inside the copy of an item that follows the finger while it's dragged.
 * Native-hosted content (a SwiftUI or Compose host) doesn't lay out a second
 * time in that copy, so components with one draw plain views there instead.
 */
export const ReorderableGhostContext = createContext(false)

export const useInReorderableGhost = () => useContext(ReorderableGhostContext)
