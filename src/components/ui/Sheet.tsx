import { useId, type ComponentProps } from 'react'
import { Sheet as TamaguiSheet } from 'tamagui'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'

type SheetProps = ComponentProps<typeof TamaguiSheet>

/**
 * Tamagui's `Sheet`, which also holds takeovers off (ADR 0021) while it's open:
 * no celebration or intro lands on top of a sheet the User is using. Sheets
 * don't take focus from the tabs the way a pushed screen does, so they say so
 * themselves. Use this instead of importing `Sheet` from `tamagui`.
 */
function SheetRoot(props: SheetProps) {
  const holdId = useId()
  useTakeoverHold(`sheet:${holdId}`, props.open === true)
  return <TamaguiSheet {...props} />
}

const Sheet = Object.assign(SheetRoot, {
  Frame: TamaguiSheet.Frame,
  Overlay: TamaguiSheet.Overlay,
  Handle: TamaguiSheet.Handle,
  ScrollView: TamaguiSheet.ScrollView,
})

export default Sheet
