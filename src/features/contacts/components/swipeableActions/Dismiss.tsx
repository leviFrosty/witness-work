import { View } from 'react-native'
import { useContext } from 'react'
import { ThemeContext } from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import IconButton from '@/components/ui/IconButton'
import { faClock } from '@fortawesome/free-solid-svg-icons/faClock'
import { ThemeSizes } from '@/types/theme'

const SwipeableDismiss = ({ size }: { size?: ThemeSizes }) => {
  const theme = useContext(ThemeContext)

  return (
    <View
      style={{
        paddingHorizontal: 40,
        paddingVertical: 5,
        gap: 5,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconButton icon={faClock} size={size || 'lg'} />
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('dismissForLater')}
      </Text>
    </View>
  )
}

export default SwipeableDismiss
