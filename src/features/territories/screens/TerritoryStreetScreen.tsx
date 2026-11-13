import { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  ScrollView,
  View,
} from 'react-native'
import * as Crypto from 'expo-crypto'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { KeyboardStickyView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeftRight as ArrowLeftRightIcon,
  CircleCheck as CircleCheckIcon,
  NotebookPen as NotebookPenIcon,
  Pencil as PencilIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react-native'
import LocationNotice from '@/components/LocationNotice'
import ActionButton from '@/components/ui/ActionButton'
import ChoiceChips from '@/components/ui/ChoiceChips'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Section from '@/components/ui/inputs/Section'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import confirmDestructive from '@/lib/confirmDestructive'
import { formatDate } from '@/lib/dates'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import { toastDuration } from '@/lib/toastDuration'
import { useToastDock } from '@/stores/toastDock'
import DoorLocationToggle from '@/features/territories/components/DoorLocationToggle'
import DoorRecorder, {
  type DoorUndo,
} from '@/features/territories/components/DoorRecorder'
import DoorRow from '@/features/territories/components/DoorRow'
import StreetWorkedCard from '@/features/territories/components/StreetWorkedCard'
import StreetWorkedDock from '@/features/territories/components/StreetWorkedDock'
import TerritoryDoNotCallSection from '@/features/territories/components/TerritoryDoNotCallSection'
import StreetActionChips from '@/features/territories/components/sharing/StreetActionChips'
import StreetReceivedFrom from '@/features/territories/components/sharing/StreetReceivedFrom'
import StreetHandoffCard from '@/features/territories/components/sharing/StreetHandoffCard'
import TerritoryHeaderActions from '@/features/territories/components/sharing/TerritoryHeaderActions'
import useFreshDoors from '@/features/territories/hooks/useFreshDoors'
import { hasOthers, personName } from '@/features/territories/lib/shareText'
import {
  isReceivedLive,
  territoryAccess,
} from '@/features/territories/lib/sharing'
import useDoorPinning from '@/features/territories/hooks/useDoorPinning'
import useDoorRecordPrivacy from '@/features/territories/hooks/useDoorRecordPrivacy'
import { doNotCallDate } from '@/features/territories/lib/doNotCallDate'
import {
  doNotCallAt,
  doorCounts,
  doorsInWalkingOrder,
  logDoor,
  nextStreet,
  nextUnrecorded,
  removeDoor,
  stepNumber,
  streetDoNotCalls,
  switchSide,
  updateStreet,
  wholeNumber,
} from '@/features/territories/lib/doors'
import {
  OUTCOME_ICON,
  OUTCOME_LABEL,
  outcomeColor,
} from '@/features/territories/lib/outcomes'
import {
  doorTitle,
  formatDoorAddress,
  streetDoNotCallSummary,
  territoryTitle,
} from '@/features/territories/lib/territoryTitle'
import {
  useTerritories,
  useTerritory,
} from '@/features/territories/stores/territories'
import type {
  DoorOutcome,
  TerritoryStreet,
} from '@/features/territories/types/territory'
import type { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryStreet'>

type Filter = 'all' | 'notHome'

const UNDO_MS = 10_000

const FILTER_FROM = 4

export default function TerritoryStreetScreen(props: Props) {
  return <StreetScreen key={props.route.params.streetId} {...props} />
}

function StreetScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { territoryId, streetId } = route.params
  const territory = useTerritory(territoryId)
  const update = useTerritories((state) => state.update)
  const privacy = useDoorRecordPrivacy()
  const street = territory?.streets.find((entry) => entry.id === streetId)

  const [typed, setTyped] = useState<string | null>(null)
  const [stowed, setStowed] = useState(false)
  const [undo, setUndo] = useState<
    (Omit<DoorUndo, 'onPress'> & { before: TerritoryStreet }) | null
  >(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>(
    route.params.notHomeOnly ? 'notHome' : 'all'
  )
  const [dockHeight, setDockHeight] = useState(0)
  const [description, setDescription] = useState<string | null>(null)

  useEffect(() => {
    if (!street) navigation.popTo('TerritoryDetails', { territoryId })
  }, [street, navigation, territoryId])

  useEffect(() => {
    if (!undo) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let live = true
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((reader) => toastDuration('undo', reader, UNDO_MS))
      .then((ms) => {
        if (live) timer = setTimeout(() => setUndo(null), ms)
      })
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [undo])

  const unnumbered = street?.numbering === 'none'

  const finished = territory?.finishedAt !== undefined
  const handedOff = street?.handoff !== undefined
  const recording =
    !!street &&
    !privacy &&
    !finished &&
    !handedOff &&
    !!territory &&
    isReceivedLive(territory)
  useToastDock(recording ? dockHeight : 0)
  const pinning = useDoorPinning({
    territoryId,
    street,
    recording,
    change: (apply) =>
      update(territoryId, (current) => updateStreet(current, streetId, apply)),
  })
  const fresh = useFreshDoors(street?.doors ?? [])

  if (!territory || !street) return null

  const change = (apply: (current: TerritoryStreet) => TerritoryStreet) =>
    update(territoryId, (current) => updateStreet(current, streetId, apply))

  const label = typed ?? String(street.next)
  const recorded = street.doors.find((door) => door.label === label.trim())
  const blocked = doNotCallAt(territory, street, label, formatDoorAddress)
  const away = typed !== null && typed.trim() !== String(street.next)
  const counts = doorCounts(street.doors)
  const worked = street.workedAt !== undefined
  const upNext = nextStreet(territory, street.id)
  const docked = recording && (!worked || typed !== null)
  const access = territoryAccess(territory)

  const undoable = (shown: Omit<DoorUndo, 'onPress'>) =>
    setUndo({ ...shown, before: street })

  const record = (outcome: DoorOutcome, described?: string) => {
    const logged = label.trim()
    void Haptics.light()
    change((current) =>
      logDoor(current, {
        id: Crypto.randomUUID(),
        label: logged,
        outcome,
        at: Date.now(),
        description: described?.trim() || undefined,
      })
    )
    show(null)
    setOpenId(null)
    setDescription(null)
    undoable({
      icon: OUTCOME_ICON[outcome],
      color: outcomeColor(outcome, theme.colors),
      text: doorTitle(street, logged),
      label: i18n.t('territories.doorRecorded', {
        door: doorTitle(street, logged),
        outcome: i18n.t(OUTCOME_LABEL[outcome]),
      }),
    })
    pinning.pinDoor(logged)
  }

  const pick = (outcome: DoorOutcome) => {
    if (!label.trim()) return
    if (outcome !== 'doNotCall') return record(outcome)
    if (unnumbered) return setDescription('')
    confirmDestructive({
      title: i18n.t('territories.doNotCallConfirm_title', {
        address: formatDoorAddress(street, { label: label.trim() }),
      }),
      description: i18n.t('territories.doNotCallConfirm_description'),
      confirmLabel: i18n.t('territories.outcome.doNotCall'),
      onConfirm: () => record(outcome),
    })
  }

  const show = (value: string | null) => {
    setTyped(value)
    setUndo(null)
  }

  const step = (by: 1 | -1) => {
    const to = stepNumber(street, wholeNumber(label) ?? street.next, by)
    show(to === street.next ? null : String(to))
  }

  const stow = () => {
    Keyboard.dismiss()
    if (description === null) setStowed(true)
  }

  const goNext = () =>
    upNext
      ? navigation.popTo('TerritoryStreet', {
          territoryId,
          streetId: upNext.id,
        })
      : navigation.popTo('TerritoryDetails', { territoryId })
  const nextLabel = upNext
    ? i18n.t('territories.nextStreet', { street: upNext.name })
    : i18n.t('territories.backToTerritory', {
        territory: territoryTitle(territory),
      })
  const side =
    street.numbering === 'odd' || street.numbering === 'even'
      ? street.numbering
      : undefined
  const crossStreet = () => {
    const crossed = switchSide(street)
    show(null)
    change(() => crossed)
    const now = crossed.numbering as 'odd' | 'even'
    undoable({
      icon: ArrowLeftRightIcon,
      color: theme.colors.accent,
      text: doorTitle(crossed, String(crossed.next)),
      label: i18n.t(`territories.switchedSide.${now}`),
    })
  }

  const finishStreet = () => {
    show(null)
    change((current) => ({
      ...current,
      workedAt: Date.now(),
      workedBy: undefined,
    }))
  }

  const skip = () => {
    const shown = wholeNumber(label)
    show(null)
    if (away || shown === undefined) return
    change((current) => ({ ...current, next: nextUnrecorded(current, shown) }))
  }

  const called = street.doors.filter((door) => door.outcome !== 'doNotCall')
  const shown = doorsInWalkingOrder(
    filter === 'notHome'
      ? called.filter((door) => door.outcome === 'notHome')
      : called,
    street.descending
  )

  const streetEntries = streetDoNotCalls(territory, street, formatDoorAddress)
  const notesShown = !finished && !handedOff
  const chipsShown =
    called.length > 0 && (called.length >= FILTER_FROM || filter !== 'all')
  const hint = (text: string) => (
    <Text
      style={{
        color: theme.colors.textAlt,
        fontSize: theme.fontSize('sm'),
        paddingHorizontal: 5,
      }}
    >
      {text}
    </Text>
  )

  const notesRow = (
    <InputRowButton
      key='notes'
      testID='street-add-from-notes'
      leftIcon={NotebookPenIcon}
      label={i18n.t('territories.notes.action')}
      onPress={() =>
        navigation.navigate('TerritoryNotes', { territoryId, streetId })
      }
      lastInSection
    />
  )

  const doNotCalls = (canAdd: boolean) => (
    <TerritoryDoNotCallSection
      title={i18n.t('territories.doNotCallsOnStreet')}
      entries={streetEntries}
      readOnly={!canAdd}
      editable={!finished}
      streets={[street]}
      pickStreet={false}
      summary={streetDoNotCallSummary(street, streetEntries)}
      onAdd={(entry) =>
        update(territoryId, (current) => ({
          ...current,
          doNotCalls: [
            ...current.doNotCalls,
            { ...entry, id: Crypto.randomUUID() },
          ],
        }))
      }
      onEdit={(entry) =>
        navigation.navigate('TerritoryDoNotCall', {
          territoryId,
          entryId: entry.id,
        })
      }
    />
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        buttonType='back'
        title={street.name}
        rightElement={
          <TerritoryHeaderActions
            actions={[
              ...(finished || access !== 'owner'
                ? []
                : [
                    {
                      icon: PencilIcon,
                      label: i18n.t('territories.editStreet'),
                      onPress: () =>
                        navigation.navigate('TerritoryStreetForm', {
                          territoryId,
                          streetId,
                        }),
                      testID: 'street-edit',
                    },
                  ]),
            ]}
          />
        }
      />
      <ScrollView
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={{ flexGrow: 1 }}
        scrollIndicatorInsets={{ bottom: docked ? dockHeight : 0 }}
      >
        <Pressable
          accessible={false}
          disabled={!docked || stowed}
          onPress={stow}
          style={{ flexGrow: 1 }}
          testID='street-blank'
        >
          <ContentColumn
            style={{
              padding: inputLayout.horizontalPadding,
              paddingBottom:
                (docked ? dockHeight : recording ? 0 : insets.bottom) + 30,
              gap: 20,
            }}
          >
            <StreetReceivedFrom territory={territory} />
            <StreetActionChips
              territory={territory}
              street={street}
              privacy={privacy}
              onOpenMap={(params) =>
                navigation.navigate('TerritoryMap', { territoryId, ...params })
              }
              onShare={() =>
                navigation.navigate('TerritoryShare', { territoryId, streetId })
              }
              onHandOff={() =>
                navigation.navigate('TerritoryHandoff', {
                  territoryId,
                  streetId,
                })
              }
            />
            <StreetHandoffCard territory={territory} street={street} />
            {handedOff && privacy ? null : privacy ? (
              <>
                <StreetWorkedCard
                  workedAt={street.workedAt}
                  onOpenSettings={() =>
                    navigation.navigate('PreferencesPrivacy')
                  }
                  onToggle={() =>
                    change((current) => ({
                      ...current,
                      workedAt:
                        current.workedAt === undefined ? Date.now() : undefined,
                    }))
                  }
                />
                {worked && !finished && (
                  <ActionButton
                    submitShortcut={false}
                    testID='street-next'
                    onPress={goNext}
                  >
                    {nextLabel}
                  </ActionButton>
                )}
                {doNotCalls(!finished)}
              </>
            ) : (
              <>
                {worked && finished && (
                  <Section>
                    <InputRowContainer
                      leftIcon={CircleCheckIcon}
                      label={i18n.t('territories.streetWorkedOn', {
                        date: formatDate(street.workedAt, { style: 'medium' }),
                      })}
                      controlWidth='auto'
                      lastInSection
                    />
                  </Section>
                )}

                {doNotCalls(!finished && !handedOff)}

                {chipsShown && (
                  <ChoiceChips<Filter>
                    options={[
                      {
                        key: 'all',
                        label: i18n.t('territories.filterAll', {
                          total: formatNumber(called.length),
                        }),
                        testID: 'door-filter-all',
                      },
                      {
                        key: 'notHome',
                        label: i18n.t('territories.filterNotHome', {
                          total: formatNumber(counts.notHome),
                        }),
                        testID: 'door-filter-notHome',
                      },
                    ]}
                    value={filter}
                    onChange={setFilter}
                  />
                )}

                {called.length === 0 ? (
                  <View style={{ gap: 20 }}>
                    <Text
                      testID='street-empty-hint'
                      style={{
                        color: theme.colors.textAlt,
                        textAlign: 'center',
                        paddingHorizontal: 20,
                        paddingTop: notesShown ? 20 : 40,
                      }}
                    >
                      {i18n.t(
                        unnumbered
                          ? 'territories.streetEmptyDoors'
                          : 'territories.streetEmptyHouses'
                      )}
                    </Text>
                    {notesShown && <Section>{notesRow}</Section>}
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {shown.length === 0 &&
                      hint(i18n.t('territories.noNotHomes'))}
                    {(shown.length > 0 || notesShown) && (
                      <Section>
                        {shown.map((door, index) => (
                          <DoorRow
                            key={door.id}
                            door={door}
                            title={doorTitle(street, door.label)}
                            open={door.id === openId}
                            current={door.id === recorded?.id}
                            last={index === shown.length - 1 && !notesShown}
                            fresh={fresh.has(door.id)}
                            recordedBy={
                              door.by
                                ? personName(territory, door.by)
                                : undefined
                            }
                            mine={hasOthers(territory)}
                            onToggle={() => {
                              const opening = openId !== door.id
                              setOpenId(opening ? door.id : null)
                              if (!recording || description !== null) return
                              setStowed(false)
                              show(
                                !opening ||
                                  (door.label === String(street.next) &&
                                    !worked)
                                  ? null
                                  : door.label
                              )
                            }}
                            onAddContact={() =>
                              navigation.navigate('Contact Form', {
                                id: Crypto.randomUUID(),
                                initialCoordinate: door.coordinate,
                                initialAddressLine:
                                  street.numbering === 'none'
                                    ? street.name
                                    : formatDoorAddress(street, door),
                              })
                            }
                            onPlacePin={() =>
                              navigation.navigate('TerritoryDoorPin', {
                                territoryId,
                                streetId,
                                doorId: door.id,
                              })
                            }
                            onRemove={() => {
                              show(null)
                              setOpenId(null)
                              change((current) => removeDoor(current, door.id))
                              undoable({
                                icon: Trash2Icon,
                                color: theme.colors.error,
                                text: doorTitle(street, door.label),
                                label: i18n.t('territories.doorRemoved', {
                                  door: doorTitle(street, door.label),
                                }),
                              })
                            }}
                          />
                        ))}
                        {notesShown && notesRow}
                      </Section>
                    )}
                    {!handedOff &&
                      hint(
                        i18n.t(
                          unnumbered
                            ? 'territories.pins.doorList_hintDoor'
                            : 'territories.pins.doorList_hint'
                        )
                      )}
                  </View>
                )}
              </>
            )}
          </ContentColumn>
        </Pressable>
      </ScrollView>
      {recording && worked && typed === null && (
        <StreetWorkedDock
          onLayout={setDockHeight}
          title={i18n.t('territories.streetWorkedOn', {
            date: formatDate(street.workedAt, { style: 'medium' }),
          })}
          next={nextLabel}
          onNext={goNext}
          onMarkNotWorked={() =>
            change((current) => ({ ...current, workedAt: undefined }))
          }
        />
      )}
      {docked && (
        <KeyboardStickyView
          offset={{ opened: insets.bottom }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        >
          <DoorRecorder
            onLayout={setDockHeight}
            stow={{ stowed, onChange: setStowed }}
            undo={
              undo
                ? {
                    icon: undo.icon,
                    color: undo.color,
                    text: undo.text,
                    label: undo.label,
                    onPress: () => {
                      const { before } = undo
                      show(null)
                      change(() => before)
                    },
                  }
                : null
            }
            pinControl={
              <DoorLocationToggle
                state={pinning.state}
                fixWith={pinning.fixWith}
                onToggle={pinning.toggle}
                onFix={pinning.fix}
              />
            }
            notice={
              pinning.notice && (
                <LocationNotice
                  access={pinning.notice.access}
                  fix={pinning.notice.fix}
                  onFix={pinning.notice.onFix}
                  testID='door-location-notice'
                  style={{ marginTop: -8, marginBottom: -4 }}
                />
              )
            }
            switchSide={
              side && !worked
                ? {
                    label: i18n.t(
                      `territories.switchSide.${side === 'odd' ? 'even' : 'odd'}`
                    ),
                    onPress: crossStreet,
                  }
                : null
            }
            caption={
              description !== null
                ? i18n.t('territories.describeDoor_caption', {
                    door: doorTitle(street, label),
                  })
                : blocked
                  ? i18n.t('territories.doNotCallSince', {
                      date: doNotCallDate(blocked.at),
                    })
                  : recorded
                    ? i18n.t('territories.pins.changeCaption', {
                        outcome: i18n.t(OUTCOME_LABEL[recorded.outcome]),
                      })
                    : i18n.t(
                        unnumbered
                          ? 'territories.nextDoorCaption'
                          : side
                            ? `territories.nextHouseCaption_${side}`
                            : 'territories.nextHouseCaption'
                      )
            }
            describing={
              description === null
                ? null
                : {
                    value: description,
                    onChange: setDescription,
                    canSave: description.trim().length > 0 || pinning.pinsNow,
                    pinned: pinning.pinsNow,
                    onSave: () => record('doNotCall', description),
                    onBack: () => setDescription(null),
                  }
            }
            onFinishStreet={worked ? null : finishStreet}
            label={label}
            numbered={!unnumbered}
            blocked={!!blocked}
            editing={!!recorded && !blocked}
            doorTitle={doorTitle(street, label)}
            onChangeLabel={show}
            onStep={step}
            onPick={pick}
            onSkip={skip}
            back={
              worked && typed !== null
                ? { label: i18n.t('cancel'), onPress: () => show(null) }
                : null
            }
          />
        </KeyboardStickyView>
      )}
    </View>
  )
}
