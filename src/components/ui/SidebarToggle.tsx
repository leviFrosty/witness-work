import { PanelLeftClose, PanelLeftOpen } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import i18n from '@/lib/locales'
import { useSidebarPreferences } from '@/stores/sidebar'

export default function SidebarToggle({ mode }: { mode: 'hide' | 'show' }) {
  const theme = useTheme()
  const { hasSidebar, sidebarVisible } = useAdaptiveLayout()
  const toggle = useSidebarPreferences((s) => s.toggle)

  if (!hasSidebar || sidebarVisible !== (mode === 'hide')) return null

  const label = i18n.t(sidebarVisible ? 'sidebarHide' : 'sidebarShow')

  return (
    <PointerTooltip
      label={label}
      placement={mode === 'hide' ? 'right' : 'bottom'}
      effect='none'
    >
      <IconButton
        noTransform
        icon={sidebarVisible ? PanelLeftClose : PanelLeftOpen}
        size={22}
        color={theme.colors.textAlt}
        accessibilityLabel={label}
        hitSlop={0}
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onPress={() => {
          toggle()
        }}
      />
    </PointerTooltip>
  )
}
