import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  PanelLeadingCloseIcon,
  PanelLeadingOpenIcon,
} from '@/components/ui/DirectionalIcon'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import i18n from '@/lib/locales'
import {
  SIDEBAR_CONTROL_OFFSET,
  SIDEBAR_TOGGLE_SIZE,
} from '@/lib/sidebarLayout'
import { useSidebarGutter, useSidebarPreferences } from '@/stores/sidebar'
import WindowControlsInsetView from '../../../modules/window-controls'

function ToggleButton({
  sidebarVisible,
  tooltipPlacement,
}: {
  sidebarVisible: boolean
  tooltipPlacement: 'right' | 'bottom'
}) {
  const theme = useTheme()
  const toggle = useSidebarPreferences((s) => s.toggle)
  const label = i18n.t(sidebarVisible ? 'sidebarHide' : 'sidebarShow')

  return (
    <PointerTooltip label={label} placement={tooltipPlacement} effect='none'>
      <IconButton
        noTransform
        icon={sidebarVisible ? PanelLeadingCloseIcon : PanelLeadingOpenIcon}
        size={22}
        color={theme.colors.textAlt}
        accessibilityLabel={label}
        hitSlop={0}
        style={{
          width: SIDEBAR_TOGGLE_SIZE,
          height: SIDEBAR_TOGGLE_SIZE,
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

export default function SidebarToggle({ mode }: { mode: 'hide' | 'show' }) {
  const { hasSidebar, sidebarVisible, sidebarToggleInGutter } =
    useAdaptiveLayout()

  if (!hasSidebar || sidebarVisible !== (mode === 'hide')) return null
  if (mode === 'show' && sidebarToggleInGutter) return null

  return (
    <ToggleButton
      sidebarVisible={sidebarVisible}
      tooltipPlacement={mode === 'hide' ? 'right' : 'bottom'}
    />
  )
}

export function SidebarGutterToggle() {
  const insets = useSafeAreaInsets()
  const { hasSidebar, sidebarToggleInGutter, sidebarToggleStart } =
    useAdaptiveLayout()
  const setWindowControls = useSidebarGutter((s) => s.setWindowControls)

  if (!hasSidebar) return null

  const top = insets.top + SIDEBAR_CONTROL_OFFSET

  return (
    <>
      <WindowControlsInsetView
        onInsetsChange={({ start }) => setWindowControls(start)}
        pointerEvents='none'
        style={{
          position: 'absolute',
          top,
          start: SIDEBAR_CONTROL_OFFSET,
          width: SIDEBAR_TOGGLE_SIZE,
          height: SIDEBAR_TOGGLE_SIZE,
        }}
      />
      {sidebarToggleInGutter && (
        <View
          style={{
            position: 'absolute',
            top,
            start: sidebarToggleStart,
            zIndex: 1,
          }}
        >
          <ToggleButton sidebarVisible={false} tooltipPlacement='right' />
        </View>
      )}
    </>
  )
}
