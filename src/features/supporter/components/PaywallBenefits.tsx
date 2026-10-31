import {
  Check as CheckIcon,
  Heart as HeartIcon,
  Minus as MinusIcon,
  Star as StarIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Platform, View } from 'react-native'
import { Image } from 'expo-image'
import Text from '@/components/ui/MyText'
import { FIT_ONE_LINE } from '@/hooks/useAccessibilityTextSize'
import WholeWordsText from '@/components/ui/WholeWordsText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import XView from '@/components/ui/layout/XView'
import Card from '@/components/ui/Card'
import { useAppStoreRatings } from '@/features/supporter/hooks/useAppStoreRatings'
import { tracking } from '@/lib/tracking'

const FEATURE_ROWS: ReadonlyArray<{
  labelKey: TranslationKey
  /** Android's wording, where it differs. */
  androidLabelKey?: TranslationKey
  iosOnly?: boolean
  // `true`/`false` render a check/dash; a TranslationKey renders that text.
  free: boolean | TranslationKey
  supporter: boolean | TranslationKey
}> = [
  // Differentiators lead; the "always free" rows close the table as a
  // trust signal rather than opening it with reasons not to pay.
  { labelKey: 'paywallFeatureRoutePlanning', free: false, supporter: true },
  { labelKey: 'paywallFeatureAccent', free: false, supporter: true },
  {
    labelKey: 'paywallFeatureAppIcons',
    free: false,
    supporter: true,
    iosOnly: true,
  },
  { labelKey: 'paywallFeatureCore', free: true, supporter: true },
  { labelKey: 'paywallFeaturePrivacy', free: true, supporter: true },
  {
    labelKey: 'paywallFeatureWidgets',
    free: true,
    supporter: true,
    iosOnly: true,
  },
]

const resolveCell = (value: boolean | TranslationKey): boolean | string =>
  typeof value === 'boolean' ? value : i18n.t(value)

/** A cell as words: the check and dash are only drawn. */
const spokenCell = (value: boolean | string) =>
  typeof value === 'string'
    ? value
    : i18n.t(value ? 'paywallCompareIncluded' : 'paywallCompareNotIncluded')

export const FounderLetter = ({ spacious = false }: { spacious?: boolean }) => {
  const theme = useTheme()
  return (
    <Card style={{ padding: 18, gap: 0 }}>
      <XView style={{ alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: theme.colors.supporterTranslucent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon
            icon={HeartIcon}
            size={10}
            color={theme.colors.supporter}
            fill={theme.colors.supporter}
          />
        </View>
        <Text
          style={{
            fontSize: 11,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.supporterText,
            letterSpacing: tracking(1.2),
            textTransform: 'uppercase',
          }}
        >
          {i18n.t('paywallLetterEyebrow')}
        </Text>
      </XView>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <View
          style={{
            padding: 3,
            borderRadius: 44,
            backgroundColor: theme.colors.supporterTranslucent,
          }}
        >
          <Image
            source={require('@/assets/levi-portrait.png')}
            style={{ width: 80, height: 80, borderRadius: 40 }}
            contentFit='cover'
            cachePolicy='memory-disk'
            transition={150}
          />
        </View>
        <Text
          style={{
            flex: 1,
            fontSize: spacious ? theme.fontSize('md') : 14,
            color: theme.colors.text,
            lineHeight: spacious ? 24 : 22,
          }}
        >
          {i18n.t('paywallLetterBody')}
        </Text>
      </View>
      <View style={{ marginTop: 12, alignItems: 'flex-start', gap: 2 }}>
        {/* TODO: replace src/assets/signature.png with actual signature art. */}
        <Image
          source={require('@/assets/signature.png')}
          style={{ width: 140, height: 48 }}
          contentFit='contain'
          cachePolicy='memory-disk'
          tintColor={theme.colors.text}
        />
        <XView style={{ alignItems: 'center', gap: 6 }}>
          <Text
            style={{
              fontSize: 13,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
              letterSpacing: tracking(0.3),
            }}
          >
            {i18n.t('founderNoteSignOff')}
          </Text>
          <LucideIcon
            icon={HeartIcon}
            size={11}
            color={theme.colors.supporter}
            fill={theme.colors.supporter}
          />
        </XView>
      </View>
    </Card>
  )
}

export const SocialProofRow = () => {
  const theme = useTheme()
  const { averageRating, ratingCount, countryCount } = useAppStoreRatings()
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <XView style={{ alignItems: 'center', gap: 5 }}>
        <LucideIcon
          icon={StarIcon}
          size={13}
          color={theme.colors.supporter}
          fill={theme.colors.supporter}
        />
        <Text
          style={{
            fontSize: 13,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('paywallSocialProofRatingAverage', {
            rating: formatNumber(averageRating, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            ratings: formatNumber(ratingCount),
          })}
        </Text>
      </XView>
      <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
        {i18n.t('paywallSocialProofCountries', {
          countries: formatNumber(countryCount),
        })}
      </Text>
    </View>
  )
}

const FREE_COL_WIDTH = 80
// The Supporter column runs flush to the card's right edge, so its tint and
// its centered cells share one width.
const SUPPORTER_COL_WIDTH = 110
const ROW_PADDING_HORIZONTAL = 18

const CompareCell = ({
  value,
  width,
  highlight,
}: {
  value: boolean | string
  width: number
  highlight?: boolean
}) => {
  const theme = useTheme()
  const accentColor = highlight
    ? theme.colors.supporterText
    : theme.colors.textAlt
  if (typeof value === 'string') {
    return (
      <View style={{ width, alignItems: 'center' }}>
        {/* The column has a fixed width, so at large text sizes (iPad at AX3)
        a word wider than it shrinks instead of breaking ("Unlimit / ed"). */}
        <WholeWordsText
          style={{
            fontSize: 13,
            fontFamily: theme.fonts.semiBold,
            color: accentColor,
            textAlign: 'center',
          }}
        >
          {value}
        </WholeWordsText>
      </View>
    )
  }
  return (
    <View style={{ width, alignItems: 'center' }}>
      <LucideIcon
        icon={value ? CheckIcon : MinusIcon}
        size={13}
        color={value ? accentColor : theme.colors.textAlt}
      />
    </View>
  )
}

export const ComparisonChart = ({
  scribeAi = false,
  spacious = false,
}: {
  /** Adds Scribe AI's row: limited free, generous for Supporters. */
  scribeAi?: boolean
  spacious?: boolean
}) => {
  const theme = useTheme()
  const rows: Array<{
    key: string
    label: string
    free: boolean | string
    supporter: boolean | string
  }> = FEATURE_ROWS.filter((row) => !row.iosOnly || Platform.OS === 'ios').map(
    (row) => ({
      key: row.labelKey,
      label: i18n.t(
        Platform.OS === 'android' && row.androidLabelKey
          ? row.androidLabelKey
          : row.labelKey
      ),
      free: resolveCell(row.free),
      supporter: resolveCell(row.supporter),
    })
  )
  if (scribeAi) {
    rows.splice(1, 0, {
      key: 'scribe-ai',
      label: i18n.t('paywallFeatureScribeAi'),
      // Never "unlimited": Supporters get generous limits.
      free: i18n.t('paywallScribeAiFree'),
      supporter: i18n.t('paywallScribeAiSupporter'),
    })
  }
  return (
    <Card
      style={{
        paddingHorizontal: 0,
        paddingVertical: 0,
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          paddingHorizontal: ROW_PADDING_HORIZONTAL,
          paddingTop: 16,
          paddingBottom: 8,
        }}
      >
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize(spacious ? 'lg' : 'md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('paywallCompareTitle')}
        </Text>
      </View>
      <View>
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: SUPPORTER_COL_WIDTH,
            backgroundColor: theme.colors.supporterTranslucent,
          }}
        />
        {/* Each row names both columns, so the headings aren't read alone. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility='no-hide-descendants'
          style={{
            flexDirection: 'row',
            paddingLeft: ROW_PADDING_HORIZONTAL,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <View style={{ flex: 1 }} />
          <View style={{ width: FREE_COL_WIDTH, alignItems: 'center' }}>
            {/* Column headings shrink to fit their fixed-width column at large
            text sizes instead of breaking mid-word ("SUPPORTE / R"). */}
            <Text
              {...FIT_ONE_LINE}
              style={{
                fontSize: 11,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                letterSpacing: tracking(1),
                textTransform: 'uppercase',
              }}
            >
              {i18n.t('paywallColFree')}
            </Text>
          </View>
          <View
            style={{
              width: SUPPORTER_COL_WIDTH,
              alignItems: 'center',
            }}
          >
            <View>
              <Text
                {...FIT_ONE_LINE}
                style={{
                  fontSize: 11,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.supporterText,
                  letterSpacing: tracking(1),
                  textTransform: 'uppercase',
                }}
              >
                {i18n.t('paywallColSupporter')}
              </Text>
            </View>
          </View>
        </View>
        {rows.map((row, index) => (
          <View
            key={row.key}
            // One item per feature that says who gets it; the check and dash
            // cells are drawn, so they read as nothing on their own.
            accessible
            accessibilityLabel={i18n.t('paywallCompareRowA11y', {
              feature: row.label,
              free: spokenCell(row.free),
              supporter: spokenCell(row.supporter),
            })}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: ROW_PADDING_HORIZONTAL,
              paddingVertical: 12,
              borderBottomWidth: index === rows.length - 1 ? 0 : 1,
              borderBottomColor: theme.colors.border,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: spacious ? theme.fontSize('md') : 14,
                paddingRight: 8,
                color: theme.colors.text,
              }}
            >
              {row.label}
            </Text>
            <CompareCell value={row.free} width={FREE_COL_WIDTH} />
            <CompareCell
              value={row.supporter}
              width={SUPPORTER_COL_WIDTH}
              highlight
            />
          </View>
        ))}
      </View>
    </Card>
  )
}
