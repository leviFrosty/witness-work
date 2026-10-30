import type { LandingMessages } from './en-US'

/** Portuguese (Portugal) copy for the WitnessWork landing page. */
const ptPT: LandingMessages = {
  meta: {
    title:
      'WitnessWork: a aplicação de serviço de campo para Testemunhas de Jeová',
    description:
      'Registe o seu tempo, planeie o mês e lembre-se de cada revisita, com lembretes discretos para manter o ritmo. Gratuita, privada e em 19 idiomas no iPhone, iPad, Apple Watch e Android.',
  },
  nav: {
    home: 'Página inicial do WitnessWork',
    features: 'Funcionalidades',
    devices: 'Dispositivos',
    privacy: 'Privacidade',
    help: 'Centro de Ajuda',
    getApp: 'Obter a aplicação',
    menu: 'Menu',
    language: 'Idioma',
    skip: 'Saltar para o conteúdo',
    pause: 'Pausar o movimento',
  },
  store: {
    appStore: 'Descarregue na App Store',
    googlePlay: 'Disponível no Google Play',
  },
  hero: {
    title: 'Feita para o ministério.',
    body: 'O seu tempo, as suas programações e revisitas num espaço tranquilo e privado, com lembretes discretos para manter o ritmo.',
    note: 'Grátis para sempre · Sem anúncios',
    rating: '4,9',
    ratingLabel: 'em mais de 700 avaliações na App Store',
    screenAlt:
      'O ecrã Página inicial do WitnessWork: Ações rápidas com o Scribe AI, o relatório de serviço do mês e as revisitas de hoje.',
  },
  proof: {
    title: 'Apreciada no ministério',
    stats: [
      {
        value: '4,9',
        label: 'avaliação na App Store',
      },
      {
        value: '10 mil+',
        label: 'publicadores por mês',
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
    eyebrow: 'Porquê o WitnessWork',
    title: 'Menos contas de cabeça. Mais ministério.',
    body: 'O WitnessWork acompanha as suas horas, programações, revisitas e estudos bíblicos, para saber sempre como está a progredir e dar atenção às pessoas que ajuda.',
  },
  journey: {
    eyebrow: 'Um dia no serviço de campo',
    title: 'Um dia. Todos os dispositivos.',
    body: 'Da primeira visita à última, o WitnessWork acompanha-o.',
    steps: [
      {
        time: '08:48',
        title: 'Veja o que vem a seguir',
        body: 'A Seguir, no pulso, mostra-lhe a próxima revisita: quem, onde e sobre o que vai conversar.',
        alt: 'A Seguir no Apple Watch: uma revisita a Maria Santos às 10:30.',
      },
      {
        time: '09:30',
        title: 'Comece a manhã',
        body: 'A programação de hoje, as revisitas de hoje e o progresso do mês, tudo na Página inicial.',
        alt: 'O ecrã Página inicial do WitnessWork com as revisitas de hoje.',
      },
      {
        time: '10:30',
        title: 'Lembre-se de cada conversa',
        body: 'Registe a visita e marque a seguinte em segundos. Notas, estudos e seguimentos ficam juntos.',
        alt: 'A página de um contacto com a próxima visita, notas e histórico de conversas.',
      },
      {
        time: '16:00',
        title: 'Abra e veja mais',
        body: 'Abra o iPhone Duo e os seus contactos e o respetivo histórico ficam lado a lado.',
        alt: 'WitnessWork aberto no iPhone Duo com os contactos ao lado dos detalhes de um contacto.',
      },
      {
        time: '19:30',
        title: 'Reveja o dia',
        body: 'No iPad, consulte o mês e o ano de serviço e planeie as próximas semanas.',
        alt: 'WitnessWork no iPad na horizontal, com o progresso deste mês junto à barra lateral.',
      },
    ],
  },
  progress: {
    eyebrow: 'Progresso',
    title: 'Saiba sempre como está.',
    body: 'Veja as suas horas, estudos e objetivo num relance. O WitnessWork calcula **quanto precisa por dia** para terminar bem, conta corretamente as horas de crédito e LDC e envia o seu relatório com um toque.',
    month: 'Este mês',
    year: 'Este ano de serviço',
    alt: 'Progresso do mês: 45,8 de 50 horas, 1,5 horas por dia para atingir o objetivo e 4 estudos bíblicos.',
    yearAlt:
      'Ritmo do ano de serviço: 4,4 horas à frente, com um gráfico das horas registadas e programadas.',
  },
  plan: {
    eyebrow: 'Programação',
    title: 'Planeie o mês com um toque.',
    body: 'Escolha os dias em que sai e o Assistente **distribui o seu objetivo por eles**. Programações recorrentes, lembretes e os dias de serviço dos seus companheiros mantêm as semanas no caminho certo.',
    alt: 'O calendário da programação de outubro, com os dias concluídos a verde e os companheiros nos próximos dias.',
    detailAlt:
      'Uma manhã programada de testemunho com carrinho no sábado, com dois companheiros convidados.',
  },
  visits: {
    eyebrow: 'Revisitas',
    title: 'Nunca perca uma revisita.',
    body: 'Cada morador, nota e seguimento fica num só lugar, **numa lista ou num mapa**. O WitnessWork lembra-o de quem está na vez, para que ninguém seja esquecido.',
    note: {
      when: 'Hoje, 10:30',
      text: 'A lição 3 correu bem. Ela já está a ler as próximas lições e perguntou o que o Reino de Deus vai fazer. Na próxima vez: Daniel 2:44.',
      next: 'Próxima visita: quarta-feira, 10:30',
    },
    listAlt:
      'Contactos com seguimentos para hoje, estudos bíblicos e visitas recentes.',
    mapAlt: 'Revisitas como marcadores num mapa.',
  },
  scribe: {
    eyebrow: 'Scribe AI',
    title: 'Basta dizer.',
    body: 'Fale, escreva ou digitalize as suas notas. O Scribe AI transforma-as em tempo, programações, contactos e seguimentos. **Nada é adicionado até tocar em Adicionar.**',
    demo: {
      listening: 'A ouvir…',
      transcript:
        'Fiz uma hora e meia esta manhã. Programa duas horas amanhã às 9 com a Anna.',
      reply: 'Isto é o que vou adicionar:',
      cards: [
        {
          kind: 'Tempo',
          title: '1,5 h de serviço de campo',
          detail: 'Hoje',
        },
        {
          kind: 'Programação',
          title: '2 h às 09:00',
          detail: 'Amanhã · com a Anna',
        },
      ],
      add: 'Adicionar 2',
      added: 'Adicionado',
    },
    alt: 'Scribe AI a mostrar um cartão de tempo e um de programação, prontos para adicionar.',
  },
  buddies: {
    eyebrow: 'Companheiros',
    title: 'Saiam juntos.',
    body: 'Ligue-se a até cinco amigos com quem sai no serviço de campo. Vejam os dias que cada um programou, **convide-os para os seus** e saiba quem vai, com encriptação ponto a ponto no iPhone e Android.',
    alt: 'A página da companheira Anna Brooks, com os dias em que as duas saem nas próximas duas semanas.',
  },
  route: {
    eyebrow: 'Planeamento de rotas',
    title: 'O melhor caminho, por ordem.',
    body: 'Coloque as paragens do dia **pela ordem de condução mais rápida**, veja a que horas chega e comece na sua aplicação de mapas favorita.',
    alt: 'Uma rota com duas revisitas e as horas de chegada.',
  },
  delight: {
    eyebrow: 'Sequências, crachás e a sua mascote',
    title: 'Celebre os bons hábitos.',
    body: 'Mantenha a sua sequência, conquiste crachás que evoluem **de Bronze a Pérola** e cuide de um companheiro que o anima.',
    petAlt: 'O Leo, o leãozinho, no seu quarto.',
    badgesAlt:
      'Crachás conquistados por participar em cada mês e enviar relatórios.',
  },
  more: {
    title: 'E muito mais.',
    items: [
      {
        title: 'Widgets',
        body: 'As suas horas e o seu calendário no ecrã principal e no ecrã de bloqueio.',
      },
      {
        title: 'Siri e Atalhos',
        body: '“Adicionar tempo no WitnessWork.” Feito.',
      },
      {
        title: 'Quilometragem',
        body: 'Registe as viagens e veja a despesa de combustível do mês.',
      },
      {
        title: 'Bloqueio da aplicação',
        body: 'Proteja os seus registos com o rosto, a impressão digital ou o código.',
      },
      {
        title: 'Traga os seus dados',
        body: 'Importe do MyTime e de outras aplicações em minutos.',
      },
      {
        title: 'Sincronização do Calendário',
        body: 'Veja programações e seguimentos no seu calendário.',
      },
      {
        title: 'Cópia de segurança',
        body: 'Cópias encriptadas que só os seus dispositivos conseguem ler.',
      },
      {
        title: 'Notas avançadas',
        body: 'Formate as suas notas e adicione fotografias.',
      },
      {
        title: 'Torne-o seu',
        body: 'Reorganize a Página inicial, escolha os separadores e use o modo claro ou escuro.',
      },
      {
        title: 'Acessível',
        body: 'Texto maior e a negrito, além de suporte para leitores de ecrã.',
      },
    ],
    widgetAlt:
      'O widget de calendário do WitnessWork no ecrã principal, a mostrar as programações da semana.',
    appleOnly: 'iPhone e iPad',
  },
  devices: {
    eyebrow: 'Todos os dispositivos',
    title: 'Uma aplicação. Todos os ecrãs.',
    body: 'O WitnessWork sente-se em casa em cada ecrã que usa.',
    poses: {
      closed: 'Fechado',
      half: 'Meio aberto',
    },
    tabs: {
      iphone: {
        name: 'iPhone',
        title: 'Tudo no seu bolso.',
        body: 'Tempo, programações, contactos e progresso a um toque, com widgets e Siri integrados.',
      },
      ipad: {
        name: 'iPad',
        title: 'Espaço para planear.',
        body: 'Barra lateral, vistas lado a lado, atalhos de teclado e suporte para ponteiro fazem do planeamento um prazer.',
      },
      duo: {
        name: 'iPhone Duo',
        title: 'Desdobre o seu ministério.',
        body: 'Fechado, é o seu companheiro de bolso. Aberto, Contactos, Programação e Progresso estendem-se por duas colunas que se encontram na dobra.',
      },
      watch: {
        name: 'Apple Watch',
        title: 'O seu ministério num relance.',
        body: 'Veja as horas do mês, adicione tempo, use o cronómetro e consulte A Seguir diretamente do pulso.',
      },
      android: {
        name: 'Android',
        title: 'Igualmente bom no Android.',
        body: 'A mesma aplicação em telemóveis e tablets Android, com uma aplicação para Wear OS e sincronização pelo Google Drive.',
      },
    },
    ipadAlt: 'WitnessWork no iPad com a barra lateral e a programação.',
    duoClosedAlt: 'WitnessWork no ecrã exterior do iPhone Duo.',
    duoOpenAlt: 'WitnessWork aberto no iPhone Duo, em duas colunas.',
    watchAlt: 'WitnessWork no Apple Watch.',
    androidAlt: 'WitnessWork num telemóvel Android.',
  },
  sync: {
    eyebrow: 'Sincronização na Nuvem',
    title: 'Registe em qualquer lado. Veja em todos.',
    body: 'Adicione tempo no relógio ou faça programações no iPad, e tudo aparece no telemóvel logo depois, **mesmo entre iPhone e Android**. Só os seus dispositivos podem ler os dados.',
    demo: {
      added: '+2 h adicionadas',
      on: 'no Apple Watch',
      encrypted: 'Encriptado',
      month: 'Outubro',
      before: '45,8',
      after: '47,8',
      alt: 'Duas horas adicionadas no Apple Watch viajam encriptadas até ao iPhone, ao iPhone Duo, ao iPad e a um telemóvel Android, e cada um passa de 45,8 para 47,8 horas.',
    },
  },
  supporter: {
    included: 'Incluído com Apoiante.',
  },
  privacy: {
    eyebrow: 'Privacidade',
    title: 'Privada desde a conceção.',
    body: 'Os seus registos do ministério são pessoais. O WitnessWork trata-os como tal.',
    items: [
      {
        title: 'Sem registo. Sem anúncios.',
        body: 'A sua conta é anónima: sem e-mail, sem número de telefone e sem palavra-passe.',
      },
      {
        title: 'Guardado no seu dispositivo',
        body: 'Os seus registos ficam nos seus dispositivos, e é você quem decide se são sincronizados ou guardados numa cópia de segurança.',
      },
      {
        title: 'Encriptação ponto a ponto',
        body: 'Só os seus dispositivos podem ler os registos sincronizados e as cópias de segurança, e só os seus Companheiros podem ler o que partilha com eles.',
      },
      {
        title: 'Bloqueado quando quiser',
        body: 'Bloqueie o WitnessWork com o rosto, a impressão digital ou o código.',
      },
      {
        title: 'Retenção zero de dados',
        body: 'O Scribe AI só trabalha com fornecedores que não guardam o que lhes envia.',
      },
      {
        title: 'Código aberto',
        body: 'Qualquer pessoa pode ler o código do WitnessWork no GitHub.',
      },
    ],
  },
  languages: {
    eyebrow: 'Idiomas',
    title: 'Fala o seu idioma.',
    body: 'Disponível em 19 idiomas.',
  },
  pricing: {
    eyebrow: 'Preços',
    title: 'Tudo o que precisa. Grátis.',
    body: 'Sem anúncios, sem registo, sem condições escondidas. Todas as funcionalidades para o seu ministério são gratuitas para todos.',
    freeItems: [
      'Tempo e relatórios',
      'Objetivos e ritmo diário',
      'Revisitas e estudos bíblicos',
      'As suas visitas no mapa',
      'Programações e lembretes',
      'Companheiros',
      'Scribe AI com limite mensal',
      'Apple Watch e Wear OS',
      'Widgets e Siri no iPhone/iPad',
      'Cópia de segurança encriptada',
      'Sincronização do Calendário',
      'Sequências, crachás e a sua mascote',
    ],
    supporterTitle: 'Ser Apoiante é opcional.',
    supporterBody:
      'Se o WitnessWork ajuda no seu ministério, uma subscrição ajuda a manter a aplicação a funcionar. Como agradecimento, os Apoiantes recebem:',
    supporterItems: [
      'Sincronização entre todos os seus dispositivos',
      'A melhor rota do dia',
      'Mais Scribe AI',
      'Cores de destaque, e ícones da aplicação no iPhone e iPad',
      'O crachá de Apoiante',
    ],
    supporterNote:
      'Subscreva na aplicação para ver os preços do seu país. Cancele quando quiser.',
  },
  faq: {
    eyebrow: 'Perguntas frequentes',
    title: 'Dúvidas? Respostas.',
    more: 'Visite o Centro de Ajuda',
    open: 'Ler a resposta completa',
  },
  cta: {
    title: 'O seu ministério, no caminho certo.',
    body: 'Descarregue o WitnessWork grátis para iPhone, iPad, Apple Watch e Android.',
    qr: 'Digitalize para descarregar',
  },
  footer: {
    contact: 'Contacto',
    source: 'Código-fonte',
    privacy: 'Política de Privacidade',
    terms: 'Termos de Utilização',
    independent:
      'O WitnessWork é uma aplicação independente. Não é afiliada à Watch Tower Bible and Tract Society of Pennsylvania.',
    trademarks:
      'Apple, iPhone, iPad, Apple Watch, Face ID, Siri e iCloud são marcas comerciais da Apple Inc., registadas nos EUA e noutros países. App Store é uma marca de serviço da Apple Inc. Google Play, Android, Wear OS e Google Drive são marcas comerciais da Google LLC.',
  },
}

export default ptPT
