import { View } from 'react-native'
import { useContext } from 'react'
import { ThemeContext } from '../../contexts/theme'
import Text from '../MyText'
import i18n from '../../lib/locales'
import IconButton from '../IconButton'
import { faEdit } from '@fortawesome/free-solid-svg-icons'

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
      <IconButton icon={faEdit} size='lg' />
      <Text style={{ color: theme.colors.textAlt }}>{i18n.t('edit')}</Text>
    </View>
  )
}
export default SwipeableEdit
