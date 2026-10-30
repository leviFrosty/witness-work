import type { LandingMessages } from './en-US'

/** Portuguese (Brazil) copy for the WitnessWork landing page. */
const ptBR: LandingMessages = {
  meta: {
    title: 'WitnessWork: o app de serviço de campo para Testemunhas de Jeová',
    description:
      'Registre seu tempo, planeje o mês e lembre de cada revisita, com lembretes discretos para manter o ritmo. Grátis, privado e em 19 idiomas no iPhone, iPad, Apple Watch e Android.',
  },
  nav: {
    home: 'Página inicial do WitnessWork',
    features: 'Recursos',
    devices: 'Dispositivos',
    privacy: 'Privacidade',
    help: 'Centro de Ajuda',
    getApp: 'Baixar o app',
    menu: 'Menu',
    language: 'Idioma',
    skip: 'Ir para o conteúdo',
    pause: 'Pausar o movimento',
  },
  store: {
    appStore: 'Baixe na App Store',
    googlePlay: 'Disponível no Google Play',
  },
  hero: {
    title: 'Feito para o ministério.',
    body: 'Seu tempo, seus planos e suas revisitas num só lugar tranquilo e privado, com lembretes discretos para manter o ritmo.',
    note: 'Grátis para sempre · Sem anúncios',
    rating: '4,9',
    ratingLabel: 'em mais de 700 avaliações na App Store',
    screenAlt:
      'A tela Início do WitnessWork: Ações rápidas com Scribe AI, o relatório de serviço do mês e as revisitas de hoje.',
  },
  proof: {
    title: 'Querido no ministério',
    stats: [
      {
        value: '4,9',
        label: 'nota na App Store',
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
    eyebrow: 'Por que o WitnessWork',
    title: 'Menos conta de cabeça. Mais ministério.',
    body: 'O WitnessWork acompanha suas horas, planos, revisitas e estudos bíblicos, para você sempre saber como está indo e dar atenção às pessoas que ajuda.',
  },
  journey: {
    eyebrow: 'Um dia no serviço de campo',
    title: 'Um dia. Todos os dispositivos.',
    body: 'Da primeira visita à última, o WitnessWork acompanha você.',
    steps: [
      {
        time: '08:48',
        title: 'Veja o que vem a seguir',
        body: 'A seguir, no seu pulso, mostra sua próxima revisita: quem, onde e sobre o que você vai conversar.',
        alt: 'A seguir no Apple Watch: uma revisita a Maria Santos às 10:30.',
      },
      {
        time: '09:30',
        title: 'Comece a manhã',
        body: 'O plano de hoje, as revisitas de hoje e o progresso do mês, tudo em Início.',
        alt: 'A tela Início do WitnessWork com as revisitas de hoje.',
      },
      {
        time: '10:30',
        title: 'Lembre de cada conversa',
        body: 'Registre a visita e marque a próxima em segundos. Anotações, estudos e acompanhamentos ficam juntos.',
        alt: 'A página de um contato com a próxima visita, anotações e histórico de conversas.',
      },
      {
        time: '16:00',
        title: 'Abra e veja mais',
        body: 'Abra o iPhone Duo e seus contatos e o histórico deles aparecem lado a lado.',
        alt: 'WitnessWork aberto no iPhone Duo com os contatos ao lado dos detalhes de um contato.',
      },
      {
        time: '19:30',
        title: 'Reveja o dia',
        body: 'No iPad, confira o mês e o ano de serviço e planeje as próximas semanas.',
        alt: 'WitnessWork no iPad na horizontal, com o progresso deste mês ao lado da barra lateral.',
      },
    ],
  },
  progress: {
    eyebrow: 'Progresso',
    title: 'Saiba sempre como você está.',
    body: 'Veja suas horas, estudos e alvo num relance. O WitnessWork calcula **quanto falta por dia** para você terminar bem, conta corretamente as horas de crédito e LDC e envia seu relatório com um toque.',
    month: 'Este mês',
    year: 'Este ano de serviço',
    alt: 'Progresso do mês: 45,8 de 50 horas, 1,5 hora por dia para chegar ao alvo e 4 estudos bíblicos.',
    yearAlt:
      'Ritmo do ano de serviço: 4,4 horas à frente, com um gráfico das horas registradas e planejadas.',
  },
  plan: {
    eyebrow: 'Agenda',
    title: 'Planeje o mês com um toque.',
    body: 'Escolha os dias em que você sai e o Assistente **distribui seu alvo entre eles**. Planos recorrentes, lembretes e os dias de serviço dos seus Buddies mantêm as semanas no rumo.',
    alt: 'A agenda de outubro, com os dias concluídos em verde e os buddies nos próximos dias.',
    detailAlt:
      'Uma manhã planejada de testemunho com carrinho no sábado, com dois buddies convidados.',
  },
  visits: {
    eyebrow: 'Revisitas',
    title: 'Nunca perca uma revisita.',
    body: 'Cada morador, anotação e acompanhamento fica num só lugar, **em lista ou no mapa**. O WitnessWork lembra quem está na vez, para que ninguém seja esquecido.',
    note: {
      when: 'Hoje, 10h30',
      text: 'A lição 3 foi bem. Ela está lendo as próximas lições e perguntou o que o Reino de Deus vai fazer. Na próxima vez: Daniel 2:44.',
      next: 'Próxima visita: quarta-feira, 10h30',
    },
    listAlt:
      'Contatos com acompanhamentos para hoje, estudos bíblicos e visitas recentes.',
    mapAlt: 'Revisitas como marcadores no mapa.',
  },
  scribe: {
    eyebrow: 'Scribe AI',
    title: 'É só falar.',
    body: 'Fale, digite ou escaneie suas anotações. O Scribe AI transforma tudo em tempo, planos, contatos e acompanhamentos. **Nada é adicionado até você tocar em Adicionar.**',
    demo: {
      listening: 'Ouvindo…',
      transcript:
        'Fiz uma hora e meia hoje de manhã. Planeje duas horas amanhã às 9 com a Anna.',
      reply: 'Isto é o que vou adicionar:',
      cards: [
        {
          kind: 'Tempo',
          title: '1,5 h de serviço de campo',
          detail: 'Hoje',
        },
        {
          kind: 'Plano',
          title: '2 h às 09:00',
          detail: 'Amanhã · com a Anna',
        },
      ],
      add: 'Adicionar 2',
      added: 'Adicionado',
    },
    alt: 'Scribe AI mostrando um cartão de tempo e um de plano, prontos para adicionar.',
  },
  buddies: {
    eyebrow: 'Buddies',
    title: 'Saiam juntos.',
    body: 'Conecte-se com até cinco amigos com quem você sai no campo. Vejam os dias que cada um planejou, **convide-os para os seus** e saiba quem vai, com criptografia de ponta a ponta no iPhone e Android.',
    alt: 'A página da buddy Anna Brooks, com os dias em que vocês duas saem nas próximas duas semanas.',
  },
  route: {
    eyebrow: 'Planejamento de rotas',
    title: 'O melhor caminho, em ordem.',
    body: 'Coloque as paradas do dia **na ordem de direção mais rápida**, veja a que horas você chega e comece no seu app de mapas favorito.',
    alt: 'Uma rota com duas revisitas e os horários de chegada.',
  },
  delight: {
    eyebrow: 'Sequências, emblemas e seu mascote',
    title: 'Celebre os bons hábitos.',
    body: 'Mantenha sua sequência, conquiste emblemas que evoluem **de Bronze a Pérola** e cuide de um companheiro que torce por você.',
    petAlt: 'Leo, o filhote de leão, no quarto dele.',
    badgesAlt:
      'Emblemas conquistados por participar a cada mês e enviar relatórios.',
  },
  more: {
    title: 'E muito mais.',
    items: [
      {
        title: 'Widgets',
        body: 'Suas horas e seu calendário na Tela Inicial e na Tela Bloqueada.',
      },
      {
        title: 'Siri e Atalhos',
        body: '“Adicionar tempo no WitnessWork.” Pronto.',
      },
      {
        title: 'Quilometragem',
        body: 'Registre viagens e veja o gasto com combustível do mês.',
      },
      {
        title: 'Bloqueio do app',
        body: 'Proteja seus registros com o rosto, a digital ou o código.',
      },
      {
        title: 'Traga seus dados',
        body: 'Importe do MyTime e de outros apps em minutos.',
      },
      {
        title: 'Sincronização do Calendário',
        body: 'Veja planos e acompanhamentos no seu calendário.',
      },
      {
        title: 'Cópia de segurança',
        body: 'Cópias criptografadas que só os seus dispositivos conseguem ler.',
      },
      {
        title: 'Anotações ricas',
        body: 'Formate suas anotações e adicione fotos.',
      },
      {
        title: 'Deixe com a sua cara',
        body: 'Reorganize o Início, escolha as abas e use o modo claro ou escuro.',
      },
      {
        title: 'Acessível',
        body: 'Texto maior e em negrito, além de suporte a leitores de tela.',
      },
    ],
    widgetAlt:
      'O widget de calendário do WitnessWork na Tela Inicial, mostrando os planos da semana.',
    appleOnly: 'iPhone e iPad',
  },
  devices: {
    eyebrow: 'Todos os dispositivos',
    title: 'Um app. Todas as telas.',
    body: 'O WitnessWork se sente em casa em cada tela que você usa.',
    poses: {
      closed: 'Fechado',
      half: 'Meio aberto',
    },
    tabs: {
      iphone: {
        name: 'iPhone',
        title: 'Tudo no seu bolso.',
        body: 'Tempo, planos, contatos e progresso a um toque, com widgets e Siri integrados.',
      },
      ipad: {
        name: 'iPad',
        title: 'Espaço para planejar.',
        body: 'Barra lateral, telas lado a lado, atalhos de teclado e suporte a ponteiro fazem do planejamento um prazer.',
      },
      duo: {
        name: 'iPhone Duo',
        title: 'Desdobre seu ministério.',
        body: 'Fechado, é o seu companheiro de bolso. Aberto, Contatos, Agenda e Progresso se espalham em duas colunas que se encontram na dobra.',
      },
      watch: {
        name: 'Apple Watch',
        title: 'Seu ministério num relance.',
        body: 'Veja as horas do mês, adicione tempo, use o cronômetro e confira o A seguir direto do pulso.',
      },
      android: {
        name: 'Android',
        title: 'Tão bom quanto no Android.',
        body: 'O mesmo app em celulares e tablets Android, com um app para Wear OS e sincronização pelo Google Drive.',
      },
    },
    ipadAlt: 'WitnessWork no iPad com a barra lateral e a agenda.',
    duoClosedAlt: 'WitnessWork na tela externa do iPhone Duo.',
    duoOpenAlt: 'WitnessWork aberto no iPhone Duo, em duas colunas.',
    watchAlt: 'WitnessWork no Apple Watch.',
    androidAlt: 'WitnessWork em um celular Android.',
  },
  sync: {
    eyebrow: 'Sincronização na nuvem',
    title: 'Registre em qualquer lugar. Veja em todos.',
    body: 'Adicione tempo pelo relógio ou planeje no iPad, e tudo aparece no celular logo depois, **até entre iPhone e Android**. Só os seus dispositivos podem ler os dados.',
    demo: {
      added: '+2 h adicionadas',
      on: 'no Apple Watch',
      encrypted: 'Criptografado',
      month: 'Outubro',
      before: '45,8',
      after: '47,8',
      alt: 'Duas horas adicionadas no Apple Watch viajam criptografadas até o iPhone, o iPhone Duo, o iPad e um celular Android, e cada um passa de 45,8 para 47,8 horas.',
    },
  },
  supporter: {
    included: 'Incluído com Apoiador.',
  },
  privacy: {
    eyebrow: 'Privacidade',
    title: 'Privado desde o projeto.',
    body: 'Seus registros do ministério são pessoais. O WitnessWork os trata assim.',
    items: [
      {
        title: 'Sem cadastro. Sem anúncios.',
        body: 'Sua conta é anônima: sem e-mail, sem telefone e sem senha.',
      },
      {
        title: 'Guardado no seu dispositivo',
        body: 'Seus registros ficam nos seus dispositivos, e você decide se eles são sincronizados ou ganham cópia de segurança.',
      },
      {
        title: 'Criptografia de ponta a ponta',
        body: 'Só os seus dispositivos podem ler seus registros sincronizados e cópias de segurança, e só os seus Buddies podem ler o que você compartilha com eles.',
      },
      {
        title: 'Bloqueado quando você quiser',
        body: 'Bloqueie o WitnessWork com o rosto, a digital ou o código.',
      },
      {
        title: 'Retenção zero de dados',
        body: 'O Scribe AI só trabalha com provedores que não guardam o que você envia.',
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
    title: 'Tudo o que você precisa. Grátis.',
    body: 'Sem anúncios, sem cadastro, sem pegadinhas. Todos os recursos para o seu ministério são grátis para todos.',
    freeItems: [
      'Tempo e relatórios',
      'Alvos e ritmo diário',
      'Revisitas e estudos bíblicos',
      'Suas visitas no mapa',
      'Planos e lembretes',
      'Buddies',
      'Scribe AI com limite mensal',
      'Apple Watch e Wear OS',
      'Widgets e Siri no iPhone/iPad',
      'Backup criptografado',
      'Sincronização do Calendário',
      'Sequências, emblemas e seu mascote',
    ],
    supporterTitle: 'Ser Apoiador é opcional.',
    supporterBody:
      'Se o WitnessWork ajuda no seu ministério, uma assinatura ajuda a manter o app funcionando. Como agradecimento, os Apoiadores recebem:',
    supporterItems: [
      'Sincronização entre todos os seus dispositivos',
      'A melhor rota do dia',
      'Mais Scribe AI',
      'Cores de destaque, e ícones do app no iPhone e iPad',
      'O emblema de Apoiador',
    ],
    supporterNote:
      'Assine no app para ver os preços do seu país. Cancele quando quiser.',
  },
  faq: {
    eyebrow: 'Perguntas frequentes',
    title: 'Dúvidas? Respostas.',
    more: 'Visite o Centro de Ajuda',
    open: 'Ler a resposta completa',
  },
  cta: {
    title: 'Seu ministério, no rumo certo.',
    body: 'Baixe o WitnessWork grátis para iPhone, iPad, Apple Watch e Android.',
    qr: 'Escaneie para baixar',
  },
  footer: {
    contact: 'Contato',
    source: 'Código-fonte',
    privacy: 'Política de Privacidade',
    terms: 'Termos de Uso',
    independent:
      'O WitnessWork é um app independente. Não é afiliado à Watch Tower Bible and Tract Society of Pennsylvania.',
    trademarks:
      'Apple, iPhone, iPad, Apple Watch, Face ID, Siri e iCloud são marcas comerciais da Apple Inc., registradas nos EUA e em outros países. App Store é uma marca de serviço da Apple Inc. Google Play, Android, Wear OS e Google Drive são marcas comerciais da Google LLC.',
  },
}

export default ptBR
