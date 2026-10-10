import { create } from 'zustand'

export type UndoToast = {
  id: number
  message: string
  onUndo: () => void
}

/**
 * The one Undo toast, for an action that finished on a screen that has since
 * closed (e.g. Log Visit's Not at Home). In memory only; `UndoToastLayer` near
 * the app root draws it and hides it after a few seconds.
 */
export const useUndoToast = create<{ toast: UndoToast | null }>(() => ({
  toast: null,
}))

let nextId = 0

/** Shows `message` with an Undo button, replacing any toast already showing. */
export const showUndoToast = (toast: Omit<UndoToast, 'id'>) => {
  nextId += 1
  useUndoToast.setState({ toast: { ...toast, id: nextId } })
}

/** Hides the toast; with `id`, only if that toast is still the one showing. */
export const hideUndoToast = (id?: number) => {
  const current = useUndoToast.getState().toast
  if (!current || (id !== undefined && current.id !== id)) return
  useUndoToast.setState({ toast: null })
}
