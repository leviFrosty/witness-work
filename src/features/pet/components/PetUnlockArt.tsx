import { View } from 'react-native'
import { resolveRoom } from '@/features/pet/art'
import RoomOptionThumb from '@/features/pet/components/RoomOptionThumb'
import usePetRoomScene from '@/features/pet/hooks/usePetRoomScene'
import {
  ROOM_THUMB_VIEWS,
  thumbRoom,
  thumbShowsPet,
} from '@/features/pet/lib/roomOptions'
import { unlockedPart } from '@/features/pet/lib/unlockNews'
import type { RoomItemId } from '@/types/pet'

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
