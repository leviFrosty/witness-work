import { useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { X as XIcon } from 'lucide-react-native'
import moment from 'moment'
import ActionButton from '@/components/ui/ActionButton'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import Sheet from '@/components/ui/Sheet'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import { formatMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { MAX_SHARED_CAR_PEOPLE, takenCarPlaces } from '@/lib/mileage/sharedCar'
import useSharedCars from '@/stores/sharedCars'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import type { Buddy } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import type { CarBuddy } from '@/app/sharedCars/carInvitations'
import { carInvitations } from '@/app/sharedCars/carInvitationsService'

export type PickedBuddy = { inboxId: string; name: string }

/** Where a buddy stands on the car, under their name. */
function statusLine(entry: CarBuddy): string | undefined {
  if (entry.status === 'onCar') return i18n.t('mileage.buddyOnCar')
  if (entry.status === 'invited')
    return i18n.t('mileage.invitedExpires', {
      date: formatMonthDayCompact(moment(entry.expiresAt)),
    })
  return undefined
}

function BuddyChoice({
  buddy,
  entry,
  disabled,
  last,
  onPick,
}: {
  buddy: Buddy
  entry: CarBuddy
  disabled: boolean
  last: boolean
  onPick: () => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const name = buddyDisplayName(buddy)
  const status = statusLine(entry)
  const available = entry.status === 'available' && !disabled
  return (
    <PointerHover onHoverChange={setHovered}>
      <Pressable
        onPress={onPick}
        disabled={!available}
        accessibilityRole='button'
        accessibilityLabel={[name, status].filter(Boolean).join(', ')}
        accessibilityState={{ disabled: !available }}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <XView
          style={{
            gap: 12,
            minHeight: 56,
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderBottomWidth: last ? 0 : 1,
            borderColor: theme.colors.border,
          }}
        >
          <BuddyAvatar
            avatar={buddy.avatar}
            name={name}
            color={buddy}
            size={36}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: theme.fonts.semiBold,
                color: available ? theme.colors.text : theme.colors.textAlt,
              }}
            >
              {name}
            </Text>
            {status ? (
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {status}
              </Text>
            ) : null}
          </View>
          {available && (
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('mileage.invite')}
            </Text>
          )}
        </XView>
        <HoverTint visible={hovered && available} />
      </Pressable>
    </PointerHover>
  )
}

/**
 * Invite a buddy to a Shared Car: each active buddy with where they stand on it
 * (available, on the car, invited). Picking one closes the sheet and then
 * invites them (`onInvite`), so its progress shows in a toast over the form. A
 * full car (its people and open invitations) offers no one. With no buddies
 * yet, it offers a way to Buddies to invite someone first.
 */
export default function CarBuddyPickerSheet({
  open,
  onOpenChange,
  spaceId,
  carName,
  onInvite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The Shared Car; absent while the User has no buddies to share it with. */
  spaceId?: string
  carName: string
  onInvite: (buddy: PickedBuddy) => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const buddies = useBuddies((state) => state.buddies)
  const { now } = useNow()
  // Re-reads where each buddy stands as invitations open and people join.
  const car = useSharedCars((state) =>
    spaceId === undefined ? undefined : state.cars[spaceId]
  )
  const next = useRef<
    { kind: 'invite'; buddy: PickedBuddy } | { kind: 'buddies' } | null
  >(null)

  const entries = car && spaceId ? carInvitations.carBuddies(spaceId) : []
  const choices = entries.flatMap((entry) => {
    const buddy = buddies.find((b) => b.inboxId === entry.inboxId)
    return buddy ? [{ entry, buddy }] : []
  })
  const full = !!car && takenCarPlaces(car, now) >= MAX_SHARED_CAR_PEOPLE

  const close = (then: NonNullable<typeof next.current>) => {
    next.current = then
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => {
        const then = next.current
        next.current = null
        if (then?.kind === 'invite') onInvite(then.buddy)
        else if (then?.kind === 'buddies') navigation.navigate('Buddies')
      }}
    >
      <XView
        style={{
          justifyContent: 'space-between',
          gap: 12,
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 6,
        }}
      >
        <Text
          accessibilityRole='header'
          style={{
            flex: 1,
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('mileage.inviteTo', { car: carName })}
        </Text>
        <IconButton
          frame
          noTransform
          icon={XIcon}
          size={20}
          color={theme.colors.text}
          accessibilityLabel={i18n.t('close')}
          onPress={() => onOpenChange(false)}
        />
      </XView>

      {choices.length === 0 ? (
        <View style={{ gap: 16, padding: 20, paddingTop: 6 }}>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('mileage.noBuddiesToInvite')}
          </Text>
          <ActionButton onPress={() => close({ kind: 'buddies' })}>
            {i18n.t('mileage.goToBuddies')}
          </ActionButton>
        </View>
      ) : (
        <>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              paddingHorizontal: 20,
              paddingBottom: 10,
            }}
          >
            {i18n.t(
              full ? 'buddies_carFull' : 'mileage.inviteSheet_description'
            )}
          </Text>
          <Sheet.ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            {choices.map(({ entry, buddy }, i) => (
              <BuddyChoice
                key={entry.inboxId}
                buddy={buddy}
                entry={entry}
                disabled={full}
                last={i === choices.length - 1}
                onPick={() =>
                  close({
                    kind: 'invite',
                    buddy: {
                      inboxId: entry.inboxId,
                      name: buddyDisplayName(buddy),
                    },
                  })
                }
              />
            ))}
          </Sheet.ScrollView>
        </>
      )}
    </Sheet>
  )
}
