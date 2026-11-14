import { type ReactNode, useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import {
  Check as CheckIcon,
  Cloud as CloudIcon,
  CloudOff as CloudOffIcon,
  HardDrive as HardDriveIcon,
  ShieldCheck as ShieldCheckIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { platformSyncKey } from '@/lib/syncCopy'
import { cloudSyncOnly } from '@/lib/syncTransport/platform'
import { usesGoogleDriveSync } from '@/lib/syncTransport'
import type { SyncOption } from '@/app/sync/syncOption'

export default function SyncOptionSection({
  option,
  busy,
  onSelect,
  onSwitchFromOffer,
  offer,
  onDismissOffer,
  otherDevicesSignedIn,
}: {
  option: SyncOption

  busy: SyncOption | null
  onSelect: (option: SyncOption) => void

  onSwitchFromOffer: () => void

  offer: boolean
  onDismissOffer: () => void

  otherDevicesSignedIn: boolean | null
}) {
  const theme = useTheme()
  const web = cloudSyncOnly()

  const row = ({
    value,
    label,
    icon,
    iconColor,
    sublabel,
    footnote,
    last = false,
  }: {
    value: SyncOption
    label: string
    icon: AppIcon
    iconColor?: string
    sublabel?: string
    footnote?: ReactNode
    last?: boolean
  }) => (
    <InputRowButton
      key={value}
      label={label}
      leftIcon={icon}
      leftIconColor={iconColor}
      sublabel={sublabel}
      footnote={footnote}
      onPress={() => onSelect(value)}
      disabled={busy !== null}
      checked={option === value}
      lastInSection={last}
      testID={`sync-option-${value}`}
    >
      {busy === value ? (
        <ActivityIndicator size='small' color={theme.colors.textAlt} />
      ) : option === value ? (
        <LucideIcon icon={CheckIcon} size={20} color={theme.colors.accent} />
      ) : null}
    </InputRowButton>
  )

  const cloudFootnote = (
    <Text
      style={{ fontSize: theme.fontSize('xs'), color: theme.colors.textAlt }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.accent,
        }}
      >
        {i18n.t('syncOption_cloudEncrypted')}
      </Text>
      {' · '}
      {i18n.t(web ? 'syncOption_cloudDevicesWeb' : 'syncOption_cloudDevices')}
    </Text>
  )

  return (
    <View style={{ gap: 12 }}>
      {offer && (
        <Card style={{ gap: 10 }} testID='cloud-sync-offer'>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LucideIcon
              icon={ShieldCheckIcon}
              size={20}
              color={theme.colors.accent}
            />
            <Text
              style={{
                flexShrink: 1,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {i18n.t('cloudSyncOffer_title')}
            </Text>
          </View>
          <Text style={{ color: theme.colors.text }}>
            {i18n.t(platformSyncKey('cloudSyncOffer_body'))}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <ActionButton
              size='md'
              onPress={onSwitchFromOffer}
              disabled={busy !== null}
              loading={busy === 'cloud'}
              testID='cloud-sync-offer-switch'
            >
              {i18n.t('cloudSyncOffer_switch')}
            </ActionButton>
            <Button
              onPress={onDismissOffer}
              disabled={busy !== null}
              testID='cloud-sync-offer-dismiss'
              style={{
                paddingVertical: 12,
                paddingHorizontal: 20,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.colors.accent }}>
                {i18n.t('notNow')}
              </Text>
            </Button>
          </View>
        </Card>
      )}

      <Text
        accessibilityRole='header'
        style={{
          paddingHorizontal: inputLayout.horizontalPadding,
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
        }}
      >
        {i18n.t('syncOption_title')}
      </Text>
      <Section>
        {row({
          value: 'cloud',
          label: i18n.t('cloudSync'),
          icon: ShieldCheckIcon,
          iconColor: theme.colors.accent,
          footnote: cloudFootnote,
          last: web,
        })}
        {!web &&
          row({
            value: 'platform',
            label: i18n.t(platformSyncKey('syncOption_platformLabel')),
            icon: usesGoogleDriveSync() ? HardDriveIcon : CloudIcon,
            sublabel: i18n.t(platformSyncKey('syncOption_platformSublabel')),
          })}
        {!web &&
          row({
            value: 'off',
            label: i18n.t('syncOption_off'),
            icon: CloudOffIcon,
            last: true,
          })}
      </Section>
      <View style={{ paddingHorizontal: inputLayout.horizontalPadding }}>
        <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
          {i18n.t(
            web
              ? 'syncOption_cloudFooterWeb'
              : option === 'cloud'
                ? 'syncOption_cloudFooter'
                : option === 'platform'
                  ? otherDevicesSignedIn
                    ? platformSyncKey('syncOption_platformFooterMixed')
                    : platformSyncKey('syncOption_platformFooter')
                  : platformSyncKey('syncOption_security')
          )}
        </Text>
      </View>
    </View>
  )
}

export function useOtherDevicesSignedIn(
  read: () => Promise<boolean>
): boolean | null {
  const [value, setValue] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    read()
      .then((next) => {
        if (live) setValue(next)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [read])
  return value
}
