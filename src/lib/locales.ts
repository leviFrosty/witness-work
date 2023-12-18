import { getLocales } from 'expo-localization'
import { I18n } from 'i18n-js'
import de from '../locales/de.json'
import es from '../locales/es.json'
import en from '../locales/en.json'
import fr from '../locales/fr.json'
import it from '../locales/it.json'
import ja from '../locales/ja.json'
import ko from '../locales/ko.json'
import nl from '../locales/nl.json'
import ru from '../locales/ru.json'
import pt from '../locales/pt.json'
import vi from '../locales/vi.json'
import zh from '../locales/zh.json'
import moment from 'moment'
import 'moment/locale/de-at'
import 'moment/locale/de-ch'
import 'moment/locale/de'
import 'moment/locale/fr-ca'
import 'moment/locale/fr-ch'
import 'moment/locale/fr'
import 'moment/locale/it'
import 'moment/locale/it-ch'
import 'moment/locale/ja'
import 'moment/locale/ko'
import 'moment/locale/pt'
import 'moment/locale/pt-br'
import 'moment/locale/ru'
import 'moment/locale/vi'
import 'moment/locale/nl-be'
import 'moment/locale/nl'
import 'moment/locale/es'
import 'moment/locale/es-do'
import 'moment/locale/es-mx'
import 'moment/locale/es-us'
import 'moment/locale/es'
import 'moment/locale/zh-cn'
import 'moment/locale/zh-hk'
import 'moment/locale/zh-tw'
import 'moment/locale/zh-mo'

const i18n = new I18n({
  de,
  en,
  es,
  fr,
  it,
  ja,
  ko,
  nl,
  pt,
  ru,
  vi,
  zh,
})

const locale = getLocales()[0].languageCode

i18n.locale = locale
i18n.enableFallback = true
moment.locale(locale)

export default i18n
