import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
} from 'react'
import { ScrollView, View } from 'react-native'
import { ExternalLink as ExternalLinkIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import Select from '@/components/ui/Select'
import Switch from '@/components/ui/Switch'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import type {
  GroupedListPickerRowProps,
  GroupedListProps,
  GroupedListRowProps,
  GroupedListSectionProps,
  GroupedListSwitchRowProps,
} from '@/components/ui/GroupedList.types'

export type * from '@/components/ui/GroupedList.types'

/**
 * Short, fixed groups of settings rows that own the screen's scroll: a SwiftUI
 * inset grouped `List` on iOS (`GroupedList.ios.tsx`) and a Material 3 grouped
 * list on Android (`GroupedList.android.tsx`). Not virtualized; use FlashList
 * for long or unknown-length data. Other platforms render the shared React
 * Native rows.
 */
export function GroupedList({ children, title, testID }: GroupedListProps) {
  const theme = useTheme()

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        testID={testID}
        contentContainerStyle={{
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          gap: 24,
          padding: 16,
        }}
      >
        {title ? (
          <Text
            accessibilityRole='header'
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            {title}
          </Text>
        ) : null}
        {children}
      </ScrollView>
    </View>
  )
}

export function GroupedListSection({
  title,
  footer,
  children,
}: GroupedListSectionProps) {
  const theme = useTheme()
  const rows = Children.toArray(children).filter(isValidElement)

  return (
    <View style={{ gap: 8 }}>
      {title ? (
        <Text
          accessibilityRole='header'
          style={{
            marginStart: inputLayout.horizontalPadding,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {title}
        </Text>
      ) : null}
      <Section>
        {rows.map((row, index) =>
          cloneElement(row as ReactElement<{ lastInSection?: boolean }>, {
            lastInSection: index === rows.length - 1,
          })
        )}
      </Section>
      {footer ? (
        <Text
          style={{
            marginHorizontal: inputLayout.horizontalPadding,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

export function GroupedListRow({
  label,
  sublabel,
  icon,
  iconColor,
  iconFill,
  onPress,
  accessory = onPress ? 'chevron' : 'none',
  trailing,
  url,
  contextActions,
  disabled,
  selected,
  checked,
  tint,
  lastInSection,
}: GroupedListRowProps & { lastInSection?: boolean }) {
  return (
    <InputRowButton
      label={label}
      sublabel={sublabel}
      leftIcon={icon}
      leftIconColor={iconColor}
      leftIconFill={iconFill}
      onPress={onPress}
      url={url}
      contextActions={contextActions}
      disabled={disabled}
      selected={selected}
      checked={checked}
      lastInSection={lastInSection}
      style={tint ? { backgroundColor: tint } : undefined}
    >
      {trailing || accessory !== 'none' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {trailing}
          {accessory !== 'none' ? (
            <IconButton
              icon={
                accessory === 'external' ? ExternalLinkIcon : ChevronForwardIcon
              }
            />
          ) : null}
        </View>
      ) : null}
    </InputRowButton>
  )
}

export function GroupedListSwitchRow({
  label,
  icon,
  info,
  value,
  onValueChange,
  disabled,
  testID,
  lastInSection,
}: GroupedListSwitchRowProps & { lastInSection?: boolean }) {
  return (
    <InputRowContainer
      leftIcon={icon}
      label={label}
      info={info}
      controlStyle={{ width: 'auto', flexShrink: 0 }}
      lastInSection={lastInSection}
    >
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      />
    </InputRowContainer>
  )
}

export function GroupedListPickerRow({
  label,
  sublabel,
  icon,
  options,
  value,
  onChange,
  lastInSection,
}: GroupedListPickerRowProps & { lastInSection?: boolean }) {
  return (
    <InputRowContainer
      leftIcon={icon}
      label={label}
      description={sublabel}
      lastInSection={lastInSection}
    >
      <Select
        accessibilityLabel={label}
        data={options}
        value={value}
        onChange={(option) => onChange(option.value)}
      />
    </InputRowContainer>
  )
}
