import {
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  DoorOpen as DoorOpenIcon,
  IdCard as IdCardIcon,
} from 'lucide-react-native'
import { View, useWindowDimensions } from 'react-native'
import * as Crypto from 'expo-crypto'
import { useNavigation } from '@react-navigation/native'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import usePublisher from '@/hooks/usePublisher'
import { analytics } from '@/lib/analytics'
import i18n, { type TranslationKey } from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import type { RootStackNavigation } from '@/types/rootStack'
import { useOpenScribe } from '@/features/scribe/components/openScribe'
import ScribeMicOrb from '@/features/scribe/components/ScribeMicOrb'
import { ScribeLabel } from '@/features/scribe/components/ScribeBadge'

type Tile = 'time' | 'visit' | 'contact' | 'plan'

const TILES: Record<
  Tile,
  { icon: AppIcon; label: TranslationKey; a11y: TranslationKey }
> = {
  time: { icon: ClockIcon, label: 'quickActions_time', a11y: 'addTime' },
  visit: {
    icon: DoorOpenIcon,
    label: 'quickActions_visit',
    a11y: 'logVisitAction',
  },
  contact: {
    icon: IdCardIcon,
    label: 'quickActions_contact',
    a11y: 'addContact',
  },
  plan: { icon: CalendarIcon, label: 'quickActions_plan', a11y: 'createPlan' },
}

// This Week's day cell; the tiles take the same height so the two cards match.
const DAY_CELL_HEIGHT = 50
const TILE_GAP = 8
// Below this window width the orb beside the tiles leaves them too little room
// for their words (iPad split view and Slide Over).
const NARROW_WINDOW = 360

/** "QUICK ACTIONS", in This Week's header type. */
const SectionLabel = ({ largeText }: { largeText: boolean }) => {
  const theme = useTheme()
  return (
    <Text
      numberOfLines={largeText ? undefined : 1}
      style={{
        fontFamily: theme.fonts.semiBold,
        color: theme.colors.textAlt,
        fontSize: theme.fontSize('sm'),
        textTransform: 'uppercase',
        letterSpacing: tracking(0.5),
      }}
    >
      {i18n.t('quickActions_sectionTitle')}
    </Text>
  )
}

/**
 * An invisible copy of a This Week day column (weekday letter, 4pt, 50pt cell).
 * The tiles stretch to it, so Quick Actions is This Week's height at every text
 * size by construction.
 */
const DayColumnStrut = () => {
  const theme = useTheme()
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      pointerEvents='none'
      style={{ width: 0, gap: 4, opacity: 0 }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.medium,
        }}
      >
        M
      </Text>
      <View style={{ height: DAY_CELL_HEIGHT }} />
    </View>
  )
}

const TileButton = ({
  tile,
  onPress,
  stacked,
}: {
  tile: Tile
  onPress: () => void
  /** A full-width row (icon, then label) at accessibility text sizes. */
  stacked: boolean
}) => {
  const theme = useTheme()
  const { icon, label, a11y } = TILES[tile]
  return (
    <Button
      noTransform
      onPress={onPress}
      accessibilityLabel={i18n.t(a11y)}
      style={[
        {
          borderRadius: theme.numbers.borderRadiusMd + 2,
          backgroundColor: theme.colors.background,
          alignItems: 'center',
        },
        stacked
          ? {
              flexDirection: 'row',
              gap: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }
          : {
              flex: 1,
              justifyContent: 'center',
              gap: 7,
              paddingHorizontal: 4,
            },
      ]}
    >
      <LucideIcon icon={icon} size={22} color={theme.colors.accent} />
      <Text
        numberOfLines={stacked ? undefined : 1}
        adjustsFontSizeToFit={!stacked}
        minimumFontScale={0.8}
        style={{
          flexShrink: 1,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
        }}
      >
        {i18n.t(label)}
      </Text>
    </Button>
  )
}

/**
 * Home's Quick Actions: Time (or Visit), Contact and Plan, and the Scribe AI
 * orb. Built like This Week (same card, header type and row height) so the two
 * read as a pair. Without Scribe AI, the tiles fill the card. Where the orb
 * beside them would squeeze the tiles (narrow windows) or their words (large
 * text), it takes a row of its own under them; at accessibility text sizes the
 * tiles become full-width rows too.
 */
const ScribeQuickActionsCard = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { showsTimeEntry } = usePublisher()
  const scribe = useOpenScribe()
  const largeText = useAccessibilityTextSize()
  const narrow = useWindowDimensions().width < NARROW_WINDOW
  const orbBelow = largeText || narrow
  const tiles: Tile[] = [showsTimeEntry ? 'time' : 'visit', 'contact', 'plan']

  const run = (tile: Tile) => {
    analytics.capture('quick_actions_tile_tapped', { tile })
    switch (tile) {
      case 'time':
        navigation.navigate('Add Time')
        break
      case 'visit':
        navigation.navigate('Log Visit')
        break
      case 'contact':
        navigation.navigate('Contact Form', { id: Crypto.randomUUID() })
        break
      case 'plan':
        navigation.navigate('PlanDay', {})
        break
    }
  }

  const tileButtons = tiles.map((tile) => (
    <TileButton
      key={tile}
      tile={tile}
      stacked={largeText}
      onPress={() => run(tile)}
    />
  ))
  const tileRow = largeText ? (
    <View style={{ gap: TILE_GAP }}>{tileButtons}</View>
  ) : (
    <View style={{ flexDirection: 'row' }}>
      <DayColumnStrut />
      {/* Equal thirds whatever the label: Home measures its sections to fit,
          where flexing tiles would size to their words. */}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          marginHorizontal: -TILE_GAP / 2,
        }}
      >
        {tileButtons.map((button) => (
          <View
            key={button.key}
            style={{
              width: `${100 / tiles.length}%`,
              paddingHorizontal: TILE_GAP / 2,
            }}
          >
            {button}
          </View>
        ))}
      </View>
    </View>
  )
  const orbLabel = i18n.t(
    scribe.offline ? 'scribe_orbOfflineLabel' : 'scribe_orbLabel'
  )

  if (orbBelow)
    return (
      <HomeSectionMenu
        accessible={false}
        hoverRadius={theme.numbers.borderRadiusLg}
      >
        <Card style={{ paddingHorizontal: 16, gap: 12 }}>
          <SectionLabel largeText={largeText} />
          {tileRow}
          {!scribe.hidden && (
            <Button
              noTransform
              onPress={() => scribe.open('home_orb')}
              accessibilityLabel={orbLabel}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingRight: 14,
                backgroundColor: 'transparent',
                borderRadius: theme.numbers.borderRadiusMd,
              }}
            >
              <ScribeMicOrb
                box={64}
                canvas={96}
                core={0.235}
                iconSize={20}
                offline={scribe.offline}
                surface={theme.colors.card}
                badgeOffset={8}
              />
              <ScribeLabel muted={scribe.offline} wrap />
            </Button>
          )}
        </Card>
      </HomeSectionMenu>
    )

  return (
    <HomeSectionMenu
      accessible={false}
      hoverRadius={theme.numbers.borderRadiusLg}
    >
      <Card style={{ paddingHorizontal: 16, gap: 0, flexDirection: 'row' }}>
        <View style={{ flex: 1, gap: 12 }}>
          <SectionLabel largeText={false} />
          {tileRow}
        </View>
        {!scribe.hidden && (
          <>
            <View
              style={{
                width: 1,
                marginVertical: 4,
                marginHorizontal: 14,
                backgroundColor: theme.colors.border,
              }}
            />
            <Button
              noTransform
              onPress={() => scribe.open('home_orb')}
              accessibilityLabel={orbLabel}
              style={{
                width: 88,
                // The orb's glow may run into the card's padding; the tiles
                // set the card's height.
                marginVertical: -8,
                alignSelf: 'center',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                backgroundColor: 'transparent',
                borderRadius: theme.numbers.borderRadiusMd,
              }}
            >
              <ScribeMicOrb
                box={84}
                canvas={128}
                core={0.235}
                iconSize={22}
                offline={scribe.offline}
                surface={theme.colors.card}
                badgeOffset={10}
                pausesOffscreen
              />
              <ScribeLabel muted={scribe.offline} />
            </Button>
          </>
        )}
      </Card>
    </HomeSectionMenu>
  )
}

export default ScribeQuickActionsCard
