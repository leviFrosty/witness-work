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

export default function PetUnlockArt({
  item,
  size,
  width = size,
}: {
  item: RoomItemId

  size: number

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
