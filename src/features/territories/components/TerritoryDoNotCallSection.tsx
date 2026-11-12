import { useState } from 'react'
import { View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import {
  Ban as BanIcon,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  Copy as CopyIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import LucideIcon from '@/components/ui/LucideIcon'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import DoNotCallDateRow from '@/features/territories/components/DoNotCallDateRow'
import DoNotCallRow from '@/features/territories/components/DoNotCallRow'
import TerritoryPill from '@/features/territories/components/TerritoryPill'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import type { DoNotCallEntry } from '@/features/territories/lib/doors'
import { mapLinkFor } from '@/features/territories/lib/territoryLink'
import { formatDoorAddress } from '@/features/territories/lib/territoryTitle'
import type {
  TerritoryDoNotCall,
  TerritoryStreet,
} from '@/features/territories/types/territory'

type StreetChoice = Pick<TerritoryStreet, 'id' | 'name' | 'numbering'>

export type NewDoNotCall = Pick<
  TerritoryDoNotCall,
  'address' | 'streetId' | 'label' | 'at'
>

const ELSEWHERE = 'elsewhere'

export default function TerritoryDoNotCallSection({
  title = i18n.t('territories.doNotCalls'),
  note,
  entries,
  readOnly,
  editable = !readOnly,
  streets,
  pickStreet = true,
  copyable = false,
  summary,
  onAdd,
  onEdit,
}: {
  title?: string

  summary?: string

  note?: string
  entries: DoNotCallEntry[]

  readOnly: boolean

  editable?: boolean

  streets: StreetChoice[]

  pickStreet?: boolean

  copyable?: boolean
  onAdd: (entry: NewDoNotCall) => void
  onEdit?: (entry: DoNotCallEntry) => void
}) {
  const theme = useTheme()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [choice, setChoice] = useState(streets[0]?.id ?? ELSEWHERE)
  const [date, setDate] = useState<Date | null>(null)
  const [open, setOpen] = useState(false)
  const street = streets.find((option) => option.id === choice)
  const ready = text.trim().length > 0

  const close = () => {
    setText('')
    setDate(null)
    setAdding(false)
  }

  const add = () => {
    if (!ready) return
    const typed = text.trim()
    const at = Math.min(date?.getTime() ?? Date.now(), Date.now())
    onAdd(
      !street
        ? { address: typed, at }
        : street.numbering === 'none'
          ? {
              address: formatDoorAddress(street, {
                label: '',
                description: typed,
              }),
              streetId: street.id,
              at,
            }
          : {
              address: formatDoorAddress(street, { label: typed }),
              streetId: street.id,
              label: typed,
              at,
            }
    )
    close()
  }

  const copy = async () => {
    await Clipboard.setStringAsync(
      entries
        .map((entry) =>
          [
            i18n.t('territories.doNotCallLine', {
              address: entry.address,
              date: formatDate(entry.at, { style: 'medium' }),
            }),
            entry.coordinate && mapLinkFor(entry.coordinate),
          ]
            .filter(Boolean)
            .join(' ')
        )
        .join('\n')
    )
    toast.success(i18n.t('copied'))
  }

  if (readOnly && entries.length === 0) return null
  const compact = summary !== undefined
  const toggles = compact && entries.length > 0
  const listed = !toggles || open

  const field = !street
    ? {
        label: i18n.t('territories.doNotCallAddress'),
        placeholder: i18n.t('territories.doNotCallAddressPlaceholder'),
      }
    : street.numbering === 'none'
      ? {
          label: i18n.t('territories.describeDoor'),
          placeholder: i18n.t('territories.describeDoor_placeholder'),
        }
      : { label: i18n.t('territories.houseNumberLabel'), placeholder: '12' }

  const hint = (words: string) => (
    <Text
      style={{
        color: theme.colors.textAlt,
        fontSize: theme.fontSize('sm'),
        paddingHorizontal: 5,
      }}
    >
      {words}
    </Text>
  )

  if (compact && entries.length === 0 && !readOnly && !adding)
    return (
      <Button
        testID='street-dnc-add'
        onPress={() => setAdding(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 8,
          minHeight: 44,
          paddingHorizontal: 5,
          marginVertical: -6,
        }}
      >
        <LucideIcon icon={PlusIcon} size={18} color={theme.colors.textAlt} />
        <Text
          style={{
            fontFamily: theme.fonts.medium,
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('territories.addDoNotCall')}
        </Text>
      </Button>
    )

  return (
    <View style={{ gap: 8 }}>
      {!compact && (
        <TerritorySectionTitle info={i18n.t('territories.doNotCall_info')}>
          {title}
        </TerritorySectionTitle>
      )}
      {note && hint(note)}
      <Section>
        {toggles && (
          <InputRowButton
            key='summary'
            testID='street-dnc-summary'
            leftIcon={BanIcon}
            leftIconColor={theme.colors.error}
            label={summary}
            onPress={() => setOpen((was) => !was)}
            lastInSection={!open}
          >
            <LucideIcon
              icon={open ? ChevronUpIcon : ChevronDownIcon}
              size={18}
              color={theme.colors.textAlt}
            />
          </InputRowButton>
        )}
        {listed &&
          entries.map((entry, index) => (
            <DoNotCallRow
              key={entry.id}
              entry={entry}
              last={readOnly && index === entries.length - 1}
              onEdit={editable && onEdit ? () => onEdit(entry) : undefined}
            />
          ))}
        {listed && !readOnly && !adding && (
          <InputRowButton
            key='add'
            leftIcon={PlusIcon}
            label={i18n.t('territories.addDoNotCall')}
            onPress={() => setAdding(true)}
            lastInSection
          />
        )}
        {listed && !readOnly && adding && pickStreet && streets.length > 0 && (
          <InputRowSelect
            key='street'
            label={i18n.t('territories.streetName')}
            selectProps={{
              data: [
                ...streets.map((option) => ({
                  label: option.name,
                  value: option.id,
                })),
                {
                  label: i18n.t('territories.doNotCallElsewhere'),
                  value: ELSEWHERE,
                },
              ],
              value: choice,
              onChange: (item) => setChoice(item.value),
              accessibilityLabel: i18n.t('territories.streetName'),
            }}
          />
        )}
        {listed && !readOnly && adding && (
          <TextInputRow
            key='address'
            label={field.label}
            controlWidth={street?.numbering === 'none' ? 'full' : undefined}
            textInputProps={{
              value: text,
              onChangeText: setText,
              onSubmitEditing: add,
              placeholder: field.placeholder,
              autoFocus: true,
              returnKeyType: 'done',
              maxLength: 120,
              testID: 'territory-dnc-address',
            }}
          />
        )}
        {listed && !readOnly && adding && (
          <DoNotCallDateRow
            key='date'
            value={date ?? new Date()}
            onChange={setDate}
          />
        )}
        {listed && !readOnly && adding && (
          <View
            key='save'
            style={{
              gap: 12,
              paddingHorizontal: inputLayout.horizontalPadding,
              paddingTop: 4,
              paddingBottom: 16,
            }}
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('territories.doNotCall_rule')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button
                onPress={close}
                testID='territory-dnc-back'
                style={{
                  minHeight: 44,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  justifyContent: 'center',
                  borderRadius: 22,
                  backgroundColor: theme.colors.backgroundLighter,
                }}
              >
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {i18n.t('cancel')}
                </Text>
              </Button>
              <Button
                disabled={!ready}
                onPress={add}
                testID='territory-dnc-add'
                style={{
                  flex: 1,
                  minHeight: 44,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 22,
                  backgroundColor: theme.colors.accent,
                  opacity: ready ? 1 : 0.5,
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.bold,
                    color: theme.colors.textInverse,
                  }}
                >
                  {i18n.t('territories.saveDoNotCall')}
                </Text>
              </Button>
            </View>
          </View>
        )}
      </Section>
      {copyable && entries.length > 0 && (
        <TerritoryPill
          icon={CopyIcon}
          iconColor={theme.colors.text}
          label={i18n.t('territories.copyDoNotCalls')}
          onPress={() => void copy()}
          testID='territory-dnc-copy'
        />
      )}
    </View>
  )
}
