import { type RefObject, useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import RichTextEditor, {
  type RichTextEditorRef,
} from '@/components/richText/editor/RichTextEditor'
import Button from '@/components/ui/Button'
import Header from '@/components/ui/layout/Header'
import Text from '@/components/ui/MyText'
import { webTextTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import {
  endNoteEditorSession,
  getNoteEditorSession,
  markNoteEditorLoaded,
} from '@/lib/richText/noteEditorSession'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>

const closeNote = (
  closing: RefObject<boolean>,
  editor: RefObject<RichTextEditorRef | null>,
  navigation: Props['navigation']
) => {
  if (closing.current) return
  closing.current = true
  const done = () => navigation.goBack()
  if (editor.current) editor.current.flush(done)
  else done()
}

const NoteEditorScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const { sessionId } = route.params

  const [session] = useState(() => getNoteEditorSession(sessionId))
  const editor = useRef<RichTextEditorRef>(null)
  const closing = useRef(false)

  useEffect(() => () => endNoteEditorSession(sessionId), [sessionId])

  useEffect(() => {
    if (!session) navigation.goBack()
  }, [session, navigation])

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (closing.current || !editor.current) return
        event.preventDefault()
        closing.current = true
        editor.current.flush(() => navigation.dispatch(event.data.action))
      }),
    [navigation]
  )

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      const target = event.target as Element | null
      if (target?.closest?.('dialog, [role=dialog], [role=menu]')) return
      closeNote(closing, editor, navigation)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navigation])

  if (!session) return null

  const close = () => closeNote(closing, editor, navigation)

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        title={session.title}
        buttonType='none'
        rightElement={
          <Button
            noTransform
            onPress={close}
            submitShortcut
            accessibilityRole='button'
            accessibilityLabel={i18n.t('done')}
            testID='note-editor-done'
            hitSlop={10}
            style={{
              position: 'absolute',
              right: 0,
              ...webTextTargetFrame('end'),
            }}
          >
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              {i18n.t('done')}
            </Text>
          </Button>
        }
      />
      <RichTextEditor
        ref={editor}
        initialDoc={session.doc}
        placeholder={session.placeholder}
        label={session.title}
        characterLimit={session.characterLimit}
        allowImages={session.allowImages}
        onChange={session.onChange}
        onSubmit={close}
        onLoad={() => markNoteEditorLoaded(sessionId)}
        onPhotoAdded={(count, source) =>
          analytics.capture('note_photo_added', {
            surface: session.surface,
            count,
            source,
          })
        }
        onPhotoFailed={() =>
          analytics.capture('note_photo_failed', { surface: session.surface })
        }
      />
    </View>
  )
}

export default NoteEditorScreen
