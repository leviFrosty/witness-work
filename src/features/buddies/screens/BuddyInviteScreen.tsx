import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
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
import { alertBuddiesError } from '@/features/buddies/lib/buddiesErrorAlert'
import {
  buddiesErrorMessage,
  isRetryableBuddiesError,
} from '@/features/buddies/lib/buddiesErrors'
import { buddyTenureLabel } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import type {
  BuddyAvatar as SharedAvatar,
  BuddyTenure,
} from '@/features/buddies/lib/schemas'
import { noteUserAction } from '@/lib/userAction'
import { formatRelative } from '@/lib/dates'

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
  | { state: 'error'; message: string; retryable: boolean }

export default function BuddyInviteScreen({ route }: Props) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const hasName = useProfile((state) => state.name.trim().length > 0)

  const [started] = useState(() => useBuddies.getState().onboardingComplete)
  const [preview, setPreview] = useState<Preview>({ state: 'loading' })
  const [accepting, setAccepting] = useState(false)

  const acceptingRef = useRef(false)
  const [nameInvalid, setNameInvalid] = useState(false)
  const [attempt, setAttempt] = useState(0)
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
          setPreview({
            state: 'error',
            message: buddiesErrorMessage(error),
            retryable: isRetryableBuddiesError(error),
          })
      })
    return () => {
      cancelled = true
    }
  }, [link, attempt])

  const retry = () => {
    setPreview({ state: 'loading' })
    setAttempt((count) => count + 1)
  }

  const accept = async () => {
    if (acceptingRef.current) return
    if (!hasName) {
      setNameInvalid(true)
      return
    }
    acceptingRef.current = true
    setAccepting(true)
    try {
      const { name } = await buddiesEngine.acceptInvite(link)
      noteUserAction('buddy')
      Alert.alert(
        i18n.t('buddies_inviteSentTitle'),
        i18n.t('buddies_inviteSentBody', { name })
      )

      if (navigation.isFocused()) navigation.goBack()
    } catch (error) {
      alertBuddiesError(i18n.t('buddies_errorAcceptTitle'), error)
    } finally {
      acceptingRef.current = false
      setAccepting(false)
    }
  }

  if (preview.state === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator
          accessibilityLabel={i18n.t('buddies_inviteLoading')}
        />
      </View>
    )
  }

  if (preview.state === 'error') {
    return (
      <Wrapper insets='bottom' style={{ flex: 1 }}>
        <View style={{ padding: 20 }}>
          <Card style={{ gap: 12 }}>
            <Text>{preview.message}</Text>
            {preview.retryable && (
              <ActionButton onPress={retry}>
                {i18n.t('buddies_tryAgain')}
              </ActionButton>
            )}
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
        {!started && <InviteShareSummary />}
        {!hasName && (
          <Card
            style={{
              gap: 12,
              borderWidth: 1,
              borderColor: nameInvalid ? theme.colors.error : 'transparent',
            }}
          >
            <Text>{i18n.t('buddies_nameRequired')}</Text>
            <ActionButton
              onPress={() => navigation.navigate('PreferencesPublisher')}
            >
              {i18n.t('buddies_editProfile')}
            </ActionButton>
          </Card>
        )}
        <View style={{ gap: 10 }}>
          <ActionButton loading={accepting} onPress={accept}>
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
              time: formatRelative(preview.expiresAt),
            })}
          </Text>
        </View>
      </ScrollView>
    </Wrapper>
  )
}
