import { type ReactNode, useState } from 'react'
import { ScrollView } from 'react-native'
import * as Crypto from 'expo-crypto'
import { KeyboardStickyView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import Section from '@/components/ui/inputs/Section'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import confirmDestructive from '@/lib/confirmDestructive'
import { formatDate } from '@/lib/dates'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { useToastDock } from '@/stores/toastDock'
import { toast } from '@/stores/toasts'
import DoorRecorder from '@/features/territories/components/DoorRecorder'
import DoorRow from '@/features/territories/components/DoorRow'
import GuestDoorSheet from '@/features/territories/components/sharing/GuestDoorSheet'
import TerritoryDoNotCallSection from '@/features/territories/components/TerritoryDoNotCallSection'
import useFreshDoors from '@/features/territories/hooks/useFreshDoors'
import {
  doNotCallAt,
  doorsInWalkingOrder,
  logDoor,
  nextUnrecorded,
  removeDoor,
  stepNumber,
  streetDoNotCalls,
  updateStreet,
  wholeNumber,
} from '@/features/territories/lib/doors'
import { OUTCOME_LABEL } from '@/features/territories/lib/outcomes'
import { personName } from '@/features/territories/lib/shareText'
import {
  doorTitle,
  formatDoorAddress,
  streetDoNotCallSummary,
} from '@/features/territories/lib/territoryTitle'
import type {
  DoorOutcome,
  Territory,
  TerritoryDoor,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const UNDO_KEY = 'territory-guest-door'

export default function GuestStreetRecorder({
  territory,
  street,
  guestId,
  ownerName,
  header,
  footer,
  onChange,
}: {
  territory: Territory
  street: TerritoryStreet
  guestId: string
  ownerName: string
  header: ReactNode
  footer?: ReactNode
  onChange: (apply: (current: Territory) => Territory) => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [typed, setTyped] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [dockHeight, setDockHeight] = useState(0)
  const fresh = useFreshDoors(street.doors, guestId)
  useToastDock(dockHeight)

  const change = (apply: (current: TerritoryStreet) => TerritoryStreet) =>
    onChange((current) => updateStreet(current, street.id, apply))

  const unnumbered = street.numbering === 'none'
  const label = typed ?? String(street.next)
  const recorded = street.doors.find((door) => door.label === label.trim())
  const blocked = doNotCallAt(territory, street, label, formatDoorAddress)
  const away = typed !== null && typed.trim() !== String(street.next)

  const record = (outcome: DoorOutcome, logged = label.trim()) => {
    void Haptics.light()
    change((current) =>
      logDoor(current, {
        id: Crypto.randomUUID(),
        label: logged,
        outcome,
        at: Date.now(),
        by: guestId,
      })
    )
    setTyped(null)
    setOpenId(null)
    toast.undo({
      key: UNDO_KEY,
      durationMs: 5000,
      title: i18n.t('territories.doorRecorded', {
        door: formatDoorAddress(street, { label: logged }),
        outcome: i18n.t(OUTCOME_LABEL[outcome]),
      }),
      onUndo: () => change(() => street),
    })
  }

  const pick = (outcome: DoorOutcome, logged = label.trim()) => {
    if (!logged) return
    if (outcome !== 'doNotCall') return record(outcome, logged)
    confirmDestructive({
      title: i18n.t('territories.doNotCallConfirm_title', {
        address: formatDoorAddress(street, { label: logged }),
      }),
      description: i18n.t('territories.doNotCallConfirm_description'),
      confirmLabel: i18n.t('territories.outcome.doNotCall'),
      onConfirm: () => record(outcome, logged),
    })
  }

  const step = (by: 1 | -1) => {
    const to = stepNumber(street, wholeNumber(label) ?? street.next, by)
    setTyped(to === street.next ? null : String(to))
  }

  const finishStreet = () => {
    change((current) => ({
      ...current,
      workedAt: Date.now(),
      workedBy: guestId,
    }))
    toast.undo({
      key: UNDO_KEY,
      durationMs: 5000,
      title: i18n.t('territories.streetFinished_toast', {
        street: street.name,
      }),
      onUndo: () =>
        change((current) => ({
          ...current,
          workedAt: street.workedAt,
          workedBy: street.workedBy,
        })),
    })
  }

  const skip = () => {
    const shown = wholeNumber(label)
    setTyped(null)
    if (away || shown === undefined) return
    change((current) => ({ ...current, next: nextUnrecorded(current, shown) }))
  }

  const recordedBy = (door: TerritoryDoor) =>
    door.by === guestId
      ? undefined
      : door.by
        ? personName(territory, door.by)
        : ownerName || undefined
  const changing = street.doors.find((door) => door.id === openId)

  const doNotCalls = streetDoNotCalls(territory, street, formatDoorAddress)
  const called = doorsInWalkingOrder(
    street.doors.filter((door) => door.outcome !== 'doNotCall'),
    street.descending
  )

  return (
    <>
      <ScrollView keyboardShouldPersistTaps='handled'>
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: 110,
            gap: 20,
          }}
        >
          {header}
          {doNotCalls.length > 0 && (
            <TerritoryDoNotCallSection
              title={i18n.t('territories.doNotCallsOnStreet')}
              entries={doNotCalls}
              readOnly
              streets={[street]}
              pickStreet={false}
              summary={streetDoNotCallSummary(street, doNotCalls)}
              onAdd={() => {}}
            />
          )}
          {called.length === 0 ? (
            <Text
              style={{
                color: theme.colors.textAlt,
                textAlign: 'center',
                paddingHorizontal: 20,
                paddingTop: 20,
              }}
            >
              {i18n.t(
                unnumbered
                  ? 'territories.guest.noDoorsYet'
                  : 'territories.guest.noHousesYet'
              )}
            </Text>
          ) : (
            <Section>
              {called.map((door, index) => (
                <DoorRow
                  key={door.id}
                  door={door}
                  title={doorTitle(street, door.label)}
                  open={false}
                  plain
                  current={door.id === openId}
                  last={index === called.length - 1}
                  fresh={fresh.has(door.id)}
                  recordedBy={recordedBy(door)}
                  mine={door.by === guestId}
                  onToggle={() => {
                    toast.dismissKey(UNDO_KEY)
                    setOpenId(door.id)
                  }}
                />
              ))}
            </Section>
          )}
          {footer}
        </ContentColumn>
      </ScrollView>
      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <DoorRecorder
          onLayout={setDockHeight}
          switchSide={null}
          caption={
            blocked
              ? unnumbered
                ? i18n.t('territories.doNotCallSince', {
                    date: formatDate(blocked.at, { style: 'medium' }),
                  })
                : i18n.t('territories.guest.doNotKnock', {
                    number: label.trim(),
                  })
              : recorded
                ? i18n.t('territories.pins.changeCaption', {
                    outcome: i18n.t(OUTCOME_LABEL[recorded.outcome]),
                  })
                : i18n.t(
                    unnumbered
                      ? 'territories.nextDoorCaption'
                      : 'territories.nextHouseCaption'
                  )
          }
          describing={null}
          onFinishStreet={street.workedAt === undefined ? finishStreet : null}
          label={label}
          numbered={!unnumbered}
          blocked={!!blocked}
          editing={!!recorded && !blocked}
          doorTitle={doorTitle(street, label)}
          onChangeLabel={setTyped}
          onStep={step}
          onPick={pick}
          onSkip={skip}
          back={null}
          onCancelChange={() => setTyped(null)}
        />
      </KeyboardStickyView>
      <GuestDoorSheet
        door={changing ?? null}
        title={
          changing
            ? unnumbered
              ? doorTitle(street, changing.label)
              : i18n.t('territories.guest.houseTitle', {
                  number: changing.label,
                })
            : ''
        }
        recordedBy={changing ? recordedBy(changing) : undefined}
        mine={changing?.by === guestId}
        onPick={(outcome) => changing && pick(outcome, changing.label)}
        onRemove={
          changing?.by === guestId
            ? () => {
                setOpenId(null)
                change((current) => removeDoor(current, changing.id))
              }
            : undefined
        }
        onClose={() => setOpenId(null)}
      />
    </>
  )
}
