import { createPortal } from 'react-dom'
import useTheme from '@/contexts/theme'
import { relativeLuminance } from '@/lib/color'

export default function WebSelectionStyles() {
  const theme = useTheme()
  const dark = relativeLuminance(theme.colors.background) < 0.5
  const highlight = `color-mix(in srgb,${theme.colors.accent} ${dark ? '45%' : '35%'},transparent)`

  const css = `::selection{background-color:${highlight};color:${theme.colors.text}}`

  return createPortal(<style data-ww-selection=''>{css}</style>, document.head)
}
