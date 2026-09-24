import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import moment from 'moment'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { useProfile } from '@/stores/profile'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import InviteShareSummary from '@/features/buddies/components/InviteShareSummary'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'
import { buddyTenureLabel } from '@/features/buddies/lib/buddyProfile'
import type {
  BuddyAvatar as SharedAvatar,
  BuddyTenure,
} from '@/features/buddies/lib/schemas'

type Props = NativeStackScreenProps<RootStackParamList, 'Buddy Invite'>

type Preview =
  | { state: 'loading' }
  | {
      state: 'ready'
      name: string
      avatar?: SharedAvatar
      tenure?: BuddyTenure
      expiresAt: number
    }
  | { state: 'error'; message: string }

/**
 * The pre-accept screen: who is inviting, what each side sees, and what is
 * never shared. Leaving (the header back arrow) sends nothing to the inviter.
 */
export default function BuddyInviteScreen({ route }: Props) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const hasName = useProfile((state) => state.name.trim().length > 0)
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
      <Wrapper insets='bottom' style={{ flex: 1 }}>
        <View style={{ padding: 20 }}>
          <Card>
            <Text>{preview.message}</Text>
          </Card>
        </View>
      </Wrapper>
    )
  }

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <BuddyAvatar avatar={preview.avatar} name={preview.name} size={80} />
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
              textAlign: 'center',
            }}
          >
            {i18n.t('buddies_inviteTitle', { name: preview.name })}
          </Text>
          {preview.tenure && (
            <Text style={{ color: theme.colors.textAlt }}>
              {buddyTenureLabel(preview.tenure)}
            </Text>
          )}
        </View>
        <InviteShareSummary />
        {!hasName && (
          <Card style={{ gap: 12 }}>
            <Text>{i18n.t('buddies_nameRequired')}</Text>
            <ActionButton
              onPress={() => navigation.navigate('PreferencesPublisher')}
            >
              {i18n.t('buddies_editProfile')}
            </ActionButton>
          </Card>
        )}
        <View style={{ gap: 10 }}>
          <ActionButton disabled={accepting || !hasName} onPress={accept}>
            {i18n.t('buddies_accept')}
          </ActionButton>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              textAlign: 'center',
            }}
          >
            {i18n.t('buddies_codeExpires', {
              time: moment(preview.expiresAt).fromNow(),
            })}
          </Text>
        </View>
      </ScrollView>
    </Wrapper>
  )
}
