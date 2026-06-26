import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { Spinner } from 'tamagui'
import {
  faArrowUp,
  faCheck,
  faCircleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import AuroraBorder from '@/components/ui/AuroraBorder'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

interface HistoryProps {
  lastAppliedInstruction: string
  refining: boolean
}

/**
 * Chat bubble echoing the last applied refinement instruction. Split out from
 * the input so a docked composer can keep this conversation history in the
 * scroll area above it.
 */
export const NotesImportRefinementHistory = ({
  lastAppliedInstruction,
  refining,
}: HistoryProps) => {
  const theme = useTheme()
  if (!lastAppliedInstruction || refining) return null
  return (
    <View
      accessibilityLiveRegion='polite'
      style={{
        alignSelf: 'flex-end',
        maxWidth: '90%',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 7,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: theme.numbers.borderRadiusLg,
        borderBottomRightRadius: 6,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.accentTranslucent,
      }}
    >
      {/* Directional tail marking this as the user's message (bottom-right). */}
      <View
        style={{
          position: 'absolute',
          bottom: 1,
          right: -2,
          width: 12,
          height: 12,
          backgroundColor: theme.colors.accentTranslucent,
          borderRadius: 2,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <FontAwesomeIcon
        icon={faCheck}
        size={12}
        color={theme.colors.accent}
        style={{ marginTop: 2 }}
      />
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {i18n.t('notesImport_refineApplied')}
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {lastAppliedInstruction}
        </Text>
      </View>
    </View>
  )
}

interface Props {
  instruction: string
  lastAppliedInstruction: string
  refining: boolean
  errorMessage?: string
  onChangeInstruction: (value: string) => void
  onSubmit: () => void
}

/**
 * The onboarding wizard's refinement prompt: an animated-border text field with
 * an inline applied-instruction bubble above it. The primary chat surface (the
 * composer screen, ADR 0009) instead reuses {@link NotesImportChatInput} for
 * both its paste and refine inputs, so this aurora treatment is wizard-only.
 */
const NotesImportRefinementComposer = ({
  instruction,
  lastAppliedInstruction,
  refining,
  errorMessage,
  onChangeInstruction,
  onSubmit,
}: Props) => {
  const theme = useTheme()
  const [focused, setFocused] = useState(false)
  const canSubmit = !!instruction.trim() && !refining

  const statusArea = (
    <View
      accessibilityLiveRegion='polite'
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        paddingLeft: 5,
      }}
    >
      {refining && (
        <>
          <Spinner size='small' color={theme.colors.accent} />
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('notesImport_refining')}
          </Text>
        </>
      )}
    </View>
  )

  const sendButton = (
    <Button
      disabled={!canSubmit}
      onPress={onSubmit}
      accessibilityLabel={i18n.t('notesImport_refine')}
      accessibilityHint={i18n.t('notesImport_refineButtonHint')}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
        backgroundColor:
          canSubmit || refining
            ? theme.colors.accent
            : theme.colors.backgroundLighter,
        borderWidth: canSubmit || refining ? 0 : 1,
        borderColor: theme.colors.border,
      }}
    >
      {refining ? (
        <Spinner size='small' color={theme.colors.textInverse} />
      ) : (
        <FontAwesomeIcon
          icon={faArrowUp}
          size={16}
          color={canSubmit ? theme.colors.textInverse : theme.colors.textAlt}
        />
      )}
    </Button>
  )

  return (
    <View style={{ gap: 10 }}>
      <NotesImportRefinementHistory
        lastAppliedInstruction={lastAppliedInstruction}
        refining={refining}
      />

      <AuroraBorder
        borderRadius={22}
        strokeWidth={focused || refining ? 2 : 1}
        rotationSeconds={14}
        glow={false}
        padding={0}
      >
        <TextInput
          value={instruction}
          onChangeText={onChangeInstruction}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          multiline
          editable={!refining}
          accessibilityLabel={i18n.t('notesImport_refineTitle')}
          accessibilityHint={i18n.t('notesImport_refineDescription')}
          placeholder={i18n.t('notesImport_refinePlaceholder')}
          placeholderTextColor={theme.colors.textAlt}
          textAlignVertical='top'
          style={{
            minHeight: 74,
            maxHeight: 150,
            paddingHorizontal: 15,
            paddingTop: 14,
            paddingBottom: 8,
            color: theme.colors.text,
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize('md'),
            lineHeight: 20,
          }}
        />
        <View
          style={{
            minHeight: 52,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingHorizontal: 10,
            paddingBottom: 8,
          }}
        >
          {statusArea}
          {sendButton}
        </View>
      </AuroraBorder>

      {!!errorMessage && !refining && (
        <View
          accessibilityLiveRegion='polite'
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 7,
            paddingHorizontal: 4,
          }}
        >
          <FontAwesomeIcon
            icon={faCircleExclamation}
            size={13}
            color={theme.colors.error}
            style={{ marginTop: 2 }}
          />
          <Text
            style={{
              flex: 1,
              color: theme.colors.error,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {errorMessage}
          </Text>
        </View>
      )}
    </View>
  )
}

export default NotesImportRefinementComposer
