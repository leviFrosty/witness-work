import { Trash2 as Trash2Icon } from 'lucide-react-native'
import { View, ViewStyle } from 'react-native'
import { useContext } from 'react'
import { ThemeContext } from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import IconButton from '@/components/ui/IconButton'
import { ThemeSizes } from '@/types/theme'

const SwipeableDelete = ({
  size,
  noText,
  style,
}: {
  size?: ThemeSizes
  noText?: boolean
  style?: ViewStyle
}) => {
  const theme = useContext(ThemeContext)

  return (
    <View
      style={[
        [
          {
            paddingHorizontal: 20,
            gap: 5,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ],
        [style],
      ]}
    >
      <IconButton icon={Trash2Icon} size={size || 'lg'} />
      {!noText && (
        <Text style={{ color: theme.colors.textAlt }}>{i18n.t('delete')}</Text>
      )}
    </View>
  )
}
export default SwipeableDelete
