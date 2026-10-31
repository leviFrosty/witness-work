import { Share, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { toast } from '@/stores/toasts'
import {
  Copy as CopyIcon,
  Share as ShareIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import Sheet from '@/components/ui/Sheet'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { RECOVERY_KEY_FONT } from '@/features/settings/components/account/recoveryKeyFont'

/** `WW1` and the eleven groups, three to a line. */
function lines(recoveryKey: string): string[] {
  const parts = recoveryKey.split('-')
  const out: string[] = []
  for (let i = 0; i < parts.length; i += 3)
    out.push(parts.slice(i, i + 3).join('  '))
  return out
}

type Props = {
  open: boolean
  /** Kept until the sheet has closed, so it doesn't empty on its way out. */
  recoveryKey: string | null
  onClose: () => void
  onClosed: () => void
}

/**
 * The recovery key, shown only after the device's own authentication: grouped
 * and monospaced to copy by hand, with Copy and Share, and a warning that
 * whoever has it has the account.
 */
export default function RecoveryKeySheet({
  open,
  recoveryKey,
  onClose,
  onClosed,
}: Props) {
  const theme = useTheme()
  return (
    <Sheet
      open={open && recoveryKey !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      onClosed={onClosed}
      backgroundColor={theme.colors.card}
      testID='recovery-key-sheet'
    >
      {recoveryKey && <RecoveryKeyContent recoveryKey={recoveryKey} />}
    </Sheet>
  )
}

/** The key with Copy and Share; also Change Account Key's new key. */
export function RecoveryKeyContent({
  recoveryKey,
  title = i18n.t('account_recoveryKeyTitle'),
  padding = 20,
}: {
  recoveryKey: string
  title?: string
  padding?: number
}) {
  const theme = useTheme()

  const copy = async () => {
    await Clipboard.setStringAsync(recoveryKey)
    analytics.capture('recovery_key_exported', { method: 'copy' })
    toast.success(i18n.t('account_recoveryKeyCopied'))
  }

  const share = async () => {
    try {
      const result = await Share.share({ message: recoveryKey })
      if (result.action === Share.sharedAction)
        analytics.capture('recovery_key_exported', { method: 'share' })
    } catch (error) {
      logger.warn('Sharing the recovery key failed', error)
    }
  }

  const action = (
    label: string,
    icon: typeof CopyIcon,
    onPress: () => unknown,
    testID: string
  ) => (
    <Button
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={label}
      testID={testID}
      style={{
        flex: 1,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.accentTranslucent,
      }}
    >
      <LucideIcon icon={icon} size={18} color={theme.colors.accent} />
      <Text
        style={{ fontFamily: theme.fonts.semiBold, color: theme.colors.accent }}
      >
        {label}
      </Text>
    </Button>
  )

  return (
    <View style={{ padding, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          accessibilityRole='header'
          style={{
            flexShrink: 1,
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {title}
        </Text>
        <InfoPopover
          title={i18n.t('account_recoveryKeyTitle')}
          description={i18n.t('account_recoveryKeyInfo')}
        />
      </View>
      <View
        style={{
          paddingVertical: 16,
          paddingHorizontal: 12,
          borderRadius: theme.numbers.borderRadiusMd,
          backgroundColor: theme.colors.backgroundLighter,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
        }}
      >
        <Text
          selectable
          testID='recovery-key'
          accessibilityLabel={i18n.t('account_recoveryKeyLabel', {
            key: recoveryKey.split('').join(' '),
          })}
          style={{
            fontFamily: RECOVERY_KEY_FONT,
            fontSize: theme.fontSize('lg'),
            lineHeight: theme.fontSize('lg') * 1.6,
            // The key is Latin letters and digits in every language, so the
            // spacing can't break Arabic joining.
            // eslint-disable-next-line no-restricted-syntax
            letterSpacing: 1,
            textAlign: 'center',
            color: theme.colors.text,
          }}
        >
          {lines(recoveryKey).join('\n')}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          padding: 12,
          borderRadius: theme.numbers.borderRadiusSm,
          backgroundColor: theme.colors.warnTranslucent,
        }}
      >
        <LucideIcon
          icon={TriangleAlertIcon}
          size={18}
          color={theme.colors.warnText}
        />
        <Text style={{ flex: 1, color: theme.colors.text }}>
          {i18n.t('account_recoveryKeyWarning')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {action(i18n.t('copy'), CopyIcon, copy, 'recovery-key-copy')}
        {action(i18n.t('share'), ShareIcon, share, 'recovery-key-share')}
      </View>
    </View>
  )
}
