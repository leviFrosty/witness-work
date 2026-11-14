type ContactLinkMessages = {
  title: string
  description: string
  instructions: string
  getApp: string
  openApp: string
  continueOnWeb: string
  imageAlt: string
}

// Keep these locale keys in sync with witness-work/src/lib/locales.ts.
export const contactLinkTranslations = {
  'en-us': {
    title: 'Open this contact in WitnessWork',
    description: 'A contact was shared with you from WitnessWork — the service time and contact management app for Jehovah’s Witnesses.',
    instructions: 'Install WitnessWork to import the shared contact. If you already have the app, it should have opened automatically.',
    getApp: 'Get WitnessWork',
    openApp: 'Open app (already installed)',
    continueOnWeb: 'Continue on the web',
    imageAlt: 'WitnessWork app icon',
  },
  'de-de': {
    title: 'Diesen Kontakt in WitnessWork öffnen',
    description: 'Ein Kontakt wurde über WitnessWork mit dir geteilt — die App für Jehovas Zeugen zur Verwaltung von Predigtdienstzeit und Kontakten.',
    instructions: 'Installiere WitnessWork, um den geteilten Kontakt zu importieren. Wenn du die App bereits hast, sollte sie sich automatisch geöffnet haben.',
    getApp: 'WitnessWork herunterladen',
    openApp: 'App öffnen (bereits installiert)',
    continueOnWeb: 'Im Web fortfahren',
    imageAlt: 'WitnessWork-App-Symbol',
  },
  'es-es': {
    title: 'Abre este contacto en WitnessWork',
    description: 'Han compartido un contacto contigo desde WitnessWork — la aplicación de gestión del tiempo de predicación y de contactos para los testigos de Jehová.',
    instructions: 'Instala WitnessWork para importar el contacto compartido. Si ya tienes la aplicación, debería haberse abierto automáticamente.',
    getApp: 'Descargar WitnessWork',
    openApp: 'Abrir la aplicación (ya instalada)',
    continueOnWeb: 'Continuar en la web',
    imageAlt: 'Icono de la aplicación WitnessWork',
  },
  'fr-fr': {
    title: 'Ouvrir ce contact dans WitnessWork',
    description: 'Un contact a été partagé avec vous depuis WitnessWork — l’application de gestion du temps de prédication et des contacts pour les Témoins de Jéhovah.',
    instructions: 'Installez WitnessWork pour importer le contact partagé. Si vous avez déjà l’application, elle devrait s’être ouverte automatiquement.',
    getApp: 'Télécharger WitnessWork',
    openApp: 'Ouvrir l’application (déjà installée)',
    continueOnWeb: 'Continuer sur le web',
    imageAlt: 'Icône de l’application WitnessWork',
  },
  'it-it': {
    title: 'Apri questo contatto in WitnessWork',
    description: 'È stato condiviso con te un contatto da WitnessWork — l’app per gestire il tempo dedicato al ministero e i contatti dei Testimoni di Geova.',
    instructions: 'Installa WitnessWork per importare il contatto condiviso. Se hai già l’app, dovrebbe essersi aperta automaticamente.',
    getApp: 'Scarica WitnessWork',
    openApp: 'Apri l’app (già installata)',
    continueOnWeb: 'Continua sul web',
    imageAlt: 'Icona dell’app WitnessWork',
  },
  'ja-jp': {
    title: 'この連絡先をWitnessWorkで開く',
    description: 'WitnessWorkから連絡先が共有されました。WitnessWorkはエホバの証人のための奉仕時間と連絡先を管理するアプリです。',
    instructions: '共有された連絡先をインポートするには、WitnessWorkをインストールしてください。すでにインストールされている場合は、自動的に開きます。',
    getApp: 'WitnessWorkをダウンロード',
    openApp: 'アプリを開く（インストール済み）',
    continueOnWeb: 'Webで続ける',
    imageAlt: 'WitnessWorkのアプリアイコン',
  },
  'ko-kr': {
    title: 'WitnessWork에서 이 연락처 열기',
    description: 'WitnessWork에서 연락처가 공유되었습니다. WitnessWork는 여호와의 증인을 위한 봉사 시간 및 연락처 관리 앱입니다.',
    instructions: '공유된 연락처를 가져오려면 WitnessWork를 설치하세요. 이미 앱이 설치되어 있다면 자동으로 열렸을 것입니다.',
    getApp: 'WitnessWork 다운로드',
    openApp: '앱 열기 (이미 설치됨)',
    continueOnWeb: '웹에서 계속하기',
    imageAlt: 'WitnessWork 앱 아이콘',
  },
  'nl-nl': {
    title: 'Open dit contact in WitnessWork',
    description: 'Er is een contact met je gedeeld via WitnessWork — de app voor Jehovah’s Getuigen om velddiensttijd en contacten te beheren.',
    instructions: 'Installeer WitnessWork om het gedeelde contact te importeren. Als je de app al hebt, zou deze automatisch geopend moeten zijn.',
    getApp: 'Download WitnessWork',
    openApp: 'Open de app (al geïnstalleerd)',
    continueOnWeb: 'Doorgaan op het web',
    imageAlt: 'WitnessWork-appicoon',
  },
  'pt-br': {
    title: 'Abra este contato no WitnessWork',
    description: 'Um contato foi compartilhado com você pelo WitnessWork — o aplicativo de gestão do tempo de pregação e de contatos para as Testemunhas de Jeová.',
    instructions: 'Instale o WitnessWork para importar o contato compartilhado. Se você já tem o aplicativo, ele deveria ter aberto automaticamente.',
    getApp: 'Baixar WitnessWork',
    openApp: 'Abrir aplicativo (já instalado)',
    continueOnWeb: 'Continuar na web',
    imageAlt: 'Ícone do aplicativo WitnessWork',
  },
  'pt-pt': {
    title: 'Abra este contacto no WitnessWork',
    description: 'Foi partilhado consigo um contacto através do WitnessWork — a aplicação de gestão do tempo de pregação e de contactos para as Testemunhas de Jeová.',
    instructions: 'Instale o WitnessWork para importar o contacto partilhado. Se já tem a aplicação, esta deveria ter aberto automaticamente.',
    getApp: 'Descarregar WitnessWork',
    openApp: 'Abrir aplicação (já instalada)',
    continueOnWeb: 'Continuar na web',
    imageAlt: 'Ícone da aplicação WitnessWork',
  },
  'ru-ru': {
    title: 'Откройте этот контакт в WitnessWork',
    description: 'С вами поделились контактом из WitnessWork — приложения для учёта времени служения и управления контактами для Свидетелей Иеговы.',
    instructions: 'Установите WitnessWork, чтобы импортировать контакт. Если приложение уже установлено, оно должно было открыться автоматически.',
    getApp: 'Скачать WitnessWork',
    openApp: 'Открыть приложение (уже установлено)',
    continueOnWeb: 'Продолжить в браузере',
    imageAlt: 'Значок приложения WitnessWork',
  },
  'vi-vn': {
    title: 'Mở liên hệ này trong WitnessWork',
    description: 'Một liên hệ đã được chia sẻ với bạn từ WitnessWork — ứng dụng quản lý thời gian rao giảng và liên hệ dành cho Nhân Chứng Giê-hô-va.',
    instructions: 'Cài đặt WitnessWork để nhập liên hệ được chia sẻ. Nếu bạn đã có ứng dụng, ứng dụng sẽ tự động mở.',
    getApp: 'Tải WitnessWork',
    openApp: 'Mở ứng dụng (đã cài đặt)',
    continueOnWeb: 'Tiếp tục trên web',
    imageAlt: 'Biểu tượng ứng dụng WitnessWork',
  },
  'zh-hant-tw': {
    title: '在WitnessWork中開啟此聯絡人',
    description: '有人透過WitnessWork與你分享了一位聯絡人。WitnessWork是為耶和華見證人設計的傳道時間和聯絡人管理應用程式。',
    instructions: '安裝WitnessWork以匯入分享的聯絡人。如果你已安裝此應用程式，它應該已自動開啟。',
    getApp: '下載WitnessWork',
    openApp: '開啟應用程式（已安裝）',
    continueOnWeb: '在網頁版繼續',
    imageAlt: 'WitnessWork應用程式圖示',
  },
  'zh-hans-cn': {
    title: '在WitnessWork中打开此联系人',
    description: '有人通过WitnessWork与你分享了一位联系人。WitnessWork是为耶和华见证人设计的传道时间和联系人管理应用。',
    instructions: '安装WitnessWork以导入分享的联系人。如果你已安装此应用，它应该已自动打开。',
    getApp: '下载WitnessWork',
    openApp: '打开应用（已安装）',
    continueOnWeb: '在网页版继续',
    imageAlt: 'WitnessWork应用图标',
  },
  'sw-ke': {
    title: 'Fungua anwani hii katika WitnessWork',
    description: 'Umetumiwa anwani kupitia WitnessWork — programu ya kusimamia muda wa huduma na anwani kwa Mashahidi wa Yehova.',
    instructions: 'Sakinisha WitnessWork ili kuingiza anwani uliyotumiwa. Ikiwa tayari una programu, inapaswa kuwa imefunguka kiotomatiki.',
    getApp: 'Pakua WitnessWork',
    openApp: 'Fungua programu (tayari imesakinishwa)',
    continueOnWeb: 'Endelea kwenye wavuti',
    imageAlt: 'Aikoni ya programu ya WitnessWork',
  },
  'uk-ua': {
    title: 'Відкрийте цей контакт у WitnessWork',
    description: 'З вами поділилися контактом із WitnessWork — додатка для обліку часу служіння та керування контактами для Свідків Єгови.',
    instructions: 'Установіть WitnessWork, щоб імпортувати контакт. Якщо додаток уже встановлено, він мав відкритися автоматично.',
    getApp: 'Завантажити WitnessWork',
    openApp: 'Відкрити додаток (уже встановлено)',
    continueOnWeb: 'Продовжити в браузері',
    imageAlt: 'Значок додатка WitnessWork',
  },
  'bem-zm': {
    title: 'Isuleni uyu muntu muli WitnessWork',
    description: 'Mwapeelwa ifyebo fya muntu ukufuma muli WitnessWork — apu ya Nte sha kwa Yehova iya kusunga inshita ya kubilikisha ne fyebo fya bantu.',
    instructions: 'Bikeni WitnessWork pa cibombelo cenu pa kwingisha ifyebo fya muntu mwapeelwa. Nga mwalikwata kale apu, yali no kwisuka iyine.',
    getApp: 'Poseni WitnessWork',
    openApp: 'Isuleni apu (yalibikwa kale)',
    continueOnWeb: 'Pitilisheni pa web',
    imageAlt: 'Icishibilo ca apu ya WitnessWork',
  },
  'rw-rw': {
    title: 'Fungura iyi aderesi muri WitnessWork',
    description: 'Wasangijwe aderesi binyuze muri WitnessWork — porogaramu ifasha Abahamya ba Yehova gucunga igihe bamara mu murimo wo kubwiriza n’aderesi.',
    instructions: 'Shyira WitnessWork ku gikoresho cyawe kugira ngo winjize aderesi wasangijwe. Niba usanzwe ufite iyi porogaramu, yagombye kuba yafungutse ubwayo.',
    getApp: 'Kuramo WitnessWork',
    openApp: 'Fungura porogaramu (isanzwe iri ku gikoresho)',
    continueOnWeb: 'Komereza ku rubuga',
    imageAlt: 'Agashushondanga ka porogaramu ya WitnessWork',
  },
  // One Arabic for every country, like the app (`ar` has no region).
  'ar': {
    title: 'افتح جهة الاتصال هذه في WitnessWork',
    description: 'تمت مشاركة جهة اتصال معك من WitnessWork — تطبيق إدارة وقت الخدمة وجهات الاتصال لشهود يهوه.',
    instructions: 'ثبّت WitnessWork لاستيراد جهة الاتصال التي شوركت معك. إذا كان التطبيق مثبّتًا لديك، فمن المفترض أن يكون قد فُتح تلقائيًا.',
    getApp: 'احصل على WitnessWork',
    openApp: 'فتح التطبيق (مثبّت بالفعل)',
    continueOnWeb: 'المتابعة على الويب',
    imageAlt: 'أيقونة تطبيق WitnessWork',
  },
} satisfies Record<string, ContactLinkMessages>

export type ContactLinkLocale = keyof typeof contactLinkTranslations
const DEFAULT_LOCALE: ContactLinkLocale = 'en-us'

const RIGHT_TO_LEFT: ReadonlySet<ContactLinkLocale> = new Set(['ar'])

/** The page's text direction in `locale`. */
export function contactLinkDirection(locale: ContactLinkLocale): 'ltr' | 'rtl' {
  return RIGHT_TO_LEFT.has(locale) ? 'rtl' : 'ltr'
}

function matchLocale(value: string): ContactLinkLocale | undefined {
  const locale = value.trim().toLowerCase()
  if (Object.hasOwn(contactLinkTranslations, locale)) {
    return locale as ContactLinkLocale
  }
  // Reject malformed input instead of reflecting it into HTML or headers.
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(locale)) return
  const [language, ...subtags] = locale.split('-')
  if (language === 'zh') {
    if (subtags.includes('hant')) return 'zh-hant-tw'
    if (subtags.includes('hans')) return 'zh-hans-cn'
    return subtags.some((tag) => ['tw', 'hk', 'mo'].includes(tag))
      ? 'zh-hant-tw'
      : 'zh-hans-cn'
  }
  return (Object.keys(contactLinkTranslations) as ContactLinkLocale[])
    .find((key) => key === language || key.startsWith(`${language}-`))
}

/** Explicit link language wins; otherwise use browser preferences, then English. */
export function resolveContactLinkLocale(
  language: string | undefined,
  acceptLanguage: string = ''
): ContactLinkLocale {
  const explicit = language ? matchLocale(language) : undefined
  if (explicit) return explicit

  const preferences = acceptLanguage.split(',').map((entry) => {
    const [tag, quality] = entry.trim().split(';')
    const match = quality?.trim().match(/^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i)
    return { tag, weight: quality === undefined ? 1 : match ? Number(match[1]) : 0 }
  }).filter(({ weight }) => weight > 0).sort((a, b) => b.weight - a.weight)

  for (const { tag } of preferences) {
    const locale = tag === '*' ? DEFAULT_LOCALE : matchLocale(tag)
    if (locale) return locale
  }
  return DEFAULT_LOCALE
}
