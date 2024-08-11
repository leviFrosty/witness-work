import { useEffect, useMemo, useState } from 'react'
import useTheme from '../contexts/theme'
import useContacts from '../stores/contactsStore'
import useConversations from '../stores/conversationStore'
import { getStudiesForGivenMonth } from '../lib/contacts'
import i18n from '../lib/locales'
import { View } from 'react-native'
import Text from './MyText'

export default function StudiesCard() {
  const theme = useTheme()
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const studies = useMemo(
    () =>
      getStudiesForGivenMonth({ contacts, conversations, month: new Date() }),
    [contacts, conversations]
  )
  const encouragementStudiesPhrase = (studies: number) => {
    let phrases: string[] = []

    if (studies === 0) {
      phrases = [
        i18n.t('phrasesStudiesNone.keepGoing'),
        i18n.t('phrasesStudiesNone.stayStrong'),
        i18n.t('phrasesStudiesNone.stayPositive'),
        i18n.t('phrasesStudiesNone.grindOn'),
        i18n.t('phrasesStudiesNone.keepSearching'),
        i18n.t('phrasesStudiesNone.stayResilient'),
      ]
    }
    if (studies > 0 && studies <= 15) {
      phrases = [
        i18n.t('phrasesStudiesDone.bravo'),
        i18n.t('phrasesStudiesDone.wellDone'),
        i18n.t('phrasesStudiesDone.amazingJob'),
        i18n.t('phrasesStudiesDone.wayToGo'),
        i18n.t('phrasesStudiesDone.victoryLap'),
        i18n.t('phrasesStudiesDone.fantastic'),
        i18n.t('phrasesStudiesDone.wow'),
      ]
    }
    if (studies > 15) {
      phrases = ['🤩🤯🎉']
    }

    const random = Math.floor(Math.random() * phrases.length)
    return phrases[random]
  }
  const [encouragementPhrase, setEncouragementPhrase] = useState(
    encouragementStudiesPhrase(studies)
  )

  useEffect(() => {
    setEncouragementPhrase(encouragementStudiesPhrase(studies))
  }, [studies])
  return (
    <View
      style={{
        flexDirection: 'column',
        paddingHorizontal: 6,
        paddingVertical: 10,
        backgroundColor: theme.colors.backgroundLighter,
        borderRadius: theme.numbers.borderRadiusLg,
        flexGrow: 1,
      }}
    >
      <View
        style={{
          gap: 10,
          justifyContent: 'center',
          alignItems: 'center',
          flexGrow: 1,
        }}
      >
        <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
          {studies}
        </Text>
        <Text
          style={{
            fontFamily: theme.fonts.bold,
            maxWidth: 125,
          }}
        >
          {encouragementPhrase}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 8,
          color: theme.colors.textAlt,
          textAlign: 'center',
        }}
      >
        {i18n.t('basedOnContacts')}
      </Text>
    </View>
  )
}
