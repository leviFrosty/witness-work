import { MenuView } from '@react-native-menu/menu'
import { Layers } from 'lucide-react-native'
import type { StyleProp, ViewStyle } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const mapLayers = ['standard', 'satellite', 'hybrid'] as const
export type MapLayer = (typeof mapLayers)[number]

export default function MapLayerMenu({
  value,
  onChange,
  style,
}: {
  value: MapLayer
  onChange: (value: MapLayer) => void
  style: StyleProp<ViewStyle>
}) {
  const theme = useTheme()

  return (
    <MenuView
      actions={mapLayers.map((layer) => ({
        id: layer,
        title: i18n.t(`map_layer_${layer}`),
        state: layer === value ? 'on' : 'off',
      }))}
      onPressAction={({ nativeEvent }) => {
        const layer = mapLayers.find((layer) => layer === nativeEvent.event)
        if (layer) onChange(layer)
      }}
    >
      <Button
        accessibilityLabel={i18n.t('map_chooseLayer')}
        accessibilityValue={{ text: i18n.t(`map_layer_${value}`) }}
        variant='glass'
        style={style}
      >
        <LucideIcon
          icon={Layers}
          size={theme.fontSize('sm')}
          style={{ color: theme.colors.text }}
        />
      </Button>
    </MenuView>
  )
}
