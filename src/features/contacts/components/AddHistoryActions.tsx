import {
  Caravan as CaravanIcon,
  MessagesSquare as MessagesSquareIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { RootStackNavigation } from '@/types/rootStack'

interface Props {
  contactId: string
  navigation: Pick<RootStackNavigation, 'navigate' | 'replace'>
  embedded: boolean
  onAction: () => void
}

export default function AddHistoryActions({
  contactId,
  navigation,
  embedded,
  onAction,
}: Props) {
  const theme = useTheme()
  const handleAction = (action: 'notAtHome' | 'conversation') => {
    const params = {
      contactId,
      notAtHome: action === 'notAtHome',
      returnToContacts: embedded,
    }
    onAction()
    if (embedded) navigation.navigate('Visit Form', params)
    else navigation.replace('Visit Form', params)
  }

  return (
    <View style={{ gap: 15 }}>
      <View style={{ gap: 10 }}>
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('addToHistory')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            marginBottom: 15,
            color: theme.colors.text,
          }}
        >
          {i18n.t('add_description')}
        </Text>
      </View>
      <Button
        noTransform
        style={{ gap: 10 }}
        variant='outline'
        onPress={() => handleAction('notAtHome')}
      >
        <IconButton
          iconStyle={{ color: theme.colors.text }}
          icon={CaravanIcon}
        />
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize('md'),
          }}
        >
          {i18n.t('notAtHome')}
        </Text>
      </Button>
      <Button
        noTransform
        style={{ gap: 10, backgroundColor: theme.colors.accent }}
        variant='solid'
        onPress={() => handleAction('conversation')}
      >
        <IconButton
          icon={MessagesSquareIcon}
          iconStyle={{
            color: theme.colors.textInverse,
          }}
        />
        <Text
          style={{
            color: theme.colors.textInverse,
            fontSize: theme.fontSize('md'),
          }}
        >
          {i18n.t('conversation')}
        </Text>
      </Button>
    </View>
  )
}
