import {
  CalendarDays as CalendarDaysIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Info as InfoIcon,
} from 'lucide-react-native'
import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import CircularProgress from '@/components/ui/CircularProgress'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'

/**
 * PROTOTYPE — throwaway UI for the Scribe usage-window decision. Three variants
 * of the existing Scribe composer usage surfaces, switched by the floating
 * bottom bar. Run with `pnpm prototype:scribe-usage`, then open Scribe AI from
 * Settings.
 */

type VariantKey = 'A' | 'B' | 'C'
type MockState = 'available' | 'limit' | 'unlimited' | 'none'

type MockCredits = {
  remaining: number | null
  limit: number | null
  resetsAt: Date | null
  isSupporter: boolean
  refinements: { remaining: number | null; limit: number | null }
}

const VARIANTS: ReadonlyArray<{ key: VariantKey; name: string }> = [
  { key: 'A', name: 'Familiar meter' },
  { key: 'B', name: 'Plain numbers' },
  { key: 'C', name: 'Reset first' },
]

const STATES: ReadonlyArray<{ key: MockState; label: string }> = [
  { key: 'available', label: '3 left' },
  { key: 'limit', label: 'At limit' },
  { key: 'unlimited', label: 'Unlimited' },
  { key: 'none', label: 'None' },
]

const resetDate = new Date(Date.now() + 17 * 24 * 60 * 60 * 1000)

const creditsFor = (state: MockState): MockCredits => {
  if (state === 'unlimited') {
    return {
      remaining: null,
      limit: null,
      resetsAt: null,
      isSupporter: true,
      refinements: { remaining: 3, limit: 5 },
    }
  }
  if (state === 'none') {
    return {
      remaining: 0,
      limit: 0,
      resetsAt: null,
      isSupporter: false,
      refinements: { remaining: 3, limit: 5 },
    }
  }
  return {
    remaining: state === 'limit' ? 0 : 3,
    limit: 5,
    resetsAt: resetDate,
    isSupporter: false,
    refinements: { remaining: 3, limit: 5 },
  }
}

const Section = ({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) => {
  const theme = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: theme.colors.textAlt,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xs'),
          textTransform: 'uppercase',
          letterSpacing: 0.7,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

const StatePicker = ({
  state,
  setState,
}: {
  state: MockState
  setState: (state: MockState) => void
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 3,
        borderRadius: theme.numbers.borderRadiusXl,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {STATES.map((option) => {
        const selected = option.key === state
        return (
          <Pressable
            key={option.key}
            onPress={() => setState(option.key)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 7,
              borderRadius: theme.numbers.borderRadiusXl,
              backgroundColor: selected
                ? theme.colors.accentTranslucent
                : 'transparent',
            }}
          >
            <Text
              style={{
                color: selected ? theme.colors.accent : theme.colors.textAlt,
                fontFamily: selected
                  ? theme.fonts.semiBold
                  : theme.fonts.regular,
                fontSize: theme.fontSize('xs'),
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const ProgressBar = ({ credits }: { credits: MockCredits }) => {
  const theme = useTheme()
  const progress =
    credits.remaining === null || credits.limit === null || credits.limit === 0
      ? 1
      : credits.remaining / credits.limit
  return (
    <View
      style={{
        height: 7,
        overflow: 'hidden',
        borderRadius: 4,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          height: '100%',
          borderRadius: 4,
          backgroundColor:
            credits.remaining === 0 ? theme.colors.warn : theme.colors.accent,
          opacity: credits.remaining === null ? 0.55 : 1,
        }}
      />
    </View>
  )
}

const resetLabel = (credits: MockCredits) =>
  credits.resetsAt ? formatDate(credits.resetsAt, { style: 'medium' }) : null

const allowanceLine = (credits: MockCredits) => {
  if (credits.remaining === null) return 'Unlimited imports'
  if (credits.limit === 0) return 'No imports included'
  return `${credits.remaining} of ${credits.limit} imports left`
}

const refinementLine = (credits: MockCredits) => {
  if (credits.refinements.remaining === null) return 'Unlimited refinements'
  return `${credits.refinements.remaining} of ${credits.refinements.limit} refinements left for this import`
}

const ComposerSample = ({ trigger }: { trigger: ReactNode }) => {
  const theme = useTheme()
  return (
    <Card style={{ gap: 12, padding: 14 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
        <View
          style={{
            flex: 1,
            minHeight: 44,
            justifyContent: 'center',
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            paddingHorizontal: 15,
          }}
        >
          <Text style={{ color: theme.colors.textAlt }}>
            Ask Scribe to adjust anything…
          </Text>
        </View>
        {trigger}
      </View>
    </Card>
  )
}

const SupporterCta = () => (
  <ActionButton onPress={() => undefined}>Get unlimited imports</ActionButton>
)

const LimitCard = ({
  title,
  body,
  credits,
}: {
  title: string
  body: string
  credits: MockCredits
}) => {
  const theme = useTheme()
  return (
    <Card style={{ gap: 11 }}>
      <Text style={{ fontFamily: theme.fonts.bold }}>{title}</Text>
      <Text style={{ color: theme.colors.textAlt, lineHeight: 20 }}>
        {body}
      </Text>
      {!credits.isSupporter && <SupporterCta />}
    </Card>
  )
}

const CopyCard = ({ children }: { children: ReactNode }) => {
  const theme = useTheme()
  return (
    <Card style={{ gap: 8, paddingVertical: 15 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <LucideIcon icon={InfoIcon} size={15} color={theme.colors.accent} />
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          Import allowance
        </Text>
      </View>
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          lineHeight: 20,
        }}
      >
        {children}
      </Text>
    </Card>
  )
}

const PaywallRow = ({ free }: { free: string }) => {
  const theme = useTheme()
  return (
    <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 13,
          paddingHorizontal: 14,
        }}
      >
        <Text style={{ flex: 1, fontFamily: theme.fonts.semiBold }}>
          Scribe AI imports
        </Text>
        <Text
          style={{
            width: 92,
            textAlign: 'center',
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {free}
        </Text>
        <Text
          style={{
            width: 92,
            textAlign: 'center',
            color: theme.colors.supporter,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          Unlimited
        </Text>
      </View>
    </Card>
  )
}

const VariantA = ({ credits }: { credits: MockCredits }) => {
  const theme = useTheme()
  const date = resetLabel(credits)
  const ringProgress =
    credits.remaining === null || credits.limit === null || credits.limit === 0
      ? 1
      : credits.remaining / credits.limit
  const limited = credits.remaining === 0 && credits.limit !== 0
  const noAllowance = credits.limit === 0
  return (
    <View style={{ gap: 20 }}>
      <Section title='Composer meter'>
        <ComposerSample
          trigger={
            <View
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularProgress
                progress={ringProgress}
                size={25}
                strokeWidth={3}
                color={
                  credits.remaining === 0
                    ? theme.colors.warn
                    : theme.colors.accent
                }
                trackColor={theme.colors.border}
              />
            </View>
          }
        />
      </Section>

      <Section title='Usage popover — shown open'>
        <Card style={{ gap: 17 }}>
          <View style={{ gap: 3 }}>
            <Text
              style={{
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              Scribe AI usage
            </Text>
            <Text style={{ color: theme.colors.textAlt }}>
              {allowanceLine(credits)}
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>Imports</Text>
            <ProgressBar credits={credits} />
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {date
                ? `Refreshes ${date}`
                : credits.isSupporter
                  ? 'No limit with Supporter'
                  : 'No refresh date'}
            </Text>
          </View>
          <View style={{ gap: 7 }}>
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              Refinements
            </Text>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {refinementLine(credits)}
            </Text>
          </View>
          {!credits.isSupporter && <SupporterCta />}
        </Card>
      </Section>

      {(limited || noAllowance) && (
        <Section title='Limit block'>
          <LimitCard
            credits={credits}
            title={
              noAllowance
                ? 'Imports aren’t included right now'
                : 'Import allowance reached'
            }
            body={
              noAllowance
                ? 'You can still re-open imports you’ve already started.'
                : `You can start another import on ${date}. Re-importing the same notes still works.`
            }
          />
        </Section>
      )}

      <Section title='Help copy'>
        <CopyCard>
          You can start 5 new imports every 30 days. Your first import starts
          the window. Re-importing the same notes doesn’t count again, and each
          import can be refined up to 5 times.
        </CopyCard>
      </Section>

      <Section title='Paywall row'>
        <PaywallRow free='5 every 30 days' />
      </Section>

      <Section title='Refinement caption'>
        <Text style={{ color: theme.colors.textAlt }}>
          {refinementLine(credits)}
        </Text>
      </Section>
    </View>
  )
}

const VariantB = ({ credits }: { credits: MockCredits }) => {
  const theme = useTheme()
  const date = resetLabel(credits)
  const limited = credits.remaining === 0 && credits.limit !== 0
  const noAllowance = credits.limit === 0
  const triggerLabel =
    credits.remaining === null
      ? 'Unlimited'
      : credits.limit === 0
        ? 'No imports'
        : `${credits.remaining} / ${credits.limit}`
  return (
    <View style={{ gap: 20 }}>
      <Section title='Composer meter'>
        <ComposerSample
          trigger={
            <View
              style={{
                minHeight: 36,
                justifyContent: 'center',
                paddingHorizontal: 11,
                borderRadius: 18,
                borderWidth: 1,
                borderColor:
                  credits.remaining === 0
                    ? theme.colors.warn
                    : theme.colors.border,
                backgroundColor: theme.colors.card,
              }}
            >
              <Text
                style={{
                  color:
                    credits.remaining === 0
                      ? theme.colors.warn
                      : theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('xs'),
                }}
              >
                {triggerLabel}
              </Text>
            </View>
          }
        />
      </Section>

      <Section title='Usage popover — shown open'>
        <Card style={{ gap: 18 }}>
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            Your Scribe allowance
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                }}
              >
                NEW IMPORTS
              </Text>
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('2xl'),
                }}
              >
                {credits.remaining === null ? '∞' : credits.remaining}
              </Text>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {credits.limit
                  ? `of ${credits.limit} left`
                  : credits.isSupporter
                    ? 'no limit'
                    : 'included'}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('xs'),
                }}
              >
                REFINEMENTS
              </Text>
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('2xl'),
                }}
              >
                {credits.refinements.remaining ?? '∞'}
              </Text>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                for this import
              </Text>
            </View>
          </View>
          <View
            style={{
              paddingTop: 13,
              borderTopWidth: 1,
              borderColor: theme.colors.border,
              gap: 4,
            }}
          >
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {date
                ? `Next refresh: ${date}`
                : credits.isSupporter
                  ? 'No refresh needed'
                  : 'No refresh scheduled'}
            </Text>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                lineHeight: 19,
              }}
            >
              Re-importing the same notes doesn’t use another import.
            </Text>
          </View>
          {!credits.isSupporter && <SupporterCta />}
        </Card>
      </Section>

      {(limited || noAllowance) && (
        <Section title='Limit block'>
          <LimitCard
            credits={credits}
            title={
              noAllowance
                ? '0 imports included'
                : `0 of ${credits.limit} imports left`
            }
            body={
              noAllowance
                ? 'New imports aren’t available with the current allowance.'
                : `Your allowance refreshes ${date}.`
            }
          />
        </Section>
      )}

      <Section title='Help copy'>
        <CopyCard>
          New imports use your included allowance. The usage button always shows
          the current limit and refresh date. Re-imports are free, and
          refinements have a separate per-import limit.
        </CopyCard>
      </Section>

      <Section title='Paywall row'>
        <PaywallRow free='Included allowance' />
      </Section>

      <Section title='Refinement caption'>
        <Text style={{ color: theme.colors.textAlt }}>
          {credits.refinements.remaining ?? 'Unlimited'} refinements remaining
          on these notes
        </Text>
      </Section>
    </View>
  )
}

const VariantC = ({ credits }: { credits: MockCredits }) => {
  const theme = useTheme()
  const date = resetLabel(credits)
  const limited = credits.remaining === 0 && credits.limit !== 0
  const noAllowance = credits.limit === 0
  return (
    <View style={{ gap: 20 }}>
      <Section title='Composer meter'>
        <ComposerSample
          trigger={
            <View
              style={{
                minHeight: 42,
                minWidth: 58,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                paddingHorizontal: 8,
                borderRadius: 12,
                backgroundColor: theme.colors.accentTranslucent,
              }}
            >
              <Text
                style={{
                  color: theme.colors.accent,
                  fontFamily: theme.fonts.bold,
                }}
              >
                {credits.remaining === null ? '∞' : credits.remaining}
              </Text>
              <Text style={{ color: theme.colors.accent, fontSize: 9 }}>
                IMPORTS
              </Text>
            </View>
          }
        />
      </Section>

      <Section title='Usage popover — shown open'>
        <Card style={{ gap: 17 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accentTranslucent,
              }}
            >
              <LucideIcon
                icon={CalendarDaysIcon}
                size={19}
                color={theme.colors.accent}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {date
                  ? 'Next allowance'
                  : credits.isSupporter
                    ? 'Your allowance'
                    : 'Import allowance'}
              </Text>
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('lg'),
                }}
              >
                {date ?? (credits.isSupporter ? 'No limit' : 'Not scheduled')}
              </Text>
            </View>
          </View>
          <View
            style={{
              padding: 13,
              gap: 5,
              borderRadius: theme.numbers.borderRadiusSm,
              backgroundColor: theme.colors.background,
            }}
          >
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {allowanceLine(credits)}
            </Text>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {refinementLine(credits)}
            </Text>
          </View>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              lineHeight: 19,
            }}
          >
            Re-imports never count twice, even after a new allowance begins.
          </Text>
          {!credits.isSupporter && <SupporterCta />}
        </Card>
      </Section>

      {(limited || noAllowance) && (
        <Section title='Limit block'>
          <LimitCard
            credits={credits}
            title={
              noAllowance
                ? 'New imports aren’t available'
                : `More imports on ${date}`
            }
            body={
              noAllowance
                ? 'Previously used notes remain available.'
                : 'Your next allowance begins automatically. Previously used notes remain available now.'
            }
          />
        </Section>
      )}

      <Section title='Help copy'>
        <CopyCard>
          Your usage details show when the next allowance begins. Starting new
          notes uses an import; returning to the same notes does not.
          Refinements use their own limit for each import.
        </CopyCard>
      </Section>

      <Section title='Paywall row'>
        <PaywallRow free='Refreshes regularly' />
      </Section>

      <Section title='Refinement caption'>
        <Text style={{ color: theme.colors.textAlt }}>
          {credits.refinements.remaining ?? 'Unlimited'} more changes for this
          import
        </Text>
      </Section>
    </View>
  )
}

const PrototypeSwitcher = ({
  variant,
  setVariant,
}: {
  variant: VariantKey
  setVariant: (variant: VariantKey) => void
}) => {
  const theme = useTheme()
  const index = VARIANTS.findIndex((item) => item.key === variant)
  const cycle = (direction: -1 | 1) => {
    const next = (index + direction + VARIANTS.length) % VARIANTS.length
    setVariant(VARIANTS[next].key)
  }
  const current = VARIANTS[index]
  return (
    <View
      style={{
        position: 'absolute',
        left: 24,
        right: 24,
        bottom: 14,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 26,
        paddingHorizontal: 7,
        backgroundColor: theme.colors.text,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 5 },
      }}
    >
      <Button
        onPress={() => cycle(-1)}
        accessibilityLabel='Previous prototype variant'
        style={{
          width: 42,
          height: 42,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon
          icon={ChevronLeftIcon}
          size={20}
          color={theme.colors.background}
        />
      </Button>
      <View style={{ alignItems: 'center', gap: 1 }}>
        <Text
          style={{
            color: theme.colors.background,
            fontFamily: theme.fonts.bold,
          }}
        >
          {current.key} — {current.name}
        </Text>
        <Text
          style={{
            color: theme.colors.background,
            opacity: 0.7,
            fontSize: theme.fontSize('xs'),
          }}
        >
          PROTOTYPE
        </Text>
      </View>
      <Button
        onPress={() => cycle(1)}
        accessibilityLabel='Next prototype variant'
        style={{
          width: 42,
          height: 42,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon
          icon={ChevronRightIcon}
          size={20}
          color={theme.colors.background}
        />
      </Button>
    </View>
  )
}

const NotesImportUsageWindowPrototypeScreen = () => {
  const theme = useTheme()
  const [variant, setVariant] = useState<VariantKey>('A')
  const [state, setState] = useState<MockState>('available')
  const credits = creditsFor(state)

  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 15,
          paddingTop: 18,
          paddingBottom: 94,
          gap: 18,
        }}
      >
        <View style={{ gap: 5 }}>
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            Scribe usage-window prototype
          </Text>
          <Text style={{ color: theme.colors.textAlt, lineHeight: 20 }}>
            Compare the meter, details, limit state, help copy, paywall row, and
            refinement caption.
          </Text>
        </View>
        <StatePicker state={state} setState={setState} />
        {variant === 'A' && <VariantA credits={credits} />}
        {variant === 'B' && <VariantB credits={credits} />}
        {variant === 'C' && <VariantC credits={credits} />}
      </ScrollView>
      <PrototypeSwitcher variant={variant} setVariant={setVariant} />
    </Wrapper>
  )
}

export default NotesImportUsageWindowPrototypeScreen
