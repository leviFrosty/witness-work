import { StyleSheet, View } from 'react-native'
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  CornerDownRight,
  createLucideIcon,
  List,
  ListChecks,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelsLeftBottom,
  PanelsRightBottom,
  Redo2,
  Undo2,
  type LucideProps,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { isRtlLayout } from '@/lib/direction'

function directional(ltr: AppIcon, rtl: AppIcon, name: string): AppIcon {
  const Icon = (props: LucideProps) => {
    const Component = isRtlLayout() ? rtl : ltr
    return <Component {...props} />
  }
  Icon.displayName = name
  return Icon as unknown as AppIcon
}

export function mirroredIcon(icon: AppIcon, name: string): AppIcon {
  const Base = icon
  const Icon = ({ style, ...props }: LucideProps) => {
    if (!isRtlLayout()) return <Base {...props} style={style} />
    const flat = StyleSheet.flatten(style) ?? {}
    const transform = Array.isArray(flat.transform) ? flat.transform : []
    return (
      <View style={[flat, { transform: [...transform, { scaleX: -1 }] }]}>
        <Base {...props} />
      </View>
    )
  }
  Icon.displayName = name
  return Icon as unknown as AppIcon
}

export const ChevronForwardIcon = directional(
  ChevronRight,
  ChevronLeft,
  'ChevronForwardIcon'
)

export const ChevronBackwardIcon = directional(
  ChevronLeft,
  ChevronRight,
  'ChevronBackwardIcon'
)

export const ArrowForwardIcon = directional(
  ArrowRight,
  ArrowLeft,
  'ArrowForwardIcon'
)

export const ArrowBackwardIcon = directional(
  ArrowLeft,
  ArrowRight,
  'ArrowBackwardIcon'
)
export const CornerDownForwardIcon = directional(
  CornerDownRight,
  CornerDownLeft,
  'CornerDownForwardIcon'
)
export const UndoIcon = directional(Undo2, Redo2, 'UndoIcon')
export const RedoIcon = directional(Redo2, Undo2, 'RedoIcon')

export const PanelLeadingOpenIcon = directional(
  PanelLeftOpen,
  PanelRightOpen,
  'PanelLeadingOpenIcon'
)
export const PanelLeadingCloseIcon = directional(
  PanelLeftClose,
  PanelRightClose,
  'PanelLeadingCloseIcon'
)

export const PanelTrailingOpenIcon = directional(
  PanelRightOpen,
  PanelLeftOpen,
  'PanelTrailingOpenIcon'
)
export const PanelTrailingCloseIcon = directional(
  PanelRightClose,
  PanelLeftClose,
  'PanelTrailingCloseIcon'
)

export const PanelsLeadingBottomIcon = directional(
  PanelsLeftBottom,
  PanelsRightBottom,
  'PanelsLeadingBottomIcon'
)
export const IndentIcon = mirroredIcon(ListIndentIncrease, 'IndentIcon')
export const OutdentIcon = mirroredIcon(ListIndentDecrease, 'OutdentIcon')

export const LogInIcon = mirroredIcon(LogIn, 'LogInIcon')

export const LogOutIcon = mirroredIcon(LogOut, 'LogOutIcon')

const ListRtl = createLucideIcon('ListRtl', [
  ['path', { d: 'M21 5h.01', key: 'b' }],
  ['path', { d: 'M21 12h.01', key: 'c' }],
  ['path', { d: 'M21 19h.01', key: 'd' }],
  ['path', { d: 'M3 5h13', key: 'e' }],
  ['path', { d: 'M3 12h13', key: 'f' }],
  ['path', { d: 'M3 19h13', key: 'g' }],
])
const ListOrderedRtl = createLucideIcon('ListOrderedRtl', [
  ['path', { d: 'M3 5h10', key: 'b' }],
  ['path', { d: 'M3 12h10', key: 'c' }],
  ['path', { d: 'M3 19h10', key: 'd' }],
  ['path', { d: 'M18 4h1v5', key: 'e' }],
  ['path', { d: 'M18 9h2', key: 'f' }],
  [
    'path',
    {
      d: 'M20.5 20H17.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02',
      key: 'g',
    },
  ],
])
const ListChecksRtl = createLucideIcon('ListChecksRtl', [
  ['path', { d: 'M3 5h8', key: 'b' }],
  ['path', { d: 'M3 12h8', key: 'c' }],
  ['path', { d: 'M3 19h8', key: 'd' }],
  ['path', { d: 'm15 17 2 2 4-4', key: 'e' }],
  ['path', { d: 'm15 7 2 2 4-4', key: 'f' }],
])
export const BulletListIcon = directional(
  List,
  ListRtl as unknown as AppIcon,
  'BulletListIcon'
)
export const NumberedListIcon = directional(
  ListOrdered,
  ListOrderedRtl as unknown as AppIcon,
  'NumberedListIcon'
)
export const ChecklistIcon = directional(
  ListChecks,
  ListChecksRtl as unknown as AppIcon,
  'ChecklistIcon'
)
