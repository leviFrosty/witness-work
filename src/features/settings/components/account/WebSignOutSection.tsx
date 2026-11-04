import { useState } from 'react'
import { View } from 'react-native'
import { LogOutIcon } from '@/components/ui/DirectionalIcon'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { webAccount } from '@/lib/serverAccount'
import { confirmWebSignOut } from '@/app/web-sign-in/confirmWebSignOut'

/**
 * The web's Sign Out (docs/passkeys-protocol.md, "On the web"): closes the
 * session, then erases the account key, the session and every local store in
 * this browser. Unsynced changes go with them, so it asks first.
 */
export default function WebSignOutSection() {
  const theme = useTheme()
  const [signingOut, setSigningOut] = useState(false)
  if (!webAccount) return null

  const confirm = () =>
    confirmWebSignOut({
      onStarted: () => setSigningOut(true),
      onFailed: () => setSigningOut(false),
    })

  return (
    <View style={{ gap: 5 }}>
      <SectionTitle text={i18n.t('webSignOut_section')} alignWithIcons />
      <Section>
        <InputRowButton
          leftIcon={LogOutIcon}
          label={i18n.t('webSignOut_button')}
          onPress={confirm}
          disabled={signingOut}
          leftIconColor={theme.colors.error}
          lastInSection
        />
      </Section>
      <SectionFooter text={i18n.t('webSignOut_footer')} />
    </View>
  )
}
