import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { Popover } from 'tamagui'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { ContactStaleness, stalenessToColor } from '@/lib/contactStaleness'
import { filterActivesContacts } from '@/lib/dismissedContacts'
import { ConversationIndex } from '@/lib/conversationIndex'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import { Contact } from '@/types/contact'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import StalenessColorKey from '@/components/StalenessColorKey'

export type ContactsStatsHeaderProps = {
  /** All contacts, active AND dismissed. The component computes the splits. */
  contacts: Contact[]
  /** Shared per-contact conversation index; staleness is an O(1) lookup. */
  index: ConversationIndex
  onPressDismissed: () => void
}

/**
 * Order shown in the staleness pill, left to right: most stale first so the eye
 * lands on red (needs attention) before grey (no data).
 */
const STALENESS_ORDER: ContactStaleness[] = ['month', 'week', 'recent', 'never']

const ContactsStatsHeader: React.FC<ContactsStatsHeaderProps> = ({
  contacts,
  index,
  onPressDismissed,
}) => {
  const theme = useTheme()
  const markerColors = useMarkerColors()
  const [infoOpen, setInfoOpen] = useState(false)

  const { activeCount, dismissedCount, stalenessCounts } = useMemo(() => {
    const active = filterActivesContacts(contacts)
    const counts: Record<ContactStaleness, number> = {
      never: 0,
      recent: 0,
      week: 0,
      month: 0,
    }
    for (const contact of active) {
      const bucket = index.stalenessFor(contact.id)
      counts[bucket] += 1
    }
    return {
      activeCount: active.length,
      dismissedCount: contacts.length - active.length,
      stalenessCounts: counts,
    }
  }, [contacts, index])

  return (
    <Card
      style={{
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: theme.colors.background,
        borderColor: theme.colors.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        {/* Total active contacts */}
        <View style={{ flexShrink: 0 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('2xl'),
              lineHeight: theme.fontSize('2xl') * 1.1,
            }}
          >
            {activeCount}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('contacts_total')}
          </Text>
        </View>

        {/* Staleness breakdown pill — tap to reveal what each color means. */}
        <Popover
          open={infoOpen}
          onOpenChange={setInfoOpen}
          placement='bottom'
          allowFlip
          offset={8}
        >
          <Popover.Trigger asChild>
            <Button
              onPress={() => setInfoOpen((v) => !v)}
              accessibilityLabel={i18n.t('contacts_stalenessInfo_title')}
              accessibilityRole='button'
              hitSlop={6}
              noTransform
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                backgroundColor: theme.colors.backgroundLighter,
                borderRadius: theme.numbers.borderRadiusMd,
                flexShrink: 1,
              }}
            >
              {STALENESS_ORDER.map((bucket) => (
                <View
                  key={bucket}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: stalenessToColor(bucket, markerColors),
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('xs'),
                      color: theme.colors.text,
                    }}
                  >
                    {stalenessCounts[bucket]}
                  </Text>
                </View>
              ))}
            </Button>
          </Popover.Trigger>

          <Popover.Content
            borderWidth={1}
            borderColor={theme.colors.border}
            backgroundColor={theme.colors.card}
            padding={14}
            elevate
            animation={[
              'quick',
              {
                opacity: {
                  overshootClamping: true,
                },
              },
            ]}
            enterStyle={{ y: -8, opacity: 0 }}
            exitStyle={{ y: -8, opacity: 0 }}
            maxWidth={300}
          >
            <Popover.Arrow
              borderWidth={1}
              borderColor={theme.colors.border}
              backgroundColor={theme.colors.card}
            />
            <StalenessColorKey onBeforeNavigate={() => setInfoOpen(false)} />
          </Popover.Content>
        </Popover>

        {/* Dismissed/archived count */}
        {dismissedCount > 0 && (
          <Button onPress={onPressDismissed} hitSlop={8}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                flexShrink: 1,
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                }}
                numberOfLines={1}
              >
                {i18n.t('contacts_dismissed' as TranslationKey, {
                  count: dismissedCount,
                })}
              </Text>
              <FontAwesomeIcon
                icon={faChevronRight}
                size={theme.fontSize('xs')}
                style={{ color: theme.colors.textAlt }}
              />
            </View>
          </Button>
        )}
      </View>
    </Card>
  )
}

export default ContactsStatsHeader
