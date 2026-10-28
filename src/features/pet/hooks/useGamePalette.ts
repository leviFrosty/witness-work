import { gamePalette, type GamePalette } from '@/features/pet/art/gameUi'
import usePetDark from '@/features/pet/hooks/usePetDark'

/** The pet screens' game look, light or dark as the app's theme is. */
export default function useGamePalette(): GamePalette {
  return gamePalette(usePetDark())
}
