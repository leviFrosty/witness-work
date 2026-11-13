import { type ReactNode, useState } from 'react'
import { ScrollView, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check as CheckIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Sheet from '@/components/ui/Sheet'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { formatDate, formatDateTime, formatTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import GuestHeader from '@/features/territories/components/sharing/GuestHeader'
import GuestShareSheet from '@/features/territories/components/sharing/GuestShareSheet'
import GuestStreetList, {
  GUEST_STREET_SEARCH_FROM,
  GuestStreetRow,
  GuestStreetSearch,
  GuestStreetRows,
} from '@/features/territories/components/sharing/GuestStreetList'
import GuestStreetRecorder from '@/features/territories/components/sharing/GuestStreetRecorder'
import TerritoryDoNotCallSection from '@/features/territories/components/TerritoryDoNotCallSection'
import {
  territoryDoNotCalls,
  updateStreet,
} from '@/features/territories/lib/doors'
import { findGuestStreets } from '@/features/territories/lib/guestStreets'
import {
  linkOpenUntilText,
  personName,
} from '@/features/territories/lib/shareText'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export type GuestPageBodyProps = {
  territory: Territory
  streets: TerritoryStreet[]
  title: string
  ownerName: string
  endsAt: number
  live: boolean
  guest: { id: string; name: string } | null
  houseRecords: boolean
  initialName?: string

  streetId?: string | null
  onPickStreet?: (streetId: string | null) => void

  shareUrl?: string | null
  notice?: ReactNode
  onJoin: (name: string) => void
  onChangeName?: () => void
  onForget?: () => void
  onChange: (apply: (current: Territory) => Territory) => void
}

export default function GuestPageBody({
  territory,
  streets,
  title,
  ownerName,
  endsAt,
  live,
  guest,
  houseRecords,
  initialName = '',
  streetId: savedStreetId,
  onPickStreet,
  shareUrl,
  notice,
  onJoin,
  onChangeName,
  onForget,
  onChange,
}: GuestPageBodyProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState(initialName)
  const [pickedStreetId, setPickedStreetId] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [query, setQuery] = useState('')
  const chosenId = onPickStreet ? savedStreetId : pickedStreetId
  const only = streets.length === 1 ? streets[0] : undefined
  const street = only ?? streets.find((entry) => entry.id === chosenId)

  const pickStreet = (id: string | null) => {
    toast.dismissKey('territory-guest-door')
    setChoosing(false)
    if (onPickStreet) onPickStreet(id)
    else setPickedStreetId(id)
  }

  const join = () => {
    if (name.trim()) onJoin(name.trim())
  }

  const overline = ownerName
    ? i18n.t('territories.guest.sharedBy', { name: ownerName })
    : undefined
  const until = live
    ? linkOpenUntilText(endsAt, Date.now())
    : i18n.t('territories.share.linkEndedOn', {
        time: formatDateTime(endsAt, { style: 'medium' }),
      })
  const closing = live && endsAt - Date.now() < 60 * 60 * 1000
  const onShare =
    live && shareUrl
      ? () => {
          toast.dismissKey('territory-guest-door')
          setSharing(true)
        }
      : undefined

  const shareSheet = shareUrl ? (
    <GuestShareSheet
      open={sharing}
      url={shareUrl}
      title={i18n.t('territories.share.guestLinkShareTitle', {
        territory: title,
      })}
      territory={title}
      context={[overline, until].filter(Boolean).join(' · ')}
      onClose={() => setSharing(false)}
      onForget={
        onForget
          ? () => {
              setSharing(false)
              onForget()
            }
          : undefined
      }
    />
  ) : null

  const recordingAs = guest && onChangeName && (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'center',
        paddingTop: 10,
      }}
    >
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('territories.guest.recordingAs', { name: guest.name })}
      </Text>
      <Button
        testID='guest-change-name'
        onPress={onChangeName}
        style={{
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: 12,
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.accent,
          }}
        >
          {i18n.t('territories.guest.changeName')}
        </Text>
      </Button>
    </View>
  )

  if (live && guest && street && houseRecords)
    return (
      <>
        <GuestStreetRecorder
          key={street.id}
          territory={territory}
          street={street}
          guestId={guest.id}
          ownerName={ownerName}
          header={
            <View style={{ gap: 12 }}>
              {notice}
              <GuestHeader
                title={street.name}
                meta={title}
                until={
                  closing
                    ? i18n.t('territories.guest.closesAt', {
                        time: formatTime(endsAt),
                      })
                    : undefined
                }
                urgent
                onShare={onShare}
                onChangeStreet={
                  only
                    ? undefined
                    : () => {
                        toast.dismissKey('territory-guest-door')
                        setChoosing(true)
                      }
                }
              />
            </View>
          }
          footer={recordingAs}
          onChange={onChange}
        />
        {shareSheet}
        <Sheet
          open={choosing}
          onOpenChange={setChoosing}
          accessibilityLabel={i18n.t('territories.guest.changeStreet')}
          testID='guest-street-sheet'
        >
          <Sheet.ScrollView>
            <View style={{ gap: 16, padding: 20, paddingTop: 28 }}>
              <Text
                accessibilityRole='header'
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('xl'),
                  textAlign: 'center',
                }}
              >
                {i18n.t('territories.guest.changeStreet')}
              </Text>
              <GuestStreetList
                heading={false}
                streets={streets}
                territory={territory}
                ownerName={ownerName}
                guestId={guest.id}
                currentId={street.id}
                onPick={pickStreet}
              />
            </View>
          </Sheet.ScrollView>
        </Sheet>
      </>
    )

  const summary = only
    ? only.name
    : i18n.t('territories.guest.streetsCount', { count: streets.length })

  const continueLabel = i18n.t(
    houseRecords && !only ? 'territories.guest.next' : 'territories.guest.start'
  )

  const nameStep = (
    <Card style={{ gap: 14 }} testID='guest-name-card'>
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
        }}
      >
        {i18n.t('territories.share.guestName')}
      </Text>
      <TextInput
        testID='guest-name-input'
        textAlign='start'
        value={name}
        onChangeText={setName}
        placeholder={i18n.t('territories.share.guestName_placeholder')}
        autoComplete='name'
        maxLength={40}
        returnKeyType='done'
        onSubmitEditing={join}
      />
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t(
          houseRecords
            ? 'territories.share.guestName_description'
            : 'territories.guest.nameHintPrivacy'
        )}
      </Text>
      {name.trim() ? (
        <ActionButton testID='guest-name-continue' onPress={join}>
          {continueLabel}
        </ActionButton>
      ) : (
        <View
          testID='guest-name-continue'
          accessibilityRole='button'
          accessibilityState={{ disabled: true }}
          style={{
            minHeight: 48,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('lg'),
              color: theme.colors.textAlt,
            }}
          >
            {continueLabel}
          </Text>
        </View>
      )}
    </Card>
  )

  const setWorked = (
    entry: TerritoryStreet,
    guestId: string,
    workedAt: number | undefined
  ) =>
    onChange((current) =>
      updateStreet(current, entry.id, (had) => ({
        ...had,
        workedAt,
        workedBy: guestId,
      }))
    )

  const toggleWorked = (entry: TerritoryStreet, guestId: string) => {
    const was = entry.workedAt
    setWorked(entry, guestId, was === undefined ? Date.now() : undefined)
    toast.undo({
      key: 'territory-guest-door',
      durationMs: 5000,
      title: i18n.t(
        was === undefined
          ? 'territories.guest.markedWorked_toast'
          : 'territories.guest.markedNotWorked_toast',
        { street: entry.name }
      ),
      onUndo: () => setWorked(entry, guestId, was),
    })
  }

  const found = findGuestStreets(streets, query)
  const workedRows = found.filter((entry) => entry.workedAt !== undefined)
  const openRows = found.filter((entry) => entry.workedAt === undefined)
  const sectionTitle = {
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textAlt,
    paddingHorizontal: 5,
    marginBottom: -10,
  }
  const workedWhen = (at: number) =>
    new Date(at).toDateString() === new Date().toDateString()
      ? formatTime(at)
      : formatDate(at, { style: 'medium' })

  const privacyRows = (entries: TerritoryStreet[], guestId: string) => (
    <GuestStreetRows>
      {entries.map((entry, index) => {
        const worked = entry.workedAt !== undefined
        return (
          <GuestStreetRow
            key={entry.id}
            testID={`guest-street-${entry.id}`}
            name={entry.name}
            status={
              entry.workedAt === undefined
                ? ''
                : entry.workedBy
                  ? entry.workedBy === guestId
                    ? i18n.t('territories.guest.workedByYou', {
                        when: workedWhen(entry.workedAt),
                      })
                    : i18n.t('territories.guest.workedBy', {
                        name: personName(territory, entry.workedBy),
                        when: workedWhen(entry.workedAt),
                      })
                  : i18n.t('territories.streetWorkedOn', {
                      date: formatDate(entry.workedAt, { style: 'medium' }),
                    })
            }
            strong={worked}
            first={index === 0}
            trailing={
              <Button
                testID={`guest-worked-${entry.id}`}
                accessibilityState={{ checked: worked }}
                onPress={() => toggleWorked(entry, guestId)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: 22,
                  backgroundColor: worked
                    ? theme.colors.accentTranslucent
                    : theme.colors.backgroundLighter,
                }}
              >
                {worked && (
                  <LucideIcon
                    icon={CheckIcon}
                    size={16}
                    color={theme.colors.accent3}
                  />
                )}
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: worked ? theme.colors.accent3 : theme.colors.text,
                  }}
                >
                  {i18n.t(
                    worked
                      ? 'territories.guest.streetWorked'
                      : 'territories.guest.markWorked'
                  )}
                </Text>
              </Button>
            }
          />
        )
      })}
    </GuestStreetRows>
  )

  const privacyBody = (guestId: string) => (
    <>
      <TerritoryDoNotCallSection
        entries={territoryDoNotCalls(territory, formatDoorAddress)}
        readOnly={!live}
        editable={false}
        streets={streets}
        elsewhere={false}
        onAdd={(added) =>
          onChange((current) => ({
            ...current,
            doNotCalls: [
              ...current.doNotCalls,
              { ...added, id: Crypto.randomUUID().toLowerCase() },
            ],
          }))
        }
      />
      <Text
        accessibilityRole='header'
        testID='guest-privacy'
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('lg'),
          paddingHorizontal: 5,
          marginBottom: -10,
        }}
      >
        {i18n.t('territories.guest.streetsHeading')}
      </Text>
      {streets.length > GUEST_STREET_SEARCH_FROM && (
        <GuestStreetSearch value={query} onChange={setQuery} />
      )}
      {workedRows.length > 0 && workedRows.length < found.length && (
        <Text style={sectionTitle}>
          {i18n.t('territories.guest.workedStreets')}
        </Text>
      )}
      {workedRows.length > 0 && privacyRows(workedRows, guestId)}
      {workedRows.length > 0 && openRows.length > 0 && (
        <Text style={sectionTitle}>
          {i18n.t('territories.guest.allStreets')}
        </Text>
      )}
      {openRows.length > 0 && privacyRows(openRows, guestId)}
    </>
  )

  return (
    <>
      <ScrollView keyboardShouldPersistTaps='handled'>
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 30,
            gap: 20,
          }}
        >
          {notice}
          <GuestHeader
            overline={overline}
            title={title}
            meta={summary}
            until={until}
            quietShare={!guest}
            onShare={onShare}
          />
          {!live ? (
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                textAlign: 'center',
              }}
            >
              {i18n.t('territories.share.linkEnded_description')}
            </Text>
          ) : !guest ? (
            nameStep
          ) : houseRecords ? (
            <GuestStreetList
              streets={streets}
              territory={territory}
              ownerName={ownerName}
              guestId={guest.id}
              onPick={pickStreet}
            />
          ) : (
            privacyBody(guest.id)
          )}
          {live && recordingAs}
        </ContentColumn>
      </ScrollView>
      {shareSheet}
    </>
  )
}
