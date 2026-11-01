import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, type ScrollView, Share, View } from 'react-native'
import {
  CircleCheck as CircleCheckIcon,
  Lock as LockIcon,
  Users as UsersIcon,
} from 'lucide-react-native'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import OnboardingFooter, {
  STEP_BOTTOM_PADDING,
} from '@/features/onboarding/components/OnboardingFooter'
import OnboardingScrollView from '@/features/onboarding/components/OnboardingScrollView'
import BuddiesPreview from '@/features/onboarding/components/BuddiesPreview'
import { BuddyInviteError } from '@/features/buddies/lib/engine'
import {
  buddiesErrorMessage,
  buddiesFailureReason,
} from '@/features/buddies/lib/buddiesErrors'
import {
  shareInviteLink,
  startBuddiesInvite,
} from '@/features/buddies/lib/shareInvite'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import MyTextInput from '@/components/ui/TextInput'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { segmentBoldMarkup } from '@/lib/projectedTotalCopy'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'

interface Props {
  goBack: () => void
  goNext: () => void
}

const inviteFailureReason = (error: unknown) => {
  if (error instanceof BuddyInviteError) {
    if (error.reason === 'nameRequired') return 'name_required'
    if (error.reason === 'limit') return 'limit'
  }
  return buddiesFailureReason(error)
}

const Note = ({
  icon,
  color,
  text,
  children,
}: {
  icon: AppIcon
  color: string
  text: string
  children?: ReactNode
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <LucideIcon icon={icon} size={14} color={color} />
      <Text
        style={{
          flexShrink: 1,
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
        }}
      >
        {segmentBoldMarkup(text).map((segment, index) => (
          <Text
            key={index}
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: segment.bold ? theme.fonts.semiBold : undefined,
              color: segment.bold ? theme.colors.text : theme.colors.textAlt,
            }}
          >
            {segment.text}
          </Text>
        ))}
      </Text>
      {children}
    </View>
  )
}

const Buddies = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sent, setSent] = useState(false)

  const [invited, setInvited] = useState(false)

  const [unsentInviteId, setUnsentInviteId] = useState<string | null>(null)
  const mounted = useRef(true)

  const name = useProfile((state) => state.name)
  const setProfile = useProfile((state) => state.set)
  const [askName, setAskName] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  const revealNameField = () =>
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true })
    )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const markScheduleIntroCovered = usePreferences(
    (state) => state.markScheduleIntroCovered
  )
  useEffect(
    () => markScheduleIntroCovered('together'),
    [markScheduleIntroCovered]
  )

  const invite = async () => {
    if (!useProfile.getState().name.trim()) {
      setAskName(true)
      revealNameField()
      return
    }
    setWorking(true)
    setError(null)
    try {
      const { inviteId, link } = await startBuddiesInvite(unsentInviteId)
      setInvited(true)
      setUnsentInviteId(inviteId)

      if (!mounted.current) return
      const { action } = await shareInviteLink(link)
      const shared = action === Share.sharedAction
      analytics.capture('onboarding_buddies_invite_result', {
        status: shared ? 'shared' : 'dismissed',
      })
      if (shared) {
        setUnsentInviteId(null)
        setSent(true)
      }
    } catch (cause) {
      analytics.capture('onboarding_buddies_invite_result', {
        status: 'error',
        reason: inviteFailureReason(cause),
      })
      setError(buddiesErrorMessage(cause))
    } finally {
      setWorking(false)
    }
  }

  const finish = () => {
    if (!invited)
      analytics.capture('onboarding_step_skipped', { step_id: 'buddies' })
    goNext()
  }

  const buttonText = {
    fontSize: theme.fontSize('lg'),
    fontFamily: theme.fonts.bold,
  }
  const inviteLabel = (color: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {working && <ActivityIndicator color={color} />}
      <Text style={[buttonText, { color }]}>{i18n.t('buddies_invite')}</Text>
    </View>
  )
  const outline = {
    borderRadius: theme.numbers.borderRadiusSm,
    paddingVertical: 11,
    paddingHorizontal: 24,
    justifyContent: 'center' as const,
  }

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: STEP_BOTTOM_PADDING,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <OnboardingScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingVertical: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 24 }}>
          <BuddiesPreview />
        </View>
        <Text
          accessibilityRole='header'
          style={[styles.stepTitle, { fontFamily: theme.fonts.bold }]}
        >
          {i18n.t('onboardingBuddies_title')}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textAlt }]}>
          {i18n.t('onboardingBuddies_description')}
        </Text>
        <View style={{ gap: 10, marginTop: 16 }}>
          <Note
            icon={LockIcon}
            color={theme.colors.textAlt}
            text={i18n.t('onboardingBuddies_private')}
          >
            <InfoPopover
              title={i18n.t('buddies_onboardingProfileTitle')}
              description={i18n.t('onboardingBuddies_private_info')}
            />
          </Note>
          {}
          {sent ? (
            <Note
              icon={CircleCheckIcon}
              color={theme.colors.accent}
              text={i18n.t('onboardingBuddies_invited')}
            />
          ) : (
            <Note
              icon={UsersIcon}
              color={theme.colors.textAlt}
              text={i18n.t('onboardingBuddies_later')}
            />
          )}
          {askName && (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('onboardingBuddies_nameHint')}
              </Text>
              <MyTextInput
                invalid={!name.trim()}
                value={name}
                onChangeText={(value) => setProfile({ name: value })}
                placeholder={i18n.t('firstNamePlaceholder')}
                accessibilityLabel={i18n.t('firstNamePlaceholder')}
                autoCapitalize='words'
                autoCorrect={false}
                autoFocus
                maxLength={40}
                enterKeyHint='done'
                textAlign='start'
                onBlur={revealNameField}
              />
            </View>
          )}
          {!!error && (
            <Text
              accessibilityLiveRegion='polite'
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.error,
              }}
            >
              {error}
            </Text>
          )}
        </View>
      </OnboardingScrollView>
      {}
      <OnboardingFooter style={{ gap: 10 }}>
        {sent ? (
          <>
            <ActionButton onPress={finish}>{i18n.t('continue')}</ActionButton>
            <Button
              variant='outline'
              style={outline}
              disabled={working}
              onPress={invite}
            >
              {inviteLabel(theme.colors.text)}
            </Button>
          </>
        ) : (
          <>
            <ActionButton disabled={working} onPress={invite}>
              {inviteLabel(theme.colors.textInverse)}
            </ActionButton>
            <Button variant='outline' style={outline} onPress={finish}>
              <Text style={[buttonText, { color: theme.colors.text }]}>
                {i18n.t('continue')}
              </Text>
            </Button>
          </>
        )}
      </OnboardingFooter>
    </Wrapper>
  )
}

export default Buddies
