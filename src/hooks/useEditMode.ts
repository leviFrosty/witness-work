import { useCallback, useEffect, useRef } from 'react'
import { BackHandler } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useEditModeStore } from '@/stores/editMode'

type Options<Source extends string> = {
  snapshot?: () => unknown

  onFinish?: (session: { source: Source; snapshot: unknown }) => void

  lifecycle?: boolean
}

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

  const setAdding = (next: boolean) =>
    useEditModeStore.setState({ adding: next })

  return { editing, start, finish, adding, setAdding }
}
