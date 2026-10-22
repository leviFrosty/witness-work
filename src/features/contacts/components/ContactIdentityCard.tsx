import { CircleQuestionMark, Mars, Venus } from 'lucide-react-native'
import { type Dispatch, type RefObject, type SetStateAction } from 'react'
import {
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import Popover from '@/components/ui/Popover'
import AvatarPickerPopover from '@/components/AvatarPickerPopover'
import {
  BackgroundSwatches,
  BACKGROUND_SWATCHES_WIDTH,
} from '@/components/AvatarPickerContent'
import IsSupporter from '@/components/IsSupporter'
import Card from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover from '@/components/ui/PointerHover'
import Text from '@/components/ui/MyText'
import MyTextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { GENDER_COLORS } from '@/components/GenderIcon'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { Contact } from '@/types/contact'
import { tracking } from '@/lib/tracking'

interface Props {
  contact: Contact
  setContact: Dispatch<SetStateAction<Contact>>
  editMode?: boolean
  nameInput: RefObject<TextInput | null>
  nameError?: string
  onNameChange: (name: string) => void
  /** The keyboard's Next key on the name field. */
  onNameSubmit: () => void
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
    <Popover
      contentWidth={popoverWidth}
      contentStyle={{ padding: popoverPadding }}
      style={{ alignSelf: 'center' }}
      renderTrigger={({ onPress, expanded }) => (
        <Pressable
          onPress={onPress}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('contactHeroBackgroundColor')}
          accessibilityState={{ expanded }}
          style={triggerStyle}
        >
          {/* Hovers the visible pill, not the taller touch target. */}
          <PointerHover effect='highlight'>
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
          </PointerHover>
        </Pressable>
      )}
    >
      <IsSupporter
        analyticsSurface='contact_background'
        feature='customAccentColor'
        size='sm'
      >
        <BackgroundSwatches value={value} onChange={onChange} />
      </IsSupporter>
    </Popover>
  )
}

const ContactIdentityCard = ({
  contact,
  setContact,
  editMode,
  nameInput,
  nameError,
  onNameChange,
  onNameSubmit,
}: Props) => {
  const theme = useTheme()
  // Gender is householder data with no ministry need, and a photo of a
  // householder has no lawful basis at all — both are hidden rather than
  // disabled so the form never invites the entry. Existing values are left
  // untouched on the record. See `docs/gdpr-mode-research.md` §11.1.
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  // With enlarged text the placeholder (and a long name) can be wider than the
  // field; it wraps and the field grows instead of cutting it off.
  const wrapName = useWindowDimensions().fontScale > 1

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 11,
          color: theme.colors.textAlt,
          letterSpacing: tracking(1.4),
          fontFamily: theme.fonts.semiBold,
          textTransform: 'uppercase',
          marginHorizontal: 12,
        }}
      >
        {i18n.t(editMode ? 'editContact' : 'addContact')}
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
            allowImage={!dataProtectionMode}
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
              testID='contact-name-input'
              // A pasted line break becomes a space, as in a one-line field.
              onChangeText={(name) => onNameChange(name.replace(/\n/g, ' '))}
              placeholder={i18n.t('name_placeholder')}
              multiline={wrapName}
              autoCapitalize='words'
              autoCorrect={false}
              autoFocus={!editMode}
              autoFocusNative={!editMode}
              enterKeyHint='next'
              submitBehavior='submit'
              onSubmitEditing={onNameSubmit}
              fontSize={20}
              fontFamily={theme.fonts.semiBold}
              textAlign='start'
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
              <View
                style={{
                  flexDirection: 'row',
                  display: dataProtectionMode ? 'none' : 'flex',
                }}
              >
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
                      <PointerHover effect='highlight'>
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
                      </PointerHover>
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
