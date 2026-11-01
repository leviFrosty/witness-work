import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import {
  Check as CheckIcon,
  ShieldCheck as ShieldCheckIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { platformSyncKey } from '@/lib/syncCopy'
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

  const row = (
    value: SyncOption,
    label: string,
    sublabel: string | undefined,
    last = false
  ) => (
    <InputRowButton
      key={value}
      label={label}
      sublabel={sublabel}
      onPress={() => onSelect(value)}
      disabled={busy !== null}
      lastInSection={last}
    >
      {busy === value ? (
        <ActivityIndicator size='small' color={theme.colors.textAlt} />
      ) : option === value ? (
        <LucideIcon icon={CheckIcon} size={20} color={theme.colors.accent} />
      ) : null}
    </InputRowButton>
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

      <View
        style={{
          paddingHorizontal: inputLayout.horizontalPadding,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('syncOption_title')}
        </Text>
        <InfoPopover
          title={i18n.t('syncOption_title')}
          description={i18n.t(platformSyncKey('syncOption_info'))}
        />
      </View>
      <Section>
        {row('cloud', i18n.t('cloudSync'), i18n.t('syncOption_cloudSublabel'))}
        {row(
          'platform',
          i18n.t(platformSyncKey('iCloudSync')),
          i18n.t(platformSyncKey('syncOption_platformSublabel'))
        )}
        {row('off', i18n.t('syncOption_off'), undefined, true)}
      </Section>
      <View style={{ paddingHorizontal: inputLayout.horizontalPadding }}>
        <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
          {i18n.t(
            option === 'cloud'
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
