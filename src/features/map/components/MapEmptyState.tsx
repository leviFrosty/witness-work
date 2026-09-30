import {
  BookUser as BookUserIcon,
  MapPinned as MapPinnedIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import { View } from 'react-native'

import Button from '@/components/ui/Button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/Empty'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

interface MapEmptyStateProps {
  activeContactCount: number
  onReviewContacts: () => void
  onAddContact: () => void
}

const MapEmptyState = ({
  activeContactCount,
  onReviewContacts,
  onAddContact,
}: MapEmptyStateProps) => {
  const theme = useTheme()
  const hasContacts = activeContactCount > 0
  const title = i18n.t(
    hasContacts ? 'map_emptyMissingLocationsTitle' : 'map_emptyNoContactsTitle'
  )
  const buttonStyle = {
    flexGrow: 1,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
  }

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <LucideIcon
            icon={MapPinnedIcon}
            size={24}
            color={theme.colors.text}
          />
        </EmptyMedia>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <EmptyTitle style={{ flexShrink: 1 }}>{title}</EmptyTitle>
          {hasContacts && (
            <InfoPopover
              inline
              title={title}
              description={i18n.t('map_emptyMissingLocationsBody')}
            />
          )}
        </View>
        {hasContacts && (
          <EmptyDescription>
            {i18n.t('map_emptyMappedCount', { count: activeContactCount })}
          </EmptyDescription>
        )}
        {!hasContacts && (
          <EmptyDescription>
            {i18n.t('map_emptyNoContactsBody')}
          </EmptyDescription>
        )}
      </EmptyHeader>
      <EmptyContent
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'stretch',
        }}
      >
        <Button
          noTransform
          onPress={hasContacts ? onReviewContacts : onAddContact}
          accessibilityRole='button'
          style={{
            ...buttonStyle,
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <LucideIcon
            icon={hasContacts ? BookUserIcon : PlusIcon}
            size={20}
            color={theme.colors.textInverse}
          />
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
              flexShrink: 1,
              textAlign: 'center',
            }}
          >
            {i18n.t(hasContacts ? 'map_reviewContacts' : 'addContact')}
          </Text>
        </Button>
        {hasContacts && (
          <Button
            noTransform
            variant='outline'
            onPress={onAddContact}
            accessibilityRole='button'
            style={{ ...buttonStyle, justifyContent: 'center', gap: 8 }}
          >
            <LucideIcon icon={PlusIcon} size={20} color={theme.colors.text} />
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                flexShrink: 1,
                textAlign: 'center',
              }}
            >
              {i18n.t('addContact')}
            </Text>
          </Button>
        )}
      </EmptyContent>
    </Empty>
  )
}

export default MapEmptyState
