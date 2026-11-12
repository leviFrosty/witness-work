import { View } from 'react-native'
import { Link as LinkIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { inputLayout, RowSeparator } from '@/components/ui/inputs/InputLayout'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import TerritoryPersonAvatar from '@/features/territories/components/sharing/TerritoryPersonAvatar'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import useTerritorySharing from '@/features/territories/hooks/useTerritorySharing'
import {
  shareScopeText,
  timeLeftText,
} from '@/features/territories/lib/shareText'
import {
  liveShares,
  personById,
  sharedWithPeople,
} from '@/features/territories/lib/sharing'
import type {
  Territory,
  TerritoryShare,
} from '@/features/territories/types/territory'

export default function TerritorySharedWithSection({
  territory,
  onOpenLink,
}: {
  territory: Territory
  onOpenLink: (shareId: string) => void
}) {
  const theme = useTheme()
  const now = Math.max(useNow().now, Date.now())
  const { buddies, actions } = useTerritorySharing()
  const me = territory.shared?.me
  const owner = !territory.received
  const mine = (share: TerritoryShare) =>
    owner || share.by === undefined || share.by === me
  const people = sharedWithPeople(territory, now)
    .map(({ person, shares }) => ({ person, shares: shares.filter(mine) }))
    .filter(({ shares }) => shares.length > 0)
  const links = liveShares(territory, now).filter(
    (share) => share.kind === 'link' && mine(share)
  )
  const sharedBy = (share: TerritoryShare) =>
    share.by !== undefined && share.by !== me
      ? personById(territory, share.by)?.name
      : undefined
  const scopeLine = (share: TerritoryShare) => {
    const scope = shareScopeText(territory, share)
    const by = sharedBy(share)
    const line = share.pending
      ? i18n.t('territories.share.invitedScope', { scope })
      : scope
    return by
      ? i18n.t('territories.share.sharedByLine', { line, name: by })
      : line
  }
  if (people.length === 0 && links.length === 0) return null
  const total = people.length + links.length

  const stop = (personId: string, name: string) =>
    confirmDestructive({
      title: i18n.t('territories.share.stopSharing_title', { name }),
      description: i18n.t('territories.share.stopSharing_description'),
      confirmLabel: i18n.t('territories.share.stopSharing'),
      onConfirm: () =>
        void actions.stopSharing(territory.id, personId).then((stopped) => {
          if (stopped)
            toast.success(
              i18n.t('territories.share.stopSharing_toast', { name })
            )
        }),
    })

  const sub = {
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('sm'),
  }
  const row = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: inputLayout.labelGap,
    minHeight: inputLayout.rowMinHeight,
    paddingVertical: 10,
    paddingStart: inputLayout.horizontalPadding,
  }

  return (
    <View style={{ gap: 8 }} testID='territory-shared-with'>
      <TerritorySectionTitle>
        {i18n.t('territories.share.sharedWith')}
      </TerritorySectionTitle>
      <Section>
        {people.map(({ person, shares }, index) => {
          const buddy = buddies.find(
            (entry) => entry.inboxId === person.inboxId
          )
          const label = i18n.t('territories.share.stopSharing_title', {
            name: person.name,
          })
          return (
            <View key={person.id}>
              <View style={{ ...row, paddingEnd: 4 }}>
                <TerritoryPersonAvatar
                  name={person.name}
                  avatar={buddy?.avatar}
                  color={buddy?.color}
                  size={36}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: theme.fonts.semiBold }}>
                    {person.name}
                  </Text>
                  <Text style={sub}>{shares.map(scopeLine).join(', ')}</Text>
                </View>
                <Button
                  onPress={() => stop(person.id, person.name)}
                  accessibilityLabel={label}
                  testID={`territory-stop-sharing-${person.name}`}
                  style={{
                    minHeight: 44,
                    minWidth: 44,
                    paddingHorizontal: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.error,
                    }}
                  >
                    {i18n.t('territories.share.stop')}
                  </Text>
                </Button>
              </View>
              {index < total - 1 && <RowSeparator />}
            </View>
          )
        })}
        {links.map((share, index) => (
          <View key={share.id}>
            <Button
              noTransform
              onPress={() => onOpenLink(share.id)}
              testID={`territory-guest-link-${share.id}`}
              style={{ ...row, paddingEnd: inputLayout.horizontalPadding }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.accentTranslucent,
                }}
              >
                <LucideIcon
                  icon={LinkIcon}
                  size={18}
                  color={theme.colors.accent}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {i18n.t('territories.share.guestLinkRow')}
                </Text>
                <Text style={sub}>
                  {[
                    i18n.t('territories.share.guestLinkRow_detail', {
                      streets: shareScopeText(territory, share),
                      left: timeLeftText(share, now),
                    }),
                    sharedBy(share),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <LucideIcon
                icon={ChevronForwardIcon}
                size={14}
                color={theme.colors.textAlt}
              />
            </Button>
            {people.length + index < total - 1 && <RowSeparator />}
          </View>
        ))}
      </Section>
    </View>
  )
}
