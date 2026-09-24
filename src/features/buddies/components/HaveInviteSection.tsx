import { useState } from 'react'
import { Alert } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import { isInviteLink } from '@/features/buddies/lib/inviteLink'

/**
 * The no-install path: someone who installed the app after receiving an invite
 * pastes the link here. Typing into a field avoids the clipboard-read prompt.
 */
export default function HaveInviteSection() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const [text, setText] = useState('')

  const openInvite = () => {
    const link = text.trim()
    if (!isInviteLink(link)) {
      Alert.alert(i18n.t('buddies_invalidLink'))
      return
    }
    setText('')
    navigation.navigate('Buddy Invite', { link })
  }

  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>
        {i18n.t('buddies_haveInvite')}
      </Text>
      <XView style={{ gap: 10 }}>
        <TextInput
          flex={1}
          value={text}
          onChangeText={setText}
          placeholder={i18n.t('buddies_haveInvite_placeholder')}
          autoCapitalize='none'
          autoCorrect={false}
        />
        <Button onPress={openInvite} disabled={text.trim().length === 0}>
          <Text style={{ color: theme.colors.accent }}>
            {i18n.t('buddies_openInvite')}
          </Text>
        </Button>
      </XView>
    </Card>
  )
}
