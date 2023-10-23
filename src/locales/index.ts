import { getLocales } from "expo-localization";
import { I18n } from "i18n-js";
import en from "./en";
import es from "./es";

const i18n = new I18n({
  en,
  es,
});

i18n.locale = getLocales()[0].languageCode;
i18n.enableFallback = true;
// i18n.locale = "es";

export default i18n;
