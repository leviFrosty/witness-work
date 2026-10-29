import { type ReactNode, useEffect, useRef, useState } from 'react'
import type {
  ImagePickerAsset,
  ImagePickerOptions,
  ImagePickerResult,
} from 'expo-image-picker'
import LimitedPhotoPickerModal, {
  type PhotoPickSurface,
} from '@/components/limitedPhotoPicker/LimitedPhotoPickerModal'
import {
  type SharedPhotoRequest,
  pickLibraryImages,
} from '@/lib/photoLibrary/pickLibraryImages'

type Resolve = (assets: ImagePickerAsset[] | null) => void

/**
 * Picks photos from the library (`pickLibraryImages`). Render `host` beside the
 * control that calls `pick`: with limited photo access it shows the app's own
 * picker, and a modal only appears from the screen it's rendered in.
 */
export default function useLibraryImagePicker(surface: PhotoPickSurface): {
  pick: (options: ImagePickerOptions) => Promise<ImagePickerResult>
  host: ReactNode
} {
  const [request, setRequest] = useState<SharedPhotoRequest | null>(null)
  const [open, setOpen] = useState(false)
  const resolver = useRef<Resolve | null>(null)
  const picked = useRef<ImagePickerAsset[] | null>(null)

  const settle = (assets: ImagePickerAsset[] | null) => {
    resolver.current?.(assets)
    resolver.current = null
    picked.current = null
  }

  // Leaving the screen mid-pick backs out of it.
  useEffect(() => () => settle(null), [])

  const chooseShared = (next: SharedPhotoRequest) =>
    new Promise<ImagePickerAsset[] | null>((resolve) => {
      settle(null)
      resolver.current = resolve
      setRequest(next)
      setOpen(true)
    })

  return {
    pick: (options) => pickLibraryImages(options, chooseShared),
    host: (
      <LimitedPhotoPickerModal
        surface={surface}
        request={request}
        open={open}
        onClose={(assets) => {
          setOpen(false)
          // A pick waits until the sheet is gone, since the caller may present
          // the next screen (the avatar crop). Backing out ends here: a swipe
          // has already dismissed it, and no dismissal event follows.
          if (assets) picked.current = assets
          else settle(null)
        }}
        onDismissed={() => {
          setRequest(null)
          if (picked.current) settle(picked.current)
        }}
      />
    ),
  }
}
