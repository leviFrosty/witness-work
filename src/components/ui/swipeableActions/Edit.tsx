import { Pencil as PencilIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { useContext } from 'react'
import { ThemeContext } from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import IconButton from '@/components/ui/IconButton'

const SwipeableEdit = () => {
  const theme = useContext(ThemeContext)

  return (
    <View
      style={{
        paddingHorizontal: 40,
        paddingVertical: 20,
        gap: 10,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconButton icon={PencilIcon} size='lg' />
      <Text style={{ color: theme.colors.textAlt }}>{i18n.t('edit')}</Text>
    </View>
  )
}
export default SwipeableEdit
