import type { LandingMessages } from './en-US'

/** Korean copy for the WitnessWork landing page. */
const koKR: LandingMessages = {
  meta: {
    title: 'WitnessWork: 여호와의 증인을 위한 야외 봉사 앱',
    description:
      '시간을 기록하고, 한 달을 계획하고, 모든 재방문을 기억하세요. 부담 없는 알림이 꾸준히 나아가도록 도와줘요. 무료로, 개인 정보를 지키면서, iPhone, iPad, Apple Watch, Android에서 19개 언어로 이용하세요.',
  },
  nav: {
    home: 'WitnessWork 홈',
    features: '기능',
    devices: '기기',
    privacy: '개인정보 보호',
    help: '도움말 센터',
    getApp: '앱 받기',
    menu: '메뉴',
    language: '언어',
    skip: '본문으로 건너뛰기',
    pause: '움직임 일시 정지',
  },
  store: {
    appStore: 'App Store에서 다운로드',
    googlePlay: 'Google Play에서 다운로드',
  },
  hero: {
    title: '봉사를 위해 만들었어요.',
    body: '시간, 계획, 재방문을 차분하고 안전한 한곳에 모으세요. 부담 없는 알림이 꾸준히 나아가도록 도와줘요.',
    note: '영원히 무료 · 광고 없음',
    rating: '4.9',
    ratingLabel: 'App Store 평점 700개 이상',
    screenAlt:
      'WitnessWork 홈 화면: Scribe AI가 있는 빠른 작업, 이번 달 봉사 보고, 오늘의 재방문.',
  },
  proof: {
    title: '봉사 현장에서 사랑받고 있어요',
    stats: [
      {
        value: '4.9',
        label: 'App Store 평점',
      },
      {
        value: '1만+',
        label: '매달 사용하는 전도인',
      },
      {
        value: '100+',
        label: '나라',
      },
      {
        value: '19',
        label: '언어',
      },
    ],
  },
  statement: {
    eyebrow: 'WitnessWork를 쓰는 이유',
    title: '계산은 덜, 봉사에 더.',
    body: 'WitnessWork가 시간, 계획, 재방문, 성서 연구를 챙겨 줘요. 늘 진행 상황을 알 수 있어서 도움을 주고 있는 사람들에게 마음을 쏟을 수 있죠.',
  },
  journey: {
    eyebrow: '봉사하는 하루',
    title: '하루 종일, 모든 기기에서.',
    body: '첫 방문부터 마지막 방문까지, WitnessWork가 함께합니다.',
    steps: [
      {
        time: '오전 8:48',
        title: '다음 일정 확인',
        body: '손목에서 다음 일정으로 다음 재방문을 확인하세요. 누구를, 어디서, 무엇을 이야기할지까지요.',
        alt: 'Apple Watch의 다음 일정: 오전 10:30 Maria Santos 재방문.',
      },
      {
        time: '오전 9:30',
        title: '아침을 시작해요',
        body: '오늘의 계획, 오늘의 재방문, 이번 달 진행 상황을 홈에서 한눈에.',
        alt: '오늘의 재방문이 있는 WitnessWork 홈 화면.',
      },
      {
        time: '오전 10:30',
        title: '모든 대화를 기억해요',
        body: '방문을 기록하고 다음 방문을 몇 초 만에 정하세요. 메모, 성서 연구, 다음 방문이 한곳에 모여요.',
        alt: '다음 방문, 메모, 대화 기록이 있는 연락처 페이지.',
      },
      {
        time: '오후 4:00',
        title: '펼치면 더 넓게',
        body: 'iPhone Duo를 펼치면 연락처와 지난 기록이 나란히 보여요.',
        alt: 'iPhone Duo를 펼쳐 연락처와 상세 정보를 나란히 보여 주는 WitnessWork.',
      },
      {
        time: '오후 7:30',
        title: '하루를 돌아봐요',
        body: 'iPad에서 이번 달과 봉사연도를 살펴보고 앞으로의 몇 주를 계획하세요.',
        alt: '가로 방향 iPad의 WitnessWork. 사이드바 옆에 이번 달 진행 상황이 표시되어 있어요.',
      },
    ],
  },
  progress: {
    eyebrow: '진행 상황',
    title: '지금 어디쯤인지 늘 알 수 있어요.',
    body: '시간, 성서 연구, 목표를 한눈에 확인하세요. WitnessWork가 목표를 잘 달성하도록 **하루에 필요한 시간**을 계산하고, 인정 시간과 건축봉사 시간도 올바르게 반영해 줘요. 보고도 한 번의 탭으로 보낼 수 있어요.',
    month: '이번 달',
    year: '이번 봉사 연도',
    alt: '이번 달 진행 상황: 50시간 중 45.8시간, 목표까지 하루 1.5시간, 성서 연구 4건.',
    yearAlt:
      '봉사연도 페이스: 4.4시간 앞서 있고, 기록한 시간과 계획한 시간 차트.',
  },
  plan: {
    eyebrow: '일정',
    title: '한 달 계획, 한 번이면 끝.',
    body: '봉사에 나가는 날을 고르면 어시스턴트가 **목표를 그 날들에 나누어** 줍니다. 반복 계획, 알림, 버디들의 봉사 일정이 매주를 순조롭게 해 줘요.',
    alt: '10월 일정 캘린더. 완료한 날은 초록색, 앞으로 올 날에는 버디가 표시되어 있어요.',
    detailAlt: '토요일 카트 봉사 계획. 버디 두 명을 초대했어요.',
  },
  visits: {
    eyebrow: '재방문',
    title: '재방문을 절대 놓치지 마세요.',
    body: '집주인, 메모, 다음 방문을 모두 한곳에서 **목록으로도 지도로도** 볼 수 있어요. 방문할 때가 된 사람을 알려 주니 아무도 잊지 않아요.',
    note: {
      when: '오늘 오전 10:30',
      text: '3과는 잘 마쳤다. 다음 내용도 미리 읽고 있고, 하느님의 왕국이 어떤 일을 할지 질문했다. 다음에는 다니엘 2:44.',
      next: '다음 방문: 수요일 오전 10:30',
    },
    listAlt: '오늘 다음 방문이 있는 연락처, 성서 연구, 최근 방문.',
    mapAlt: '지도에 핀으로 표시된 재방문.',
  },
  scribe: {
    eyebrow: 'Scribe AI',
    title: '그냥 말하세요.',
    body: '말하거나, 입력하거나, 메모를 스캔하세요. Scribe AI가 시간, 계획, 연락처, 다음 방문으로 정리해 줍니다. **추가를 누르기 전까지는 아무것도 추가되지 않아요.**',
    demo: {
      listening: '듣는 중…',
      transcript:
        '오늘 아침에 한 시간 반 했어요. 내일 9시에 Anna와 두 시간 계획을 넣어 주세요.',
      reply: '이렇게 추가할게요:',
      cards: [
        {
          kind: '시간',
          title: '봉사 1.5시간',
          detail: '오늘',
        },
        {
          kind: '계획',
          title: '오전 9:00부터 2시간',
          detail: '내일 · Anna와 함께',
        },
      ],
      add: '2개 추가',
      added: '추가됨',
    },
    alt: '시간 카드와 계획 카드를 추가할 준비가 된 Scribe AI.',
  },
  buddies: {
    eyebrow: '버디',
    title: '함께 나가요.',
    body: '함께 봉사하는 친구를 최대 다섯 명까지 연결하세요. 서로의 계획을 보고, **내 봉사 일정에 초대하고**, 누가 오는지 확인할 수 있어요. iPhone과 Android에서 종단 간 암호화로 안전하게 이용하세요.',
    alt: 'Anna Brooks 님의 버디 페이지. 앞으로 2주 동안 함께 나가는 날이 표시되어 있어요.',
  },
  route: {
    eyebrow: '경로 계획',
    title: '가장 좋은 경로를, 순서대로.',
    body: '그날 들를 곳을 **가장 빠른 운전 순서**로 정렬하고, 도착 시각을 확인한 뒤, 즐겨 쓰는 지도 앱에서 바로 출발하세요.',
    alt: '재방문 두 곳과 도착 시각이 있는 경로.',
  },
  delight: {
    eyebrow: '연속 기록, 배지, 반려동물',
    title: '충실한 습관을 기뻐해요.',
    body: '연속 기록을 이어 가고, **브론즈에서 펄까지** 성장하는 배지를 모으고, 응원해 주는 반려동물을 키워 보세요.',
    petAlt: '자기 방에 있는 아기 사자 Leo.',
    badgesAlt: '매달 봉사하고 보고를 보내서 받은 배지.',
  },
  more: {
    title: '그 밖에도 정말 많아요.',
    items: [
      {
        title: '위젯',
        body: '홈 화면과 잠금 화면에서 시간과 캘린더를 확인하세요.',
      },
      {
        title: 'Siri와 단축어',
        body: '“WitnessWork에서 시간 추가해 줘.” 끝.',
      },
      {
        title: '주행 거리',
        body: '이동을 기록하고 이번 달 연료비를 확인하세요.',
      },
      {
        title: '앱 잠금',
        body: '얼굴, 지문 또는 암호로 기록을 지키세요.',
      },
      {
        title: '내 데이터 가져오기',
        body: 'MyTime 등 다른 앱의 데이터를 몇 분 만에 가져와요.',
      },
      {
        title: '캘린더 동기화',
        body: '계획과 다음 방문을 캘린더에서 확인하세요.',
      },
      {
        title: '백업',
        body: '내 기기만 읽을 수 있는 암호화 백업.',
      },
      {
        title: '서식 있는 메모',
        body: '메모를 꾸미고 사진도 넣을 수 있어요.',
      },
      {
        title: '나만의 앱으로',
        body: '홈 순서 바꾸기, 탭 고르기, 밝게 또는 어둡게 선택.',
      },
      {
        title: '손쉬운 사용',
        body: '더 크고 굵은 텍스트와 화면 읽기 프로그램을 지원해요.',
      },
    ],
    widgetAlt: '홈 화면에 놓은 WitnessWork 캘린더 위젯. 이번 주 계획이 보여요.',
    appleOnly: 'iPhone·iPad',
  },
  devices: {
    eyebrow: '모든 기기',
    title: '앱 하나. 모든 화면.',
    body: 'WitnessWork는 사용하는 모든 화면에 자연스럽게 어울려요.',
    poses: {
      closed: '접힘',
      half: '반만 펼침',
    },
    tabs: {
      iphone: {
        name: 'iPhone',
        title: '모든 것을 주머니 속에.',
        body: '시간, 계획, 연락처, 진행 상황이 한 번 누르면 바로 열려요. 위젯과 Siri도 기본 제공돼요.',
      },
      ipad: {
        name: 'iPad',
        title: '계획하기에 넉넉한 공간.',
        body: '사이드바, 나란히 보기, 키보드 단축키, 포인터 지원으로 계획이 즐거워져요.',
      },
      duo: {
        name: 'iPhone Duo',
        title: '봉사를 펼쳐 보세요.',
        body: '접으면 주머니 속 동반자. 펼치면 연락처, 일정, 진행 상황이 접힌 부분에 맞춰 두 열로 펼쳐져요.',
      },
      watch: {
        name: 'Apple Watch',
        title: '봉사를 한눈에.',
        body: '손목에서 이번 달 시간을 보고, 시간을 추가하고, 타이머를 켜고, 다음 일정을 확인하세요.',
      },
      android: {
        name: 'Android',
        title: 'Android에서도 똑같이 좋아요.',
        body: 'Android 휴대폰과 태블릿에서도 같은 앱을 쓸 수 있고, Wear OS 앱과 Google Drive 동기화도 지원해요.',
      },
    },
    ipadAlt: '사이드바와 일정이 있는 iPad의 WitnessWork.',
    duoClosedAlt: 'iPhone Duo 바깥쪽 디스플레이의 WitnessWork.',
    duoOpenAlt: 'iPhone Duo를 펼쳐 두 열로 보여 주는 WitnessWork.',
    watchAlt: 'Apple Watch의 WitnessWork.',
    androidAlt: 'Android 휴대폰의 WitnessWork.',
  },
  sync: {
    eyebrow: '클라우드 동기화',
    title: '어디서나 기록하고, 어디서나 확인하세요.',
    body: '시계에서 시간을 추가하거나 iPad에서 계획하면 잠시 후 휴대폰에도 표시돼요. **iPhone과 Android 사이에서도요**. 데이터를 읽을 수 있는 건 내 기기뿐이에요.',
    demo: {
      added: '+2시간 추가됨',
      on: 'Apple Watch에서',
      encrypted: '암호화됨',
      month: '10월',
      before: '45.8',
      after: '47.8',
      alt: 'Apple Watch에서 추가한 2시간이 암호화되어 iPhone, iPhone Duo, iPad, Android 휴대폰으로 전달되고, 각 기기가 45.8시간에서 47.8시간으로 업데이트되는 모습.',
    },
  },
  supporter: {
    included: '서포터에 포함되어 있어요.',
  },
  privacy: {
    eyebrow: '개인정보 보호',
    title: '처음부터 비공개로 설계했어요.',
    body: '봉사 기록은 개인적인 것입니다. WitnessWork는 그렇게 다룹니다.',
    items: [
      {
        title: '가입 없음. 광고 없음.',
        body: '계정은 익명이에요. 이메일, 전화번호, 비밀번호가 필요 없어요.',
      },
      {
        title: '내 기기에 보관',
        body: '기록은 내 기기에 있고, 동기화나 백업 여부는 내가 정해요.',
      },
      {
        title: '종단 간 암호화',
        body: '동기화하거나 백업한 기록은 내 기기만 읽을 수 있고, 버디와 공유한 내용은 그 버디만 읽을 수 있어요.',
      },
      {
        title: '원할 때 잠그기',
        body: '얼굴, 지문 또는 암호로 WitnessWork를 잠그세요.',
      },
      {
        title: '데이터 보관 없음',
        body: 'Scribe AI는 보낸 내용을 저장하지 않는 제공업체와만 작동해요.',
      },
      {
        title: '오픈 소스',
        body: '누구나 GitHub에서 WitnessWork의 코드를 읽을 수 있어요.',
      },
    ],
  },
  languages: {
    eyebrow: '언어',
    title: '내 언어로 말해요.',
    body: '19개 언어로 이용할 수 있어요.',
  },
  pricing: {
    eyebrow: '요금',
    title: '필요한 모든 것을, 무료로.',
    body: '광고도, 가입도, 숨은 조건도 없어요. 봉사에 필요한 모든 기능이 누구에게나 무료예요.',
    freeItems: [
      '시간과 보고',
      '목표와 하루 페이스',
      '재방문과 성서 연구',
      '지도에서 보는 방문지',
      '계획과 알림',
      '버디',
      '월 한도가 있는 Scribe AI',
      'Apple Watch와 Wear OS',
      'iPhone·iPad의 위젯과 Siri',
      '암호화된 백업',
      '캘린더 동기화',
      '연속 기록, 배지, 반려동물',
    ],
    supporterTitle: '서포터는 선택 사항이에요.',
    supporterBody:
      'WitnessWork가 봉사에 도움이 된다면, 구독으로 앱이 계속 운영되도록 도울 수 있어요. 감사의 마음을 담아 서포터에게는 다음 기능을 드려요.',
    supporterItems: [
      '모든 기기에서 동기화',
      '그날의 최적 경로',
      '더 많은 Scribe AI',
      '강조 색상과 iPhone·iPad 앱 아이콘',
      '서포터 배지',
    ],
    supporterNote:
      '앱에서 구독하면 내 나라의 가격을 볼 수 있어요. 언제든 취소할 수 있어요.',
  },
  faq: {
    eyebrow: '자주 묻는 질문',
    title: '궁금한 점, 답해 드려요.',
    more: '도움말 센터 방문하기',
    open: '전체 답변 읽기',
  },
  cta: {
    title: '봉사를, 꾸준히 순조롭게.',
    body: 'iPhone, iPad, Apple Watch, Android용 WitnessWork를 무료로 다운로드하세요.',
    qr: '스캔해서 다운로드',
  },
  footer: {
    contact: '문의',
    source: '소스 코드',
    privacy: '개인정보 처리방침',
    terms: '이용약관',
    independent:
      'WitnessWork는 독립적인 앱이며 Watch Tower Bible and Tract Society of Pennsylvania와 관련이 없습니다.',
    trademarks:
      'Apple, iPhone, iPad, Apple Watch, Face ID, Siri, iCloud는 미국 및 기타 국가에서 등록된 Apple Inc.의 상표입니다. App Store는 Apple Inc.의 서비스 마크입니다. Google Play, Android, Wear OS, Google Drive는 Google LLC의 상표입니다.',
  },
}

export default koKR
