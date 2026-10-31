import { Platform, View } from 'react-native'
import {
  Fingerprint as FingerprintIcon,
  KeyRound as KeyRoundIcon,
  LockKeyhole as LockKeyholeIcon,
  MonitorSmartphone as MonitorSmartphoneIcon,
  TriangleAlert as TriangleAlertIcon,
  Users as UsersIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/**
 * Change Account Key's first screen: what changes, the Apple Account note on
 * iOS (ADR 0039 §8), the passkey a browser confirms with (§2), and the devices
 * too old to sign back in (§10).
 */
export default function KeyChangeIntro({
  tooOld,
  ownerFailed,
  onStart,
}: {
  /** Other devices' names whose app can't sign back in; `unknown` unread. */
  tooOld: string[] | 'unknown'
  ownerFailed: boolean
  onStart: () => void
}) {
  const theme = useTheme()
  const point = (icon: AppIcon, text: string) => (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <LucideIcon icon={icon} size={20} color={theme.colors.accent} />
      <Text style={{ flex: 1 }}>{text}</Text>
    </View>
  )
  const notice = (title: string | null, body: string, names?: string[]) => (
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
      <View style={{ flex: 1, gap: 4 }}>
        {title && (
          <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
        )}
        <Text>{body}</Text>
        {names?.map((name) => (
          <Text key={name} style={{ fontFamily: theme.fonts.semiBold }}>
            {`• ${name}`}
          </Text>
        ))}
      </View>
    </View>
  )

  return (
    <View style={{ gap: 20 }} testID='key-change-intro'>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <LucideIcon icon={KeyRoundIcon} size={44} color={theme.colors.accent} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            accessibilityRole='header'
            style={{
              flexShrink: 1,
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
              textAlign: 'center',
            }}
          >
            {i18n.t('accountKeyChange_introTitle')}
          </Text>
          <InfoPopover
            title={i18n.t('accountKeyChange_row')}
            description={i18n.t('accountKeyChange_info')}
          />
        </View>
        <Text style={{ textAlign: 'center' }}>
          {i18n.t('accountKeyChange_introBody')}
        </Text>
      </View>
      <View style={{ gap: 14 }}>
        {point(MonitorSmartphoneIcon, i18n.t('accountKeyChange_pointDevices'))}
        {point(UsersIcon, i18n.t('accountKeyChange_pointBuddies'))}
        {point(LockKeyholeIcon, i18n.t('accountKeyChange_pointData'))}
        {Platform.OS === 'web' &&
          point(FingerprintIcon, i18n.t('accountKeyChange_pointPasskeyWeb'))}
      </View>
      {Platform.OS === 'ios' &&
        notice(null, i18n.t('accountKeyChange_appleNote'))}
      {tooOld === 'unknown'
        ? notice(null, i18n.t('accountKeyChange_tooOldUnknown'))
        : tooOld.length > 0 &&
          notice(
            i18n.t('accountKeyChange_tooOldTitle'),
            i18n.t('accountKeyChange_tooOldBody'),
            tooOld
          )}
      {ownerFailed && (
        <Text
          accessibilityLiveRegion='polite'
          style={{ color: theme.colors.error, textAlign: 'center' }}
        >
          {i18n.t('accountKeyChange_unlockFailed')}
        </Text>
      )}
      <ActionButton onPress={onStart} testID='key-change-start'>
        {i18n.t('accountKeyChange_start')}
      </ActionButton>
    </View>
  )
}
