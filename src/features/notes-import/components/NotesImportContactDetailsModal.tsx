import { Sheet } from 'tamagui'
import { ScrollView, View } from 'react-native'
import Checkbox from 'expo-checkbox'
import moment from 'moment'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Divider from '@/components/ui/Divider'
import i18n from '@/lib/locales'
import { WarningLine } from '@/features/notes-import/components/NotesImportRecordRow'
import { visitCountLabel } from '@/features/notes-import/lib/notesImportMessages'
import type {
  PreviewContactInfo,
  PreviewRow,
  PreviewSelection,
} from '@/features/notes-import/lib/buildNotesImportPreview'
import type { MappedWarning } from '@/features/notes-import/lib/mapNotesImport'

/**
 * A contact and everything imported alongside it — its fields, its warnings,
 * and its visits — grouped so the relationship is visible. `isExisting` marks a
 * contact the user already has (only its new visits get imported; the contact
 * itself isn't re-created).
 */
export interface ContactGroup {
  id: string
  name: string
  isExisting: boolean
  info?: PreviewContactInfo
  warnings: MappedWarning[]
  visits: PreviewRow[]
}

interface Props {
  group: ContactGroup | null
  open: boolean
  setOpen: (open: boolean) => void
  selection: PreviewSelection
  toggleRow: (id: string) => void
  setRows: (ids: string[], value: boolean) => void
  disabled?: boolean
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const isDateOnly = (date: Date) =>
  date.getUTCHours() === 12 &&
  date.getUTCMinutes() === 0 &&
  date.getUTCSeconds() === 0 &&
  date.getUTCMilliseconds() === 0

/**
 * The mapper anchors date-only values at noon UTC. Keep those on their original
 * calendar day; show a local time only when the imported value had one.
 */
const formatReviewDate = (date: Date) =>
  isDateOnly(date)
    ? moment.utc(date).format('MMM D, YYYY')
    : moment(date).format('MMM D, YYYY · LT')

const SectionLabel = ({ children }: { children: string }) => {
  const theme = useTheme()
  return (
    <Text
      style={{
        color: theme.colors.textAlt,
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('xs'),
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  )
}

const VisitReviewCard = ({
  visit,
  checked,
  disabled,
  onToggle,
}: {
  visit: PreviewRow
  checked: boolean
  disabled?: boolean
  onToggle: () => void
}) => {
  const theme = useTheme()
  const flags = [
    visit.isBibleStudy ? i18n.t('notesImport_bibleStudy') : undefined,
    visit.notAtHome ? i18n.t('notesImport_notAtHome') : undefined,
  ].filter((flag): flag is string => !!flag)

  return (
    <View
      style={{
        gap: 12,
        padding: 14,
        borderRadius: theme.numbers.borderRadiusLg,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Button
        noTransform
        disabled={disabled}
        onPress={onToggle}
        accessibilityRole='checkbox'
        accessibilityState={{ checked, disabled: !!disabled }}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('notesImport_untitledVisit')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {[visit.date ? formatReviewDate(visit.date) : undefined, ...flags]
              .filter((value): value is string => !!value)
              .join(' · ')}
          </Text>
        </View>
        <View pointerEvents='none' style={{ paddingTop: 2 }}>
          <Checkbox value={checked} color={theme.colors.accent} />
        </View>
      </Button>

      <Divider />

      <View style={{ gap: 5 }}>
        <SectionLabel>{i18n.t('notesImport_visitNotes')}</SectionLabel>
        <Text
          style={{
            color: visit.title ? theme.colors.text : theme.colors.textAlt,
            fontStyle: visit.title ? 'normal' : 'italic',
            lineHeight: theme.fontSize('md') * 1.4,
          }}
        >
          {visit.title || i18n.t('notesImport_noVisitNotes')}
        </Text>
      </View>

      {visit.followUp && (
        <View
          style={{
            gap: 8,
            padding: 12,
            borderRadius: theme.numbers.borderRadiusMd,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.accentTranslucent,
          }}
        >
          <SectionLabel>{i18n.t('notesImport_followUp')}</SectionLabel>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {formatReviewDate(visit.followUp.date)}
          </Text>
          {!!visit.followUp.topic && (
            <View style={{ gap: 3 }}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                }}
              >
                {i18n.t('topic')}
              </Text>
              <Text style={{ lineHeight: theme.fontSize('md') * 1.4 }}>
                {visit.followUp.topic}
              </Text>
            </View>
          )}
        </View>
      )}

      {visit.warnings.length > 0 && (
        <View style={{ gap: 2 }}>
          {visit.warnings.map((warning) => (
            <WarningLine key={warning.id} warning={warning} />
          ))}
        </View>
      )}
    </View>
  )
}

const NotesImportContactDetailsModal = ({
  group,
  open,
  setOpen,
  selection,
  toggleRow,
  setRows,
  disabled,
}: Props) => {
  const theme = useTheme()

  const included = group
    ? group.isExisting || selection.ids.has(group.id)
    : false
  const visitsDisabled = disabled || (!!group && !group.isExisting && !included)

  const visitIds = group?.visits.map((v) => v.id) ?? []
  const allVisitsSelected =
    visitIds.length > 0 && visitIds.every((id) => selection.ids.has(id))

  const details: { label: string; value: string }[] = group?.info
    ? [
        group.info.phone && {
          label: i18n.t('notesImport_detailPhone'),
          value: group.info.phone,
        },
        group.info.email && {
          label: i18n.t('notesImport_detailEmail'),
          value: group.info.email,
        },
        group.info.addressLine && {
          label: i18n.t('notesImport_detailAddress'),
          value: group.info.addressLine,
        },
        group.info.gender && {
          label: i18n.t('notesImport_detailGender'),
          value: titleCase(group.info.gender),
        },
      ].filter((d): d is { label: string; value: string } => !!d)
    : []

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      dismissOnSnapToBottom
      modal
      snapPoints={[85]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        {group && (
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingBottom: 40, gap: 20 }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    fontSize: theme.fontSize('2xl'),
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {group.name}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {group.visits.length > 0
                    ? visitCountLabel(group.visits.length)
                    : i18n.t('notesImport_noVisits')}
                </Text>
              </View>
              <IconButton
                noTransform
                icon={faTimes}
                size='xl'
                onPress={() => setOpen(false)}
              />
            </View>

            {/* Include toggle (new contacts only) */}
            {!group.isExisting && (
              <Button
                noTransform
                onPress={() => toggleRow(group.id)}
                disabled={disabled}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderRadius: theme.numbers.borderRadiusLg,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor: included
                    ? theme.colors.accent
                    : theme.colors.border,
                  backgroundColor: included
                    ? theme.colors.accentTranslucent
                    : theme.colors.card,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: theme.fonts.semiBold }}>
                    {i18n.t('notesImport_addContact')}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {i18n.t('notesImport_addContactHint')}
                  </Text>
                </View>
                <View pointerEvents='none'>
                  <Checkbox value={included} color={theme.colors.accent} />
                </View>
              </Button>
            )}

            {group.isExisting && (
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                  lineHeight: 20,
                }}
              >
                {i18n.t('notesImport_existingContactNote')}
              </Text>
            )}

            {/* Imported contact fields */}
            {details.length > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: theme.fonts.bold }}>
                  {i18n.t('notesImport_contactDetails')}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 14,
                    borderRadius: theme.numbers.borderRadiusLg,
                    borderCurve: 'continuous',
                    backgroundColor: theme.colors.backgroundLighter,
                  }}
                >
                  {details.map((detail, index) => (
                    <View
                      key={detail.label}
                      style={{
                        gap: 4,
                        paddingVertical: 12,
                        borderBottomWidth:
                          index < details.length - 1 ? 1 : undefined,
                        borderBottomColor: theme.colors.border,
                      }}
                    >
                      <SectionLabel>{detail.label}</SectionLabel>
                      <Text style={{ lineHeight: theme.fontSize('md') * 1.35 }}>
                        {detail.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Contact-level warnings */}
            {group.warnings.length > 0 && (
              <View style={{ gap: 2 }}>
                {group.warnings.map((w) => (
                  <WarningLine key={w.id} warning={w} />
                ))}
              </View>
            )}

            {/* Visits */}
            <View style={{ gap: 12 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <Text style={{ fontFamily: theme.fonts.bold }}>
                  {i18n.t('notesImport_visits')} ({group.visits.length})
                </Text>
                {group.visits.length > 0 && (
                  <Button
                    noTransform
                    disabled={visitsDisabled}
                    onPress={() => setRows(visitIds, !allVisitsSelected)}
                  >
                    <Text
                      style={{
                        color: theme.colors.accent,
                        fontSize: theme.fontSize('sm'),
                        opacity: visitsDisabled ? 0.5 : 1,
                      }}
                    >
                      {allVisitsSelected
                        ? i18n.t('notesImport_deselectAll')
                        : i18n.t('notesImport_selectAll')}
                    </Text>
                  </Button>
                )}
              </View>

              {group.visits.length === 0 ? (
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('notesImport_noVisits')}
                </Text>
              ) : (
                group.visits.map((v) => (
                  <VisitReviewCard
                    key={v.id}
                    visit={v}
                    checked={selection.ids.has(v.id)}
                    disabled={visitsDisabled}
                    onToggle={() => toggleRow(v.id)}
                  />
                ))
              )}

              {visitsDisabled && !disabled && (
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('xs'),
                    fontStyle: 'italic',
                  }}
                >
                  {i18n.t('notesImport_contactDisabledHint')}
                </Text>
              )}
            </View>
          </ScrollView>
        )}
      </Sheet.Frame>
    </Sheet>
  )
}

export default NotesImportContactDetailsModal
