import { getLocales } from "expo-localization";
import { I18n } from "i18n-js";
import en from "../locales/en.json";
import es from "../locales/es.json";
import ar from "../locales/ar.json";
import de from "../locales/de.json";
import fr from "../locales/fr.json";
import it from "../locales/it.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import pt from "../locales/pt.json";
import ru from "../locales/ru.json";
import vi from "../locales/vi.json";
import zh_CN from "../locales/zh_CN.json";
import moment from "moment";
import "moment/locale/es";

const i18n = new I18n({
  ar,
  de,
  fr,
  it,
  ja,
  ko,
  pt,
  ru,
  vi,
  zh_CN,
  en,
  es,
});

const locale = getLocales()[0].languageCode;

i18n.locale = locale;
i18n.enableFallback = true;
moment.locale(locale);

export default i18n;
