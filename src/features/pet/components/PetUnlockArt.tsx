import { View } from 'react-native'
import { resolveRoom } from '@/features/pet/art'
import type RoomOptionThumbComponent from '@/features/pet/components/RoomOptionThumb'
import usePetRoomScene from '@/features/pet/hooks/usePetRoomScene'
import {
  ROOM_THUMB_VIEWS,
  thumbRoom,
  thumbShowsPet,
} from '@/features/pet/lib/roomOptions'
import { unlockedPart } from '@/features/pet/lib/unlockNews'
import type { RoomItemId } from '@/types/pet'
import { canvasKitComponent } from '@/lib/canvasKit/canvasKitComponent'

/**
 * An unlocked item as Decorate Room's thumbnail draws it, in the pet's own
 * room: the pet wearing the hat, or the room with the new floor. Filled to a
 * `size` square, cropped at the sides.
 */
export default function PetUnlockArt({
  item,
  size,
  width = size,
}: {
  item: RoomItemId
  /** The height it fills. */
  size: number
  /** The width it fills; the picture is cropped to it. */
  width?: number
}) {
  const scene = usePetRoomScene()
  if (!scene) return null
  const { part, option } = unlockedPart(item)
  const view = ROOM_THUMB_VIEWS[part]
  const drawn = Math.max(width, (size * view[2]) / view[3])
  return (
    <View
      style={{
        width,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <RoomOptionThumb
        input={{
          ...scene.thumbBase,
          pet: thumbShowsPet(part) ? scene.thumbBase.pet : null,
          room: resolveRoom(
            thumbRoom(scene.state.room, part, option),
            scene.liveNow
          ),
        }}
        view={view}
        width={drawn}
      />
    </View>
  )
}

/**
 * The thumbnail draws with Skia, so toasts and the tray can show this before
 * Skia has loaded: on the web it draws once CanvasKit has downloaded.
 */
const RoomOptionThumb = canvasKitComponent(
  (): typeof RoomOptionThumbComponent =>
    require('@/features/pet/components/RoomOptionThumb').default
)
