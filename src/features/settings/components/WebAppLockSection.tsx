import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { UserRoundKey as UserRoundKeyIcon } from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import Switch from '@/components/ui/Switch'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import { appLockDelayLabel } from '@/features/settings/components/appLockDelayLabel'
import { loadPasskeys } from '@/app/account/passkeys'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { requestStepUp } from '@/lib/serverAccount/stepUpPrompt'
import {
  captureWebAppLock,
  turnOffWebAppLock,
  turnOffWebAppLockNoPasskey,
  webAppLock,
  webUnlockFailureMessage,
} from '@/lib/webAppLockRuntime'
import {
  appLockDelayFor,
  appLockDelays,
  useAppLockSettings,
} from '@/stores/appLock'
import { toast } from '@/stores/toasts'

/**
 * App Lock on the web (docs/passkeys-protocol.md, "On the web"): Require a
 * Passkey, once the account has one. Turning it on is a step-up, whose passkeys
 * this browser keeps; turning it off asks one of them, checked here, so it
 * works offline. No Face ID or passcode choices: the browser has none.
 */
export default function WebAppLockSection() {
  const { enabled, requireAfter, set } = useAppLockSettings()
  // Whether the account has a passkey; `failed` when the list can't be read.
  const [hasPasskey, setHasPasskey] = useState<boolean | 'loading' | 'failed'>(
    'loading'
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Loading them also drops the lock's removed passkeys.
    loadPasskeys()
      .then(({ passkeys }) => {
        if (!cancelled) setHasPasskey(passkeys.length > 0)
      })
      .catch((error: unknown) => {
        logger.debug('[app-lock] listing passkeys failed', error)
        if (!cancelled) setHasPasskey('failed')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const turnOn = async () => {
    const result = await requestStepUp('app_lock')
    if (result.status !== 'confirmed') return
    if (result.via !== 'passkey') {
      toast.info(i18n.t('webAppLock_needsPasskey'))
      return
    }
    const enabling = webAppLock?.enable(result)
    if (enabling?.status !== 'enabled') {
      logger.warn(`[app-lock] the device's check refused: ${enabling?.reason}`)
      toast.error(i18n.t('webAppLock_enableFailed'), {
        message: i18n.t('webAppLock_enableFailedMessage'),
      })
      return
    }
    // No Immediately on the web: 1 minute is the shortest, and the default.
    set({ enabled: true, requireAfter: appLockDelayFor(requireAfter, true) })
    captureWebAppLock(true)
  }

  const turnOff = async () => {
    const result = await webAppLock?.unlock()
    if (!result) return
    // A browser says the same for a cancel as for none of the account's
    // passkeys being here: say the lock stayed on.
    if (result.status === 'cancelled') {
      toast.info(i18n.t('webAppLock_turnOffFailed'), {
        message: i18n.t('webAppLock_turnOffStopped'),
      })
      return
    }
    if (result.status === 'unlocked') {
      turnOffWebAppLock()
      captureWebAppLock(false)
      return
    }
    // Nothing here could unlock it any more.
    if (result.status === 'noCredentials') {
      turnOffWebAppLockNoPasskey()
      return
    }
    toast.error(i18n.t('webAppLock_turnOffFailed'), {
      message: webUnlockFailureMessage(result),
    })
  }

  const toggle = async (value: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      await (value ? turnOn() : turnOff())
    } finally {
      setBusy(false)
    }
  }

  const label = i18n.t('webAppLock_require')
  const available = enabled || hasPasskey === true

  return (
    <View style={{ gap: 5 }}>
      <Section>
        <InputRowContainer
          leftIcon={UserRoundKeyIcon}
          label={label}
          info={i18n.t('webAppLock_info')}
          controlWidth='auto'
          lastInSection={!enabled}
          style={{ justifyContent: 'space-between' }}
        >
          <Switch
            accessibilityLabel={label}
            value={enabled}
            disabled={!available || busy}
            onValueChange={(value) => void toggle(value)}
            testID='web-app-lock-switch'
          />
        </InputRowContainer>
        {enabled && (
          <InputRowSelect
            label={i18n.t('appLock_requireAfter')}
            lastInSection
            selectProps={{
              data: appLockDelays(true).map((value) => ({
                value,
                label: appLockDelayLabel(value),
              })),
              value: appLockDelayFor(requireAfter, true),
              onChange: ({ value }) => {
                set({ requireAfter: value })
                captureWebAppLock(true)
              },
            }}
          />
        )}
      </Section>
      {!available && hasPasskey !== 'loading' && (
        <SectionFooter
          text={i18n.t(
            hasPasskey !== 'failed'
              ? 'webAppLock_needsPasskey'
              : typeof navigator !== 'undefined' && !navigator.onLine
                ? 'webAppLock_offline'
                : 'webAppLock_listFailed'
          )}
        />
      )}
    </View>
  )
}
