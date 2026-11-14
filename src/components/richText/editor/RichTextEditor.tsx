import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Alert, Platform, View } from 'react-native'
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
import { openAppSettings } from '@/lib/openAppSettings'
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
  type EditorImageFile,
  type EditorImageSource,
  type EditorSetup,
} from '@/components/richText/editor/editorProtocol'
import { MAX_PHOTO_BYTES } from '@/lib/files/imageSizing'
import { UnsupportedImageError } from '@/lib/files/webImages'
import { toast } from '@/stores/toasts'
import useTheme from '@/contexts/theme'
import useLibraryImagePicker from '@/hooks/useLibraryImagePicker'
import { relativeLuminance } from '@/lib/color'
import { registerSubmitAction } from '@/lib/submitShortcut'
import { pickWebImages } from '@/lib/files/pickWebImages'
import { isRtlLayout } from '@/lib/direction'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { photoFailedMessage } from '@/lib/photoLibrary/photoFailedMessage'
import { richTextImages } from '@/lib/richText/inspect'
import { deleteNoteImages, MAX_NOTE_IMAGES } from '@/lib/richText/noteImages'
import { canAddNotePhotos } from '@/lib/richText/notePhotos'
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
  onPhotoAdded?: (count: number, source: 'picker' | EditorImageSource) => void
  onPhotoFailed?: () => void

  onLoad?: () => void

  onSubmit?: () => void
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
  const imageCount = useRef(0)
  const addingImages = useRef(0)
  const imageBatches = useRef<Promise<void>>(Promise.resolve())

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

  const submit = () => {
    if (props.onSubmit) props.onSubmit()
    else run({ type: 'blur' })
  }
  const latestSubmit = useRef(submit)
  useEffect(() => {
    latestSubmit.current = submit
  })
  useEffect(() => {
    if (Platform.OS === 'web' || !format.focused) return
    return registerSubmitAction({
      owns: true,
      press: () => latestSubmit.current(),
      disabled: () => false,
      focused: () => true,
    })
  }, [format.focused])

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
      photoMissing: i18n.t('richText_photoMissing'),
      characterLimit: props.characterLimit,
      autofocus: true,
      inline: Platform.OS === 'web',
      takesImageFiles: Platform.OS === 'web',
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
            onPress: () => void openAppSettings(),
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
          ? Platform.OS === 'web'
            ? await pickWebImages(options, 'camera')
            : await ImagePicker.launchCameraAsync(options)
          : await library.pick({
              ...options,
              allowsMultipleSelection: true,
              selectionLimit: remaining,
              orderedSelection: true,
            })
    } catch (error) {
      logger.error('Failed to pick a photo for a note', error)
      props.onPhotoFailed?.()
      Alert.alert(
        i18n.t('error'),
        photoFailedMessage(error, 'richText_photoFailed')
      )
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
    if (added) props.onPhotoAdded?.(added, 'picker')
  }

  const addImageFiles = async (
    files: EditorImageFile[],
    source: EditorImageSource,
    imagesInNote: number
  ) => {
    if (!canAddNotePhotos(props.allowImages)) {
      toast.error(i18n.t('richText_photosNotAllowed'))
      return
    }
    if (!files.length) {
      toast.error(i18n.t('photoPicker_unsupported'))
      return
    }
    if (!addingImages.current) imageCount.current = imagesInNote
    addingImages.current++
    const batch = imageBatches.current.then(() => saveImageFiles(files, source))
    imageBatches.current = batch.then(
      () => undefined,
      () => undefined
    )
    try {
      await batch
    } finally {
      addingImages.current--
    }
  }

  const saveImageFiles = async (
    files: EditorImageFile[],
    source: EditorImageSource
  ) => {
    let added = 0
    let failure: string | null = null
    for (const file of files) {
      if (imageCount.current >= MAX_NOTE_IMAGES) {
        failure ??= i18n.t('richText_photoLimit', { count: MAX_NOTE_IMAGES })
        break
      }
      try {
        if (file.size > MAX_PHOTO_BYTES)
          throw new UnsupportedImageError('tooLarge')
        const image = await saveNoteImage(file.uri)
        if (imageCount.current >= MAX_NOTE_IMAGES) {
          void deleteNoteImages([image.id])
          failure ??= i18n.t('richText_photoLimit', { count: MAX_NOTE_IMAGES })
          break
        }
        imageCount.current++
        run({
          type: 'insertImage',
          image,
          src: await editorImageSource(image.id),
        })
        added++
      } catch (error) {
        logger.error(`Failed to add a ${source} photo to a note`, error)
        props.onPhotoFailed?.()
        failure ??= photoFailedMessage(error, 'richText_photoFailed')
      }
    }
    if (failure) toast.error(failure)
    if (added) props.onPhotoAdded?.(added, source)
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
          onSubmit={async () => submit()}
          onImageFiles={addImageFiles}
          onImageHandles={excludeFromBackGesture}
          onFormatState={async (state) => {
            if (state.focused && !format.focused) requestKeyboard()
            if (!addingImages.current) imageCount.current = state.images
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
            canAddNotePhotos(props.allowImages)
              ? (source) => void addPhoto(source)
              : undefined
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
