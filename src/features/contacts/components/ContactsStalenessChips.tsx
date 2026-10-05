import { Info as InfoIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { ScrollView, View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import {
  ContactStaleness,
  STALENESS_DISPLAY_ORDER,
  stalenessToColor,
} from '@/lib/contactStaleness'
import { ConversationIndex } from '@/lib/conversationIndex'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { usePreferences } from '@/stores/preferences'
import { Contact } from '@/types/contact'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import StalenessColorKey from '@/components/StalenessColorKey'

export type ContactsStalenessChipsProps = {
  /** Active (not dismissed) contacts; the chips count these. */
  contacts: Contact[]
  /** Shared per-contact conversation index; staleness is an O(1) lookup. */
  index: ConversationIndex
}

/**
 * Swipeable row of quick filters by time since the last visit: All, then each
 * staleness bucket with its count, most stale first. A chip swaps any
 * `pinStaleness` filter for its own and leaves other filters alone, so the Sort
 * & Filter sheet still shows (and can clear) what a chip set. The trailing info
 * button explains the colors and links to their settings.
 */
const ContactsStalenessChips = ({
  contacts,
  index,
}: ContactsStalenessChipsProps) => {
  const theme = useTheme()
  const markerColors = useMarkerColors()
  const contactsFilters = usePreferences((s) => s.contactsFilters)
  const setContactsFilters = usePreferences((s) => s.setContactsFilters)

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
    analytics.capture('contacts_staleness_chip_applied', { variant: bucket })
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps='handled'
      style={{ flexGrow: 0 }}
      contentContainerStyle={{
        paddingHorizontal: 12,
        gap: 8,
        alignItems: 'center',
      }}
    >
      <StalenessChip
        label={i18n.t('contacts_stalenessChip_all')}
        count={contacts.length}
        active={selected.size === 0}
        onPress={() => select(undefined)}
      />
      {STALENESS_DISPLAY_ORDER.map((bucket) => (
        <StalenessChip
          key={bucket}
          label={i18n.t(`contacts_pinStaleness_${bucket}` as TranslationKey)}
          count={counts[bucket]}
          color={stalenessToColor(bucket, markerColors)}
          active={selected.has(bucket)}
          onPress={() => select(bucket)}
        />
      ))}
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
    </ScrollView>
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
