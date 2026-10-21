import { View } from 'react-native'
import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import { UndoIcon } from '@/components/ui/DirectionalIcon'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import PullDownMenu from '@/components/ui/PullDownMenu'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { type Buddy, ownSettingsCount } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * The top of Buddies Settings, as breadcrumbs: All Buddies / Grace. All Buddies
 * goes back to the settings every buddy follows; the buddy opens a menu of
 * buddies to switch to (from All Buddies, to pick one). Under them, what the
 * scope means, and for a buddy with settings of their own, an undo arrow that
 * has them follow All Buddies in everything.
 */
export default function BuddySettingsScopeBar({
  buddy,
  onSelect,
  onResetAll,
}: {
  /** The buddy whose settings show, or null for All Buddies. */
  buddy: Buddy | null
  onSelect: (inboxId: string | null) => void
  onResetAll: () => void
}) {
  const theme = useTheme()
  const buddies = useBuddies((state) => state.buddies).filter(
    (b) => b.status === 'active'
  )
  const alertOverrides = useBuddies((state) => state.alertOverrides)
  if (buddies.length === 0) return null

  const ownSettings = (b: Buddy) => ownSettingsCount(b, alertOverrides)
  const own = buddy ? ownSettings(buddy) : 0
  const withOwn = buddies.filter((b) => ownSettings(b) > 0)
  const crumb = {
    fontSize: theme.fontSize('lg'),
    fontFamily: theme.fonts.semiBold,
  }
  const note = {
    flex: 1,
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('sm'),
  }

  return (
    <View style={{ gap: 6, paddingHorizontal: 15 }}>
      <XView style={{ gap: 8, flexWrap: 'wrap' }}>
        {buddy ? (
          <Button
            noTransform
            hitSlop={8}
            onPress={() => onSelect(null)}
            accessibilityRole='link'
          >
            <Text style={{ ...crumb, color: theme.colors.accent }}>
              {i18n.t('buddies_allBuddies')}
            </Text>
          </Button>
        ) : (
          <Text style={crumb} accessibilityRole='header'>
            {i18n.t('buddies_allBuddies')}
          </Text>
        )}
        <Text style={{ ...crumb, color: theme.colors.textAlt }}>/</Text>
        <PullDownMenu
          accessibilityLabel={i18n.t('buddies_chooseBuddy')}
          accessibilityValue={buddy ? buddyDisplayName(buddy) : undefined}
          pointerEffect='tint'
          hoverRadius={theme.numbers.borderRadiusSm}
          actions={[
            buddies.map((other) => {
              const count = ownSettings(other)
              return {
                id: other.inboxId,
                title: count
                  ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
                    i18n.t('buddies_scopeChipLabel', {
                      name: buddyDisplayName(other),
                      count,
                    })
                  : buddyDisplayName(other),
                checked: other.inboxId === buddy?.inboxId,
                onPress: () => onSelect(other.inboxId),
              }
            }),
          ]}
        >
          <XView style={{ gap: 4 }}>
            <Text
              style={{
                ...crumb,
                color: buddy ? theme.colors.text : theme.colors.textAlt,
              }}
            >
              {buddy ? buddyDisplayName(buddy) : i18n.t('buddies_chooseBuddy')}
            </Text>
            <LucideIcon
              icon={ChevronDownIcon}
              size={theme.fontSize('md')}
              color={theme.colors.textAlt}
            />
          </XView>
        </PullDownMenu>
      </XView>
      <XView style={{ gap: 12, minHeight: 22 }}>
        <Text style={note}>
          {buddy
            ? own > 0
              ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
                i18n.t('buddies_scopeBuddyOwn', {
                  count: own,
                  name: buddyDisplayName(buddy),
                })
              : i18n.t('buddies_scopeBuddyFollows', {
                  name: buddyDisplayName(buddy),
                })
            : withOwn.length > 0
              ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
                i18n.t('buddies_scopeAllSomeOwn', { count: withOwn.length })
              : i18n.t('buddies_scopeAllEveryone')}
        </Text>
        {buddy && own > 0 && (
          <PointerTooltip
            label={i18n.t('buddies_settingsResetAllLabel', {
              name: buddyDisplayName(buddy),
            })}
            effect='none'
          >
            <IconButton
              icon={UndoIcon}
              size={16}
              color={theme.colors.textAlt}
              onPress={onResetAll}
              frame
              accessibilityLabel={i18n.t('buddies_settingsResetAllLabel', {
                name: buddyDisplayName(buddy),
              })}
            />
          </PointerTooltip>
        )}
      </XView>
    </View>
  )
}
