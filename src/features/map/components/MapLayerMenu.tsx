import { Layers } from 'lucide-react-native'
import type { ViewStyle } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import PullDownMenu from '@/components/ui/PullDownMenu'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { mapLayers, type MapLayer } from '@/types/map'

export default function MapLayerMenu({
  value,
  onChange,
  style,
}: {
  value: MapLayer
  onChange: (value: MapLayer) => void
  style: ViewStyle
}) {
  const theme = useTheme()
  // The menu's trigger takes the pointer effect, shaped like the button.
  const { borderRadius } = style

  return (
    <PullDownMenu
      actions={mapLayers.map((layer) => ({
        id: layer,
        title: i18n.t(`map_layer_${layer}`),
        checked: layer === value,
        onPress: () => onChange(layer),
      }))}
      accessibilityLabel={i18n.t('map_chooseLayer')}
      accessibilityValue={i18n.t(`map_layer_${value}`)}
      pointerEffect='lift'
      hoverRadius={typeof borderRadius === 'number' ? borderRadius : undefined}
    >
      <Button variant='glass' style={style}>
        <LucideIcon
          icon={Layers}
          size={theme.fontSize('sm')}
          style={{ color: theme.colors.text }}
        />
      </Button>
    </PullDownMenu>
  )
}
