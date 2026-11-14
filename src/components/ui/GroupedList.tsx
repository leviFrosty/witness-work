import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  useImperativeHandle,
  useRef,
} from 'react'
import { ScrollView, View } from 'react-native'
import type { InputRef } from 'tamagui'
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
import ActionButton from '@/components/ui/ActionButton'
import MyTextInput from '@/components/ui/TextInput'
import PullDownMenu from '@/components/ui/PullDownMenu'
import ReorderControls from '@/components/ui/ReorderControls'
import { submitScope } from '@/components/ui/submitScope'
import type {
  GroupedListPickerRowProps,
  GroupedListProps,
  GroupedListReorderSectionProps,
  GroupedListRowProps,
  GroupedListSectionProps,
  GroupedListSwitchRowProps,
  GroupedListTextFieldRowProps,
} from '@/components/ui/GroupedList.types'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

export type * from '@/components/ui/GroupedList.types'

export function GroupedList({
  children,
  title,
  header,
  testID,
}: GroupedListProps) {
  const foldColumn = useFoldColumn(inputLayout.contentMaxWidth)
  const theme = useTheme()

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        testID={testID}
        contentContainerStyle={[
          {
            width: '100%',
            maxWidth: inputLayout.contentMaxWidth,
            alignSelf: 'center',
            gap: 24,
            padding: 16,
          },
          foldColumn,
        ]}
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
        {header ? <View style={{ alignItems: 'center' }}>{header}</View> : null}
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

export function GroupedListReorderSection<T>({
  title,
  footer,
  data,
  keyExtractor,
  onMove,
  children,
}: GroupedListReorderSectionProps<T>) {
  return (
    <GroupedListSection title={title} footer={footer}>
      {data.map((item, index) => {
        const last = index === data.length - 1
        return (
          <View
            key={keyExtractor(item)}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <View style={{ paddingStart: inputLayout.horizontalPadding - 4 }}>
              <ReorderControls
                onMoveUp={
                  index > 0 ? () => onMove(index, index - 1) : undefined
                }
                onMoveDown={last ? undefined : () => onMove(index, index + 1)}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {cloneElement(
                children(item, index) as ReactElement<{
                  lastInSection?: boolean
                }>,
                { lastInSection: last }
              )}
            </View>
          </View>
        )
      })}
    </GroupedListSection>
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
  menuActions,
  menuLabel,
  disabled,
  selected,
  checked,
  tint,
  lastInSection,
}: GroupedListRowProps & { lastInSection?: boolean }) {
  const menu = menuActions && !disabled
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
      {trailing || menu || accessory !== 'none' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {trailing}
          {menu ? (
            <PullDownMenu
              triggerSize={16}
              accessibilityLabel={menuLabel ?? label}
              actions={menuActions}
            />
          ) : null}
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
      controlWidth='auto'
      lastInSection={lastInSection}
    >
      <Select
        variant='plain'
        accessibilityLabel={label}
        data={options}
        value={value}
        onChange={(option) => onChange(option.value)}
      />
    </InputRowContainer>
  )
}

export function GroupedListTextFieldRow({
  value,
  onChangeText,
  onEndEditing,
  accessibilityLabel,
  placeholder,
  maxLength,
  autoCapitalize = 'words',
  invalid,
  sublabel,
  action,
  menuActions,
  menuLabel,
  ref,
  testID,
  lastInSection,
}: GroupedListTextFieldRowProps & { lastInSection?: boolean }) {
  const theme = useTheme()
  const input = useRef<InputRef>(null)
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }))

  return (
    <View {...(action ? submitScope : undefined)}>
      <InputRowContainer
        lastInSection={lastInSection}
        controlWidth='full'
        controlStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <MyTextInput
            ref={input}
            testID={testID}
            value={value}
            onChangeText={onChangeText}
            onEndEditing={onEndEditing}
            accessibilityLabel={accessibilityLabel}
            placeholder={placeholder}
            invalid={invalid}
            maxLength={maxLength}
            autoCapitalize={autoCapitalize}
            textAlign='start'
          />
          {sublabel ? (
            <Text
              numberOfLines={1}
              style={{
                paddingHorizontal: 4,
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {sublabel}
            </Text>
          ) : null}
        </View>
        {action ? (
          <ActionButton onPress={action.onPress}>
            <Text style={{ color: theme.colors.textInverse }}>
              {action.label}
            </Text>
          </ActionButton>
        ) : null}
        {menuActions ? (
          <PullDownMenu
            triggerSize={16}
            accessibilityLabel={menuLabel ?? accessibilityLabel}
            actions={menuActions}
          />
        ) : null}
      </InputRowContainer>
    </View>
  )
}
