import { View } from 'react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatRelative } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import type {
  ScribeConversationSummary,
  ScribeLegacyImport,
} from '@/features/scribe/types'

const ROW_RADIUS = 14

export const ScribeHistoryRow = ({
  conversation,
  onOpen,
  onDelete,
}: {
  conversation: ScribeConversationSummary
  onOpen: () => void
  onDelete: () => void
}) => {
  const theme = useTheme()
  const meta = [
    formatRelative(conversation.updatedAt),
    conversation.appliedCount > 0
      ? i18n.t('scribe_historyAdded' as TranslationKey, {
          count: conversation.appliedCount,
        })
      : null,
    conversation.hasPendingProposal ? i18n.t('scribe_historyWaiting') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <ContextMenu
      onPress={onOpen}
      accessibilityLabel={`${conversation.title}, ${meta}`}
      accessibilityRole='button'
      hoverRadius={ROW_RADIUS}
      actions={[
        {
          id: 'delete',
          title: i18n.t('scribe_historyDelete'),
          systemImage: 'trash',
          destructive: true,
          onPress: onDelete,
        },
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: 60,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: ROW_RADIUS,
          backgroundColor: theme.colors.card,
        }}
      >
        {conversation.hasPendingProposal ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.colors.accent,
            }}
          />
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: theme.fontSize('md'),
              fontFamily: theme.fonts.medium,
            }}
          >
            {conversation.title}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {meta}
          </Text>
        </View>
        <LucideIcon
          icon={ChevronForwardIcon}
          size={16}
          color={theme.colors.textAlt}
        />
      </View>
    </ContextMenu>
  )
}

const LEGACY_COUNTS = [
  ['contacts', 'scribe_legacyContacts'],
  ['visits', 'scribe_legacyVisits'],
  ['timeEntries', 'scribe_legacyTimeEntries'],
] as const

export const ScribeLegacyImportRow = ({
  entry,
  onUndo,
}: {
  entry: ScribeLegacyImport
  onUndo: () => void
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 60,
        paddingVertical: 10,
        paddingLeft: 14,
        paddingRight: 4,
        borderRadius: ROW_RADIUS,
        backgroundColor: theme.colors.card,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.medium,
          }}
        >
          {entry.title}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {[
            formatRelative(entry.acceptedAt),
            ...LEGACY_COUNTS.filter(([field]) => entry.counts[field] > 0).map(
              ([field, key]) =>
                i18n.t(key as TranslationKey, { count: entry.counts[field] })
            ),
          ].join(' · ')}
        </Text>
      </View>
      <Button
        noTransform
        onPress={onUndo}
        style={{
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: 12,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.accent,
          }}
        >
          {i18n.t('scribe_undo')}
        </Text>
      </Button>
    </View>
  )
}
