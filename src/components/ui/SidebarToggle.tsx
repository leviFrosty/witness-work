import { PanelLeftClose, PanelLeftOpen } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import IconButton from '@/components/ui/IconButton'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { SIDEBAR_LABEL_MIN_WIDTH } from '@/lib/sidebarLayout'
import { useSidebarPreferences } from '@/stores/sidebar'

export default function SidebarToggle({ mode }: { mode: 'hide' | 'show' }) {
  const theme = useTheme()
  const { hasSidebar, sidebarVisible } = useAdaptiveLayout()
  const toggle = useSidebarPreferences((s) => s.toggle)

  if (!hasSidebar || sidebarVisible !== (mode === 'hide')) return null

  return (
    <IconButton
      noTransform
      icon={sidebarVisible ? PanelLeftClose : PanelLeftOpen}
      size={22}
      color={theme.colors.textAlt}
      accessibilityLabel={i18n.t(
        sidebarVisible ? 'sidebarHide' : 'sidebarShow'
      )}
      hitSlop={0}
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onPress={() => {
        const { width } = useSidebarPreferences.getState()
        toggle()
        analytics.capture('sidebar_visibility_changed', {
          visible: !sidebarVisible,
          mode: width < SIDEBAR_LABEL_MIN_WIDTH ? 'icons' : 'labels',
          source: mode === 'hide' ? 'sidebar' : 'header',
        })
      }}
    />
  )
}
