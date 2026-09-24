import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import moment from 'moment'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import BuddiesNameSection from '@/features/buddies/components/BuddiesNameSection'
import InviteShareSummary from '@/features/buddies/components/InviteShareSummary'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

type Props = NativeStackScreenProps<RootStackParamList, 'Buddy Invite'>

type Preview =
  | { state: 'loading' }
  | { state: 'ready'; name: string; expiresAt: number }
  | { state: 'error'; message: string }

/**
 * The pre-accept screen: who is inviting, exactly what each side sees, and what
 * is never shared. "Not now" sends nothing back to the inviter.
 */
export default function BuddyInviteScreen({ route }: Props) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const hasName = useBuddies((state) => state.displayName.trim().length > 0)
  const [preview, setPreview] = useState<Preview>({ state: 'loading' })
  const [accepting, setAccepting] = useState(false)
  const { link } = route.params

  useEffect(() => {
    let cancelled = false
    buddiesEngine
      .previewInvite(link)
      .then((result) => {
        if (!cancelled) setPreview({ state: 'ready', ...result })
      })
      .catch((error) => {
        if (!cancelled)
          setPreview({ state: 'error', message: buddiesErrorMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [link])

  const accept = async () => {
    setAccepting(true)
    try {
      const { name } = await buddiesEngine.acceptInvite(link)
      Alert.alert(
        i18n.t('buddies_inviteSentTitle'),
        i18n.t('buddies_inviteSentBody', { name })
      )
      navigation.goBack()
    } catch (error) {
      Alert.alert(buddiesErrorMessage(error))
    } finally {
      setAccepting(false)
    }
  }

  if (preview.state === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (preview.state === 'error') {
    return (
      <Wrapper insets='bottom'>
        <View style={{ padding: 20, gap: 20 }}>
          <Card>
            <Text>{preview.message}</Text>
          </Card>
          <ActionButton onPress={() => navigation.goBack()}>
            {i18n.t('buddies_notNow')}
          </ActionButton>
        </View>
      </Wrapper>
    )
  }

  return (
    <Wrapper insets='bottom'>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('buddies_inviteTitle', { name: preview.name })}
        </Text>
        <InviteShareSummary inviterName={preview.name} />
        <BuddiesNameSection />
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('buddies_inviteExpiresOn', {
            date: moment(preview.expiresAt).format('LLL'),
          })}
        </Text>
        <ActionButton disabled={accepting || !hasName} onPress={accept}>
          {i18n.t('buddies_accept')}
        </ActionButton>
        <Button
          style={{ alignSelf: 'center', paddingVertical: 6 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('buddies_notNow')}
          </Text>
        </Button>
      </ScrollView>
    </Wrapper>
  )
}
