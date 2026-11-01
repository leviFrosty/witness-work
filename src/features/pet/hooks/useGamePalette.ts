import { gamePalette, type GamePalette } from '@/features/pet/art/gameUi'
import usePetDark from '@/features/pet/hooks/usePetDark'

export default function useGamePalette(): GamePalette {
  return gamePalette(usePetDark())
}
