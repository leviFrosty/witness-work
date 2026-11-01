import {
  Bed as BedIcon,
  createLucideIcon,
  Grid2x2 as WindowIcon,
  Lamp as LampIcon,
  LibraryBig as ShelfIcon,
  PaintRoller as WallIcon,
  Presentation as SignIcon,
  Rows3 as FloorIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { RoomTab } from '@/features/pet/lib/roomOptions'

const HatIcon = createLucideIcon('PetHat', [
  [
    'path',
    {
      d: 'M6 15.5 7.2 6.6A2 2 0 0 1 9.2 5h5.6a2 2 0 0 1 2 1.6L18 15.5',
      key: 'a',
    },
  ],
  ['path', { d: 'M6.6 11.5h10.8', key: 'b' }],
  ['path', { d: 'M2 17.5a10 2.5 0 1 0 20 0a10 2.5 0 1 0-20 0', key: 'c' }],
])

export const ROOM_TAB_ICONS: Readonly<Record<RoomTab, AppIcon>> = {
  hat: HatIcon,
  window: WindowIcon,
  wall: WallIcon,
  floor: FloorIcon,
  bed: BedIcon,
  shelf: ShelfIcon,
  lamp: LampIcon,
  sign: SignIcon,
}
