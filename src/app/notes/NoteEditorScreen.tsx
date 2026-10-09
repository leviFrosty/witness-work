import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import RichTextEditor, {
  type RichTextEditorRef,
} from '@/components/richText/editor/RichTextEditor'
import Button from '@/components/ui/Button'
import Header from '@/components/ui/layout/Header'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import {
  endNoteEditorSession,
  getNoteEditorSession,
} from '@/lib/richText/noteEditorSession'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>

/**
 * A note, full screen, for writing with formatting. Changes reach the form that
 * opened it as they're made; the form saves them with the record.
 */
const NoteEditorScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const { sessionId } = route.params
  // Kept from the first render: the session ends when the screen unmounts,
  // and React may run that cleanup early in development.
  const [session] = useState(() => getNoteEditorSession(sessionId))
  const editor = useRef<RichTextEditorRef>(null)
  const closing = useRef(false)

  useEffect(() => () => endNoteEditorSession(sessionId), [sessionId])

  // A session doesn't survive the app restarting; there's nothing to edit.
  useEffect(() => {
    if (!session) navigation.goBack()
  }, [session, navigation])

  // Back (Android, or a pointer's Escape) hands over the last edit first.
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

  if (!session) return null

  const close = () => {
    if (closing.current) return
    closing.current = true
    const done = () => navigation.goBack()
    if (editor.current) editor.current.flush(done)
    else done()
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        title={session.title}
        buttonType='none'
        rightElement={
          <Button
            noTransform
            onPress={close}
            accessibilityRole='button'
            accessibilityLabel={i18n.t('done')}
            testID='note-editor-done'
            hitSlop={10}
            style={{ position: 'absolute', right: 0 }}
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
        onPhotoAdded={(count) =>
          analytics.capture('note_photo_added', {
            surface: session.surface,
            count,
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
