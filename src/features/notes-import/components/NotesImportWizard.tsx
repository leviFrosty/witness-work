import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { Spinner } from 'tamagui'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import {
  faCircleExclamation,
  faLock,
  faRotateLeft,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { PublisherImportMode } from '@/lib/import/writeMappedData'
import { useNotesImport } from '@/features/notes-import/hooks/useNotesImport'
import NotesImportPreview from '@/features/notes-import/components/NotesImportPreview'
import type { NotesImportErrorCode } from '@/features/notes-import/lib/notesImportClient'

interface Props {
  publisherMode: PublisherImportMode
  /** Hide the in-component title/description (host already shows a header). */
  compact?: boolean
  /** Called when the user finishes (acknowledges success / done). */
  onComplete?: () => void
  /** Shown as the CTA when the free import limit is hit; omit to hide it. */
  onRequestUpgrade?: () => void
}

const errorMessageKey = (code: NotesImportErrorCode): string => {
  switch (code) {
    case 'too_large':
      return 'notesImport_tooLarge'
    case 'model_error':
      return 'notesImport_modelError'
    case 'network':
      return 'notesImport_networkError'
    case 'attestation_failed':
    case 'attestation_required':
      return 'notesImport_attestationError'
    case 'refinement_limit':
      return 'notesImport_refinementLimit'
    default:
      return 'notesImport_error'
  }
}

const NotesImportWizard = ({
  publisherMode,
  compact,
  onComplete,
  onRequestUpgrade,
}: Props) => {
  const theme = useTheme()
  const {
    status,
    preview,
    selection,
    credits,
    errorCode,
    refining,
    canConfirm,
    submit,
    refine,
    toggleRow,
    togglePublisher,
    setGroup,
    confirm,
    undo,
    reset,
  } = useNotesImport({ publisherMode })

  const [text, setText] = useState('')
  const [instruction, setInstruction] = useState('')

  const creditsLabel = credits
    ? credits.isSupporter || credits.remaining === null
      ? i18n.t('notesImport_creditsUnlimited')
      : i18n.t('notesImport_creditsRemaining', { count: credits.remaining })
    : null

  const isEmptyPreview =
    !!preview &&
    preview.counts.contacts === 0 &&
    preview.counts.visits === 0 &&
    preview.counts.timeEntries === 0 &&
    !preview.hasPublisher

  const inputArea = (
    <View style={{ gap: 16 }}>
      {!compact && (
        <>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('notesImport_title')}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('notesImport_description')}
          </Text>
        </>
      )}

      <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <FontAwesomeIcon icon={faLock} size={16} color={theme.colors.textAlt} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('notesImport_disclosureTitle')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('notesImport_disclosureBody')}
          </Text>
        </View>
      </Card>

      <Card>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder={i18n.t('notesImport_placeholder')}
          placeholderTextColor={theme.colors.textAlt}
          style={{
            minHeight: 160,
            textAlignVertical: 'top',
            color: theme.colors.text,
            fontFamily: theme.fonts.regular,
            fontSize: theme.fontSize('md'),
          }}
        />
      </Card>

      {errorCode === 'limit_reached' ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ fontFamily: theme.fonts.bold }}>
            {i18n.t('notesImport_limitTitle')}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('notesImport_limitBody')}
          </Text>
          {onRequestUpgrade && (
            <ActionButton onPress={onRequestUpgrade}>
              <Text
                style={{
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.bold,
                }}
              >
                {i18n.t('notesImport_limitCta')}
              </Text>
            </ActionButton>
          )}
        </Card>
      ) : (
        errorCode && (
          <Card
            style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
          >
            <FontAwesomeIcon
              icon={faCircleExclamation}
              size={18}
              color={theme.colors.textAlt}
            />
            <Text style={{ flex: 1, color: theme.colors.textAlt }}>
              {i18n.t(errorMessageKey(errorCode) as 'notesImport_error')}
            </Text>
          </Card>
        )
      )}

      <ActionButton disabled={!text.trim()} onPress={() => submit(text)}>
        <Text
          style={{
            color: theme.colors.textInverse,
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('notesImport_submit')}
        </Text>
      </ActionButton>

      {creditsLabel && (
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            textAlign: 'center',
          }}
        >
          {creditsLabel}
        </Text>
      )}
    </View>
  )

  const loadingCard = (label: string) => (
    <Card
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        paddingVertical: 32,
      }}
    >
      <Spinner size='large' color={theme.colors.accent} />
      <Text style={{ color: theme.colors.textAlt }}>{label}</Text>
    </Card>
  )

  const previewArea = preview && (
    <View style={{ gap: 16 }}>
      {!compact && (
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('notesImport_previewTitle')}
        </Text>
      )}

      {isEmptyPreview ? (
        <Card style={{ gap: 8 }}>
          <Text style={{ fontFamily: theme.fonts.bold }}>
            {i18n.t('notesImport_emptyTitle')}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('notesImport_emptyBody')}
          </Text>
        </Card>
      ) : (
        <>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('notesImport_previewDescription')}
          </Text>
          <NotesImportPreview
            preview={preview}
            selection={selection}
            toggleRow={toggleRow}
            togglePublisher={togglePublisher}
            setGroup={setGroup}
            disabled={refining}
          />

          <Card style={{ gap: 10 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {i18n.t('notesImport_refineTitle')}
            </Text>
            <TextInput
              value={instruction}
              onChangeText={setInstruction}
              placeholder={i18n.t('notesImport_refinePlaceholder')}
              placeholderTextColor={theme.colors.textAlt}
              editable={!refining}
              style={{
                color: theme.colors.text,
                fontFamily: theme.fonts.regular,
              }}
            />
            <Button
              disabled={refining || !instruction.trim()}
              onPress={() => {
                refine(instruction)
                setInstruction('')
              }}
              noTransform
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {refining
                  ? i18n.t('notesImport_refining')
                  : i18n.t('notesImport_refine')}
              </Text>
            </Button>
          </Card>

          <ActionButton disabled={!canConfirm || refining} onPress={confirm}>
            <Text
              style={{
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('notesImport_confirm')}
            </Text>
          </ActionButton>
        </>
      )}

      <Button
        onPress={reset}
        style={{ alignSelf: 'center', paddingVertical: 8 }}
      >
        <Text
          style={{
            color: theme.colors.textAlt,
            textDecorationLine: 'underline',
          }}
        >
          {i18n.t('notesImport_startOver')}
        </Text>
      </Button>
    </View>
  )

  const successArea = (
    <Card style={{ gap: 16, alignItems: 'center', paddingVertical: 24 }}>
      <Text style={{ fontFamily: theme.fonts.semiBold }}>
        {i18n.t('notesImport_success')}
      </Text>
      <Button
        onPress={undo}
        noTransform
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <FontAwesomeIcon
          icon={faRotateLeft}
          size={14}
          color={theme.colors.accent}
        />
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('notesImport_undo')}
        </Text>
      </Button>
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <Button onPress={reset}>
          <Text
            style={{
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('notesImport_importAnother')}
          </Text>
        </Button>
        {onComplete && (
          <Button onPress={onComplete}>
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('done')}
            </Text>
          </Button>
        )}
      </View>
    </Card>
  )

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ gap: 24, paddingBottom: 40 }}
      keyboardShouldPersistTaps='handled'
    >
      {status === 'submitting'
        ? loadingCard(i18n.t('notesImport_submitting'))
        : status === 'committing'
          ? loadingCard(i18n.t('mytimeImport_importing'))
          : status === 'success'
            ? successArea
            : status === 'preview'
              ? previewArea
              : inputArea}
    </KeyboardAwareScrollView>
  )
}

export default NotesImportWizard
