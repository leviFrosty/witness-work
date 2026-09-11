import {
  Check as CheckIcon,
  Heart as HeartIcon,
  Minus as MinusIcon,
  Star as StarIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import { Image } from 'expo-image'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import Card from '@/components/ui/Card'

const FEATURE_ROWS: ReadonlyArray<{
  labelKey: TranslationKey
  // `true`/`false` render a check/dash; a TranslationKey renders that text
  // (e.g. the `5` vs. `Unlimited` Notes Import allowance).
  free: boolean | TranslationKey
  supporter: boolean | TranslationKey
}> = [
  // Differentiators lead; the "always free" rows close the table as a
  // trust signal rather than opening it with reasons not to pay.
  { labelKey: 'paywallFeatureSync', free: false, supporter: true },
  { labelKey: 'paywallFeatureAccent', free: false, supporter: true },
  { labelKey: 'paywallFeatureAppIcons', free: false, supporter: true },
  { labelKey: 'paywallFeatureCore', free: true, supporter: true },
  { labelKey: 'paywallFeaturePrivacy', free: true, supporter: true },
  { labelKey: 'paywallFeatureWidgets', free: true, supporter: true },
]

const resolveCell = (value: boolean | TranslationKey): boolean | string =>
  typeof value === 'boolean' ? value : i18n.t(value)

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
            color: theme.colors.supporter,
            letterSpacing: 1.2,
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
              letterSpacing: 0.3,
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
          {i18n.t('paywallSocialProofRating')}
        </Text>
      </XView>
      <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
        {i18n.t('paywallSocialProofReach')}
      </Text>
    </View>
  )
}

const FREE_COL_WIDTH = 80
const SUPPORTER_COL_WIDTH = 100
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
  const accentColor = highlight ? theme.colors.supporter : theme.colors.textAlt
  if (typeof value === 'string') {
    return (
      <View style={{ width, alignItems: 'center' }}>
        <Text
          style={{
            fontSize: 13,
            fontFamily: theme.fonts.semiBold,
            color: accentColor,
            textAlign: 'center',
          }}
        >
          {value}
        </Text>
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

export interface NotesImportPaywallAllowance {
  free: string
  supporter: string
}

export const ComparisonChart = ({
  notesImportAllowance,
  spacious = false,
}: {
  notesImportAllowance?: NotesImportPaywallAllowance
  spacious?: boolean
}) => {
  const theme = useTheme()
  const rows: Array<{
    key: string
    label: string
    free: boolean | string
    supporter: boolean | string
  }> = FEATURE_ROWS.map((row) => ({
    key: row.labelKey,
    label: i18n.t(row.labelKey),
    free: resolveCell(row.free),
    supporter: resolveCell(row.supporter),
  }))
  if (notesImportAllowance) {
    rows.splice(1, 0, {
      key: 'notes-import',
      label: i18n.t('paywallFeatureNotesImport'),
      free: notesImportAllowance.free,
      supporter: notesImportAllowance.supporter,
    })
  }
  return (
    <Card style={{ padding: 0, gap: 0, overflow: 'hidden' }}>
      <View
        style={{
          paddingHorizontal: ROW_PADDING_HORIZONTAL,
          paddingTop: 16,
          paddingBottom: 8,
        }}
      >
        <Text
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
            width: SUPPORTER_COL_WIDTH + ROW_PADDING_HORIZONTAL,
            backgroundColor: theme.colors.supporterTranslucent,
          }}
        />
        <View
          style={{
            flexDirection: 'row',
            paddingHorizontal: ROW_PADDING_HORIZONTAL,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <View style={{ flex: 1 }} />
          <View style={{ width: FREE_COL_WIDTH, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
                letterSpacing: 1,
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
                style={{
                  fontSize: 11,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.supporter,
                  letterSpacing: 1,
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
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: ROW_PADDING_HORIZONTAL,
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
