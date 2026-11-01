import { useRef } from 'react'
import { Modal, Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import type { ImagePickerAsset } from 'expo-image-picker'
import LimitedPhotoPicker from '@/components/limitedPhotoPicker/LimitedPhotoPicker'
import { analytics } from '@/lib/analytics'
import type { SharedPhotoRequest } from '@/lib/photoLibrary/pickLibraryImages'

export type PhotoPickSurface =
  | 'avatar'
  | 'note'
  | 'scribe_photo'
  | 'scribe_paper'

type Props = {
  surface: PhotoPickSurface

  request: SharedPhotoRequest | null
  open: boolean

  onClose: (assets: ImagePickerAsset[] | null) => void
  onDismissed: () => void
}

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
