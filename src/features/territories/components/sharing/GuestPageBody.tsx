import { type ReactNode, useState } from 'react'
import { ScrollView, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  CircleCheck as CircleCheckIcon,
  Circle as CircleIcon,
  Timer as TimerIcon,
} from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import ChoiceChips from '@/components/ui/ChoiceChips'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import GuestStreetRecorder from '@/features/territories/components/sharing/GuestStreetRecorder'
import TerritoryDoNotCallSection from '@/features/territories/components/TerritoryDoNotCallSection'
import {
  streetDoNotCalls,
  updateStreet,
} from '@/features/territories/lib/doors'
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
  endsText: string
  live: boolean
  guest: { id: string; name: string } | null
  houseRecords: boolean
  initialName?: string
  notice?: ReactNode
  footer?: ReactNode
  onJoin: (name: string) => void
  onChange: (apply: (current: Territory) => Territory) => void
}

export default function GuestPageBody({
  territory,
  streets,
  title,
  ownerName,
  endsText,
  live,
  guest,
  houseRecords,
  initialName = '',
  notice,
  footer,
  onJoin,
  onChange,
}: GuestPageBodyProps) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState(initialName)
  const [streetId, setStreetId] = useState<string | null>(null)
  const street = streets.find((entry) => entry.id === streetId) ?? streets[0]
  const chips = !!guest && live && houseRecords && streets.length > 1

  const join = () => {
    if (name.trim()) onJoin(name.trim())
  }

  const muted = {
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('sm'),
  }

  const intro = (
    <View style={{ gap: 12 }}>
      {notice}
      <View style={{ gap: 4, paddingHorizontal: 5 }}>
        <Text
          accessibilityRole='header'
          testID='guest-title'
          style={{
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('2xl'),
          }}
        >
          {ownerName
            ? i18n.t('territories.share.guestTitle', {
                name: ownerName,
                territory: title,
              })
            : title}
        </Text>
        {!chips && (
          <Text style={{ color: theme.colors.textAlt }}>
            {streets.map((entry) => entry.name).join(', ')}
          </Text>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
          }}
        >
          <LucideIcon icon={TimerIcon} size={16} color={theme.colors.accent} />
          <Text
            testID='guest-ends'
            style={{ fontFamily: theme.fonts.semiBold }}
          >
            {live
              ? endsText
              : i18n.t('territories.share.linkEndedOn', { time: endsText })}
          </Text>
        </View>
      </View>
      {chips && street && (
        <ChoiceChips<string>
          options={streets.map((entry) => ({
            key: entry.id,
            label: entry.name,
            testID: `guest-street-${entry.id}`,
          }))}
          value={street.id}
          onChange={setStreetId}
        />
      )}
    </View>
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
      <Text style={muted}>
        {i18n.t('territories.share.guestName_description')}
      </Text>
      <ActionButton
        testID='guest-name-continue'
        disabled={!name.trim()}
        onPress={join}
      >
        {i18n.t('territories.share.guestStart')}
      </ActionButton>
    </Card>
  )

  const toggleWorked = (entry: TerritoryStreet, guestId: string) =>
    onChange((current) =>
      updateStreet(current, entry.id, (had) => ({
        ...had,
        workedAt: had.workedAt === undefined ? Date.now() : undefined,
        workedBy: guestId,
      }))
    )

  const privacyBody = (guestId: string) => (
    <>
      <Section>
        {streets.map((entry, index) => (
          <InputRowButton
            key={entry.id}
            testID={`guest-worked-${entry.id}`}
            label={entry.name}
            sublabel={
              entry.workedAt !== undefined
                ? i18n.t('territories.streetWorkedOn', {
                    date: formatDate(entry.workedAt, { style: 'medium' }),
                  })
                : i18n.t('territories.streetNotWorked')
            }
            checked={entry.workedAt !== undefined}
            onPress={() => toggleWorked(entry, guestId)}
            lastInSection={index === streets.length - 1}
          >
            <LucideIcon
              icon={entry.workedAt !== undefined ? CircleCheckIcon : CircleIcon}
              size={22}
              color={
                entry.workedAt !== undefined
                  ? theme.colors.accent
                  : theme.colors.border
              }
            />
          </InputRowButton>
        ))}
      </Section>
      {streets.map((entry) => (
        <TerritoryDoNotCallSection
          key={entry.id}
          title={entry.name}
          entries={streetDoNotCalls(territory, entry, formatDoorAddress)}
          readOnly={!live}
          editable={false}
          streets={[entry]}
          pickStreet={false}
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
      ))}
    </>
  )

  if (live && guest && street && houseRecords)
    return (
      <GuestStreetRecorder
        key={street.id}
        territory={territory}
        street={street}
        guestId={guest.id}
        ownerName={ownerName}
        header={intro}
        footer={footer}
        onChange={onChange}
      />
    )

  return (
    <ScrollView keyboardShouldPersistTaps='handled'>
      <ContentColumn
        style={{
          padding: inputLayout.horizontalPadding,
          paddingBottom: insets.bottom + 30,
          gap: 20,
        }}
      >
        {intro}
        {!live ? (
          <Text style={{ ...muted, textAlign: 'center' }}>
            {i18n.t('territories.share.linkEnded_description')}
          </Text>
        ) : !guest ? (
          nameStep
        ) : (
          privacyBody(guest.id)
        )}
        {footer}
      </ContentColumn>
    </ScrollView>
  )
}
