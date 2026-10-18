import { useCallback, useEffect, useRef } from 'react'
import { BackHandler } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useEditModeStore } from '@/stores/editMode'

type Options<Source extends string> = {
  /** Saved when editing starts and handed back to `onFinish`. */
  snapshot?: () => unknown
  /** Editing ended; report what changed against `snapshot` here. */
  onFinish?: (session: { source: Source; snapshot: unknown }) => void
  /**
   * This instance belongs to the screen being edited (not, say, its header):
   * leaving the screen ends editing, and Android's Back ends it rather than
   * leaving. Pass it from exactly one instance per surface.
   */
  lifecycle?: boolean
}

/**
 * A screen's edit mode, like the Home Screen's jiggle mode: `start` from Edit,
 * a menu or a long press, `finish` from Done or tapping empty space. Any
 * component can read or end it, so a header and its screen share one mode. Pass
 * the same `onFinish` from each, since whichever ends it reports.
 */
export default function useEditMode<Source extends string>(
  surface: string,
  { snapshot, onFinish, lifecycle = false }: Options<Source> = {}
) {
  const editing = useEditModeStore((s) => s.session?.surface === surface)
  const adding = useEditModeStore(
    (s) => s.adding && s.session?.surface === surface
  )

  const start = (source: Source) => {
    if (useEditModeStore.getState().session?.surface === surface) return
    useEditModeStore.setState({
      session: { surface, source, snapshot: snapshot?.() },
    })
  }

  const finish = () => {
    const { session } = useEditModeStore.getState()
    if (session?.surface !== surface) return
    useEditModeStore.setState({ session: null, adding: false })
    onFinish?.({ source: session.source as Source, snapshot: session.snapshot })
  }

  const latestFinish = useRef(finish)
  useEffect(() => {
    latestFinish.current = finish
  })
  useFocusEffect(
    useCallback(() => {
      if (!lifecycle) return
      return () => latestFinish.current()
    }, [lifecycle])
  )

  useEffect(() => {
    if (!lifecycle || !editing) return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        latestFinish.current()
        return true
      }
    )
    return () => subscription.remove()
  }, [lifecycle, editing])

  /** Opens or closes the screen's gallery of things to add. */
  const setAdding = (next: boolean) =>
    useEditModeStore.setState({ adding: next })

  return { editing, start, finish, adding, setAdding }
}
