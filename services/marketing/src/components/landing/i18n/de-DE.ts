import type { LandingMessages } from './en-US'

/** German copy for the WitnessWork landing page. */
const deDE: LandingMessages = {
  meta: {
    title: 'WitnessWork: die Predigtdienst-App für Jehovas Zeugen',
    description:
      'Erfassen Sie Ihre Zeit, planen Sie Ihren Monat und behalten Sie jeden Rückbesuch im Blick. Sanfte Erinnerungen helfen Ihnen, auf Kurs zu bleiben. Kostenlos, privat und in 19 Sprachen auf iPhone, iPad, Apple Watch und Android.',
  },
  nav: {
    home: 'WitnessWork Startseite',
    features: 'Funktionen',
    devices: 'Geräte',
    privacy: 'Datenschutz',
    help: 'Hilfezentrum',
    getApp: 'App laden',
    menu: 'Menü',
    language: 'Sprache',
    skip: 'Zum Inhalt springen',
    pause: 'Bewegung anhalten',
  },
  store: {
    appStore: 'Laden im App Store',
    googlePlay: 'Jetzt bei Google Play',
  },
  hero: {
    title: 'Für Ihren Predigtdienst gemacht.',
    body: 'Ihre Zeit, Pläne und Rückbesuche an einem ruhigen, privaten Ort. Sanfte Erinnerungen helfen Ihnen, auf Kurs zu bleiben.',
    note: 'Für immer kostenlos · Ohne Werbung',
    rating: '4,9',
    ratingLabel: 'aus über 700 Bewertungen im App Store',
    screenAlt:
      'Die Startseite von WitnessWork: Schnellaktionen mit Scribe AI, der Predigtdienstbericht dieses Monats und die heutigen Rückbesuche.',
  },
  proof: {
    title: 'Beliebt im Dienst',
    stats: [
      {
        value: '4,9',
        label: 'Bewertung im App Store',
      },
      {
        value: '10.000+',
        label: 'Verkündiger pro Monat',
      },
      {
        value: '100+',
        label: 'Länder',
      },
      {
        value: '19',
        label: 'Sprachen',
      },
    ],
  },
  statement: {
    eyebrow: 'Warum WitnessWork',
    title: 'Weniger Rechnerei. Mehr Predigtdienst.',
    body: 'WitnessWork zählt Ihre Stunden, Pläne, Rückbesuche und Bibelkurse mit. So wissen Sie immer, wo Sie stehen, und können sich ganz auf die Menschen konzentrieren, denen Sie helfen.',
  },
  journey: {
    eyebrow: 'Ein Tag im Dienst',
    title: 'Ein Tag. Jedes Gerät.',
    body: 'Vom ersten bis zum letzten Besuch begleitet Sie WitnessWork.',
    steps: [
      {
        time: '08:48',
        title: 'Sehen, was als Nächstes kommt',
        body: '„Als Nächstes“ am Handgelenk zeigt Ihren nächsten Rückbesuch: wer, wo und worüber Sie sprechen.',
        alt: '„Als Nächstes“ auf der Apple Watch: ein Rückbesuch bei Maria Santos um 10:30 Uhr.',
      },
      {
        time: '09:30',
        title: 'Den Morgen beginnen',
        body: 'Der Plan für heute, die heutigen Rückbesuche und der Fortschritt dieses Monats – alles auf der Startseite.',
        alt: 'Die Startseite von WitnessWork mit den heutigen Rückbesuchen.',
      },
      {
        time: '10:30',
        title: 'Kein Gespräch vergessen',
        body: 'Besuch erfassen und den nächsten in Sekunden planen. Notizen, Bibelkurse und Folgebesuche bleiben beisammen.',
        alt: 'Die Seite eines Kontakts mit dem nächsten Besuch, Notizen und Gesprächsverlauf.',
      },
      {
        time: '16:00',
        title: 'Aufklappen für mehr',
        body: 'Klappen Sie das iPhone Duo auf, und Ihre Kontakte und deren Verlauf stehen nebeneinander.',
        alt: 'WitnessWork auf dem aufgeklappten iPhone Duo: Kontakte neben den Details eines Kontakts.',
      },
      {
        time: '19:30',
        title: 'Auf den Tag zurückblicken',
        body: 'Auf dem iPad sehen Sie Monat und Dienstjahr im Überblick und planen die kommenden Wochen.',
        alt: 'WitnessWork auf dem iPad im Querformat, mit dem Fortschritt dieses Monats neben der Seitenleiste.',
      },
    ],
  },
  progress: {
    eyebrow: 'Fortschritt',
    title: 'Immer wissen, wo Sie stehen.',
    body: 'Stunden, Bibelkurse und Ziel auf einen Blick. WitnessWork rechnet aus, **was jeden Tag nötig ist**, um gut ins Ziel zu kommen, zählt Gutschriftstunden und LDC richtig mit und sendet Ihren Bericht mit einem Tipp.',
    month: 'Dieser Monat',
    year: 'Dieses Dienstjahr',
    alt: 'Fortschritt im Monat: 45,8 von 50 Stunden, 1,5 Stunden pro Tag bis zum Ziel und 4 Bibelkurse.',
    yearAlt:
      'Tempo im Dienstjahr: 4,4 Stunden voraus, mit einem Diagramm der erfassten und geplanten Stunden.',
  },
  plan: {
    eyebrow: 'Zeitplan',
    title: 'Den Monat mit einem Tipp planen.',
    body: 'Wählen Sie die Tage, an denen Sie in den Dienst gehen, und der Assistent **verteilt Ihr Ziel darauf**. Wiederkehrende Pläne, Erinnerungen und die Diensttage Ihrer Buddies halten die Wochen auf Kurs.',
    alt: 'Der Zeitplan-Kalender für Oktober: abgeschlossene Tage in Grün, Buddies an kommenden Tagen.',
    detailAlt:
      'Ein geplanter Samstagvormittag am Literaturwagen mit zwei eingeladenen Buddies.',
  },
  visits: {
    eyebrow: 'Rückbesuche',
    title: 'Kein Rückbesuch geht verloren.',
    body: 'Jeder Wohnungsinhaber, jede Notiz und jeder Folgebesuch an einem Ort, **als Liste oder auf der Karte**. WitnessWork erinnert Sie, wer an der Reihe ist, damit niemand vergessen wird.',
    note: {
      when: 'Heute, 10:30 Uhr',
      text: 'Lektion 3 lief gut. Sie liest schon weiter und fragte, was Gottes Königreich tun wird. Nächstes Mal: Daniel 2:44.',
      next: 'Nächster Besuch: Mittwoch, 10:30 Uhr',
    },
    listAlt:
      'Kontakte mit heute fälligen Folgebesuchen, Bibelkurse und letzte Besuche.',
    mapAlt: 'Rückbesuche als Pins auf einer Karte.',
  },
  scribe: {
    eyebrow: 'Scribe AI',
    title: 'Einfach sagen.',
    body: 'Sprechen, tippen oder Notizen scannen. Scribe AI macht daraus Zeit, Pläne, Kontakte und Folgebesuche. **Nichts wird hinzugefügt, bevor Sie auf Hinzufügen tippen.**',
    demo: {
      listening: 'Ich höre zu …',
      transcript:
        'Ich war heute Morgen anderthalb Stunden im Dienst. Plane morgen um 9 Uhr zwei Stunden mit Anna ein.',
      reply: 'Das füge ich hinzu:',
      cards: [
        {
          kind: 'Zeit',
          title: '1,5 Std. Predigtdienst',
          detail: 'Heute',
        },
        {
          kind: 'Plan',
          title: '2 Std. um 09:00 Uhr',
          detail: 'Morgen · mit Anna',
        },
      ],
      add: '2 hinzufügen',
      added: 'Hinzugefügt',
    },
    alt: 'Scribe AI mit einer Zeitkarte und einer Plankarte, bereit zum Hinzufügen.',
  },
  buddies: {
    eyebrow: 'Buddies',
    title: 'Gemeinsam losziehen.',
    body: 'Verbinden Sie sich mit bis zu fünf Freunden, mit denen Sie in den Dienst gehen. Sehen Sie gegenseitig Ihre geplanten Tage, **laden Sie sie zu Ihren ein** und wissen Sie, wer mitkommt – Ende-zu-Ende-verschlüsselt auf iPhone und Android.',
    alt: 'Die Buddy-Seite von Anna Brooks mit den Tagen der nächsten zwei Wochen, an denen Sie beide unterwegs sind.',
  },
  route: {
    eyebrow: 'Routenplanung',
    title: 'Die beste Route, der Reihe nach.',
    body: 'Bringen Sie die Stationen des Tages in **die schnellste Fahrreihenfolge**, sehen Sie die Ankunftszeiten und starten Sie in Ihrer Lieblings-Karten-App.',
    alt: 'Eine Route mit zwei Rückbesuchen und Ankunftszeiten.',
  },
  delight: {
    eyebrow: 'Serien, Abzeichen & Ihr Haustier',
    title: 'Treue feiern.',
    body: 'Halten Sie Ihre Serie am Laufen, sammeln Sie Abzeichen, die von **Bronze bis Perle** wachsen, und ziehen Sie einen Begleiter groß, der Sie anfeuert.',
    petAlt: 'Das Löwenjunge Leo in seinem Zimmer.',
    badgesAlt:
      'Abzeichen für den Dienst in jedem Monat und für gesendete Berichte.',
  },
  more: {
    title: 'Und noch viel mehr.',
    items: [
      {
        title: 'Widgets',
        body: 'Ihre Stunden und der Kalender auf Home- und Sperrbildschirm.',
      },
      {
        title: 'Siri und Kurzbefehle',
        body: '„Zeit in WitnessWork hinzufügen.“ Erledigt.',
      },
      {
        title: 'Fahrstrecke',
        body: 'Fahrten erfassen und die Kraftstoffkosten des Monats sehen.',
      },
      {
        title: 'App-Sperre',
        body: 'Ihre Aufzeichnungen geschützt durch Gesicht, Fingerabdruck oder Code.',
      },
      {
        title: 'Daten mitbringen',
        body: 'Import aus MyTime und anderen Apps in wenigen Minuten.',
      },
      {
        title: 'Kalender-Synchronisierung',
        body: 'Pläne und Folgebesuche in Ihrem Kalender sehen.',
      },
      {
        title: 'Sicherung',
        body: 'Verschlüsselte Sicherungen, die nur Ihre Geräte lesen können.',
      },
      {
        title: 'Formatierte Notizen',
        body: 'Notizen gestalten und Fotos hinzufügen.',
      },
      {
        title: 'Ganz nach Ihrem Geschmack',
        body: 'Startseite umordnen, Tabs wählen und zwischen Hell und Dunkel wechseln.',
      },
      {
        title: 'Barrierefrei',
        body: 'Größere und fette Schrift sowie Unterstützung für Bildschirmleser.',
      },
    ],
    widgetAlt:
      'Das WitnessWork-Kalender-Widget auf dem Home-Bildschirm mit den Plänen dieser Woche.',
    appleOnly: 'iPhone und iPad',
  },
  devices: {
    eyebrow: 'Jedes Gerät',
    title: 'Eine App. Jeder Bildschirm.',
    body: 'WitnessWork fühlt sich auf jedem Ihrer Bildschirme zu Hause.',
    poses: {
      closed: 'Zugeklappt',
      half: 'Halb offen',
    },
    tabs: {
      iphone: {
        name: 'iPhone',
        title: 'Alles in der Hosentasche.',
        body: 'Zeit, Pläne, Kontakte und Fortschritt mit einem Tipp erreichbar – mit Widgets und Siri.',
      },
      ipad: {
        name: 'iPad',
        title: 'Platz zum Planen.',
        body: 'Seitenleiste, Ansichten nebeneinander, Tastaturkurzbefehle und Zeigerunterstützung machen das Planen zum Vergnügen.',
      },
      duo: {
        name: 'iPhone Duo',
        title: 'Den Dienst aufklappen.',
        body: 'Zugeklappt ist es Ihr Begleiter für unterwegs. Aufgeklappt verteilen sich Kontakte, Zeitplan und Fortschritt auf zwei Spalten, die sich an der Falz treffen.',
      },
      watch: {
        name: 'Apple Watch',
        title: 'Ihr Predigtdienst auf einen Blick.',
        body: 'Sehen Sie die Stunden dieses Monats, fügen Sie Zeit hinzu, starten Sie den Timer und prüfen Sie „Als Nächstes“ am Handgelenk.',
      },
      android: {
        name: 'Android',
        title: 'Genauso gut auf Android.',
        body: 'Dieselbe App auf Android-Handys und -Tablets, mit einer Wear-OS-App und Google-Drive-Synchronisierung.',
      },
    },
    ipadAlt: 'WitnessWork auf dem iPad mit Seitenleiste und dem Zeitplan.',
    duoClosedAlt: 'WitnessWork auf dem äußeren Display des iPhone Duo.',
    duoOpenAlt:
      'WitnessWork auf dem aufgeklappten iPhone Duo, in zwei Spalten.',
    watchAlt: 'WitnessWork auf der Apple Watch.',
    androidAlt: 'WitnessWork auf einem Android-Handy.',
  },
  sync: {
    eyebrow: 'Cloud Sync',
    title: 'Überall erfassen. Überall sehen.',
    body: 'Fügen Sie Zeit an der Uhr hinzu oder planen Sie am iPad – einen Moment später ist alles auf Ihrem Handy, **sogar zwischen iPhone und Android**. Nur Ihre Geräte können die Daten lesen.',
    demo: {
      added: '+2 Std. hinzugefügt',
      on: 'auf der Apple Watch',
      encrypted: 'Verschlüsselt',
      month: 'Oktober',
      before: '45,8',
      after: '47,8',
      alt: 'Zwei auf der Apple Watch hinzugefügte Stunden reisen verschlüsselt zu iPhone, iPhone Duo, iPad und einem Android-Handy, und jedes Gerät springt von 45,8 auf 47,8 Stunden.',
    },
  },
  supporter: {
    included: 'Im Unterstützer-Abo enthalten.',
  },
  privacy: {
    eyebrow: 'Datenschutz',
    title: 'Privat von Grund auf.',
    body: 'Ihre Aufzeichnungen im Dienst sind persönlich. WitnessWork behandelt sie auch so.',
    items: [
      {
        title: 'Keine Registrierung. Keine Werbung.',
        body: 'Ihr Konto ist anonym: keine E-Mail-Adresse, keine Telefonnummer, kein Passwort.',
      },
      {
        title: 'Auf Ihrem Gerät gespeichert',
        body: 'Ihre Aufzeichnungen liegen auf Ihren Geräten, und Sie entscheiden, ob sie synchronisiert oder gesichert werden.',
      },
      {
        title: 'Ende-zu-Ende-verschlüsselt',
        body: 'Nur Ihre Geräte können Ihre synchronisierten und gesicherten Aufzeichnungen lesen, und nur Ihre Buddies das, was Sie mit ihnen teilen.',
      },
      {
        title: 'Gesperrt, wenn Sie wollen',
        body: 'Sperren Sie WitnessWork mit Gesicht, Fingerabdruck oder Code.',
      },
      {
        title: 'Keine Datenspeicherung',
        body: 'Scribe AI arbeitet nur mit Anbietern, die nicht speichern, was Sie senden.',
      },
      {
        title: 'Open Source',
        body: 'Jeder kann den Code von WitnessWork auf GitHub einsehen.',
      },
    ],
  },
  languages: {
    eyebrow: 'Sprachen',
    title: 'Spricht Ihre Sprache.',
    body: 'In 19 Sprachen verfügbar.',
  },
  pricing: {
    eyebrow: 'Preise',
    title: 'Alles, was Sie brauchen. Kostenlos.',
    body: 'Keine Werbung, keine Anmeldung, kein Haken. Alle Funktionen für Ihren Predigtdienst sind für alle kostenlos.',
    freeItems: [
      'Zeit und Berichte',
      'Ziele und Tagestempo',
      'Rückbesuche und Bibelkurse',
      'Ihre Besuche auf der Karte',
      'Pläne und Erinnerungen',
      'Buddies',
      'Scribe AI mit Monatslimit',
      'Apple Watch und Wear OS',
      'Widgets und Siri auf iPhone/iPad',
      'Verschlüsselte Sicherung',
      'Kalender-Synchronisierung',
      'Serien, Abzeichen und Ihr Haustier',
    ],
    supporterTitle: 'Unterstützer ist freiwillig.',
    supporterBody:
      'Wenn WitnessWork Ihnen im Predigtdienst hilft, hält ein Abo die App am Laufen. Als Dankeschön erhalten Unterstützer:',
    supporterItems: [
      'Synchronisierung über alle Ihre Geräte',
      'Die beste Route des Tages',
      'Mehr Scribe AI',
      'Akzentfarben sowie App-Symbole auf iPhone und iPad',
      'Das Unterstützer-Abzeichen',
    ],
    supporterNote:
      'Schließen Sie das Abo in der App ab, dort sehen Sie die Preise für Ihr Land. Jederzeit kündbar.',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Fragen? Antworten.',
    more: 'Zum Hilfezentrum',
    open: 'Ganze Antwort lesen',
  },
  cta: {
    title: 'Ihr Predigtdienst auf Kurs.',
    body: 'Laden Sie WitnessWork kostenlos für iPhone, iPad, Apple Watch und Android.',
    qr: 'Zum Laden scannen',
  },
  footer: {
    contact: 'Kontakt',
    source: 'Quellcode',
    privacy: 'Datenschutzerklärung',
    terms: 'Nutzungsbedingungen',
    independent:
      'WitnessWork ist eine unabhängige App. Sie steht in keiner Verbindung zur Watch Tower Bible and Tract Society of Pennsylvania.',
    trademarks:
      'Apple, iPhone, iPad, Apple Watch, Face ID, Siri und iCloud sind Marken von Apple Inc., eingetragen in den USA und weiteren Ländern. App Store ist eine Dienstleistungsmarke von Apple Inc. Google Play, Android, Wear OS und Google Drive sind Marken von Google LLC.',
  },
}

export default deDE
