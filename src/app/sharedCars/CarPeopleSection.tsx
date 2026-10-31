import { useState } from 'react'
import { View } from 'react-native'
import moment from 'moment'
import {
  Share2 as Share2Icon,
  UserPlus as UserPlusIcon,
} from 'lucide-react-native'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import XView from '@/components/ui/layout/XView'
import type { ContextMenuAction } from '@/components/ui/ContextMenu.types'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import confirmDestructive from '@/lib/confirmDestructive'
import { formatMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { useMileageView } from '@/stores/mileageView'
import useSharedCars from '@/stores/sharedCars'
import type { ProfileAvatar } from '@/types/avatar'
import type { MileageVehicle } from '@/types/mileage'
import type { SharedCar } from '@/types/sharedCars'
import useMileageSharing, {
  useMileagePeople,
} from '@/features/mileage/hooks/useMileageSharing'
import { personLabel } from '@/features/mileage/lib/personLabel'
import CarBuddyPickerSheet, {
  type PickedBuddy,
} from '@/app/sharedCars/CarBuddyPickerSheet'
import CarPeopleActionRow from '@/app/sharedCars/CarPeopleActionRow'
import { carPeopleActions } from '@/app/sharedCars/carPeopleActionsService'
import {
  carPeopleList,
  type CarPeopleRow,
  type CarPersonAction,
} from '@/app/sharedCars/carPeopleRows'
import CarPersonRow from '@/app/sharedCars/CarPersonRow'

function Title() {
  const theme = useTheme()
  return (
    <XView style={{ gap: 0, marginLeft: 5 }}>
      <Text
        accessibilityRole='header'
        style={{
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('mileage.people')}
      </Text>
      <InfoPopover
        title={i18n.t('mileage.people')}
        description={i18n.t('mileage.people_info')}
        inline
      />
    </XView>
  )
}

const NO_AVATAR: ProfileAvatar = { type: 'none', value: '' }

/** Someone on the car, as a row's menu acts on them. */
type RowPerson = {
  /** The row's key, which shows its spinner while an action runs. */
  key: string
  memberId: string
  /** As shown: "You" for the User. */
  name: string
  /** Not named yet: someone whose join didn't finish. */
  unnamed: boolean
}

/**
 * Who's on a Shared Car, with what the User can do about each of them. While
 * Shared Cars is off on this device (`sharing`), only the User's own way off
 * the car stays.
 */
function SharedCarPeople({
  car,
  vehicle,
  sharing,
  onInvite,
}: {
  car: SharedCar
  vehicle: MileageVehicle
  sharing: boolean
  onInvite: () => void
}) {
  const people = useMileagePeople()
  const { now } = useNow()
  const [busy, setBusy] = useState<string | null>(null)
  const { rows, full } = carPeopleList(car, people, now, { sharing })
  const carName = vehicle.name

  const run = async (key: string, action: () => Promise<boolean>) => {
    setBusy(key)
    try {
      await action()
    } finally {
      setBusy(null)
    }
  }

  // Leaving and stopping end the car here; the form closes with it.
  const personAction = (
    row: RowPerson,
    action: CarPersonAction
  ): ContextMenuAction => {
    const { name } = row
    switch (action) {
      case 'leave':
        return {
          id: 'leave',
          title: i18n.t('mileage.leaveCar'),
          systemImage: 'door.left.hand.closed',
          destructive: true,
          onPress: () =>
            confirmDestructive({
              title: i18n.t('mileage.leaveCar_title', { car: carName }),
              description: i18n.t('mileage.leaveCar_description'),
              confirmLabel: i18n.t('mileage.leave'),
              onConfirm: () =>
                void run(row.key, () =>
                  carPeopleActions.leave(car.spaceId, carName)
                ),
            }),
        }
      case 'stopSharing':
        return {
          id: 'stop_sharing',
          title: i18n.t('mileage.stopSharing'),
          systemImage: 'person.2.slash',
          destructive: true,
          onPress: () =>
            confirmDestructive({
              title: i18n.t('mileage.stopSharing_title', { car: carName }),
              description: i18n.t('mileage.stopSharing_description'),
              confirmLabel: i18n.t('mileage.stopSharingConfirm'),
              onConfirm: () =>
                void run(row.key, () =>
                  carPeopleActions.stopSharing(car.spaceId, carName)
                ),
            }),
        }
      case 'remove':
        return {
          id: 'remove',
          title: i18n.t('mileage.removePerson'),
          systemImage: 'person.badge.minus',
          destructive: true,
          onPress: () =>
            confirmDestructive({
              ...(row.unnamed
                ? {
                    title: i18n.t('mileage.removeUnnamed_title', {
                      car: carName,
                    }),
                    description: i18n.t('mileage.removeUnnamed_description'),
                  }
                : {
                    title: i18n.t('mileage.removePerson_title', {
                      name,
                      car: carName,
                    }),
                    description: i18n.t('mileage.removePerson_description', {
                      name,
                    }),
                  }),
              confirmLabel: i18n.t('remove'),
              onConfirm: () =>
                void run(row.key, () =>
                  carPeopleActions.remove(car.spaceId, {
                    memberId: row.memberId,
                    // The toasts' "Removed this person".
                    name: row.unnamed ? i18n.t('mileage.thisPerson') : name,
                  })
                ),
            }),
        }
    }
  }

  const cancelInvite = (
    row: Extract<CarPeopleRow, { kind: 'invite' }>,
    name: string
  ): ContextMenuAction => ({
    id: 'cancel_invite',
    title: i18n.t('mileage.cancelInvite'),
    systemImage: 'xmark',
    destructive: true,
    onPress: () =>
      confirmDestructive({
        title: i18n.t('mileage.cancelInvite_title', { name }),
        description: i18n.t('mileage.cancelInvite_description', {
          car: carName,
        }),
        confirmLabel: i18n.t('mileage.cancelInvite'),
        onConfirm: () =>
          void run(row.key, () =>
            carPeopleActions.cancelInvite(car.spaceId, row.invite.inviteId)
          ),
      }),
  })

  // Invite Buddy… ends the section while sharing; otherwise the last row does.
  const last = (row: CarPeopleRow) => !sharing && row === rows.at(-1)

  const personRow = (row: Extract<CarPeopleRow, { kind: 'person' }>) => {
    const target = {
      key: row.key,
      memberId: row.person.memberId,
      name: personLabel(row.person),
      unnamed: false,
    }
    return (
      <CarPersonRow
        key={row.key}
        name={target.name}
        avatar={row.person.avatar}
        color={row.person.color}
        subtitle={row.person.owner ? i18n.t('mileage.owner') : undefined}
        actions={row.actions.map((action) => personAction(target, action))}
        busy={busy === row.key}
        last={last(row)}
      />
    )
  }

  const unnamedRow = (row: Extract<CarPeopleRow, { kind: 'unnamed' }>) => {
    const target = {
      key: row.key,
      memberId: row.memberId,
      name: row.me
        ? personLabel({ me: true, name: '' })
        : i18n.t('mileage.someoneWhoJoined'),
      unnamed: !row.me,
    }
    return (
      <CarPersonRow
        key={row.key}
        name={target.name}
        avatar={NO_AVATAR}
        subtitle={
          car.ownerId === row.memberId ? i18n.t('mileage.owner') : undefined
        }
        actions={row.actions.map((action) => personAction(target, action))}
        busy={busy === row.key}
        last={last(row)}
      />
    )
  }

  const inviteRow = (row: Extract<CarPeopleRow, { kind: 'invite' }>) => {
    const name = row.invitee.name || i18n.t('mileage.someone')
    return (
      <CarPersonRow
        key={row.key}
        name={name}
        avatar={row.invitee.avatar}
        color={row.invitee.color}
        subtitle={i18n.t('mileage.invitedExpires', {
          date: formatMonthDayCompact(moment(row.invite.expiresAt)),
        })}
        actions={row.canCancel ? [cancelInvite(row, name)] : []}
        busy={busy === row.key}
        last={last(row)}
      />
    )
  }

  return (
    <Section>
      {rows.map((row) =>
        row.kind === 'person'
          ? personRow(row)
          : row.kind === 'unnamed'
            ? unnamedRow(row)
            : inviteRow(row)
      )}
      {sharing && (
        <CarPeopleActionRow
          icon={UserPlusIcon}
          label={i18n.t('mileage.inviteBuddy')}
          description={full ? i18n.t('buddies_carFull') : undefined}
          disabled={full}
          onPress={onInvite}
          lastInSection
          testID='car-invite-buddy'
        />
      )}
    </Section>
  )
}

/**
 * The car form's People section (docs/mileage-tracking-prd.md, "Shared Cars"):
 * who's on a Shared Car and its open invitations, with Invite Buddy…, or Share
 * Car… for one of the User's own. Sharing moves the car's history to its space,
 * which takes a moment, then offers the User's buddies to invite. With no
 * buddies yet, the picker points to Buddies instead, and nothing is shared.
 *
 * While Shared Cars is off on this device (its flag, or Buddies), nothing new
 * is shared, but a Shared Car still lists its people, and the User can still
 * leave it, or stop sharing it as its owner: the way off a car never closes.
 */
export default function CarPeopleSection({ vehicleId }: { vehicleId: string }) {
  const sharing = useMileageSharing()
  const vehicle = useMileageView((view) =>
    view.vehicles.find((v) => v.id === vehicleId)
  )
  const car = useSharedCars((state) =>
    vehicle?.spaceId === undefined ? undefined : state.cars[vehicle.spaceId]
  )
  const [sharingCar, setSharingCar] = useState(false)
  const [picker, setPicker] = useState(false)
  const [pickerSpace, setPickerSpace] = useState<string>()

  if (!vehicle) return null
  // Archived cars aren't offered to share; a Shared Car stays listed.
  if (!car && (!sharing.enabled || vehicle.archived)) return null

  const openPicker = (spaceId?: string) => {
    setPickerSpace(spaceId)
    setPicker(true)
  }

  const share = async () => {
    if (sharing.buddies.length === 0) {
      openPicker()
      return
    }
    setSharingCar(true)
    try {
      const spaceId = await carPeopleActions.shareCar(vehicle)
      if (spaceId) openPicker(spaceId)
    } finally {
      setSharingCar(false)
    }
  }

  const invite = (buddy: PickedBuddy) => {
    if (pickerSpace) void carPeopleActions.invite(pickerSpace, buddy)
  }

  return (
    <View style={{ gap: 8 }}>
      <Title />
      {car ? (
        <SharedCarPeople
          car={car}
          vehicle={vehicle}
          sharing={sharing.enabled}
          onInvite={() => openPicker(car.spaceId)}
        />
      ) : (
        <Section>
          <CarPeopleActionRow
            icon={Share2Icon}
            label={i18n.t(
              sharingCar ? 'mileage.sharingCar' : 'mileage.shareCar'
            )}
            loading={sharingCar}
            onPress={() => void share()}
            lastInSection
            testID='car-share'
          />
        </Section>
      )}
      {sharing.enabled && (
        <CarBuddyPickerSheet
          open={picker}
          onOpenChange={setPicker}
          spaceId={pickerSpace}
          carName={vehicle.name}
          onInvite={invite}
        />
      )}
    </View>
  )
}
