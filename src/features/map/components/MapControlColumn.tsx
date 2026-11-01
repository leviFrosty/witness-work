import { View } from 'react-native'
import { Expand as ExpandIcon, Info as InfoIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import {
  PanelTrailingCloseIcon,
  PanelTrailingOpenIcon,
} from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Popover from '@/components/ui/Popover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { MapLayer } from '@/types/map'
import MapKey from '@/features/map/components/MapColorKey'
import MapLayerMenu from '@/features/map/components/MapLayerMenu'
import {
  MAP_CONTROL_TOOLTIP,
  mapControlStyle,
} from '@/features/map/lib/mapStyles'

const INSET = 16

export type MapControlsLayout = {
  start: number
  y: number
  width: number
  height: number
}

export default function MapControlColumn({
  top,
  onFit,
  stow,
  mapLayer,
  onChangeLayer,
  onLayout,
}: {
  top: number

  onFit: (() => void) | null

  stow: { stowed: boolean; onToggle: () => void } | null
  mapLayer: MapLayer
  onChangeLayer: (layer: MapLayer) => void
  onLayout: (layout: MapControlsLayout) => void
}) {
  const theme = useTheme()
  const controlStyle = mapControlStyle(theme.colors.card)
  const stowLabel = i18n.t(
    stow?.stowed ? 'map_showContactCards' : 'map_hideContactCards'
  )

  return (
    <View
      onLayout={(e) => {
        const { y, width, height } = e.nativeEvent.layout
        onLayout({ start: INSET, y, width, height })
      }}
      style={{
        position: 'absolute',
        top,
        left: INSET,
        gap: 8,
      }}
    >
      {onFit && (
        <PointerTooltip
          label={i18n.t('map_fitContacts')}
          {...MAP_CONTROL_TOOLTIP}
        >
          <Button
            accessibilityLabel={i18n.t('map_fitContacts')}
            variant='glass'
            onPress={onFit}
            style={controlStyle}
          >
            <LucideIcon
              icon={ExpandIcon}
              size={theme.fontSize('sm')}
              style={{ color: theme.colors.text }}
            />
          </Button>
        </PointerTooltip>
      )}
      {}
      {stow && (
        <PointerTooltip label={stowLabel} {...MAP_CONTROL_TOOLTIP}>
          <Button
            accessibilityLabel={stowLabel}
            variant='glass'
            onPress={stow.onToggle}
            style={controlStyle}
          >
            <LucideIcon
              icon={
                stow.stowed ? PanelTrailingOpenIcon : PanelTrailingCloseIcon
              }
              size={theme.fontSize('sm')}
              style={{ color: theme.colors.text }}
            />
          </Button>
        </PointerTooltip>
      )}
      {}
      <PointerTooltip label={i18n.t('map_options')} {...MAP_CONTROL_TOOLTIP}>
        <MapLayerMenu
          value={mapLayer}
          onChange={onChangeLayer}
          style={controlStyle}
        />
      </PointerTooltip>
      <Popover
        contentWidth={280}
        renderTrigger={({ onPress }) => (
          <PointerTooltip
            label={i18n.t('map_showLegend')}
            {...MAP_CONTROL_TOOLTIP}
          >
            <Button
              accessibilityLabel={i18n.t('map_showLegend')}
              variant='glass'
              onPress={onPress}
              style={controlStyle}
            >
              <LucideIcon
                icon={InfoIcon}
                size={theme.fontSize('sm')}
                style={{ color: theme.colors.text }}
              />
            </Button>
          </PointerTooltip>
        )}
      >
        <MapKey />
      </Popover>
    </View>
  )
}
