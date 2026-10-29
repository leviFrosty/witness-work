import { useRef } from 'react'
import { Modal, Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import type { ImagePickerAsset } from 'expo-image-picker'
import LimitedPhotoPicker from '@/components/limitedPhotoPicker/LimitedPhotoPicker'
import { analytics } from '@/lib/analytics'
import type { SharedPhotoRequest } from '@/lib/photoLibrary/pickLibraryImages'

/** Where a photo pick started, for analytics. */
export type PhotoPickSurface =
  | 'avatar'
  | 'note'
  | 'scribe_photo'
  | 'scribe_paper'

type Props = {
  surface: PhotoPickSurface
  /** The request it's showing; kept while it slides away. */
  request: SharedPhotoRequest | null
  open: boolean
  /**
   * The User picked (`assets`) or backed out (null). The sheet then slides
   * away; `onDismissed` follows once it's gone.
   */
  onClose: (assets: ImagePickerAsset[] | null) => void
  onDismissed: () => void
}

/**
 * The limited-access photo picker in a page sheet (iOS only; Android's system
 * picker already keeps to the photos the User shared). React Native presents a
 * modal from the screen it's rendered in, so render it beside the control that
 * picks: inside a popover or a presented screen, a modal from the app root
 * can't appear.
 */
export default function LimitedPhotoPickerModal({
  surface,
  request,
  open,
  onClose,
  onDismissed,
}: Props) {
  const managed = useRef(false)
  const failed = useRef(false)

  if (Platform.OS !== 'ios') return null

  const close = (assets: ImagePickerAsset[] | null) => {
    analytics.capture('photo_picker_limited_closed', {
      surface,
      outcome: assets ? 'picked' : 'cancelled',
      count: assets?.length ?? 0,
      managed: managed.current,
      failed: failed.current,
    })
    managed.current = false
    failed.current = false
    onClose(assets)
  }

  return (
    <Modal
      visible={open}
      animationType='slide'
      presentationStyle='pageSheet'
      allowSwipeDismissal
      onRequestClose={() => close(null)}
      onDismiss={onDismissed}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {request && (
          <LimitedPhotoPicker
            request={request}
            onCancel={() => close(null)}
            onPicked={close}
            onManage={() => {
              managed.current = true
            }}
            onFailed={() => {
              failed.current = true
            }}
          />
        )}
      </GestureHandlerRootView>
    </Modal>
  )
}
