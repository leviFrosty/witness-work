import { Platform, View } from 'react-native'
import { useMemo, useState } from 'react'
import { useToastController } from '@tamagui/toast'
import * as Clipboard from 'expo-clipboard'
import { faCopy } from '@fortawesome/free-solid-svg-icons'
import Text from '../../../components/MyText'
import Card from '../../../components/Card'
import XView from '../../../components/layout/XView'
import Button from '../../../components/Button'
import IconButton from '../../../components/IconButton'
import useTheme from '../../../contexts/theme'
import i18n from '../../../lib/locales'
import Haptics from '../../../lib/haptics'
import { Theme } from '../../../types/theme'

const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
})
const MAX_HIGHLIGHT_CHARS = 80_000

type JsonToken = { text: string; color?: string }

const tokenizeJson = (src: string, theme: Theme): JsonToken[] => {
  const regex =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g
  const tokens: JsonToken[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(src)) !== null) {
    if (m.index > last) tokens.push({ text: src.slice(last, m.index) })
    const [, str, colon, keyword, number] = m
    if (str) {
      if (colon) {
        tokens.push({ text: str, color: theme.colors.accent3 })
        tokens.push({ text: colon })
      } else {
        tokens.push({ text: str, color: theme.colors.accent })
      }
    } else if (keyword) {
      tokens.push({
        text: keyword,
        color: keyword === 'null' ? theme.colors.textAlt : theme.colors.purple,
      })
    } else if (number) {
      tokens.push({ text: number, color: theme.colors.warn })
    }
    last = regex.lastIndex
  }
  if (last < src.length) tokens.push({ text: src.slice(last) })
  return tokens
}

type Props = {
  label: string
  value: unknown
  count?: number
  defaultExpanded?: boolean
}

const JsonViewer = ({
  label,
  value,
  count,
  defaultExpanded = false,
}: Props) => {
  const theme = useTheme()
  const toast = useToastController()
  const [expanded, setExpanded] = useState(defaultExpanded)

  const serialized = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2) ?? ''
    } catch {
      return String(value)
    }
  }, [value])

  // Skip syntax highlighting for very large payloads — the linear tokenizer is
  // cheap but rendering thousands of nested <Text> nodes can jank the UI.
  const tokens = useMemo(() => {
    if (!expanded) return null
    if (serialized.length > MAX_HIGHLIGHT_CHARS) return null
    return tokenizeJson(serialized, theme)
  }, [expanded, serialized, theme])

  const handleCopy = async () => {
    Haptics.success()
    await Clipboard.setStringAsync(serialized)
    toast.show(i18n.t('copied'), { message: '', native: true })
  }

  return (
    <Card style={{ gap: 10 }}>
      <XView style={{ justifyContent: 'space-between' }}>
        <XView style={{ gap: 8, flexShrink: 1 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>{label}</Text>
          {count !== undefined && (
            <View
              style={{
                backgroundColor: theme.colors.backgroundLighter,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.medium,
                }}
              >
                {count.toLocaleString()}
              </Text>
            </View>
          )}
        </XView>
        <XView style={{ gap: 12 }}>
          <IconButton
            icon={faCopy}
            onPress={handleCopy}
            color={theme.colors.textAlt}
          />
          <Button onPress={() => setExpanded(!expanded)}>
            <Text
              style={{
                fontFamily: theme.fonts.bold,
                color: theme.colors.accent,
              }}
            >
              {i18n.t(expanded ? 'hide' : 'show')}
            </Text>
          </Button>
        </XView>
      </XView>
      {expanded && (
        <View
          style={{
            backgroundColor: theme.colors.backgroundLighter,
            borderRadius: theme.numbers.borderRadiusSm,
            padding: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          {tokens ? (
            <Text
              selectable
              style={{
                fontSize: theme.fontSize('xs'),
                fontFamily: MONO,
                color: theme.colors.text,
              }}
            >
              {tokens.map((t, i) => (
                <Text key={i} style={{ color: t.color ?? theme.colors.text }}>
                  {t.text}
                </Text>
              ))}
            </Text>
          ) : (
            <Text
              selectable
              style={{
                fontSize: theme.fontSize('xs'),
                fontFamily: MONO,
                color: theme.colors.text,
              }}
            >
              {serialized}
            </Text>
          )}
        </View>
      )}
    </Card>
  )
}

export default JsonViewer
