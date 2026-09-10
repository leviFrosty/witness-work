import { CircleQuestionMark, Mars, Venus } from 'lucide-react-native'
import { type Dispatch, type RefObject, type SetStateAction } from 'react'
import {
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import AvatarPickerPopover from '@/components/AvatarPickerPopover'
import {
  BackgroundSwatches,
  BACKGROUND_SWATCHES_WIDTH,
} from '@/components/AvatarPickerContent'
import IsSupporter from '@/components/IsSupporter'
import Card from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import MyTextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { GENDER_COLORS } from '@/features/contacts/components/GenderIcon'
import i18n from '@/lib/locales'
import { Contact } from '@/types/contact'

interface Props {
  contact: Contact
  setContact: Dispatch<SetStateAction<Contact>>
  editMode?: boolean
  nameInput: RefObject<TextInput | null>
  nameError?: string
  onNameChange: (name: string) => void
}

/**
 * Compact entry-point for editing the per-contact background color. Always
 * opens a popover — non-supporters see the swatch row dimmed via `IsSupporter`
 * so they discover the perk without a separate gate sheet.
 */
const BackgroundEditButton = ({
  value,
  onChange,
}: {
  value: string | null
  onChange: (next: string | null) => void
}) => {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const swatchColor = value ?? theme.colors.accent
  const popoverPadding = 10
  const popoverExtraWidth = 28
  const popoverWidth = Math.min(
    BACKGROUND_SWATCHES_WIDTH + popoverPadding * 2 + popoverExtraWidth,
    width - 32
  )

  const triggerStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 44,
    justifyContent: 'center' as const,
    alignSelf: 'center' as const,
  }

  return (
    <AnchoredPopover
      contentWidth={popoverWidth}
      contentStyle={{ padding: popoverPadding }}
      renderTrigger={({ onPress, expanded, anchorRef }) => (
        <View ref={anchorRef} collapsable={false}>
          <Pressable
            onPress={onPress}
            accessibilityRole='button'
            accessibilityLabel={i18n.t('contactHeroBackgroundColor')}
            accessibilityState={{ expanded }}
            style={triggerStyle}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 30,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: swatchColor,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.colors.border,
                }}
              />
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.medium,
                }}
              >
                {i18n.t('contactHeroBackgroundColor')}
              </Text>
            </View>
          </Pressable>
        </View>
      )}
    >
      <IsSupporter feature='customAccentColor' size='sm'>
        <BackgroundSwatches value={value} onChange={onChange} />
      </IsSupporter>
    </AnchoredPopover>
  )
}

const ContactIdentityCard = ({
  contact,
  setContact,
  editMode,
  nameInput,
  nameError,
  onNameChange,
}: Props) => {
  const theme = useTheme()

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 11,
          color: theme.colors.textAlt,
          letterSpacing: 1.4,
          fontFamily: theme.fonts.semiBold,
          textTransform: 'uppercase',
          marginHorizontal: 12,
        }}
      >
        {editMode ? i18n.t('edit') : i18n.t('add')} {i18n.t('contact')}
      </Text>
      <Card style={{ paddingVertical: 14, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <AvatarPickerPopover
            value={contact.avatar ?? { type: 'none', value: '' }}
            onChange={(avatar) =>
              setContact((current) => ({ ...current, avatar }))
            }
            onImageMeta={(avatarMeta) =>
              setContact((current) => ({ ...current, avatarMeta }))
            }
            name={contact.name}
            size={64}
            imageFileName={`contact-${contact.id}-avatar.jpg`}
            background={contact.avatarBackground ?? undefined}
            backgroundValue={contact.avatarBackground ?? null}
            onBackgroundChange={(avatarBackground) =>
              setContact((current) => ({ ...current, avatarBackground }))
            }
          />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <MyTextInput
              ref={nameInput}
              value={contact.name}
              error={nameError}
              accessibilityLabel={i18n.t('name')}
              onChangeText={onNameChange}
              placeholder={i18n.t('name_placeholder')}
              autoCapitalize='words'
              autoCorrect={false}
              autoFocus={!editMode}
              autoFocusNative={!editMode}
              enterKeyHint='next'
              fontSize={20}
              fontFamily={theme.fonts.semiBold}
              textAlign='left'
              hitSlop={0}
              style={{ color: theme.colors.text, width: '100%' }}
            />
            {nameError ? (
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.error,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {nameError}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                columnGap: 8,
              }}
            >
              <View style={{ flexDirection: 'row' }}>
                {(
                  [
                    { key: 'male', icon: Mars, color: GENDER_COLORS.male },
                    { key: 'female', icon: Venus, color: GENDER_COLORS.female },
                    {
                      key: 'unknown',
                      icon: CircleQuestionMark,
                      color: theme.colors.textAlt,
                    },
                  ] as const
                ).map(({ key, icon, color }) => {
                  const selected = contact.gender === key
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole='button'
                      accessibilityLabel={i18n.t(`gender_${key}`)}
                      accessibilityState={{ selected }}
                      onPress={() =>
                        setContact((current) => ({
                          ...current,
                          gender: selected ? undefined : key,
                        }))
                      }
                      style={{
                        width: 44,
                        height: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: selected
                            ? `${color}26`
                            : 'transparent',
                          borderWidth: 1,
                          borderColor: selected ? color : theme.colors.border,
                        }}
                      >
                        <LucideIcon
                          icon={icon}
                          size={14}
                          color={selected ? color : theme.colors.textAlt}
                        />
                      </View>
                    </Pressable>
                  )
                })}
              </View>
              <BackgroundEditButton
                value={contact.heroBackground ?? null}
                onChange={(heroBackground) =>
                  setContact((current) => ({ ...current, heroBackground }))
                }
              />
            </View>
          </View>
        </View>
      </Card>
    </View>
  )
}

export default ContactIdentityCard
