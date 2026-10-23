import { useEffect, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { Flame as FlameIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Popover from '@/components/ui/Popover'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { PetRoomSettings } from '@/types/pet'
import { resolveRoom, type SceneInput } from '@/features/pet/art'
import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'
import {
  roomOptionLabel,
  roomSectionLabel,
  unlockPillText,
  unlockRequirementText,
} from '@/features/pet/lib/roomLabels'
import {
  ROOM_THUMB_VIEWS,
  selectedRoomOption,
  silhouetteRooms,
  silhouetteStyle,
  thumbRoom,
  thumbShowsPet,
  unlockRequirement,
  type RoomChoicePart,
  type RoomChoiceSection,
  type RoomUnlocks,
  type UnlockRequirement,
} from '@/features/pet/lib/roomOptions'
import { isSecretItem } from '@/features/pet/lib/secretUnlocks'
import { markSecretItemsSeen, secretItemSeen } from '@/features/pet/lib/secrets'
import { usePetSession } from '@/features/pet/stores/petSession'
import RoomOptionThumb, {
  type ThumbSilhouette,
} from '@/features/pet/components/RoomOptionThumb'

const GAP = 10
const TOOLTIP_WIDTH = 240

/** The secret options of `part` that are open but this install hasn't shown. */
function unseenSecrets(
  part: RoomChoicePart,
  options: readonly string[],
  unlocked: ReadonlySet<string>
): Set<string> {
  return new Set(
    options.filter((option) => {
      const item = `${part}:${option}`
      return isSecretItem(item) && unlocked.has(item) && !secretItemSeen(item)
    })
  )
}

/** The small pill over a cell's top corner: how it opens up, or "New". */
function CornerPill({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 6,
        end: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 99,
        backgroundColor: 'rgba(0, 0, 0, 0.62)',
      }}
    >
      {children}
    </View>
  )
}

/**
 * One section of Decorate Room: its options as two columns of thumbnails drawn
 * from the room itself, the current one ringed. Locked options are dimmed with
 * how they open up (a flame and the streak count, or the month); a locked
 * secret shows only its silhouette and a question mark. Tapping a locked one
 * says how it opens up (a secret never says). A secret that opened up since
 * this install last showed it says "New".
 */
export default function RoomOptionGrid({
  section,
  room,
  liveNow,
  thumbBase,
  unlocks,
  onSelect,
}: {
  section: RoomChoiceSection
  room: PetRoomSettings
  /** The clock's time and season, for Live choices. */
  liveNow: ResolvedWindow
  thumbBase: Omit<SceneInput, 'room'>
  unlocks: RoomUnlocks
  onSelect: (option: string) => void
}) {
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const cell = width > 0 ? Math.floor((width - GAP) / 2) : 0
  const { part, options } = section
  const selected = selectedRoomOption(room, part)
  const heading = roomSectionLabel(part)
  const radius = theme.numbers.borderRadiusMd

  // Worked out once, so "New" stays while the section is up. While the dev
  // harness opens every secret (`override({ secrets: true })`), they say "New"
  // without being noted as shown, so they say it again when they really open.
  const fakedSecrets = usePetSession((s) =>
    __DEV__ ? s.devOverride?.secrets === true : false
  )
  const [fresh] = useState(() => ({
    options: unseenSecrets(part, options, unlocks.unlocked),
    note: !fakedSecrets,
  }))
  useEffect(() => {
    if (fresh.note && fresh.options.size)
      markSecretItemsSeen(
        [...fresh.options].map((option) => `${part}:${option}`)
      )
  }, [fresh, part])

  const sceneOf = (settings: PetRoomSettings): SceneInput => ({
    ...thumbBase,
    pet: thumbShowsPet(part) ? thumbBase.pet : null,
    room: resolveRoom(settings, liveNow),
  })

  const tooltip = (requirement: UnlockRequirement, label: string) => (
    <View style={{ gap: 4 }}>
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {requirement.by === 'secret' ? i18n.t('pet.room.secret.title') : label}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
        }}
      >
        {unlockRequirementText(requirement)}
      </Text>
    </View>
  )

  return (
    <View style={{ gap: 8 }}>
      {heading && (
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
          }}
        >
          {heading}
        </Text>
      )}
      <View
        accessibilityRole='radiogroup'
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}
      >
        {cell > 0 &&
          options.map((option) => {
            const isSelected = option === selected
            const requirement = unlockRequirement(part, option, unlocks)
            const open = requirement === null
            const secret = requirement?.by === 'secret'
            const isNew = open && fresh.options.has(option)
            const label = roomOptionLabel(part, option)

            let input: SceneInput
            let silhouette: ThumbSilhouette | undefined
            if (secret) {
              const shapes = silhouetteRooms(room, part, option)
              input = sceneOf(shapes.room)
              silhouette = {
                references: shapes.references.map(sceneOf),
                style: silhouetteStyle(part),
              }
            } else {
              input = sceneOf(thumbRoom(room, part, option))
            }

            const content = (
              <>
                <View style={{ opacity: open || secret ? 1 : 0.45 }}>
                  <RoomOptionThumb
                    input={input}
                    view={ROOM_THUMB_VIEWS[part]}
                    width={cell - 4}
                    silhouette={silhouette}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    textAlign: 'center',
                    paddingVertical: 6,
                    paddingHorizontal: 6,
                    fontSize: theme.fontSize('sm'),
                    fontFamily: isSelected
                      ? theme.fonts.semiBold
                      : theme.fonts.regular,
                    color: open ? theme.colors.text : theme.colors.textAlt,
                  }}
                >
                  {secret ? i18n.t('pet.room.secret.label') : label}
                </Text>
                {requirement && (
                  <CornerPill>
                    {requirement.by === 'streak' && (
                      <LucideIcon
                        icon={FlameIcon}
                        size={12}
                        color={theme.colors.orange}
                        fill={theme.colors.orange}
                      />
                    )}
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        fontFamily: theme.fonts.semiBold,
                        color: '#ffffff',
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {unlockPillText(requirement)}
                    </Text>
                  </CornerPill>
                )}
                {isNew && (
                  <CornerPill>
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        fontFamily: theme.fonts.semiBold,
                        color: '#ffffff',
                      }}
                    >
                      {i18n.t('pet.room.secret.new')}
                    </Text>
                  </CornerPill>
                )}
              </>
            )
            const cellStyle = {
              width: cell,
              borderRadius: radius,
              borderWidth: 2,
              borderColor: isSelected ? theme.colors.accent : 'transparent',
              backgroundColor: theme.colors.backgroundLighter,
              overflow: 'hidden' as const,
            }

            if (!requirement)
              return (
                <Button
                  key={option}
                  onPress={() => onSelect(option)}
                  accessibilityRole='radio'
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={
                    isNew
                      ? i18n.t('pet.room.secret.newA11y', { option: label })
                      : label
                  }
                  style={cellStyle}
                >
                  {content}
                </Button>
              )

            return (
              <Popover
                key={option}
                contentWidth={TOOLTIP_WIDTH}
                style={{ width: cell }}
                renderTrigger={({ onPress }) => (
                  <Button
                    onPress={() => {
                      analytics.capture('pet_room_locked_tapped', {
                        part,
                        secret,
                      })
                      onPress()
                    }}
                    accessibilityRole='radio'
                    accessibilityState={{ checked: false, disabled: true }}
                    accessibilityLabel={
                      secret
                        ? i18n.t('pet.room.secret.a11y')
                        : i18n.t('pet.room.lockedA11y', {
                            option: label,
                            when: unlockRequirementText(requirement),
                          })
                    }
                    style={cellStyle}
                  >
                    {content}
                  </Button>
                )}
              >
                {tooltip(requirement, label)}
              </Popover>
            )
          })}
      </View>
    </View>
  )
}
