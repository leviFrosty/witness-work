import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { CircleCheck as CircleCheckIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { useCardStyle } from '@/components/ui/Card'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { findGuestStreets } from '@/features/territories/lib/guestStreets'
import { joinNames, personName } from '@/features/territories/lib/shareText'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

type Status = { text: string; started: boolean }

export function guestStreetStatus(
  street: TerritoryStreet,
  territory: Pick<Territory, 'people'>,
  ownerName: string,
  guestId?: string
): Status {
  if (street.workedAt !== undefined)
    return { text: i18n.t('territories.guest.streetWorked'), started: true }
  const doors = street.doors.filter((door) => door.outcome !== 'doNotCall')
  if (doors.length === 0) return { text: '', started: false }
  const names = [
    ...new Set(
      doors
        .map((door) =>
          door.by === undefined
            ? ownerName
            : door.by === guestId
              ? i18n.t('territories.guest.you')
              : personName(territory, door.by)
        )
        .filter(Boolean)
    ),
  ]
  return {
    started: true,
    text:
      names.length > 0
        ? i18n.t('territories.guest.streetRecordedBy', {
            count: doors.length,
            names: joinNames(names),
          })
        : i18n.t('territories.guest.streetRecorded', { count: doors.length }),
  }
}

export function GuestStreetRows({ children }: { children: ReactNode }) {
  const card = useCardStyle()
  return <View style={{ ...card, overflow: 'hidden' }}>{children}</View>
}

export function GuestStreetRow({
  name,
  status,
  strong,
  first,
  here = false,
  trailing,
  testID,
  onPress,
}: {
  name: string
  status: string
  strong: boolean
  first: boolean
  here?: boolean
  trailing: ReactNode
  testID: string
  onPress?: () => void
}) {
  const theme = useTheme()
  const Row = onPress ? Button : View
  return (
    <Row
      testID={testID}
      {...(onPress ? { onPress, accessibilityState: { selected: here } } : {})}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 60,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderTopWidth: first ? 0 : 1,
        borderColor: theme.colors.border,
        backgroundColor: here ? theme.colors.accentTranslucent : undefined,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
          }}
        >
          {name}
        </Text>
        {!!status && (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: strong ? theme.fonts.semiBold : theme.fonts.regular,
              color: strong ? theme.colors.accent3 : theme.colors.textAlt,
            }}
          >
            {status}
          </Text>
        )}
      </View>
      {trailing}
    </Row>
  )
}

export const GUEST_STREET_SEARCH_FROM = 10

export function GuestStreetSearch({
  value,
  onChange,
  onSheet = false,
}: {
  value: string
  onChange: (value: string) => void
  onSheet?: boolean
}) {
  const theme = useTheme()
  return (
    <TextInput
      testID='guest-street-search'
      textAlign='start'
      value={value}
      onChangeText={onChange}
      placeholder={i18n.t('territories.guest.findStreet')}
      accessibilityLabel={i18n.t('territories.guest.findStreet')}
      autoCorrect={false}
      returnKeyType='search'
      style={{
        backgroundColor: onSheet
          ? theme.colors.backgroundLighter
          : theme.colors.card,
      }}
    />
  )
}

export default function GuestStreetList({
  streets,
  territory,
  ownerName,
  guestId,
  currentId,
  heading = true,
  onPick,
}: {
  streets: TerritoryStreet[]
  territory: Pick<Territory, 'people'>
  ownerName: string
  guestId?: string
  currentId?: string | null
  heading?: boolean
  onPick: (streetId: string) => void
}) {
  const theme = useTheme()
  const [query, setQuery] = useState('')
  const rows = findGuestStreets(streets, query)
    .map((street) => ({
      street,
      status: guestStreetStatus(street, territory, ownerName, guestId),
    }))
    .sort(
      (a, b) =>
        Number(b.street.id === currentId) - Number(a.street.id === currentId)
    )
  const active = rows.filter(
    ({ street, status }) => status.started || street.id === currentId
  )
  const rest = rows.filter((row) => !active.includes(row))

  const title = (text: string) => (
    <Text
      accessibilityRole='header'
      style={{
        fontFamily: theme.fonts.semiBold,
        color: theme.colors.textAlt,
        paddingHorizontal: 5,
        marginTop: 6,
      }}
    >
      {text}
    </Text>
  )

  const group = (entries: typeof rows) => (
    <GuestStreetRows>
      {entries.map(({ street, status }, index) => {
        const worked = street.workedAt !== undefined
        const here = street.id === currentId
        return (
          <GuestStreetRow
            key={street.id}
            testID={`guest-street-${street.id}`}
            name={street.name}
            status={
              here
                ? [i18n.t('territories.guest.youAreHere'), status.text]
                    .filter(Boolean)
                    .join(' · ')
                : status.text
            }
            strong={status.started || here}
            first={index === 0}
            here={here}
            onPress={() => onPick(street.id)}
            trailing={
              <LucideIcon
                icon={worked ? CircleCheckIcon : ChevronForwardIcon}
                size={worked ? 24 : 18}
                color={worked ? theme.colors.accent : theme.colors.textAlt}
              />
            }
          />
        )
      })}
    </GuestStreetRows>
  )

  return (
    <View style={{ gap: 10 }} testID='guest-street-list'>
      {heading && (
        <Text
          accessibilityRole='header'
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
            paddingHorizontal: 5,
          }}
        >
          {i18n.t('territories.guest.whichStreet')}
        </Text>
      )}
      {streets.length > GUEST_STREET_SEARCH_FROM && (
        <GuestStreetSearch
          value={query}
          onChange={setQuery}
          onSheet={!heading}
        />
      )}
      {active.length > 0 && title(i18n.t('territories.guest.yourGroup'))}
      {active.length > 0 && group(active)}
      {rest.length > 0 &&
        active.length > 0 &&
        title(i18n.t('territories.guest.allStreets'))}
      {rest.length > 0 && group(rest)}
      {rows.length === 0 && (
        <Text
          style={{
            color: theme.colors.textAlt,
            textAlign: 'center',
            padding: 20,
          }}
        >
          {i18n.t('territories.guest.noStreetFound')}
        </Text>
      )}
    </View>
  )
}
