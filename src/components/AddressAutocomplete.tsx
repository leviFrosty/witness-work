import React, { useState, useEffect, useCallback, useRef } from 'react'
import { View, TouchableOpacity, TextInput } from 'react-native'
import axios from 'axios'
import apis from '../constants/apis'
import Text from './MyText'
import useTheme from '../contexts/theme'
import { Address } from '../types/contact'
import i18n from '../lib/locales'
import { FlashList } from '@shopify/flash-list'
import TextInputRow from './inputs/TextInputRow'
import useLocation from '../hooks/useLocation'
import Section from './inputs/Section'

interface AddressAutocompleteProps {
  onSelect: (address: Address) => void
  initialValue?: string
}

interface Suggestion {
  title: string
  highlightedTitle: React.ReactNode
  address: Address
}

const SEARCH_RADIUS = 1000000
const DEBOUNCE_TIMEOUT = 200
const MAX_SUGGESTIONS = 5

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  onSelect,
}) => {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [error, setError] = useState(false)
  const textInputRef = useRef<TextInput>(null)
  const { location } = useLocation()
  const theme = useTheme()

  const getHighlightedText = useCallback(
    (
      text: string,
      highlights: { start: number; end: number }[]
    ): React.ReactNode => {
      if (!highlights || highlights.length === 0) {
        return <Text>{text}</Text>
      }

      const result: React.ReactNode[] = []
      let lastIndex = 0

      highlights.forEach((highlight, index) => {
        if (highlight.start > lastIndex) {
          result.push(
            <Text
              key={`normal-${index}`}
              style={{ color: theme.colors.textAlt }}
            >
              {text.slice(lastIndex, highlight.start)}
            </Text>
          )
        }

        result.push(
          <Text key={`highlight-${index}`} style={{ fontWeight: 'bold' }}>
            {text.slice(highlight.start, highlight.end)}
          </Text>
        )
        lastIndex = highlight.end
      })

      if (lastIndex < text.length) {
        result.push(
          <Text key='normal-end' style={{ color: theme.colors.textAlt }}>
            {text.slice(lastIndex)}
          </Text>
        )
      }

      return <React.Fragment>{result}</React.Fragment>
    },
    [theme.colors.textAlt]
  )

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.length < 3) {
        setSuggestions([])
        return
      }

      try {
        const hereApiKey = process.env.HERE_API_KEY
        const autocompleteUrl = `${apis.hereAutocomplete}?apiKey=${hereApiKey}&q=${encodeURIComponent(query)}&limit=${MAX_SUGGESTIONS}${location ? `&in=circle:${location.coords.latitude},${location.coords.longitude};r=${SEARCH_RADIUS}` : ''}`
        const response = await axios.get(autocompleteUrl)

        if (response.status !== 200) {
          throw new Error('Error fetching address suggestions')
        }

        const results = response.data.items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => {
            const address: Address = {
              line1: item.address.houseNumber
                ? `${item.address.houseNumber} ${item.address.street}`
                : item.address.street,
              city: item.address.city,
              state: item.address.state,
              zip: item.address.postalCode,
              country: item.address.countryName,
            }

            return {
              title: item.address.label,
              highlightedTitle: getHighlightedText(
                item.address.label,
                item.highlights.address.label
              ),
              address,
            }
          })
        setSuggestions(results)
      } catch (error) {
        setError(true)
        setSuggestions([])
      }
    }

    const debounce = setTimeout(fetchSuggestions, DEBOUNCE_TIMEOUT)
    return () => clearTimeout(debounce)
  }, [getHighlightedText, location, query])

  return (
    <Section>
      <TextInputRow
        ref={textInputRef}
        label={i18n.t('search')}
        textInputProps={{
          onChangeText: setQuery,
          placeholder: i18n.t('enterAddress'),
        }}
        style={{ marginTop: 8 }}
        lastInSection
      />
      {error ? (
        <Text
          style={{
            color: theme.colors.error,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('errorFetchingAddress')}
        </Text>
      ) : (
        <View style={{ minHeight: 2 }}>
          <FlashList
            data={suggestions}
            keyExtractor={(_, index) => index.toString()}
            estimatedItemSize={100}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  onSelect(item.address)
                  textInputRef.current?.blur()
                  setSuggestions([])
                }}
                style={{
                  padding: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <Text>{item.highlightedTitle}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </Section>
  )
}

export default AddressAutocomplete
