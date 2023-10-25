import { getLocales } from "expo-localization";
import { I18n } from "i18n-js";
import en from "./en";
import es from "./es";
import moment from "moment";
import "moment/locale/es";

const i18n = new I18n({
  en,
  es,
});

const locale = "es" ?? getLocales()[0].languageCode;

i18n.locale = locale;
i18n.enableFallback = true;
moment.locale(locale);

export default i18n;
