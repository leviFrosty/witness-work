import { ReactNode, useState } from 'react'
import { Pressable, View } from 'react-native'
import {
  Check as CheckIcon,
  Layers as LayersIcon,
  UsersRound as UsersRoundIcon,
} from 'lucide-react-native'
import { UndoIcon } from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import InputRowSelect from '@/components/ui/inputs/InputRowSelect'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import Text from '@/components/ui/MyText'
import Popover from '@/components/ui/Popover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import XView from '@/components/ui/layout/XView'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import {
  type ScopedSetting,
  useBuddySettingsScope,
} from '@/features/buddies/hooks/useBuddySettingsScope'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'

const MARKER_SIZE = 16
/**
 * The markers after a setting's label get full frames, pulled back top and
 * bottom so the row keeps its height. The source's frame reaches back over the
 * label, which takes no taps; after that each frame takes its room, so the
 * source's, Reset's and the info icon's meet without overlapping.
 */
const markerFrame = touchTargetFrame(MARKER_SIZE)

/** One level in the source popover: who, their value, and whether it wins. */
function SourceLayer({
  leading,
  name,
  value,
  muted,
  winning,
  onPress,
}: {
  leading: ReactNode
  name: string
  value: string
  muted?: boolean
  winning?: boolean
  onPress?: () => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const row = (
    <XView
      style={{
        gap: 10,
        minHeight: 40,
        paddingHorizontal: 10,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: winning ? theme.colors.backgroundLighter : undefined,
      }}
    >
      {leading}
      <Text style={{ flex: 1, fontFamily: theme.fonts.medium }}>{name}</Text>
      <Text style={{ color: muted ? theme.colors.textAlt : theme.colors.text }}>
        {value}
      </Text>
      <View style={{ width: 16 }}>
        {winning && (
          <LucideIcon icon={CheckIcon} size={16} color={theme.colors.accent} />
        )}
      </View>
    </XView>
  )
  return onPress ? (
    <PointerHover onHoverChange={setHovered}>
      <Pressable onPress={onPress} accessibilityRole='button'>
        {row}
        <HoverTint
          visible={hovered}
          borderRadius={theme.numbers.borderRadiusSm}
        />
      </Pressable>
    </PointerHover>
  ) : (
    row
  )
}

/**
 * The layers icon after a row's label: where its value comes from. In a buddy's
 * settings it's always there, tinted while the value is the buddy's own; it
 * opens the buddy's value and All Buddies', the one in effect checked. In All
 * Buddies' it's there while some buddies have their own value, and lists them;
 * tapping one opens their settings.
 */
function SettingSourceButton<T>({
  setting,
  label,
  format,
}: {
  setting: ScopedSetting<T>
  label: string
  format: (value: T) => string
}) {
  const theme = useTheme()
  const { buddy, select } = useBuddySettingsScope()
  if (!buddy && setting.overriddenBy.length === 0) return null
  const own = !!buddy && setting.source === 'buddy'
  const allIcon = (
    <LucideIcon icon={UsersRoundIcon} size={18} color={theme.colors.textAlt} />
  )

  return (
    <Popover
      contentWidth={280}
      contentStyle={{ padding: 8, gap: 2 }}
      renderTrigger={({ onPress }) => (
        <PointerTooltip
          label={i18n.t('buddies_settingSource')}
          effect='none'
          style={{ marginStart: 6 }}
        >
          <IconButton
            icon={LayersIcon}
            size={MARKER_SIZE}
            color={own || !buddy ? theme.colors.accent : theme.colors.textAlt}
            onPress={onPress}
            accessibilityLabel={i18n.t('buddies_settingSourceLabel', {
              setting: label,
            })}
            style={[markerFrame, { marginEnd: 0, borderRadius: 999 }]}
          />
        </PointerTooltip>
      )}
    >
      {({ closeThen }) => (
        <>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            {label}
          </Text>
          {buddy ? (
            <>
              <SourceLayer
                leading={
                  <BuddyAvatar
                    avatar={buddy.avatar}
                    name={buddyDisplayName(buddy)}
                    color={buddy}
                    size={18}
                  />
                }
                name={buddyDisplayName(buddy)}
                value={
                  own
                    ? format(setting.value)
                    : i18n.t('buddies_settingInherits')
                }
                muted={!own}
                winning={own}
              />
              <SourceLayer
                leading={allIcon}
                name={i18n.t('buddies_allBuddies')}
                value={format(setting.inherited)}
                winning={!own}
                onPress={
                  select ? () => closeThen(() => select(null)) : undefined
                }
              />
            </>
          ) : (
            <>
              <SourceLayer
                leading={allIcon}
                name={i18n.t('buddies_allBuddies')}
                value={format(setting.inherited)}
                winning
              />
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                  paddingHorizontal: 10,
                  paddingTop: 8,
                  paddingBottom: 4,
                }}
              >
                {i18n.t('buddies_settingOverriddenBy')}
              </Text>
              {setting.overriddenBy.map(({ buddy: other, value }) => (
                <SourceLayer
                  key={other.inboxId}
                  leading={
                    <BuddyAvatar
                      avatar={other.avatar}
                      name={buddyDisplayName(other)}
                      color={other}
                      size={18}
                    />
                  }
                  name={buddyDisplayName(other)}
                  value={format(value)}
                  onPress={
                    select
                      ? () => closeThen(() => select(other.inboxId))
                      : undefined
                  }
                />
              ))}
            </>
          )}
        </>
      )}
    </Popover>
  )
}

/** The undo arrow after a buddy's own value: follow All Buddies again. */
function SettingResetButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme()
  const label = i18n.t('buddies_settingResetLabel')
  return (
    <PointerTooltip label={label} effect='none'>
      <IconButton
        icon={UndoIcon}
        size={MARKER_SIZE}
        color={theme.colors.textAlt}
        onPress={onPress}
        accessibilityLabel={label}
        style={[markerFrame, { marginHorizontal: 0, borderRadius: 999 }]}
      />
    </PointerTooltip>
  )
}

function SettingMarkers<T>({
  setting,
  label,
  format,
}: {
  setting: ScopedSetting<T>
  label: string
  format: (value: T) => string
}) {
  return (
    <>
      <SettingSourceButton setting={setting} label={label} format={format} />
      {setting.reset && <SettingResetButton onPress={setting.reset} />}
    </>
  )
}

const onOff = (value: boolean) =>
  i18n.t(value ? 'buddies_settingOn' : 'buddies_settingOff')

/** A switch for a setting in the current scope. */
export function ScopedSwitchRow({
  setting,
  label,
  info,
  description,
  lastInSection,
}: {
  setting: ScopedSetting<boolean>
  label: string
  info?: string
  description?: ReactNode
  lastInSection?: boolean
}) {
  return (
    <InputRowSwitch
      label={label}
      info={info}
      description={description}
      labelTrailing={
        <SettingMarkers setting={setting} label={label} format={onOff} />
      }
      value={setting.value}
      onValueChange={setting.set}
      lastInSection={lastInSection}
    />
  )
}

/** A choice for a setting in the current scope. */
export function ScopedSelectRow<T extends string>({
  setting,
  label,
  info,
  choices,
  lastInSection,
}: {
  setting: ScopedSetting<T>
  label: string
  info?: string
  choices: { value: T; label: string }[]
  lastInSection?: boolean
}) {
  const format = (value: T) =>
    choices.find((choice) => choice.value === value)?.label ?? value
  return (
    <InputRowSelect
      label={label}
      info={info}
      labelTrailing={
        <SettingMarkers setting={setting} label={label} format={format} />
      }
      lastInSection={lastInSection}
      selectProps={{
        data: choices,
        value: setting.value,
        onChange: ({ value }) => setting.set(value),
      }}
    />
  )
}
