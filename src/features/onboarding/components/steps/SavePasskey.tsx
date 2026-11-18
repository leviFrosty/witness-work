import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import {
  UserRoundCheck as UserRoundCheckIcon,
  UserRoundKey as UserRoundKeyIcon,
} from 'lucide-react-native'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import OnboardingFooter, {
  STEP_BOTTOM_PADDING,
} from '@/features/onboarding/components/OnboardingFooter'
import OnboardingScrollView from '@/features/onboarding/components/OnboardingScrollView'
import {
  addPasskeyWithToasts,
  letUnlockWithToasts,
  removeWithConfirm,
} from '@/features/settings/components/account/passkeys/passkeyActions'
import PasskeyRow from '@/features/settings/components/account/passkeys/PasskeyRow'
import RenamePasskeySheet, {
  type RenamingPasskey,
} from '@/features/settings/components/account/passkeys/RenamePasskeySheet'
import { type LoadedPasskeys, loadPasskeys } from '@/app/account/passkeys'
import {
  backOffPasskeyPrompt,
  stopPasskeyPrompt,
} from '@/app/account/passkeyPrompt'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import type { Passkey } from '@/lib/serverAccount/passkeyClient'

interface Props {
  goBack: () => void
  goNext: () => void
}

let remembered: LoadedPasskeys | null = null

export const forgetRememberedPasskeys = () => {
  remembered = null
}

const SavePasskey = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const [loaded, setLoaded] = useState<LoadedPasskeys | null>(remembered)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<RenamingPasskey | null>(null)
  const mounted = useRef(true)

  const reload = async () => {
    try {
      const next = await loadPasskeys()
      remembered = next
      if (next.passkeys.length > 0) stopPasskeyPrompt()
      if (mounted.current) setLoaded(next)
    } catch (error) {
      logger.debug('[passkeys] onboarding list failed', error)
    }
  }

  useEffect(() => {
    mounted.current = true
    void reload()
    return () => {
      mounted.current = false
    }
  }, [])

  const passkeys = loaded?.passkeys ?? []
  const added = loaded != null && passkeys.length > 0

  const run = async (action: () => Promise<boolean>) => {
    if (busy) return false
    setBusy(true)
    try {
      return await action()
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const add = async () => {
    const saved = await run(() =>
      addPasskeyWithToasts({
        count: passkeys.length,
        support: null,
        source: 'onboarding',
      })
    )
    if (!saved) return
    void reload()
    goNext()
  }

  const change = (action: () => Promise<unknown>) =>
    void run(async () => {
      await action()
      await reload()
      return true
    })

  const remove = (passkey: Passkey) =>
    change(() => removeWithConfirm(passkey, passkeys))

  const letUnlock = (passkey: Passkey) =>
    change(() => letUnlockWithToasts(passkey))

  const rename = (passkey: Passkey) => {
    if (busy || !loaded) return
    setRenaming({
      credentialId: passkey.credentialId,
      name: loaded.readName(passkey.credentialId, passkey.name),
    })
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
              icon={added ? UserRoundCheckIcon : UserRoundKeyIcon}
              size={40}
              color={theme.colors.accent}
            />
          </View>
          <Text
            accessibilityRole='header'
            style={[styles.stepTitle, { fontFamily: theme.fonts.bold }]}
          >
            {i18n.t(
              added ? 'onboardingPasskey_addedTitle' : 'onboardingPasskey_title'
            )}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              style={[
                styles.description,
                { color: theme.colors.textAlt, flexShrink: 1 },
              ]}
            >
              {i18n.t(
                added ? 'onboardingPasskey_addedDesc' : 'onboardingPasskey_desc'
              )}
            </Text>
            <InfoPopover
              title={i18n.t('onboardingPasskey_infoTitle')}
              description={i18n.t('onboardingPasskey_infoDesc')}
            />
          </View>
          {added && (
            <View style={{ marginTop: 24, gap: 5 }}>
              <Section>
                {passkeys.map((passkey, index) => (
                  <PasskeyRow
                    key={passkey.credentialId}
                    passkey={passkey}
                    name={loaded.name}
                    customName={loaded.readName(
                      passkey.credentialId,
                      passkey.name
                    )}
                    readLabel={loaded.readLabel}
                    disabled={busy}
                    lastInSection={index === passkeys.length - 1}
                    onLetUnlock={() => letUnlock(passkey)}
                    onRename={() => rename(passkey)}
                    onRemove={() => remove(passkey)}
                  />
                ))}
              </Section>
            </View>
          )}
        </ContentColumn>
      </OnboardingScrollView>
      {}
      <OnboardingFooter style={{ gap: 10 }}>
        <ContentColumn style={{ gap: 10 }}>
          {added ? (
            <ActionButton disabled={busy} onPress={goNext}>
              <Text style={[buttonText, { color: theme.colors.textInverse }]}>
                {i18n.t('continue')}
              </Text>
            </ActionButton>
          ) : (
            <>
              <ActionButton disabled={busy} onPress={() => void add()}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {busy && (
                    <ActivityIndicator color={theme.colors.textInverse} />
                  )}
                  <Text
                    style={[buttonText, { color: theme.colors.textInverse }]}
                  >
                    {i18n.t('passkeys_add')}
                  </Text>
                </View>
              </ActionButton>
              <Button
                variant='outline'
                disabled={busy}
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
            </>
          )}
        </ContentColumn>
      </OnboardingFooter>
      <RenamePasskeySheet
        passkey={renaming}
        accountName={loaded?.name ?? null}
        onClosed={(renamed) => {
          setRenaming(null)
          if (renamed) void reload()
        }}
      />
    </Wrapper>
  )
}

export default SavePasskey
