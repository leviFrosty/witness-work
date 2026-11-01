import type { PopoverProps } from '@/components/ui/Popover.types'

export type {
  PopoverControls,
  PopoverProps,
} from '@/components/ui/Popover.types'

export default function Popover({ renderTrigger }: PopoverProps) {
  return renderTrigger({ onPress: () => {}, expanded: false })
}
