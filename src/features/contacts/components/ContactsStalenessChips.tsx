import {
  Info as InfoIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
} from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import LucideIcon from '@/components/ui/LucideIcon'
import FilterChip from '@/components/ui/FilterChip'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import {
  ContactStaleness,
  getEffectiveStalenessChipOrder,
  stalenessToColor,
} from '@/lib/contactStaleness'
import { ConversationIndex } from '@/lib/conversationIndex'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { usePreferences } from '@/stores/preferences'
import useContactsQuery from '@/features/contacts/hooks/useContactsQuery'
import { Contact } from '@/types/contact'
import Button from '@/components/ui/Button'
import SortableChipRow from '@/components/ui/SortableChipRow'
import Popover from '@/components/ui/Popover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import StalenessColorKey from '@/components/StalenessColorKey'
import { RootStackNavigation } from '@/types/rootStack'

export type ContactsStalenessChipsProps = {
  contacts: Contact[]

  index: ConversationIndex

  surface: 'list' | 'map'
}

const ContactsStalenessChips = ({
  contacts,
  index,
  surface,
}: ContactsStalenessChipsProps) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const markerColors = useMarkerColors()
  const chipOrder = getEffectiveStalenessChipOrder(
    usePreferences((s) => s.stalenessChipOrder)
  )
  const setPreferences = usePreferences((s) => s.set)
  const {
    query: { filters: contactsFilters },
    setFilters: setContactsFilters,
  } = useContactsQuery()

  const counts: Record<ContactStaleness, number> = {
    never: 0,
    recent: 0,
    week: 0,
    month: 0,
  }
  for (const contact of contacts) counts[index.stalenessFor(contact.id)] += 1

  const selected = new Set(
    contactsFilters.flatMap((f) => (f.kind === 'pinStaleness' ? [f.value] : []))
  )
  const otherFilters = contactsFilters.filter((f) => f.kind !== 'pinStaleness')

  const select = (bucket: ContactStaleness | undefined) => {
    if (!bucket || (selected.size === 1 && selected.has(bucket))) {
      setContactsFilters(otherFilters)
      return
    }
    setContactsFilters([
      ...otherFilters,
      { kind: 'pinStaleness', value: bucket },
    ])
    analytics.capture('contacts_staleness_chip_applied', {
      variant: bucket,
      source: surface,
    })
  }

  const colorKey = (
    <Popover
      contentWidth={280}
      renderTrigger={({ onPress }) => (
        <PointerTooltip label={i18n.t('contacts_stalenessInfo_title')}>
          <Button
            onPress={onPress}
            accessibilityLabel={i18n.t('contacts_stalenessInfo_title')}
            accessibilityRole='button'
            style={touchTargetFrame(32)}
          >
            <LucideIcon
              icon={InfoIcon}
              size={theme.fontSize('md')}
              style={{ color: theme.colors.textAlt }}
            />
          </Button>
        </PointerTooltip>
      )}
    >
      <StalenessColorKey />
    </Popover>
  )

  return (
    <SortableChipRow
      data={chipOrder}
      keyExtractor={(bucket) => bucket}
      onReorder={(next) => setPreferences({ stalenessChipOrder: next })}
      leading={
        <>
          {}
          <FilterChip
            label={i18n.t('contacts_sortAndFilter_title')}
            icon={SlidersHorizontalIcon}
            count={otherFilters.length > 0 ? otherFilters.length : undefined}
            active={otherFilters.length > 0}
            onPress={() => navigation.navigate('Contacts Sort And Filter')}
          />
          <FilterChip
            label={i18n.t('contacts_stalenessChip_all')}
            count={contacts.length}
            active={selected.size === 0}
            onPress={() => select(undefined)}
          />
        </>
      }
      renderItem={(bucket) => (
        <FilterChip
          label={i18n.t(`contacts_pinStaleness_${bucket}` as TranslationKey)}
          count={counts[bucket]}
          color={stalenessToColor(bucket, markerColors)}
          active={selected.has(bucket)}
          onPress={() => select(bucket)}
        />
      )}
      trailing={surface === 'list' ? colorKey : undefined}
    />
  )
}

export default ContactsStalenessChips
