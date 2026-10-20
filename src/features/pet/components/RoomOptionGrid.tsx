import { useState } from 'react'
import { View } from 'react-native'
import { Flame as FlameIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import type { PetRoomSettings } from '@/types/pet'
import { resolveRoom, type SceneInput } from '@/features/pet/art'
import type { ResolvedWindow } from '@/features/pet/lib/liveWindow'
import {
  roomOptionLabel,
  roomSectionLabel,
  unlockBadgeText,
  unlockRequirementText,
} from '@/features/pet/lib/roomLabels'
import {
  ROOM_THUMB_VIEWS,
  roomWithChoice,
  selectedRoomOption,
  thumbShowsPet,
  unlockRequirement,
  type RoomChoiceSection,
  type RoomUnlocks,
} from '@/features/pet/lib/roomOptions'
import RoomOptionThumb from '@/features/pet/components/RoomOptionThumb'

const GAP = 10

/**
 * One section of Decorate Room: its options as two columns of thumbnails drawn
 * from the room itself, the current one ringed. Locked options are dimmed with
 * how they open up (a flame and the streak count, or the month), and can't be
 * picked.
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
            const label = roomOptionLabel(part, option)
            const input: SceneInput = {
              ...thumbBase,
              pet: thumbShowsPet(part) ? thumbBase.pet : null,
              room: resolveRoom(roomWithChoice(room, part, option), liveNow),
            }
            return (
              <Button
                key={option}
                disabled={!open}
                onPress={() => onSelect(option)}
                accessibilityRole='radio'
                accessibilityState={{ checked: isSelected, disabled: !open }}
                accessibilityLabel={
                  requirement
                    ? i18n.t('pet.room.lockedA11y', {
                        option: label,
                        when: unlockRequirementText(requirement),
                      })
                    : label
                }
                style={{
                  width: cell,
                  borderRadius: radius,
                  borderWidth: 2,
                  borderColor: isSelected ? theme.colors.accent : 'transparent',
                  backgroundColor: theme.colors.backgroundLighter,
                  overflow: 'hidden',
                }}
              >
                <View style={{ opacity: open ? 1 : 0.45 }}>
                  <RoomOptionThumb
                    input={input}
                    view={ROOM_THUMB_VIEWS[part]}
                    width={cell - 4}
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
                  {label}
                </Text>
                {requirement && (
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
                      {requirement.by === 'streak'
                        ? formatNumber(requirement.count)
                        : unlockBadgeText(requirement.monthsFromNow)}
                    </Text>
                  </View>
                )}
              </Button>
            )
          })}
      </View>
    </View>
  )
}
