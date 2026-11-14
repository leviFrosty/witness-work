import type { ContactLinkLocale } from '../contactLinkLocales'

type HandoffPageMessages = {
  title: string
  description: string
  instructions: string
  appStore: string
  googlePlay: string
  imageAlt: string
}

/**
 * The `/h` page's text, in every locale the shared contact page (`/c`)
 * resolves to, so both pages pick a language the same way
 * (`resolveContactLinkLocale`). Keep the keys in step with
 * `contactLinkTranslations`.
 */
export const handoffPageTranslations = {
  'en-us': {
    title: 'Scan this code in WitnessWork',
    description: 'Set up WitnessWork on another phone.',
    instructions: 'This code sets up WitnessWork on a new phone. Install or open WitnessWork on the new phone, then scan the code from inside the app.',
    appStore: 'Get it on the App Store',
    googlePlay: 'Get it on Google Play',
    imageAlt: 'WitnessWork app icon',
  },
  'de-de': {
    title: 'Scanne diesen Code in WitnessWork',
    description: 'WitnessWork auf einem anderen Telefon einrichten.',
    instructions: 'Mit diesem Code richtest du WitnessWork auf einem neuen Telefon ein. Installiere oder öffne WitnessWork auf dem neuen Telefon und scanne den Code dann in der App.',
    appStore: 'Im App Store laden',
    googlePlay: 'Bei Google Play herunterladen',
    imageAlt: 'WitnessWork-App-Symbol',
  },
  'es-es': {
    title: 'Escanea este código en WitnessWork',
    description: 'Configura WitnessWork en otro teléfono.',
    instructions: 'Este código configura WitnessWork en un teléfono nuevo. Instala o abre WitnessWork en el teléfono nuevo y escanea el código desde la aplicación.',
    appStore: 'Descargar en el App Store',
    googlePlay: 'Disponible en Google Play',
    imageAlt: 'Icono de la aplicación WitnessWork',
  },
  'fr-fr': {
    title: 'Scannez ce code dans WitnessWork',
    description: 'Configurer WitnessWork sur un autre téléphone.',
    instructions: 'Ce code configure WitnessWork sur un nouveau téléphone. Installez ou ouvrez WitnessWork sur le nouveau téléphone, puis scannez le code depuis l’application.',
    appStore: 'Télécharger dans l’App Store',
    googlePlay: 'Disponible sur Google Play',
    imageAlt: 'Icône de l’application WitnessWork',
  },
  'it-it': {
    title: 'Scansiona questo codice in WitnessWork',
    description: 'Configura WitnessWork su un altro telefono.',
    instructions: 'Questo codice configura WitnessWork su un nuovo telefono. Installa o apri WitnessWork sul nuovo telefono, poi scansiona il codice dall’app.',
    appStore: 'Scarica su App Store',
    googlePlay: 'Disponibile su Google Play',
    imageAlt: 'Icona dell’app WitnessWork',
  },
  'ja-jp': {
    title: 'このコードをWitnessWorkでスキャン',
    description: '別の電話でWitnessWorkを設定します。',
    instructions: 'このコードは新しい電話でWitnessWorkを設定するためのものです。新しい電話でWitnessWorkをインストールするか開いて、アプリ内からコードをスキャンしてください。',
    appStore: 'App Storeでダウンロード',
    googlePlay: 'Google Playで手に入れよう',
    imageAlt: 'WitnessWorkのアプリアイコン',
  },
  'ko-kr': {
    title: 'WitnessWork에서 이 코드를 스캔하세요',
    description: '다른 휴대폰에서 WitnessWork를 설정합니다.',
    instructions: '이 코드는 새 휴대폰에서 WitnessWork를 설정하는 데 사용됩니다. 새 휴대폰에서 WitnessWork를 설치하거나 연 다음, 앱 안에서 코드를 스캔하세요.',
    appStore: 'App Store에서 다운로드',
    googlePlay: 'Google Play에서 다운로드',
    imageAlt: 'WitnessWork 앱 아이콘',
  },
  'nl-nl': {
    title: 'Scan deze code in WitnessWork',
    description: 'WitnessWork instellen op een andere telefoon.',
    instructions: 'Met deze code stel je WitnessWork in op een nieuwe telefoon. Installeer of open WitnessWork op de nieuwe telefoon en scan de code daarna vanuit de app.',
    appStore: 'Download in de App Store',
    googlePlay: 'Ontdek het op Google Play',
    imageAlt: 'App-pictogram van WitnessWork',
  },
  'pt-br': {
    title: 'Escaneie este código no WitnessWork',
    description: 'Configure o WitnessWork em outro celular.',
    instructions: 'Este código configura o WitnessWork em um celular novo. Instale ou abra o WitnessWork no celular novo e escaneie o código dentro do app.',
    appStore: 'Baixar na App Store',
    googlePlay: 'Disponível no Google Play',
    imageAlt: 'Ícone do app WitnessWork',
  },
  'pt-pt': {
    title: 'Leia este código no WitnessWork',
    description: 'Configure o WitnessWork noutro telemóvel.',
    instructions: 'Este código configura o WitnessWork num telemóvel novo. Instale ou abra o WitnessWork no telemóvel novo e leia o código a partir da aplicação.',
    appStore: 'Descarregar na App Store',
    googlePlay: 'Disponível no Google Play',
    imageAlt: 'Ícone da aplicação WitnessWork',
  },
  'ru-ru': {
    title: 'Отсканируйте этот код в WitnessWork',
    description: 'Настройка WitnessWork на другом телефоне.',
    instructions: 'С помощью этого кода WitnessWork настраивается на новом телефоне. Установите или откройте WitnessWork на новом телефоне, а затем отсканируйте код в приложении.',
    appStore: 'Загрузить в App Store',
    googlePlay: 'Доступно в Google Play',
    imageAlt: 'Значок приложения WitnessWork',
  },
  'vi-vn': {
    title: 'Quét mã này trong WitnessWork',
    description: 'Thiết lập WitnessWork trên một điện thoại khác.',
    instructions: 'Mã này dùng để thiết lập WitnessWork trên điện thoại mới. Hãy cài đặt hoặc mở WitnessWork trên điện thoại mới, rồi quét mã từ trong ứng dụng.',
    appStore: 'Tải về trên App Store',
    googlePlay: 'Tải về trên Google Play',
    imageAlt: 'Biểu tượng ứng dụng WitnessWork',
  },
  'zh-hant-tw': {
    title: '請在 WitnessWork 中掃描這個條碼',
    description: '在另一支手機上設定 WitnessWork。',
    instructions: '這個條碼用來在新手機上設定 WitnessWork。請在新手機上安裝或開啟 WitnessWork，然後在 App 內掃描條碼。',
    appStore: '在 App Store 下載',
    googlePlay: '在 Google Play 下載',
    imageAlt: 'WitnessWork App 圖示',
  },
  'zh-hans-cn': {
    title: '请在 WitnessWork 中扫描此二维码',
    description: '在另一部手机上设置 WitnessWork。',
    instructions: '此二维码用于在新手机上设置 WitnessWork。请在新手机上安装或打开 WitnessWork，然后在应用内扫描二维码。',
    appStore: '在 App Store 下载',
    googlePlay: '在 Google Play 下载',
    imageAlt: 'WitnessWork 应用图标',
  },
  'sw-ke': {
    title: 'Changanua msimbo huu katika WitnessWork',
    description: 'Weka WitnessWork kwenye simu nyingine.',
    instructions: 'Msimbo huu unaweka WitnessWork kwenye simu mpya. Sakinisha au fungua WitnessWork kwenye simu mpya, kisha uchanganue msimbo ukiwa ndani ya programu.',
    appStore: 'Pakua kwenye App Store',
    googlePlay: 'Pakua kwenye Google Play',
    imageAlt: 'Aikoni ya programu ya WitnessWork',
  },
  'uk-ua': {
    title: 'Відскануйте цей код у WitnessWork',
    description: 'Налаштування WitnessWork на іншому телефоні.',
    instructions: 'За допомогою цього коду WitnessWork налаштовується на новому телефоні. Установіть або відкрийте WitnessWork на новому телефоні, а потім відскануйте код у додатку.',
    appStore: 'Завантажити в App Store',
    googlePlay: 'Завантажити в Google Play',
    imageAlt: 'Значок додатка WitnessWork',
  },
  'bem-zm': {
    title: 'Skanini iyi kodi muli WitnessWork',
    description: 'Bikeni WitnessWork pa foni imbi.',
    instructions: 'Iyi kodi ibika WitnessWork pa foni ipya. Bikeni nangu isuleni WitnessWork pa foni ipya, e lyo mu-skanine kodi ukufuma mu kati ka apu.',
    appStore: 'Poseni pa App Store',
    googlePlay: 'Poseni pa Google Play',
    imageAlt: 'Icishibilo ca apu ya WitnessWork',
  },
  'rw-rw': {
    title: 'Sikana iyi kode muri WitnessWork',
    description: 'Shyira WitnessWork kuri telefoni indi.',
    instructions: 'Iyi kode ishyira WitnessWork kuri telefoni nshya. Shyira cyangwa ufungure WitnessWork kuri telefoni nshya, hanyuma usikane kode uri muri porogaramu.',
    appStore: 'Kuramo kuri App Store',
    googlePlay: 'Kuramo kuri Google Play',
    imageAlt: 'Agashushondanga ka porogaramu ya WitnessWork',
  },
  'ar': {
    title: 'امسح هذا الرمز في WitnessWork',
    description: 'إعداد WitnessWork على هاتف آخر.',
    instructions: 'يُستخدم هذا الرمز لإعداد WitnessWork على هاتف جديد. ثبّت WitnessWork أو افتحه على الهاتف الجديد، ثم امسح الرمز من داخل التطبيق.',
    appStore: 'تنزيل من App Store',
    googlePlay: 'احصل عليه من Google Play',
    imageAlt: 'أيقونة تطبيق WitnessWork',
  },
} satisfies Record<ContactLinkLocale, HandoffPageMessages>
