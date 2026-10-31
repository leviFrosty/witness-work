import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { UserRoundKey as UserRoundKeyIcon } from 'lucide-react-native'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import OnboardingFooter, {
  STEP_BOTTOM_PADDING,
} from '@/features/onboarding/components/OnboardingFooter'
import OnboardingScrollView from '@/features/onboarding/components/OnboardingScrollView'
import { addPasskeyWithToasts } from '@/features/settings/components/account/passkeys/passkeyActions'
import { readPasskeyOffer } from '@/app/account/passkeyOffer'
import {
  backOffPasskeyPrompt,
  stopPasskeyPrompt,
} from '@/app/account/passkeyPrompt'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'

interface Props {
  goBack: () => void
  goNext: () => void
  /** The app relaunched on this step (Android recreates it behind the sheet). */
  resumed?: boolean
}

/**
 * Offers to save a passkey once the account exists (ADR 0038 §9): a way to sign
 * in on a computer. Add a Passkey runs the same flow as Settings → Account →
 * Passkeys; Not Now moves on and holds back the later gentle prompt for 30
 * days. Only shown where passkeys work, for an account with none (see
 * `Onboarding`). A relaunch on the step asks the account again: an add may have
 * finished before the app was recreated, and then there's nothing to offer.
 */
const SavePasskey = ({ goBack, goNext, resumed = false }: Props) => {
  const theme = useTheme()
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!resumed) return
    let live = true
    void readPasskeyOffer().then((offer) => {
      if (!live || offer !== 'has_passkey') return
      stopPasskeyPrompt()
      goNext()
    })
    return () => {
      live = false
    }
  }, [resumed, goNext])

  const add = async () => {
    if (adding) return
    setAdding(true)
    const added = await addPasskeyWithToasts({
      count: 0,
      support: null,
      source: 'onboarding',
    })
    setAdding(false)
    // Adding a passkey stops the gentle prompt itself (`addPasskeyWithToasts`).
    if (added) goNext()
  }

  const notNow = () => {
    backOffPasskeyPrompt()
    analytics.capture('onboarding_step_skipped', { step_id: 'passkeys' })
    goNext()
  }

  const buttonText = {
    fontSize: theme.fontSize('lg'),
    fontFamily: theme.fonts.bold,
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
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingVertical: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ContentColumn>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.backgroundLighter,
              marginBottom: 24,
            }}
          >
            <LucideIcon
              icon={UserRoundKeyIcon}
              size={40}
              color={theme.colors.accent}
            />
          </View>
          <Text
            accessibilityRole='header'
            style={[styles.stepTitle, { fontFamily: theme.fonts.bold }]}
          >
            {i18n.t('onboardingPasskey_title')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              style={[
                styles.description,
                { color: theme.colors.textAlt, flexShrink: 1 },
              ]}
            >
              {i18n.t('onboardingPasskey_desc')}
            </Text>
            <InfoPopover
              title={i18n.t('onboardingPasskey_infoTitle')}
              description={i18n.t('onboardingPasskey_infoDesc')}
            />
          </View>
        </ContentColumn>
      </OnboardingScrollView>
      {/* Adding and skipping stay the same size and one tap away. */}
      <OnboardingFooter style={{ gap: 10 }}>
        <ContentColumn style={{ gap: 10 }}>
          <ActionButton disabled={adding} onPress={() => void add()}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              {adding && <ActivityIndicator color={theme.colors.textInverse} />}
              <Text style={[buttonText, { color: theme.colors.textInverse }]}>
                {i18n.t('passkeys_add')}
              </Text>
            </View>
          </ActionButton>
          <Button
            variant='outline'
            disabled={adding}
            style={{
              borderRadius: theme.numbers.borderRadiusSm,
              paddingVertical: 11,
              paddingHorizontal: 24,
              justifyContent: 'center',
            }}
            onPress={notNow}
          >
            <Text style={[buttonText, { color: theme.colors.text }]}>
              {i18n.t('notNow')}
            </Text>
          </Button>
        </ContentColumn>
      </OnboardingFooter>
    </Wrapper>
  )
}

export default SavePasskey
