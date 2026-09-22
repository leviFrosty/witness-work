import {
  Archive as ArchiveIcon,
  Trash2 as TrashIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import { useContext } from 'react'
import { ThemeContext } from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import IconButton from '@/components/ui/IconButton'
import { ThemeSizes } from '@/types/theme'

const SwipeableArchive = ({
  size,
  permanent = false,
}: {
  size?: ThemeSizes
  permanent?: boolean
}) => {
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
      <IconButton
        icon={permanent ? TrashIcon : ArchiveIcon}
        size={size || 'lg'}
      />
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t(permanent ? 'delete' : 'archive')}
      </Text>
    </View>
  )
}
export default SwipeableArchive
