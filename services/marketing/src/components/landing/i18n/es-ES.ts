import type { LandingMessages } from './en-US'

/** Spanish (Spain) copy for the WitnessWork landing page. */
const esES: LandingMessages = {
  meta: {
    title: 'WitnessWork: la app de predicación para los testigos de Jehová',
    description:
      'Registra tu tiempo, planifica tu mes y recuerda cada revisita, con recordatorios discretos que te ayudan a seguir tu ritmo. Gratis, privada y en 19 idiomas en iPhone, iPad, Apple Watch y Android.',
  },
  nav: {
    home: 'Inicio de WitnessWork',
    features: 'Funciones',
    devices: 'Dispositivos',
    privacy: 'Privacidad',
    help: 'Centro de Ayuda',
    getApp: 'Descargar la app',
    menu: 'Menú',
    language: 'Idioma',
    skip: 'Saltar al contenido',
    pause: 'Pausar el movimiento',
  },
  store: {
    appStore: 'Descárgala en el App Store',
    googlePlay: 'Disponible en Google Play',
  },
  hero: {
    title: 'Hecha para predicar.',
    body: 'Tu tiempo, tus planes y tus revisitas en un lugar tranquilo y privado, con recordatorios discretos que te ayudan a seguir tu ritmo.',
    note: 'Gratis para siempre · Sin anuncios',
    rating: '4,9',
    ratingLabel: 'en más de 700 valoraciones del App Store',
    screenAlt:
      'La pantalla Inicio de WitnessWork: Acciones rápidas con Scribe AI, el informe de servicio del mes y las revisitas de hoy.',
  },
  proof: {
    title: 'Querida en la predicación',
    stats: [
      {
        value: '4,9',
        label: 'valoración en el App Store',
      },
      {
        value: '10.000+',
        label: 'publicadores cada mes',
      },
      {
        value: '100+',
        label: 'países',
      },
      {
        value: '19',
        label: 'idiomas',
      },
    ],
  },
  statement: {
    eyebrow: 'Por qué WitnessWork',
    title: 'Menos cuentas. Más ministerio.',
    body: 'WitnessWork lleva la cuenta de tus horas, planes, revisitas y cursos bíblicos, para que siempre sepas cómo vas y puedas centrarte en las personas a las que ayudas.',
  },
  journey: {
    eyebrow: 'Un día de predicación',
    title: 'Un día. Todos tus dispositivos.',
    body: 'Desde la primera visita hasta la última, WitnessWork va contigo.',
    steps: [
      {
        time: '08:48',
        title: 'Mira lo que viene',
        body: 'Próximamente, en tu muñeca, te muestra tu siguiente revisita: quién, dónde y de qué hablarás.',
        alt: 'Próximamente en el Apple Watch: una revisita a María Santos a las 10:30.',
      },
      {
        time: '09:30',
        title: 'Empieza la mañana',
        body: 'El plan de hoy, las revisitas de hoy y el progreso del mes, todo en Inicio.',
        alt: 'La pantalla Inicio de WitnessWork con las revisitas de hoy.',
      },
      {
        time: '10:30',
        title: 'Recuerda cada conversación',
        body: 'Anota la visita y programa la siguiente en segundos. Notas, cursos y seguimientos, todo junto.',
        alt: 'La ficha de un contacto con la próxima visita, notas e historial de conversaciones.',
      },
      {
        time: '16:00',
        title: 'Ábrelo y ve más',
        body: 'Abre el iPhone Duo y tus contactos y su historial aparecen lado a lado.',
        alt: 'WitnessWork abierto en un iPhone Duo con los contactos junto a los detalles de un contacto.',
      },
      {
        time: '19:30',
        title: 'Repasa el día',
        body: 'En el iPad, revisa tu mes y tu año de servicio, y planifica las próximas semanas.',
        alt: 'WitnessWork en iPad en horizontal, con el progreso de este mes junto a la barra lateral.',
      },
    ],
  },
  progress: {
    eyebrow: 'Progreso',
    title: 'Siempre sabrás cómo vas.',
    body: 'Consulta de un vistazo tus horas, cursos y meta. WitnessWork calcula **lo que necesitas cada día** para terminar bien, cuenta correctamente las horas de crédito y las LDC, y envía tu informe con un toque.',
    month: 'Este mes',
    year: 'Este año de servicio',
    alt: 'Progreso del mes: 45,8 de 50 horas, 1,5 horas al día para llegar a la meta y 4 cursos bíblicos.',
    yearAlt:
      'Ritmo del año de servicio: 4,4 horas por delante, con una gráfica de las horas registradas y planificadas.',
  },
  plan: {
    eyebrow: 'Cronograma',
    title: 'Planifica tu mes con un toque.',
    body: 'Elige los días en que sales y el Asistente **reparte tu meta entre ellos**. Los planes recurrentes, los recordatorios y los días de tus compañeros mantienen tus semanas en marcha.',
    alt: 'El calendario del cronograma de octubre, con los días completados en verde y los compañeros en los próximos días.',
    detailAlt:
      'Una mañana planificada de predicación con carrito el sábado, con dos compañeros invitados.',
  },
  visits: {
    eyebrow: 'Revisitas',
    title: 'Que no se te escape ninguna revisita.',
    body: 'Cada persona, nota y seguimiento vive en un solo lugar, **en una lista o en un mapa**. WitnessWork te recuerda a quién le toca, para que nadie quede olvidado.',
    note: {
      when: 'Hoy, 10:30',
      text: 'La lección 3 fue bien. Está leyendo por adelantado y preguntó qué hará el Reino de Dios. La próxima vez: Daniel 2:44.',
      next: 'Próxima visita: miércoles, 10:30',
    },
    listAlt:
      'Contactos con seguimientos para hoy, cursos bíblicos y visitas recientes.',
    mapAlt: 'Revisitas como marcadores en un mapa.',
  },
  scribe: {
    eyebrow: 'Scribe AI',
    title: 'Solo cuéntalo.',
    body: 'Habla, escribe o escanea tus notas. Scribe AI las convierte en tiempo, planes, contactos y seguimientos. **No se agrega nada hasta que toques Agregar.**',
    demo: {
      listening: 'Escuchando…',
      transcript:
        'Hice hora y media esta mañana. Planifica dos horas para mañana a las 9 con Anna.',
      reply: 'Esto es lo que voy a agregar:',
      cards: [
        {
          kind: 'Tiempo',
          title: '1,5 h de predicación',
          detail: 'Hoy',
        },
        {
          kind: 'Plan',
          title: '2 h a las 09:00',
          detail: 'Mañana · con Anna',
        },
      ],
      add: 'Agregar 2',
      added: 'Agregado',
    },
    alt: 'Scribe AI mostrando una tarjeta de tiempo y otra de plan, listas para agregar.',
  },
  buddies: {
    eyebrow: 'Compañeros',
    title: 'Salgan juntos.',
    body: 'Conecta con hasta cinco amigos con los que sales a predicar. Ved los días que habéis planeado, **invítalos a los tuyos** y ten claro quién va, con cifrado de extremo a extremo en iPhone y Android.',
    alt: 'La página de compañera de Anna Brooks, con los días en que ambas salen en las próximas dos semanas.',
  },
  route: {
    eyebrow: 'Planificación de rutas',
    title: 'La mejor ruta, en orden.',
    body: 'Ordena las paradas del día **de la forma más rápida en coche**, mira a qué hora llegarás y empieza en tu app de mapas favorita.',
    alt: 'Una ruta con dos revisitas y las horas de llegada.',
  },
  delight: {
    eyebrow: 'Rachas, insignias y tu mascota',
    title: 'Celebra los buenos hábitos.',
    body: 'Mantén tu racha, gana insignias que suben **de Bronce a Perla** y cuida a un compañero que te anima.',
    petAlt: 'Leo, el cachorro de león, en su habitación.',
    badgesAlt:
      'Insignias ganadas por participar cada mes y enviar los informes.',
  },
  more: {
    title: 'Y mucho más.',
    items: [
      {
        title: 'Widgets',
        body: 'Tus horas y tu calendario en la pantalla de inicio y en la de bloqueo.',
      },
      {
        title: 'Siri y Atajos',
        body: '“Agrega tiempo en WitnessWork.” Listo.',
      },
      {
        title: 'Kilometraje',
        body: 'Registra los viajes y mira el gasto de gasolina del mes.',
      },
      {
        title: 'Bloqueo de la app',
        body: 'Protege tus registros con tu cara, tu huella o tu código.',
      },
      {
        title: 'Trae tus datos',
        body: 'Importa desde MyTime y otras apps en minutos.',
      },
      {
        title: 'Sincronización del calendario',
        body: 'Mira planes y seguimientos en tu calendario.',
      },
      {
        title: 'Respaldo',
        body: 'Copias cifradas que solo tus dispositivos pueden leer.',
      },
      {
        title: 'Notas enriquecidas',
        body: 'Da formato a tus notas y agrega fotos.',
      },
      {
        title: 'Hazla tuya',
        body: 'Reorganiza Inicio, elige las pestañas y escoge el modo claro u oscuro.',
      },
      {
        title: 'Accesible',
        body: 'Texto más grande y en negrita, y compatibilidad con lectores de pantalla.',
      },
    ],
    widgetAlt:
      'El widget de calendario de WitnessWork en la pantalla de inicio, con los planes de la semana.',
    appleOnly: 'iPhone y iPad',
  },
  devices: {
    eyebrow: 'Todos los dispositivos',
    title: 'Una app. Todas las pantallas.',
    body: 'WitnessWork se siente como en casa en cada pantalla que usas.',
    poses: {
      closed: 'Cerrado',
      half: 'Semiabierto',
    },
    tabs: {
      iphone: {
        name: 'iPhone',
        title: 'Todo en tu bolsillo.',
        body: 'Tiempo, planes, contactos y progreso a un toque, con widgets y Siri integrados.',
      },
      ipad: {
        name: 'iPad',
        title: 'Espacio para planificar.',
        body: 'Barra lateral, vistas en paralelo, atajos de teclado y compatibilidad con el puntero hacen que planificar sea un placer.',
      },
      duo: {
        name: 'iPhone Duo',
        title: 'Despliega tu ministerio.',
        body: 'Cerrado, es tu compañero de bolsillo. Ábrelo y Contactos, Cronograma y Progreso se reparten en dos columnas que se encuentran en el pliegue.',
      },
      watch: {
        name: 'Apple Watch',
        title: 'Tu ministerio de un vistazo.',
        body: 'Mira las horas del mes, agrega tiempo, usa el cronómetro y consulta Próximamente desde tu muñeca.',
      },
      android: {
        name: 'Android',
        title: 'Igual de bien en Android.',
        body: 'La misma app en teléfonos y tabletas Android, con una app para Wear OS y sincronización con Google Drive.',
      },
    },
    ipadAlt: 'WitnessWork en el iPad con la barra lateral y el cronograma.',
    duoClosedAlt: 'WitnessWork en la pantalla exterior del iPhone Duo.',
    duoOpenAlt: 'WitnessWork abierto en un iPhone Duo, en dos columnas.',
    watchAlt: 'WitnessWork en el Apple Watch.',
    androidAlt: 'WitnessWork en un teléfono Android.',
  },
  sync: {
    eyebrow: 'Sincronización en la nube',
    title: 'Anótalo donde quieras. Velo en todas partes.',
    body: 'Añade tiempo desde tu reloj o planifica en tu iPad, y al momento estará en tu móvil, **incluso entre iPhone y Android**. Solo tus dispositivos pueden leer los datos.',
    demo: {
      added: '+2 h agregadas',
      on: 'en el Apple Watch',
      encrypted: 'Cifrado',
      month: 'Octubre',
      before: '45,8',
      after: '47,8',
      alt: 'Dos horas agregadas en el Apple Watch viajan cifradas al iPhone, al iPhone Duo, al iPad y a un teléfono Android, y cada uno pasa de 45,8 a 47,8 horas.',
    },
  },
  supporter: {
    included: 'Incluido con Colaborador.',
  },
  privacy: {
    eyebrow: 'Privacidad',
    title: 'Privada desde el diseño.',
    body: 'Tus registros del ministerio son personales. WitnessWork los trata como tales.',
    items: [
      {
        title: 'Sin registro. Sin anuncios.',
        body: 'Tu cuenta es anónima: sin correo, sin número de teléfono y sin contraseña.',
      },
      {
        title: 'Se quedan en tu dispositivo',
        body: 'Tus registros viven en tus dispositivos, y tú decides si se sincronizan o se respaldan.',
      },
      {
        title: 'Cifrado de extremo a extremo',
        body: 'Solo tus dispositivos pueden leer tus registros sincronizados y respaldados, y solo tus compañeros pueden leer lo que compartes con ellos.',
      },
      {
        title: 'Bloqueada cuando quieras',
        body: 'Bloquea WitnessWork con tu cara, tu huella o tu código.',
      },
      {
        title: 'Cero retención de datos',
        body: 'Scribe AI solo trabaja con proveedores que no guardan lo que les envías.',
      },
      {
        title: 'Código abierto',
        body: 'Cualquiera puede leer el código de WitnessWork en GitHub.',
      },
    ],
  },
  languages: {
    eyebrow: 'Idiomas',
    title: 'Habla tu idioma.',
    body: 'Disponible en 19 idiomas.',
  },
  pricing: {
    eyebrow: 'Precios',
    title: 'Todo lo que necesitas. Gratis.',
    body: 'Sin anuncios, sin registro, sin trampa. Todas las funciones para tu predicación son gratis para todos.',
    freeItems: [
      'Tiempo e informes',
      'Metas y ritmo diario',
      'Revisitas y cursos bíblicos',
      'Tus visitas en un mapa',
      'Planes y recordatorios',
      'Compañeros',
      'Scribe AI con un límite mensual',
      'Apple Watch y Wear OS',
      'Widgets y Siri en iPhone/iPad',
      'Copia de seguridad cifrada',
      'Sincronización del calendario',
      'Rachas, insignias y tu mascota',
    ],
    supporterTitle: 'Ser Colaborador es opcional.',
    supporterBody:
      'Si WitnessWork te ayuda a predicar, una suscripción ayuda a mantenerla en marcha. Como agradecimiento, los Colaboradores reciben:',
    supporterItems: [
      'Sincronización entre todos tus dispositivos',
      'La mejor ruta del día',
      'Más Scribe AI',
      'Colores de acento, e iconos de la app en iPhone y iPad',
      'La insignia de Colaborador',
    ],
    supporterNote:
      'Suscríbete desde la app para ver los precios de tu país. Cancela cuando quieras.',
  },
  faq: {
    eyebrow: 'Preguntas frecuentes',
    title: '¿Preguntas? Respuestas.',
    more: 'Visita el Centro de Ayuda',
    open: 'Leer la respuesta completa',
  },
  cta: {
    title: 'Tu predicación, bien encaminada.',
    body: 'Descarga WitnessWork gratis para iPhone, iPad, Apple Watch y Android.',
    qr: 'Escanea para descargar',
  },
  footer: {
    contact: 'Contacto',
    source: 'Código fuente',
    privacy: 'Política de privacidad',
    terms: 'Condiciones de uso',
    independent:
      'WitnessWork es una app independiente. No está afiliada a la Watch Tower Bible and Tract Society of Pennsylvania.',
    trademarks:
      'Apple, iPhone, iPad, Apple Watch, Face ID, Siri e iCloud son marcas comerciales de Apple Inc., registradas en EE. UU. y en otros países. App Store es una marca de servicio de Apple Inc. Google Play, Android, Wear OS y Google Drive son marcas comerciales de Google LLC.',
  },
}

export default esES
