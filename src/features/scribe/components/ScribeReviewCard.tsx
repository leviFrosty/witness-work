import { useState } from 'react'
import { Pressable, View } from 'react-native'
import {
  Calendar as CalendarIcon,
  CalendarClock as CalendarClockIcon,
  CalendarCog as CalendarCogIcon,
  Check as CheckIcon,
  Clock as ClockIcon,
  DoorClosed as DoorClosedIcon,
  Info as InfoIcon,
  MessageCircle as MessageCircleIcon,
  PencilLine as PencilLineIcon,
  Plus as PlusIcon,
  Sparkles as SparklesIcon,
  Tag as TagIcon,
  TriangleAlert as TriangleAlertIcon,
  UserRound as UserRoundIcon,
  UserRoundPlus as UserRoundPlusIcon,
  UserRoundSearch as UserRoundSearchIcon,
  UsersRound as UsersRoundIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import Text from '@/components/ui/MyText'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type {
  ScribeContactChoice,
  ScribeEffect,
  ScribeReviewCard as Card,
} from '@/features/scribe/types'
import {
  cardWarnings,
  choiceSummary,
  effectLines,
  type ReviewLine,
} from '@/features/scribe/components/reviewCopy'

const RADIUS = 16
// Nested rows line up with the title, past the check and the kind tile.
const INDENT = 38

type Tone = 'accent' | 'warn'

const Check = ({ on, dim }: { on: boolean; dim?: boolean }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? theme.colors.accent : 'transparent',
        borderWidth: on ? 0 : 2,
        borderColor: theme.colors.textAlt,
        opacity: dim ? 0.5 : 1,
      }}
    >
      {on && (
        <LucideIcon
          icon={CheckIcon}
          size={15}
          color={theme.colors.textInverse}
          strokeWidth={3}
        />
      )}
    </View>
  )
}

const KindTile = ({ icon, tone }: { icon: AppIcon; tone: Tone }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor:
          tone === 'warn'
            ? theme.colors.warnTranslucent
            : theme.colors.accentTranslucent,
      }}
    >
      <LucideIcon
        icon={icon}
        size={18}
        color={tone === 'warn' ? theme.colors.warnText : theme.colors.accent}
      />
    </View>
  )
}

const Tag = ({ label, tone }: { label: string; tone: Tone }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
        backgroundColor:
          tone === 'warn'
            ? theme.colors.warnTranslucent
            : theme.colors.accentTranslucent,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize('xs') + 1,
          fontFamily: theme.fonts.semiBold,
          color: tone === 'warn' ? theme.colors.warnText : theme.colors.accent,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

/** Meta text, then `from "…"` with the sparkle that marks a resolved value. */
const MetaLine = ({
  line,
  lines = 2,
}: {
  line: ReviewLine
  /** Null for a contact: everything it will be saved with shows. */
  lines?: number | null
}) => {
  const theme = useTheme()
  // At accessibility sizes two lines hold only a few words; show them all.
  const uncapped = useAccessibilityTextSize()
  if (!line.meta.length && !line.spoken) return null
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 8,
      }}
    >
      {line.meta.length > 0 && (
        <Text
          numberOfLines={uncapped ? undefined : (lines ?? undefined)}
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {line.meta.join(' · ')}
        </Text>
      )}
      {line.spoken ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <LucideIcon
            icon={SparklesIcon}
            size={11}
            color={theme.colors.accent}
          />
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {line.spoken}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const SubRow = ({ icon, line }: { icon: AppIcon | null; line: ReviewLine }) => {
  const theme = useTheme()
  const uncapped = useAccessibilityTextSize()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginLeft: INDENT,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      {icon ? (
        <LucideIcon icon={icon} size={17} color={theme.colors.accent} />
      ) : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          numberOfLines={uncapped ? undefined : 4}
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.medium,
          }}
        >
          {line.title}
        </Text>
        <MetaLine line={line} />
      </View>
    </View>
  )
}

const ChoiceChip = ({
  label,
  detail,
  icon,
  chosen,
  onPress,
}: {
  label: string
  detail?: string | null
  icon?: AppIcon
  chosen: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const lines = useAccessibilityTextSize() ? undefined : 1
  return (
    <Button
      noTransform
      onPress={onPress}
      accessibilityRole='radio'
      accessibilityState={{ checked: chosen }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        maxWidth: '100%',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: chosen
          ? theme.colors.accentTranslucent
          : theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: chosen ? theme.colors.accent : theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {icon ? (
        <LucideIcon icon={icon} size={14} color={theme.colors.text} />
      ) : null}
      <View style={{ flexShrink: 1 }}>
        <Text
          numberOfLines={lines}
          style={{
            fontSize: theme.fontSize('sm') + 1,
            fontFamily: theme.fonts.medium,
          }}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            numberOfLines={lines}
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </Button>
  )
}

const effectIcon = (effect: ScribeEffect, index: number): AppIcon | null => {
  const preview = effect.preview
  switch (preview.kind) {
    case 'visit.create':
      if (index > 0) return CalendarClockIcon
      return preview.notAtHome ? DoorClosedIcon : MessageCircleIcon
    case 'contact.update':
    case 'plan.update':
      return PencilLineIcon
    default:
      return null
  }
}

interface Props {
  card: Card
  /** Pending: the check, chips and row toggle work. */
  editable: boolean
  onToggle: () => void
  onChoose: (choice: ScribeContactChoice) => void
  /** Added: opens the record it wrote. */
  onOpen?: () => void
}

/**
 * One review card (V-A): a check, the kind tile, what will be added and where a
 * date came from, nested Visit and Follow-up rows for a contact, and the people
 * to pick between when a name matched more than one.
 */
const ScribeReviewCard = ({
  card,
  editable,
  onToggle,
  onChoose,
  onOpen,
}: Props) => {
  const theme = useTheme()
  const format = usePreferences((s) => s.timeDisplayFormat)
  const [hovered, setHovered] = useState(false)
  const uncapped = useAccessibilityTextSize()
  const contact = card.contact
  const choice = contact?.type === 'choice' ? contact : null
  const chosenOption =
    choice?.chosen?.type === 'existing'
      ? choice.options.find(
          (o) =>
            choice.chosen?.type === 'existing' &&
            o.contactId === choice.chosen.contactId
        )
      : null
  const needsLook = card.needsChoice || (choice !== null && !choice.chosen)

  // The header line, its icon and tag; then the nested rows.
  let icon: AppIcon = ClockIcon
  let tone: Tone = 'accent'
  let tag: { label: string; tone: Tone } | null = null
  let header: ReviewLine
  let rows: { icon: AppIcon | null; line: ReviewLine }[] = []

  if (contact) {
    const nested = card.effects.filter(
      (e) => e.kind !== 'contact.create' || contact.type !== 'new'
    )
    if (contact.type === 'choice') {
      icon = UserRoundSearchIcon
      tone = needsLook ? 'warn' : 'accent'
      tag = needsLook
        ? { label: i18n.t('scribe_needsALook'), tone: 'warn' }
        : choice?.chosen?.type === 'new'
          ? { label: i18n.t('scribe_newContact'), tone: 'accent' }
          : null
      header = {
        title: chosenOption
          ? chosenOption.name
          : choice?.chosen?.type === 'new'
            ? contact.spokenName
            : i18n.t('scribe_whichContact', { name: contact.spokenName }),
        meta: [choiceSummary(card, format)].filter(Boolean),
        spoken: null,
      }
    } else {
      icon = contact.type === 'new' ? UserRoundPlusIcon : UserRoundIcon
      tag =
        contact.type === 'new'
          ? { label: i18n.t('scribe_newContact'), tone: 'accent' }
          : null
      // A new Contact shows everything it will be saved with.
      const created = card.effects.find(
        (effect) => effect.preview.kind === 'contact.create'
      )?.preview
      header = {
        title: contact.name,
        meta: [
          contact.addressLine,
          ...(contact.type === 'new' && created?.kind === 'contact.create'
            ? [created.phone, created.email]
            : []),
        ].filter((value): value is string => !!value),
        spoken: null,
      }
      rows = nested.flatMap((effect) =>
        effectLines(effect, format)
          .map((line, i) => ({ icon: effectIcon(effect, i), line }))
          // The header already names the Contact a change is for.
          .filter((_, i) => effect.preview.kind !== 'contact.update' || i > 0)
      )
    }
  } else {
    const effect = card.effects[0]
    const lines = effect ? effectLines(effect, format) : []
    header = lines[0] ?? { title: '', meta: [], spoken: null }
    // A new Plan's only other line is who to invite.
    rows = lines.slice(1).map((line) => ({
      icon:
        effect?.preview.kind === 'plan.create'
          ? UsersRoundIcon
          : PencilLineIcon,
      line,
    }))
    switch (effect?.preview.kind) {
      case 'plan.create':
        icon = CalendarIcon
        break
      case 'plan.update':
        icon = CalendarCogIcon
        break
      case 'category.create':
        icon = TagIcon
        break
      default:
        icon = ClockIcon
    }
  }

  const warnings = cardWarnings(card)
  const settled = !editable
  const checked = settled ? card.status === 'applied' : card.selected
  // Skipped or failed is a problem; unchecked before Add was the User's call.
  const notAdded =
    settled && (card.status === 'skipped' || card.status === 'failed')
      ? 'warn'
      : settled && card.status === 'dismissed'
        ? 'muted'
        : null

  const opens = !editable && !!onOpen

  return (
    <PointerHover onHoverChange={setHovered} enabled={editable || opens}>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: RADIUS,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor:
            editable && card.needsChoice
              ? theme.colors.warn
              : theme.colors.border,
          paddingVertical: 10,
          paddingHorizontal: 14,
          gap: 8,
          opacity: settled && card.status === 'dismissed' ? 0.55 : 1,
        }}
      >
        <Pressable
          disabled={!editable && !opens}
          onPress={editable ? onToggle : onOpen}
          accessibilityRole={opens ? 'button' : 'checkbox'}
          accessibilityState={
            opens ? undefined : { checked, disabled: !editable }
          }
          accessibilityLabel={[
            header.title,
            tag?.label,
            ...header.meta,
            header.spoken,
            notAdded ? i18n.t('scribe_notAdded') : null,
          ]
            .filter(Boolean)
            .join(', ')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: MIN_TOUCH_TARGET,
          }}
        >
          <View
            style={{
              width: MIN_TOUCH_TARGET,
              height: MIN_TOUCH_TARGET,
              marginLeft: -10,
              marginRight: -6,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check on={checked} dim={settled && !checked} />
          </View>
          <KindTile icon={icon} tone={tone} />
          <View style={{ flex: 1, gap: 2 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                columnGap: 8,
                rowGap: 2,
              }}
            >
              <Text
                // A person's whole name, even at large text sizes.
                numberOfLines={contact || uncapped ? undefined : 2}
                style={{
                  fontSize: theme.fontSize('md') + 1,
                  fontFamily: theme.fonts.semiBold,
                  flexShrink: 1,
                }}
              >
                {header.title}
              </Text>
              {tag ? <Tag label={tag.label} tone={tag.tone} /> : null}
            </View>
            <MetaLine line={header} lines={contact ? null : 2} />
            {notAdded ? (
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color:
                    notAdded === 'warn'
                      ? theme.colors.warnText
                      : theme.colors.textAlt,
                }}
              >
                {i18n.t('scribe_notAdded')}
              </Text>
            ) : null}
          </View>
          {opens ? (
            <LucideIcon
              icon={ChevronForwardIcon}
              size={16}
              color={theme.colors.textAlt}
            />
          ) : null}
        </Pressable>
        {rows.map((row, i) => (
          <SubRow key={i} icon={row.icon} line={row.line} />
        ))}
        {choice && editable ? (
          <View
            accessibilityRole='radiogroup'
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginLeft: INDENT,
              paddingBottom: 4,
            }}
          >
            {choice.options.map((option) => (
              <ChoiceChip
                key={option.contactId}
                label={option.name}
                detail={option.addressLine}
                chosen={
                  choice.chosen?.type === 'existing' &&
                  choice.chosen.contactId === option.contactId
                }
                onPress={() =>
                  onChoose({ type: 'existing', contactId: option.contactId })
                }
              />
            ))}
            <ChoiceChip
              label={i18n.t('scribe_choiceNew')}
              icon={PlusIcon}
              chosen={choice.chosen?.type === 'new'}
              onPress={() => onChoose({ type: 'new' })}
            />
          </View>
        ) : null}
        {warnings.map(({ text, severity }) => {
          // Info (another plan that day) is worth knowing, not a problem.
          const color =
            severity === 'info' ? theme.colors.textAlt : theme.colors.warnText
          return (
            <View
              key={text}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginLeft: INDENT,
              }}
            >
              <LucideIcon
                icon={severity === 'info' ? InfoIcon : TriangleAlertIcon}
                size={14}
                color={color}
              />
              <Text style={{ flex: 1, fontSize: theme.fontSize('sm'), color }}>
                {text}
              </Text>
            </View>
          )
        })}
        <HoverTint
          visible={hovered}
          borderRadius={RADIUS}
          borderCurve='continuous'
        />
      </View>
    </PointerHover>
  )
}

export default ScribeReviewCard
