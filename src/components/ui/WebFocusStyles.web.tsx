import { createPortal } from 'react-dom'
import useTheme from '@/contexts/theme'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { relativeLuminance } from '@/lib/color'

const OWN_FOCUS =
  ':not([data-menu-item]):not([role=menu]):not([role=dialog]):not(dialog):not([data-ww-focus-guard]):not([data-ww-focus=none]):not([data-ww-focus=proxy])'

const INPUT_SELECTOR =
  ':is(input:not([role=switch]):not([type=checkbox]):not([type=radio]),textarea,select)'

export default function WebFocusStyles() {
  const theme = useTheme()
  const dark = relativeLuminance(theme.colors.background) < 0.5
  const ring = `color-mix(in srgb,${theme.colors.text} ${dark ? '76%' : '68%'},transparent)`
  const halo = `color-mix(in srgb,${theme.colors.text} ${dark ? '18%' : '14%'},transparent)`
  const sectionRadius = `${inputLayout.sectionRadius}px`

  const css = [
    `:root{--ww-ring:${ring};--ww-ring-halo:${halo};--ww-section-radius:${sectionRadius}}`,
    `:focus-visible:where(${OWN_FOCUS}){outline:2px solid var(--ww-ring)!important;outline-offset:2px!important}`,
    `:where(${INPUT_SELECTOR}):focus-visible:where(${OWN_FOCUS}){outline:2px solid var(--ww-ring)!important;outline-offset:0!important;box-shadow:0 0 0 4px var(--ww-ring-halo)!important}`,
    `input[role=switch]{border-radius:9999px}`,
    `input[role=switch]:focus-visible{outline:2px solid var(--ww-ring)!important;outline-offset:2px!important}`,
    `[data-ww-focus=inset]:focus-visible,[data-ww-focus=row]:focus-visible{outline:2px solid var(--ww-ring)!important;outline-offset:-2px!important;box-shadow:inset 0 0 0 4px var(--ww-ring-halo)!important}`,
    `[data-ww-focus-section] [data-ww-focus=row]{border-radius:0}`,
    `[data-ww-focus-section]>:first-child [data-ww-focus=row],[data-ww-focus-section]>[data-ww-focus=row]:first-child{border-top-left-radius:var(--ww-section-radius);border-top-right-radius:var(--ww-section-radius)}`,
    `[data-ww-focus-section]>:last-child [data-ww-focus=row]:not([data-ww-focus-not-bottom]),[data-ww-focus-section]>[data-ww-focus=row]:last-child:not([data-ww-focus-not-bottom]){border-bottom-left-radius:var(--ww-section-radius);border-bottom-right-radius:var(--ww-section-radius)}`,
    `[data-ww-focus-row-split] [data-ww-focus=row]{border-top-left-radius:0!important;border-bottom-left-radius:0!important}`,
    `[data-ww-focus-header] :focus-visible:where(${OWN_FOCUS}){outline:2px solid var(--ww-ring)!important;outline-offset:-2px!important;box-shadow:inset 0 0 0 4px var(--ww-ring-halo)!important}`,
    `[data-ww-focus-phone] :is([tabindex="0"],button,input):focus-visible{outline:2px solid var(--ww-ring)!important;outline-offset:-2px!important;box-shadow:inset 0 0 0 4px var(--ww-ring-halo)!important}`,
    `[data-ww-focus=proxy]:focus-visible{outline:none!important;box-shadow:none!important}`,
    `[data-ww-focus=proxy]:focus-visible [data-ww-focus-visual]{outline:2px solid var(--ww-ring)!important;outline-offset:2px!important}`,
    `[data-ww-focus-guard]:focus,[data-ww-focus-guard]:focus-visible,[data-stack-layer]>[tabindex="-1"]:focus,[data-stack-layer]>[tabindex="-1"]:focus-visible,[data-ww-focus=none]:focus-visible{outline:none!important;box-shadow:none!important}`,
  ].join('')

  return createPortal(<style data-ww-focus=''>{css}</style>, document.head)
}
