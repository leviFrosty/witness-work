import { useState } from 'react'
import { View } from 'react-native'
import * as Crypto from 'expo-crypto'
import {
  Building2 as Building2Icon,
  Check as CheckIcon,
  CirclePlus as CirclePlusIcon,
  Flag as FlagIcon,
  House as HouseIcon,
  MapPin as MapPinIcon,
  Play as PlayIcon,
  Plus as PlusIcon,
  X as XIcon,
} from 'lucide-react-native'
import PinPickerMap from '@/components/PinPickerMap'
import PlaceSearchInput from '@/components/PlaceSearchInput'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import IconButton from '@/components/ui/IconButton'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import NativeSegmentedControl from '@/components/ui/NativeSegmentedControl'
import Sheet from '@/components/ui/Sheet'
import MyTextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { addressToString } from '@/lib/address'
import { analytics } from '@/lib/analytics'
import { buildContactsFuse } from '@/lib/contactsSearch'
import { filterActivesContacts } from '@/lib/dismissedContacts'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatPlanLocation, type ResolvedPlace } from '@/lib/placeSearch'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import type { Coordinate } from '@/types/contact'
import type { AddedStopSource } from '@/features/route-planning/hooks/useRouteBuilder'
import { parseCoordinateInput } from '@/features/route-planning/lib/coordinateInput'
import { coordinateText } from '@/features/route-planning/lib/coordinateText'
import { contactStop } from '@/features/route-planning/lib/contactStop'
import { pinTitle } from '@/features/route-planning/lib/pinTitle'
import {
  SAVED_PLACE_KINDS,
  type AddedStop,
  type SavedPlaceKind,
} from '@/features/route-planning/lib/routeBuilder'
import {
  savedPlaceLabel,
  savedPlaceOnRoute,
} from '@/features/route-planning/lib/savedPlaceMenu'
import { stopContactResults } from '@/features/route-planning/lib/stopContacts'
import { useSavedPlaces } from '@/features/route-planning/stores/savedPlaces'

type Tab = 'places' | 'contacts' | 'map'

/** What a pick is for: a stop, or where the day starts or finishes. */
export type AddRouteStopMode = 'stop' | 'start' | 'finish'

const SAVED_PLACE_ICONS: Record<SavedPlaceKind, AppIcon> = {
  home: HouseIcon,
  kingdomHall: Building2Icon,
}

const SAVED_PLACE_SOURCE: Record<SavedPlaceKind, AddedStopSource> = {
  home: 'home',
  kingdomHall: 'kingdom_hall',
}

const isCoordinate = (value?: Partial<Coordinate>): value is Coordinate =>
  typeof value?.latitude === 'number' &&
  typeof value.longitude === 'number' &&
  Number.isFinite(value.latitude) &&
  Number.isFinite(value.longitude)

const coordinateLabel = ({ latitude, longitude }: Coordinate) =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`

const pinnedStop = (coordinate: Coordinate, title?: string): AddedStop => ({
  key: `place:${Crypto.randomUUID()}`,
  kind: 'place',
  title: title?.trim() || i18n.t('routeBuilder_pinnedPlace'),
  subtitle: coordinateLabel(coordinate),
  coordinate,
  destination: coordinateText(coordinate),
})

/**
 * Finds a place for the route: Home or the Kingdom Hall, a searched place or
 * address (or pasted coordinates), one of the User's Contacts, or a pin put on
 * the map. In `start` and `finish` modes it picks that end of the day instead
 * of adding a stop. With `saving`, the place picked is also saved as Home or
 * the Kingdom Hall.
 */
export default function AddRouteStopSheet({
  open,
  mode,
  saving: savingAtOpen,
  around,
  onRouteContactIds,
  onClose,
  onPick,
}: {
  open: boolean
  mode: AddRouteStopMode
  /** Opened to save this place first, e.g. from Set Home in a menu. */
  saving?: SavedPlaceKind
  /** Where the Map tab opens: the route's area. */
  around?: Coordinate
  /** Contacts already stops on the route. */
  onRouteContactIds: string[]
  onClose: () => void
  onPick: (
    stop: AddedStop,
    source: AddedStopSource,
    savedPlace?: SavedPlaceKind
  ) => void
}) {
  const theme = useTheme()
  const [tab, setTab] = useState<Tab>('places')
  const [placeQuery, setPlaceQuery] = useState('')
  const [contactQuery, setContactQuery] = useState('')
  const [pin, setPin] = useState<{ coordinate: Coordinate; title?: string }>()
  const [pinName, setPinName] = useState('')
  const [saving, setSaving] = useState(savingAtOpen)
  const [openedFor, setOpenedFor] = useState(open ? savingAtOpen : undefined)
  if (open && openedFor !== savingAtOpen) {
    setOpenedFor(savingAtOpen)
    setSaving(savingAtOpen)
  }
  const contacts = useContacts((s) => s.contacts)
  const conversations = useConversations((s) => s.conversations)
  const savedPlaces = useSavedPlaces((s) => s.places)
  const savePlace = useSavedPlaces((s) => s.set)
  const forgetPlace = useSavedPlaces((s) => s.clear)

  const close = () => {
    onClose()
    setTab('places')
    setPlaceQuery('')
    setContactQuery('')
    setPin(undefined)
    setPinName('')
    setSaving(undefined)
    setOpenedFor(undefined)
  }

  const pick = (stop: AddedStop, source: AddedStopSource) => {
    if (saving) {
      const { key: _key, kind: _kind, ...place } = stop
      savePlace(saving, place)
      analytics.capture('route_saved_place_set', {
        place: SAVED_PLACE_SOURCE[saving],
      })
      onPick(
        {
          key: `place:${Crypto.randomUUID()}`,
          kind: 'place',
          ...savedPlaceOnRoute(saving, place),
        },
        SAVED_PLACE_SOURCE[saving],
        saving
      )
    } else {
      onPick(stop, source)
    }
    close()
  }

  const pickSaved = (kind: SavedPlaceKind) => {
    const place = savedPlaces[kind]
    if (!place) return
    onPick(
      {
        key: `place:${Crypto.randomUUID()}`,
        kind: 'place',
        ...savedPlaceOnRoute(kind, place),
      },
      SAVED_PLACE_SOURCE[kind],
      kind
    )
    close()
  }

  const pickPlace = (place: ResolvedPlace) => {
    const { latitude, longitude } = place
    if (!isCoordinate({ latitude, longitude })) return
    const lines = formatPlanLocation(place)
    pick(
      {
        key: `place:${Crypto.randomUUID()}`,
        kind: 'place',
        title: lines.primary,
        subtitle: lines.secondary,
        coordinate: { latitude: latitude!, longitude: longitude! },
        destination:
          place.address?.trim() ||
          coordinateText({ latitude: latitude!, longitude: longitude! }),
      },
      'place'
    )
  }

  const dropPin = async (coordinate: Coordinate) => {
    setPin({ coordinate })
    const title = await pinTitle(coordinate)
    if (!title) return
    setPin((current) =>
      current?.coordinate === coordinate ? { coordinate, title } : current
    )
  }

  const located = filterActivesContacts(contacts).filter((contact) =>
    isCoordinate(contact.coordinate)
  )
  // Keyed on whether there's a query, not the query itself, so the compiler
  // keeps one index while the User types.
  const searching = contactQuery.trim().length > 0
  const fuse = searching ? buildContactsFuse(located, conversations) : undefined
  const contactResults = stopContactResults(located, contactQuery, fuse)

  // Coordinates pasted into search (or a map link) go straight on the route.
  const pasted = parseCoordinateInput(placeQuery)

  const pickLabel = saving
    ? i18n.t('routeBuilder_saveAs', { place: savedPlaceLabel(saving) })
    : mode === 'start'
      ? i18n.t('routeBuilder_startHere')
      : mode === 'finish'
        ? i18n.t('routeBuilder_finishHere')
        : i18n.t('routeBuilder_addToRoute')
  const pickIcon =
    mode === 'start' ? PlayIcon : mode === 'finish' ? FlagIcon : CirclePlusIcon

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && close()}
      snapPoints={[{ fraction: 0.85 }]}
      // Panning the map mustn't pull the sheet down.
      dismissible={tab !== 'map'}
      backgroundColor={theme.colors.backgroundLighter}
    >
      <View style={{ flex: 1, paddingTop: 20, paddingHorizontal: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              flex: 1,
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {saving
              ? i18n.t('routeBuilder_setSavedPlaceTitle', {
                  place: savedPlaceLabel(saving),
                })
              : mode === 'start'
                ? i18n.t('routeBuilder_chooseStart')
                : mode === 'finish'
                  ? i18n.t('routeBuilder_chooseFinish')
                  : i18n.t('routeBuilder_addStop')}
          </Text>
          <IconButton
            frame
            noTransform
            icon={XIcon}
            size='xl'
            accessibilityLabel={i18n.t('close')}
            onPress={close}
          />
        </View>
        <NativeSegmentedControl
          options={[
            { key: 'places', label: i18n.t('routeBuilder_places') },
            { key: 'contacts', label: i18n.t('contacts') },
            { key: 'map', label: i18n.t('routeBuilder_map') },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'map' ? (
          <View style={{ flex: 1, gap: 10, paddingBottom: 24 }}>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('routeBuilder_mapHelp')}
            </Text>
            <View
              style={{
                flex: 1,
                overflow: 'hidden',
                borderRadius: theme.numbers.borderRadiusMd,
                borderCurve: 'continuous',
              }}
            >
              <PinPickerMap
                coordinate={pin?.coordinate}
                around={around}
                onChange={(coordinate) => void dropPin(coordinate)}
                otherPins={located.map((contact) => ({
                  id: contact.id,
                  coordinate: contact.coordinate!,
                }))}
              />
            </View>
            {pin && (
              <Text
                selectable
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {coordinateLabel(pin.coordinate)}
              </Text>
            )}
            {!saving && (
              <MyTextInput
                value={pinName}
                onChangeText={setPinName}
                placeholder={
                  pin?.title ??
                  `${i18n.t('routeBuilder_stopName')} (${i18n.t('routeBuilder_stopNamePlaceholder')})`
                }
                accessibilityLabel={i18n.t('routeBuilder_stopName')}
                textAlign='start'
              />
            )}
            <ActionButton
              noTransform
              disabled={!pin}
              onPress={() => {
                if (!pin) return
                pick(pinnedStop(pin.coordinate, pinName || pin.title), 'map')
              }}
            >
              {pickLabel}
            </ActionButton>
          </View>
        ) : (
          <Sheet.ScrollView
            contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
            keyboardDismissMode='on-drag'
          >
            {tab === 'places' && (
              <>
                {saving ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: theme.numbers.borderRadiusMd,
                      backgroundColor: theme.colors.accentTranslucent,
                    }}
                  >
                    <LucideIcon
                      icon={SAVED_PLACE_ICONS[saving]}
                      size={16}
                      color={theme.colors.accent}
                    />
                    <Text style={{ flex: 1, fontSize: theme.fontSize('sm') }}>
                      {i18n.t('routeBuilder_setSavedPlaceHint', {
                        place: savedPlaceLabel(saving),
                      })}
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {SAVED_PLACE_KINDS.map((kind) => (
                      <SavedPlaceChip
                        key={kind}
                        kind={kind}
                        address={savedPlaces[kind]?.title}
                        set={!!savedPlaces[kind]}
                        onPick={() => pickSaved(kind)}
                        onSet={() => setSaving(kind)}
                        onForget={() => forgetPlace(kind)}
                      />
                    ))}
                  </View>
                )}
                {pasted && (
                  <Button
                    noTransform
                    accessibilityLabel={`${pickLabel}, ${coordinateLabel(pasted)}`}
                    onPress={() => pick(pinnedStop(pasted), 'coordinates')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: theme.numbers.borderRadiusMd,
                      backgroundColor: theme.colors.card,
                    }}
                  >
                    <LucideIcon
                      icon={MapPinIcon}
                      size={18}
                      color={theme.colors.textAlt}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontFamily: theme.fonts.semiBold }}>
                        {i18n.t('routeBuilder_coordinates')}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.textAlt,
                          fontSize: theme.fontSize('sm'),
                        }}
                      >
                        {coordinateLabel(pasted)}
                      </Text>
                    </View>
                    <LucideIcon
                      icon={pickIcon}
                      size={20}
                      color={theme.colors.accent}
                    />
                  </Button>
                )}
                <PlaceSearchInput
                  scope='all'
                  query={placeQuery}
                  onChangeQuery={setPlaceQuery}
                  onSelect={pickPlace}
                  searchEnabled={!pasted}
                  placeholder={i18n.t('routeBuilder_searchPlaces')}
                  accessibilityLabel={i18n.t('routeBuilder_searchPlaces')}
                />
              </>
            )}

            {tab === 'contacts' && (
              <>
                <MyTextInput
                  value={contactQuery}
                  onChangeText={setContactQuery}
                  placeholder={i18n.t('routeBuilder_searchContacts')}
                  accessibilityLabel={i18n.t('routeBuilder_searchContacts')}
                  textAlign='start'
                  clearButtonMode='while-editing'
                  autoCorrect={false}
                />
                {contactResults.shown.length === 0 ? (
                  <Text style={{ color: theme.colors.textAlt }}>
                    {i18n.t('routeBuilder_noContacts')}
                  </Text>
                ) : (
                  <View
                    style={{
                      borderRadius: theme.numbers.borderRadiusMd,
                      backgroundColor: theme.colors.card,
                      overflow: 'hidden',
                    }}
                  >
                    {contactResults.shown.map((contact, index) => {
                      const address = addressToString(contact.address).trim()
                      const onRoute =
                        mode === 'stop' &&
                        !saving &&
                        onRouteContactIds.includes(contact.id)
                      return (
                        <Button
                          key={contact.id}
                          noTransform
                          disabled={onRoute}
                          accessibilityLabel={contact.name}
                          onPress={() =>
                            pick(
                              contactStop({
                                ...contact,
                                coordinate: contact.coordinate!,
                              }),
                              'contact'
                            )
                          }
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderTopWidth: index === 0 ? 0 : 1,
                            borderTopColor: theme.colors.border,
                          }}
                        >
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text
                              numberOfLines={1}
                              style={{ fontFamily: theme.fonts.semiBold }}
                            >
                              {contact.name}
                            </Text>
                            {address ? (
                              <Text
                                numberOfLines={1}
                                style={{
                                  color: theme.colors.textAlt,
                                  fontSize: theme.fontSize('sm'),
                                }}
                              >
                                {address}
                              </Text>
                            ) : null}
                          </View>
                          {onRoute ? (
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <LucideIcon
                                icon={CheckIcon}
                                size={14}
                                color={theme.colors.textAlt}
                              />
                              <Text
                                style={{
                                  color: theme.colors.textAlt,
                                  fontSize: theme.fontSize('sm'),
                                }}
                              >
                                {i18n.t('routeBuilder_onRoute')}
                              </Text>
                            </View>
                          ) : (
                            <LucideIcon
                              icon={pickIcon}
                              size={20}
                              color={theme.colors.accent}
                            />
                          )}
                        </Button>
                      )
                    })}
                  </View>
                )}
                {contactResults.more > 0 && (
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                      textAlign: 'center',
                    }}
                  >
                    {i18n.t(
                      (searching
                        ? 'routeBuilder_moreContactsKeepTyping'
                        : 'routeBuilder_moreContactsSearch') as TranslationKey,
                      { count: contactResults.more }
                    )}
                  </Text>
                )}
              </>
            )}
          </Sheet.ScrollView>
        )}
      </View>
    </Sheet>
  )
}

/**
 * Home or the Kingdom Hall: picks the saved place, or starts saving it. Touch
 * and hold a saved one to change or forget it.
 */
function SavedPlaceChip({
  kind,
  address,
  set,
  onPick,
  onSet,
  onForget,
}: {
  kind: SavedPlaceKind
  address?: string
  set: boolean
  onPick: () => void
  onSet: () => void
  onForget: () => void
}) {
  const theme = useTheme()
  const label = savedPlaceLabel(kind)
  const chip = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.card,
        borderWidth: set ? 0 : 1,
        borderStyle: 'dashed',
        borderColor: theme.colors.border,
      }}
    >
      <LucideIcon
        icon={SAVED_PLACE_ICONS[kind]}
        size={18}
        color={set ? theme.colors.accent : theme.colors.textAlt}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.semiBold }}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {set ? address : i18n.t('routeBuilder_savedPlaceUnset')}
        </Text>
      </View>
      {!set && (
        <LucideIcon icon={PlusIcon} size={14} color={theme.colors.textAlt} />
      )}
    </View>
  )

  return (
    <View style={{ flex: 1 }}>
      {set ? (
        <ContextMenu
          onPress={onPick}
          accessibilityLabel={address ? `${label}, ${address}` : label}
          hoverRadius={theme.numbers.borderRadiusMd}
          actions={[
            {
              id: 'change',
              title: i18n.t('routeBuilder_changeSavedPlace'),
              systemImage: 'pencil',
              onPress: onSet,
            },
            {
              id: 'forget',
              title: i18n.t('remove'),
              systemImage: 'trash',
              destructive: true,
              onPress: onForget,
            },
          ]}
        >
          {chip}
        </ContextMenu>
      ) : (
        <Button
          noTransform
          onPress={onSet}
          accessibilityLabel={i18n.t('routeBuilder_setSavedPlace', {
            place: label,
          })}
        >
          {chip}
        </Button>
      )}
    </View>
  )
}
