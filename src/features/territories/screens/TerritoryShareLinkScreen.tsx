import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Copy as CopyIcon,
  Share as ShareIcon,
  Timer as TimerIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import Section from '@/components/ui/inputs/Section'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import confirmDestructive from '@/lib/confirmDestructive'
import { formatDateTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { shareUrl } from '@/lib/share'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import GuestLinkQrCard from '@/features/territories/components/sharing/GuestLinkQrCard'
import useDoorRecordPrivacy from '@/features/territories/hooks/useDoorRecordPrivacy'
import {
  guestLinkDaysLabel,
  linkEndsText,
  linkHeading,
  timeLeftText,
} from '@/features/territories/lib/shareText'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import {
  GUEST_LINK_DAYS,
  type GuestLinkDays,
  guestLinkDays,
  guestLinkLifetimeMs,
  linkDaysLeft,
} from '@/features/territories/lib/linkLifetime'
import { isShareLive } from '@/features/territories/lib/sharing'
import { territoryTitle } from '@/features/territories/lib/territoryTitle'
import { useTerritory } from '@/features/territories/stores/territories'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryShareLink'>

export default function TerritoryShareLinkScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId, shareId, streetIds } = route.params
  const territory = useTerritory(territoryId)
  const { actions } = useTerritorySharing()
  const privacy = useDoorRecordPrivacy()
  const { now } = useNow()
  const days = guestLinkDays(
    usePreferences((state) => state.territoryGuestLinkDays)
  )
  const share = territory?.shares?.find((entry) => entry.id === shareId)
  const [made, setMade] = useState<{ linkId: string; url: string } | null>(null)
  const [shown, setShown] = useState<{ linkId: string; url: string } | null>(
    null
  )
  const [creating, setCreating] = useState(false)
  const [changing, setChanging] = useState(false)
  const [unreadable, setUnreadable] = useState<string | null>(null)

  useEffect(() => {
    if (!shareId || made?.linkId === shareId) return
    let current = true
    void actions.linkUrl(territoryId, shareId).then((found) => {
      if (!current) return
      if (found) setShown({ linkId: shareId, url: found })
      else setUnreadable(shareId)
    })
    return () => {
      current = false
    }
  }, [actions, made, shareId, territoryId])

  if (!territory || (shareId && !share)) return null

  const url =
    (made?.linkId === shareId ? made?.url : undefined) ??
    (shown?.linkId === shareId ? shown?.url : undefined)
  const live = !!share && isShareLive(share, Math.max(now, Date.now()))
  const heading = linkHeading(territory, share ?? { streetIds })
  const guests = (territory.people ?? []).filter(
    (person) => !!share && person.shareId === share.id
  )
  const caption = i18n.t(
    privacy ? 'territories.share.guestCanPrivacy' : 'territories.share.guestCan'
  )

  const create = async () => {
    setCreating(true)
    const created = await actions.createLink(
      territoryId,
      streetIds,
      guestLinkLifetimeMs(days)
    )
    setCreating(false)
    if (!created) return
    setMade(created)
    navigation.setParams({ shareId: created.linkId, streetIds: undefined })
  }

  const action = (
    icon: AppIcon,
    label: string,
    onPress: () => void,
    testID: string,
    filled: boolean
  ) => (
    <Button
      onPress={onPress}
      testID={testID}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 52,
        paddingHorizontal: 16,
        borderRadius: 26,
        backgroundColor: filled ? theme.colors.accent : theme.colors.card,
      }}
    >
      <LucideIcon
        icon={icon}
        size={20}
        color={filled ? theme.colors.textInverse : theme.colors.accent}
      />
      <Text
        style={{
          fontFamily: theme.fonts.bold,
          fontSize: theme.fontSize('md'),
          color: filled ? theme.colors.textInverse : theme.colors.text,
        }}
      >
        {label}
      </Text>
    </Button>
  )

  const changeLasts = (picked: GuestLinkDays) => {
    usePreferences.getState().set({ territoryGuestLinkDays: picked })
    if (!shareId || changing) return
    setChanging(true)
    void actions
      .setLinkLifetime(territoryId, shareId, guestLinkLifetimeMs(picked))
      .then((changed) => {
        setChanging(false)
        if (changed)
          toast.success(
            i18n.t('territories.share.lastsChanged_toast', {
              time: formatDateTime(Date.now() + guestLinkLifetimeMs(picked), {
                style: 'medium',
              }),
            })
          )
      })
  }

  const note = (text: string, testID?: string) => (
    <Text
      testID={testID}
      style={{
        color: theme.colors.textAlt,
        fontSize: theme.fontSize('sm'),
        textAlign: 'center',
        paddingHorizontal: 10,
      }}
    >
      {text}
    </Text>
  )

  const endNow = () =>
    confirmDestructive({
      title: i18n.t('territories.share.endLink_title'),
      description: i18n.t('territories.share.endLink_description'),
      confirmLabel: i18n.t('territories.share.endLink'),
      onConfirm: () => {
        if (!shareId) return
        void actions.endLink(territoryId, shareId).then((ended) => {
          if (ended) toast.success(i18n.t('territories.share.endLink_toast'))
        })
      },
    })

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        noInsets
        buttonType='back'
        title={i18n.t('territories.share.guestLinkTitle')}
      />
      <ScrollView>
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 30,
            gap: 20,
          }}
        >
          <View style={{ gap: 4, paddingHorizontal: 5 }}>
            <Text
              style={{
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('xl'),
              }}
            >
              {heading}
            </Text>
            {share && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 6,
                }}
              >
                <LucideIcon
                  icon={TimerIcon}
                  size={16}
                  color={live ? theme.colors.accent : theme.colors.textAlt}
                />
                <Text
                  testID='guest-link-time-left'
                  style={{
                    flex: 1,
                    fontFamily: theme.fonts.semiBold,
                    color: live ? theme.colors.text : theme.colors.textAlt,
                  }}
                >
                  {live
                    ? `${timeLeftText(share, now)} · ${linkEndsText(share)}`
                    : i18n.t('territories.share.linkEndedOn', {
                        time: linkEndsText(share),
                      })}
                </Text>
              </View>
            )}
          </View>

          {!share ? (
            <>
              <Text
                testID='guest-link-caption'
                style={{ color: theme.colors.textAlt, paddingHorizontal: 5 }}
              >
                {caption}
              </Text>
              <ActionButton
                testID='guest-link-create'
                submitShortcut={false}
                disabled={creating}
                loading={creating}
                onPress={() => void create()}
              >
                {i18n.t('territories.share.createLink')}
              </ActionButton>
            </>
          ) : live && shareId && !url && unreadable === shareId ? (
            note(
              i18n.t('territories.share.startFailed_toast'),
              'guest-link-unreadable'
            )
          ) : live && shareId && !url ? (
            <ActivityIndicator
              testID='guest-link-loading'
              color={theme.colors.textAlt}
            />
          ) : live && shareId && url ? (
            <>
              <GuestLinkQrCard url={url} caption={caption} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {action(
                  CopyIcon,
                  i18n.t('copy'),
                  () => {
                    void Clipboard.setStringAsync(url)
                    toast.success(i18n.t('linkCopied'))
                  },
                  'guest-link-copy',
                  false
                )}
                {action(
                  ShareIcon,
                  i18n.t('share'),
                  () =>
                    void shareUrl(
                      url,
                      i18n.t('territories.share.guestLinkShareTitle', {
                        territory: territoryTitle(territory),
                      })
                    ),
                  'guest-link-share',
                  true
                )}
              </View>
              <Section>
                <InputRowSelect
                  key={String(linkDaysLeft(share.expiresAt, now))}
                  label={i18n.t('territories.share.lastsTitle')}
                  lastInSection
                  selectProps={{
                    data: GUEST_LINK_DAYS.map((option) => ({
                      label: guestLinkDaysLabel(option),
                      value: option,
                    })),
                    value: linkDaysLeft(share.expiresAt, now),
                    placeholder: timeLeftText(share, now),
                    onChange: (item) => changeLasts(item.value),
                  }}
                />
              </Section>
              {guests.length > 0 &&
                note(
                  i18n.t('territories.share.guestsJoined', {
                    names: guests.map((guest) => guest.name).join(', '),
                  }),
                  'guest-link-joined'
                )}
              <Button
                testID='guest-link-end'
                onPress={endNow}
                style={{
                  alignSelf: 'center',
                  minHeight: 44,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.error,
                  }}
                >
                  {i18n.t('territories.share.endLink')}
                </Text>
              </Button>
            </>
          ) : (
            note(i18n.t('territories.share.linkEnded_description'))
          )}
        </ContentColumn>
      </ScrollView>
    </View>
  )
}
