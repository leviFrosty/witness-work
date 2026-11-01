import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Alert, Linking, Platform, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import {
  useKeyboardController,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller'
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import LinkSheet from '@/components/richText/editor/LinkSheet'
import RichTextEditorDom, {
  type BridgeValue,
  type RichTextEditorHandle,
} from '@/components/richText/editor/RichTextEditorDom'
import RichTextToolbar from '@/components/richText/editor/RichTextToolbar'
import {
  editorFonts,
  editorImageSource,
  editorImageSources,
} from '@/components/richText/editor/editorAssets'
import {
  EMPTY_FORMAT_STATE,
  type EditorCommand,
  type EditorFormatState,
  type EditorSetup,
} from '@/components/richText/editor/editorProtocol'
import useTheme from '@/contexts/theme'
import useLibraryImagePicker from '@/hooks/useLibraryImagePicker'
import { relativeLuminance } from '@/lib/color'
import { isRtlLayout } from '@/lib/direction'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { richTextImages } from '@/lib/richText/inspect'
import { MAX_NOTE_IMAGES } from '@/lib/richText/noteImages'
import { saveNoteImage } from '@/lib/richText/saveNoteImage'
import { parseRichTextDoc } from '@/lib/richText/parse'
import { usePreferences } from '@/stores/preferences'
import type { RichTextDoc } from '@/types/richText'

export type RichTextEditorRef = {
  flush: (done: () => void) => void
}

const FLUSH_TIMEOUT_MS = 500

const NO_DATA_DETECTORS: ['none'] = ['none']

let mountedEditors = 0

const RichTextEditor = (props: {
  ref?: React.Ref<RichTextEditorRef>
  initialDoc: RichTextDoc
  placeholder: string
  label: string
  characterLimit?: number
  allowImages: boolean
  onChange: (doc: RichTextDoc) => void
  onPhotoAdded?: (count: number) => void
  onPhotoFailed?: () => void

  onLoad?: () => void
}) => {
  const theme = useTheme()
  const library = useLibraryImagePicker('note')
  const insets = useSafeAreaInsets()
  const fontSizeOffset = usePreferences((s) => s.fontSizeOffset)
  const { setEnabled } = useKeyboardController()
  const dom = useRef<RichTextEditorHandle>(null)
  const [format, setFormat] = useState<EditorFormatState>(EMPTY_FORMAT_STATE)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [linkSheet, setLinkSheet] = useState<{
    open: boolean
    href: string | null
    selection: string
  }>({ open: false, href: null, selection: '' })
  const closeLinkSheet = () =>
    setLinkSheet((sheet) => ({ ...sheet, open: false }))
  const pendingFlush = useRef<(() => void) | null>(null)

  const keyboard = useReanimatedKeyboardAnimation()
  const bottomInset = insets.bottom
  const toolbarLift = useAnimatedStyle(() => ({
    paddingBottom: Math.max(-keyboard.height.value, bottomInset),
  }))

  useAnimatedReaction(
    () => keyboard.height.value < 0,
    (visible, previous) => {
      if (visible !== previous) scheduleOnRN(setKeyboardVisible, visible)
    }
  )

  useEffect(() => {
    mountedEditors++
    setEnabled(true)
    return () => {
      mountedEditors--
      if (mountedEditors === 0) setEnabled(false)
    }
  }, [setEnabled])

  const requestKeyboard = () => {
    if (Platform.OS !== 'android') return
    ;(dom.current as unknown as { requestFocus?: () => void })?.requestFocus?.()
  }

  const excludeFromBackGesture = async (rects: number[][]) => {
    if (Platform.OS !== 'android') return
    ;(
      dom.current as unknown as {
        setGestureExclusion?: (rects: number[][]) => void
      }
    )?.setGestureExclusion?.(rects)
  }

  const run = (command: EditorCommand) =>
    dom.current?.run?.(command as unknown as BridgeValue)

  useImperativeHandle(props.ref, () => ({
    flush: (done) => {
      if (!dom.current?.run) return done()
      const timer = setTimeout(finish, FLUSH_TIMEOUT_MS)
      function finish() {
        clearTimeout(timer)
        pendingFlush.current = null
        done()
      }
      pendingFlush.current = finish
      run({ type: 'flush' })
    },
  }))

  const getSetup = async (): Promise<EditorSetup> => {
    const ids = richTextImages(props.initialDoc).map((image) => image.id)
    const [imageSources, fonts] = await Promise.all([
      editorImageSources(ids),
      editorFonts(),
    ])
    return {
      doc: props.initialDoc,
      imageSources,
      fonts,
      theme: {
        scheme:
          relativeLuminance(theme.colors.background) < 0.4 ? 'dark' : 'light',
        text: theme.colors.text,
        textAlt: theme.colors.textAlt,
        accent: theme.colors.accent,
        background: theme.colors.background,
        border: theme.colors.border,
        fontSize: theme.fontSize('md') + fontSizeOffset,
      },
      direction: isRtlLayout() ? 'rtl' : 'ltr',
      placeholder: props.placeholder,
      label: props.label,
      characterLimit: props.characterLimit,
      autofocus: true,
    }
  }

  const onChange = async (json: Record<string, unknown>) => {
    const doc = parseRichTextDoc(json)
    if (doc) props.onChange(doc)
    pendingFlush.current?.()
  }

  const addPhoto = async (source: 'camera' | 'library') => {
    const remaining = MAX_NOTE_IMAGES - format.images
    if (remaining <= 0) {
      Alert.alert(
        i18n.t('richText_photoLimitTitle'),
        i18n.t('richText_photoLimit', { count: MAX_NOTE_IMAGES })
      )
      return
    }
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : Platform.OS === 'ios'
          ? await ImagePicker.requestMediaLibraryPermissionsAsync()
          : { granted: true }
    if (!permission.granted) {
      Alert.alert(
        i18n.t('permissionRequired'),
        i18n.t(
          source === 'camera'
            ? 'richText_cameraPermission'
            : 'richText_photosPermission'
        ),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t('richText_openSettings'),
            onPress: () => void Linking.openSettings(),
          },
        ]
      )
      return
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
    }
    let result: ImagePicker.ImagePickerResult
    try {
      result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await library.pick({
              ...options,
              allowsMultipleSelection: true,
              selectionLimit: remaining,
              orderedSelection: true,
            })
    } catch (error) {
      logger.error('Failed to pick a photo for a note', error)
      props.onPhotoFailed?.()
      Alert.alert(i18n.t('error'), i18n.t('richText_photoFailed'))
      run({ type: 'focus' })
      return
    }
    if (result.canceled) {
      run({ type: 'focus' })
      return
    }
    let added = 0
    for (const asset of result.assets.slice(0, remaining)) {
      try {
        const image = await saveNoteImage(asset.uri, asset)
        run({
          type: 'insertImage',
          image,
          src: await editorImageSource(image.id),
        })
        added++
      } catch (error) {
        logger.error('Failed to add a photo to a note', error)
        props.onPhotoFailed?.()
        Alert.alert(i18n.t('error'), i18n.t('richText_photoFailed'))
        break
      }
    }
    if (added) props.onPhotoAdded?.(added)
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1 }}>
        <RichTextEditorDom
          ref={dom}
          dom={{
            useExpoDOMWebView: Platform.OS !== 'ios',
            keyboardDisplayRequiresUserAction: false,
            hideKeyboardAccessoryView: true,
            contentInsetAdjustmentBehavior: 'never',
            automaticallyAdjustContentInsets: false,
            allowsLinkPreview: false,
            ...(Platform.OS === 'ios' && {
              dataDetectorTypes: NO_DATA_DETECTORS,
            }),
            overScrollMode: 'never',
            setSupportMultipleWindows: false,

            onShouldStartLoadWithRequest: (request) =>
              !request.isTopFrame ||
              !/^https?:/i.test(request.url) ||
              /^https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2|[\d.]+):\d+\//.test(
                request.url
              ),
            style: { flex: 1, backgroundColor: theme.colors.background },
            containerStyle: { flex: 1 },
          }}
          getSetup={getSetup}
          onReady={async () => {
            requestKeyboard()
            run({ type: 'focus', at: 'end' })
            props.onLoad?.()
          }}
          onChange={onChange}
          onImageHandles={excludeFromBackGesture}
          onFormatState={async (state) => {
            if (state.focused && !format.focused) requestKeyboard()
            setFormat(state)
          }}
        />
      </View>
      <Animated.View
        style={[{ backgroundColor: theme.colors.card }, toolbarLift]}
      >
        <RichTextToolbar
          format={format}
          run={run}
          keyboardVisible={keyboardVisible}
          onDismissKeyboard={() => run({ type: 'blur' })}
          onLink={() =>
            setLinkSheet({
              open: true,
              href: format.link,
              selection: format.selection,
            })
          }
          onAddPhoto={
            props.allowImages ? (source) => void addPhoto(source) : undefined
          }
        />
      </Animated.View>
      <LinkSheet
        open={linkSheet.open}
        currentHref={linkSheet.href}
        selection={linkSheet.selection}
        onClose={() => {
          closeLinkSheet()
          run({ type: 'focus' })
        }}
        onSave={(href, text) => {
          closeLinkSheet()
          run({ type: 'setLink', href, text })
        }}
        onRemove={() => {
          closeLinkSheet()
          run({ type: 'unsetLink' })
        }}
      />
      {library.host}
    </View>
  )
}

export default RichTextEditor
