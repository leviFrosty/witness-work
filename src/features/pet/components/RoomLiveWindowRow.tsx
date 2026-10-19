import { View } from 'react-native'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/** The window tab's Live switch: the window follows the clock and season. */
export default function RoomLiveWindowRow({
  live,
  onChange,
}: {
  live: boolean
  onChange: (live: boolean) => void
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: theme.colors.backgroundLighter,
        overflow: 'hidden',
      }}
    >
      <InputRowSwitch
        label={i18n.t('pet.room.liveWindow')}
        info={i18n.t('pet.room.liveWindowInfo')}
        value={live}
        onValueChange={onChange}
        lastInSection
      />
    </View>
  )
}
