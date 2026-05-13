import { ScrollView, Share, View } from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MenuView, MenuAction } from '@react-native-menu/menu'
import * as Clipboard from 'expo-clipboard'
import moment from 'moment'
import { useCallback, useMemo, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import {
  faArrowUpFromBracket,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  G,
  Circle,
} from 'react-native-svg'

import IconButton from '@/components/IconButton'
import Text from '@/components/MyText'
import useTheme from '@/contexts/theme'
import i18n, { _i18n } from '@/lib/locales'
import Haptics from '@/lib/haptics'
import useMonthReportData from '@/features/service-reports/hooks/useMonthReportData'
import usePublisher from '@/hooks/usePublisher'
import { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'ServiceReportView'>

const PAPER_BG = '#F5ECD6'
const PAPER_BG_EDGE = '#E6D9B4'
const PAPER_BG_BACK = '#EFE4C7'
const PAPER_INK = '#1B2A4E'
const PAPER_INK_SOFT = '#2A3A60'
const PAPER_LABEL = '#7B6B49'
const PAPER_LINE = '#C9B98F'
const PAPER_SHADOW = 'rgba(50, 36, 14, 0.35)'

const PAPER_WIDTH = 320
const PAPER_HEIGHT_MIN = 480
const RAGGED_INSET = 6
const RAGGED_SEGMENTS_X = 14
const RAGGED_SEGMENTS_Y = 20

// Deterministic pseudo-random in [-1, 1] from a seed.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9999.137) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

// Build a slightly irregular rectangle path so the paper edge reads as torn.
function buildRaggedPaperPath(
  width: number,
  height: number,
  seed: number,
  jitter = 2.4
): string {
  const points: { x: number; y: number }[] = []
  const segX = RAGGED_SEGMENTS_X
  const segY = RAGGED_SEGMENTS_Y

  // Top edge, left -> right
  for (let i = 0; i <= segX; i++) {
    const t = i / segX
    points.push({
      x: width * t,
      y: pseudoRandom(seed + i * 1.3) * jitter,
    })
  }
  // Right edge, top -> bottom
  for (let i = 1; i <= segY; i++) {
    const t = i / segY
    points.push({
      x: width + pseudoRandom(seed + 100 + i * 1.7) * jitter,
      y: height * t,
    })
  }
  // Bottom edge, right -> left
  for (let i = 1; i <= segX; i++) {
    const t = i / segX
    points.push({
      x: width * (1 - t),
      y: height + pseudoRandom(seed + 200 + i * 2.1) * jitter,
    })
  }
  // Left edge, bottom -> top
  for (let i = 1; i < segY; i++) {
    const t = i / segY
    points.push({
      x: pseudoRandom(seed + 300 + i * 1.9) * jitter,
      y: height * (1 - t),
    })
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`
  }
  d += ' Z'
  return d
}

function getHandwritingFont(locale: string): string {
  const lower = locale.toLowerCase()
  if (lower.startsWith('ko')) return 'Gaegu_400Regular'
  if (lower.startsWith('ja')) return 'KleeOne_400Regular'
  if (lower.startsWith('zh')) return 'MaShanZheng_400Regular'
  return 'Kalam_400Regular'
}

function getHandwritingFontBold(locale: string): string {
  const lower = locale.toLowerCase()
  if (lower.startsWith('ko')) return 'Gaegu_700Bold'
  if (lower.startsWith('ja')) return 'KleeOne_600SemiBold'
  if (lower.startsWith('zh')) return 'MaShanZheng_400Regular'
  return 'Kalam_700Bold'
}

const ServiceReportViewScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { month, year } = route.params
  const data = useMonthReportData(month, year)
  const { name, hasName } = usePublisher()

  const monthYearLabel = useMemo(
    () => moment().month(month).year(year).format('MMMM YYYY'),
    [month, year]
  )

  const handwritingFont = useMemo(() => getHandwritingFont(_i18n.locale), [])
  const handwritingFontBold = useMemo(
    () => getHandwritingFontBold(_i18n.locale),
    []
  )

  const [paperHeight, setPaperHeight] = useState(PAPER_HEIGHT_MIN)
  const handlePaperLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const measured = Math.ceil(e.nativeEvent.layout.height)
      const next = Math.max(measured, PAPER_HEIGHT_MIN)
      if (Math.abs(next - paperHeight) > 2) setPaperHeight(next)
    },
    [paperHeight]
  )

  const shareActions: MenuAction[] = useMemo(
    () => [
      {
        id: 'copy',
        title: i18n.t('copyToClipboard'),
        image: 'doc.on.doc',
        imageColor: theme.colors.text,
      },
      {
        id: 'share',
        title: i18n.t('share'),
        image: 'square.and.arrow.up',
        imageColor: theme.colors.text,
      },
    ],
    [theme.colors.text]
  )

  const handleShareAction = useCallback(
    async (action: string) => {
      const message = data.reportAsString()
      if (action === 'copy') {
        Haptics.success()
        await Clipboard.setStringAsync(message)
      } else if (action === 'share') {
        await Share.share({ message })
      }
    },
    [data]
  )

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 20,
        paddingHorizontal: 10,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 6,
        }}
      >
        <IconButton
          icon={faTimes}
          size={18}
          onPress={() => navigation.goBack()}
        />
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
            color: theme.colors.text,
          }}
        >
          {i18n.t('fieldServiceReport')}
        </Text>
        <MenuView
          actions={shareActions}
          onPressAction={({ nativeEvent }) =>
            handleShareAction(nativeEvent.event)
          }
        >
          <IconButton icon={faArrowUpFromBracket} size={15} />
        </MenuView>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: 28,
          paddingBottom: insets.bottom + 64,
          paddingHorizontal: 16,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: PAPER_WIDTH + 40,
            minHeight: paperHeight + 40,
            alignItems: 'center',
          }}
        >
          {/* Sheet behind the main one */}
          <BackPaperSheet height={paperHeight} />
          {/* Main sheet */}
          <PaperSheet
            handwritingFont={handwritingFont}
            handwritingFontBold={handwritingFontBold}
            monthYearLabel={monthYearLabel}
            name={hasName ? name : null}
            sharedInMinistry={data.sharedInMinistry}
            studies={data.studies ?? 0}
            hours={data.hours}
            credit={data.credit}
            showHours={data.showHours}
            showCredit={data.showCredit}
            notes={data.notes}
            height={paperHeight}
            onLayoutContent={handlePaperLayout}
          />
        </View>
      </ScrollView>
    </View>
  )
}

const BackPaperSheet = ({ height }: { height: number }) => {
  const path = useMemo(
    () => buildRaggedPaperPath(PAPER_WIDTH, height, 31, 2.6),
    [height]
  )
  return (
    <View
      style={{
        position: 'absolute',
        top: 8,
        left: 16,
        transform: [{ rotate: '-1.2deg' }],
        shadowColor: PAPER_SHADOW,
        shadowOpacity: 0.5,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      <Svg width={PAPER_WIDTH} height={height}>
        <Defs>
          <LinearGradient id='backFill' x1='0' y1='0' x2='1' y2='1'>
            <Stop offset='0' stopColor={PAPER_BG_BACK} />
            <Stop offset='1' stopColor={PAPER_BG_EDGE} />
          </LinearGradient>
        </Defs>
        <Path
          d={path}
          fill='url(#backFill)'
          stroke={PAPER_BG_EDGE}
          strokeWidth={0.5}
        />
      </Svg>
    </View>
  )
}

type PaperSheetProps = {
  handwritingFont: string
  handwritingFontBold: string
  monthYearLabel: string
  name: string | null
  sharedInMinistry: boolean
  studies: number
  hours: number
  credit: number
  showHours: boolean
  showCredit: boolean
  notes: string
  height: number
  onLayoutContent: (e: LayoutChangeEvent) => void
}

const PaperSheet = ({
  handwritingFont,
  handwritingFontBold,
  monthYearLabel,
  name,
  sharedInMinistry,
  studies,
  hours,
  credit,
  showHours,
  showCredit,
  notes,
  height,
  onLayoutContent,
}: PaperSheetProps) => {
  const path = useMemo(
    () => buildRaggedPaperPath(PAPER_WIDTH, height, 7, 2.2),
    [height]
  )

  const fibers = useMemo(() => {
    const fiberCount = Math.round(60 * (height / PAPER_HEIGHT_MIN))
    const arr: { cx: number; cy: number; r: number; o: number }[] = []
    for (let i = 0; i < fiberCount; i++) {
      arr.push({
        cx: ((pseudoRandom(i + 1) + 1) / 2) * PAPER_WIDTH,
        cy: ((pseudoRandom(i + 200) + 1) / 2) * height,
        r: 0.6 + ((pseudoRandom(i + 400) + 1) / 2) * 0.8,
        o: 0.04 + ((pseudoRandom(i + 600) + 1) / 2) * 0.06,
      })
    }
    return arr
  }, [height])

  return (
    <View
      style={{
        width: PAPER_WIDTH,
        transform: [{ rotate: '0.6deg' }],
        shadowColor: PAPER_SHADOW,
        shadowOpacity: 0.5,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 12 },
      }}
    >
      <View>
        <Svg
          width={PAPER_WIDTH}
          height={height}
          style={{ position: 'absolute' }}
        >
          <Defs>
            <LinearGradient id='paperFill' x1='0' y1='0' x2='1' y2='1'>
              <Stop offset='0' stopColor='#F8F0DA' />
              <Stop offset='0.5' stopColor={PAPER_BG} />
              <Stop offset='1' stopColor={PAPER_BG_EDGE} />
            </LinearGradient>
            <LinearGradient id='foldShade' x1='0' y1='0' x2='0.7' y2='1'>
              <Stop offset='0' stopColor='#000' stopOpacity='0' />
              <Stop offset='0.55' stopColor='#000' stopOpacity='0.04' />
              <Stop offset='0.6' stopColor='#000' stopOpacity='0' />
            </LinearGradient>
          </Defs>

          <Path
            d={path}
            fill='url(#paperFill)'
            stroke={PAPER_BG_EDGE}
            strokeWidth={0.5}
          />

          {/* Subtle paper fibers */}
          <G>
            {fibers.map((f, i) => (
              <Circle
                key={i}
                cx={f.cx}
                cy={f.cy}
                r={f.r}
                fill='#7A6A45'
                opacity={f.o}
              />
            ))}
          </G>

          {/* Soft fold shading */}
          <Rect
            x={0}
            y={0}
            width={PAPER_WIDTH}
            height={height}
            fill='url(#foldShade)'
          />

          {/* Inner shadow tint at edges */}
          <Path
            d={path}
            fill='none'
            stroke='rgba(110, 84, 38, 0.18)'
            strokeWidth={2}
          />
        </Svg>

        <View
          onLayout={onLayoutContent}
          style={{
            paddingHorizontal: RAGGED_INSET + 26,
            paddingTop: RAGGED_INSET + 22,
            paddingBottom: RAGGED_INSET + 22,
            minHeight: PAPER_HEIGHT_MIN,
          }}
        >
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            <Text
              style={{
                fontFamily: handwritingFontBold,
                fontSize: 28,
                color: PAPER_INK,
                lineHeight: 40,
                includeFontPadding: false,
              }}
            >
              {monthYearLabel}
            </Text>
            <View
              style={{
                height: 1,
                backgroundColor: PAPER_LINE,
                width: '70%',
                marginTop: 4,
                opacity: 0.6,
              }}
            />
            {name ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{
                  fontFamily: handwritingFont,
                  fontSize: 18,
                  color: PAPER_INK_SOFT,
                  marginTop: 6,
                  maxWidth: '100%',
                  transform: [{ rotate: '-0.6deg' }],
                }}
              >
                {name}
              </Text>
            ) : null}
          </View>

          <PaperRow label={i18n.t('sharedInMinistry')}>
            <HandDrawnCheck checked={sharedInMinistry} />
          </PaperRow>

          <PaperRow label={i18n.t('bibleStudiesConducted')}>
            <HandwrittenValue
              value={studies}
              fontFamily={handwritingFontBold}
              seed={11}
            />
          </PaperRow>

          {showHours && (
            <PaperRow label={i18n.t('hours')}>
              <HandwrittenValue
                value={hours}
                fontFamily={handwritingFontBold}
                seed={23}
              />
            </PaperRow>
          )}

          {showCredit && (
            <PaperRow label={i18n.t('credit')}>
              <HandwrittenValue
                value={credit}
                fontFamily={handwritingFontBold}
                seed={37}
              />
            </PaperRow>
          )}

          <PaperRow label={i18n.t('comments')} extraGap>
            <HandwrittenNote text={notes} fontFamily={handwritingFont} />
          </PaperRow>
        </View>
      </View>
    </View>
  )
}

const PaperRow = ({
  label,
  children,
  extraGap,
}: {
  label: string
  children: React.ReactNode
  extraGap?: boolean
}) => {
  const theme = useTheme()
  return (
    <View style={{ marginTop: extraGap ? 16 : 14 }}>
      <Text
        style={{
          color: PAPER_LABEL,
          fontFamily: theme.fonts.semiBold,
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: PAPER_LINE,
          opacity: 0.55,
          marginTop: 3,
        }}
      />
    </View>
  )
}

const HandwrittenValue = ({
  value,
  fontFamily,
  seed,
}: {
  value: number | string
  fontFamily: string
  seed: number
}) => {
  const chars = String(value).split('')
  return (
    <View
      style={{
        flexDirection: 'row',
        minHeight: 48,
        paddingTop: 4,
        alignItems: 'flex-end',
      }}
    >
      {chars.map((ch, i) => {
        const rot = pseudoRandom(seed + i * 3.7) * 1.6
        const dy = pseudoRandom(seed + 50 + i * 2.3) * 1.6
        const inkVariation = Math.floor(pseudoRandom(seed + 90 + i) * 12)
        const inkColor = inkVariation < 0 ? PAPER_INK : PAPER_INK_SOFT
        return (
          <Text
            key={i}
            style={{
              fontFamily,
              fontSize: 30,
              color: inkColor,
              transform: [
                { rotate: `${rot.toFixed(2)}deg` },
                { translateY: dy },
              ],
              marginRight: 1,
              lineHeight: 42,
              includeFontPadding: false,
            }}
          >
            {ch}
          </Text>
        )
      })}
    </View>
  )
}

const HandwrittenNote = ({
  text,
  fontFamily,
}: {
  text: string
  fontFamily: string
}) => {
  if (!text) {
    return <View style={{ minHeight: 48 }} />
  }
  return (
    <Text
      style={{
        fontFamily,
        fontSize: 15,
        color: PAPER_INK_SOFT,
        lineHeight: 21,
        transform: [{ rotate: '-0.4deg' }],
      }}
    >
      {text}
    </Text>
  )
}

const HandDrawnCheck = ({ checked }: { checked: boolean }) => {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <Svg width={44} height={44} viewBox='0 0 44 44'>
        {/* Hand-drawn box outline */}
        <Path
          d='M 4 6 Q 3 18, 4.5 30 Q 4 36, 6 38 Q 18 38.5, 32 38 Q 34 38, 34 36 Q 34.5 22, 33.5 8 Q 34 5, 32 5 Q 18 4.5, 6 5 Q 4 5, 4 6 Z'
          fill='none'
          stroke={PAPER_INK}
          strokeWidth={1.6}
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        {checked && (
          <Path
            d='M 9 22 Q 13 27, 17 31 Q 24 19, 36 6'
            fill='none'
            stroke={PAPER_INK}
            strokeWidth={2.6}
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        )}
      </Svg>
    </View>
  )
}

export default ServiceReportViewScreen
