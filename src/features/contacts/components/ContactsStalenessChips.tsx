import { Info as InfoIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
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
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import SortableChipRow from '@/components/ui/SortableChipRow'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import StalenessColorKey from '@/components/StalenessColorKey'

export type ContactsStalenessChipsProps = {
  /**
   * The contacts the chips count: active (not dismissed) ones, and on the map
   * only those with a location, so the counts match the pins.
   */
  contacts: Contact[]
  /** Shared per-contact conversation index; staleness is an O(1) lookup. */
  index: ConversationIndex
  /**
   * Where the chips sit, for analytics. The map has its own legend button, so
   * the chips leave theirs out there.
   */
  surface: 'list' | 'map'
}

/**
 * Swipeable row of quick filters by time since the last visit: All, then each
 * staleness bucket with its count, most stale first until the User drags them
 * into their own order. A chip swaps any `pinStaleness` filter for its own and
 * leaves other filters alone, so the Sort & Filter sheet still shows (and can
 * clear) what a chip set. With a Saved View showing, the chips edit that view's
 * filters. On the list, the trailing info button explains the colors and links
 * to their settings.
 */
const ContactsStalenessChips = ({
  contacts,
  index,
  surface,
}: ContactsStalenessChipsProps) => {
  const theme = useTheme()
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
    <AnchoredPopover
      contentWidth={280}
      renderTrigger={({ onPress, anchorRef }) => (
        <View ref={anchorRef} collapsable={false}>
          <PointerTooltip label={i18n.t('contacts_stalenessInfo_title')}>
            <Button
              onPress={onPress}
              accessibilityLabel={i18n.t('contacts_stalenessInfo_title')}
              accessibilityRole='button'
              hitSlop={6}
              style={{
                width: 32,
                height: 32,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LucideIcon
                icon={InfoIcon}
                size={theme.fontSize('md')}
                style={{ color: theme.colors.textAlt }}
              />
            </Button>
          </PointerTooltip>
        </View>
      )}
    >
      {({ close }) => <StalenessColorKey onBeforeNavigate={close} />}
    </AnchoredPopover>
  )

  return (
    <SortableChipRow
      data={chipOrder}
      keyExtractor={(bucket) => bucket}
      onReorder={(next) => setPreferences({ stalenessChipOrder: next })}
      leading={
        <StalenessChip
          label={i18n.t('contacts_stalenessChip_all')}
          count={contacts.length}
          active={selected.size === 0}
          onPress={() => select(undefined)}
        />
      }
      renderItem={(bucket) => (
        <StalenessChip
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

const StalenessChip = ({
  label,
  count,
  color,
  active,
  onPress,
}: {
  label: string
  count: number
  /** Staleness dot; omitted for All. */
  color?: string
  active: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      noTransform
      accessibilityRole='button'
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        backgroundColor: active
          ? theme.colors.accentTranslucent
          : theme.colors.backgroundLighter,
        // Empty buckets stay tappable but recede.
        opacity: count === 0 && !active ? 0.55 : 1,
      }}
    >
      {color && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
      )}
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: active ? theme.fonts.semiBold : theme.fonts.medium,
          color: active ? theme.colors.accent : theme.colors.text,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: active ? theme.colors.accent : theme.colors.textAlt,
        }}
      >
        {count}
      </Text>
    </Button>
  )
}

export default ContactsStalenessChips
