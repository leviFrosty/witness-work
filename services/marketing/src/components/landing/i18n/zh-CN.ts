import type { LandingMessages } from './en-US'

/** Simplified Chinese copy for the WitnessWork landing page. */
const zhCN: LandingMessages = {
  meta: {
    title: 'WitnessWork：为耶和华见证人设计的传道应用',
    description:
      '记录时数、规划整月、记住每一次续访，贴心提醒帮你稳步前进。免费、注重隐私，支持19种语言，适用于iPhone、iPad、Apple Watch和Android。',
  },
  nav: {
    home: 'WitnessWork 首页',
    features: '功能',
    devices: '设备',
    privacy: '隐私',
    help: '帮助中心',
    getApp: '获取应用',
    menu: '菜单',
    language: '语言',
    skip: '跳到正文',
    pause: '暂停动画',
  },
  store: {
    appStore: '在 App Store 下载',
    googlePlay: '在 Google Play 获取',
  },
  hero: {
    title: '为传道而设计。',
    body: '时数、计划和续访，安心收在一处。保护隐私，也用贴心提醒帮你稳步前进。',
    note: '永久免费 · 没有广告',
    rating: '4.9',
    ratingLabel: '来自 700 多个 App Store 评分',
    screenAlt:
      'WitnessWork 的主页：含 Scribe AI 的快捷操作、本月传道报告和今天的续访。',
  },
  proof: {
    title: '深受传道员喜爱',
    stats: [
      {
        value: '4.9',
        label: 'App Store 评分',
      },
      {
        value: '1万+',
        label: '每月使用的传道员',
      },
      {
        value: '100+',
        label: '个国家',
      },
      {
        value: '19',
        label: '种语言',
      },
    ],
  },
  statement: {
    eyebrow: '为什么选择 WitnessWork',
    title: '少算一点，多传道。',
    body: 'WitnessWork帮你统计时数，跟进计划、续访和圣经研读，让你随时清楚自己的进度，把心思放在你帮助的人身上。',
  },
  journey: {
    eyebrow: '传道的一天',
    title: '一天时间，所有设备。',
    body: '从第一次拜访到最后一次，WitnessWork 都与你同行。',
    steps: [
      {
        time: '上午8:48',
        title: '看看接下来的安排',
        body: '手腕上的“接下来”会显示下一次续访：访问谁、在哪里、谈什么。',
        alt: 'Apple Watch 上的“接下来”：上午10:30拜访 Maria Santos 的续访。',
      },
      {
        time: '上午9:30',
        title: '开启早晨',
        body: '今天的计划、今天的续访和本月进度，全都在主页上。',
        alt: 'WitnessWork 的主页，显示今天的续访。',
      },
      {
        time: '上午10:30',
        title: '记住每一次交谈',
        body: '几秒钟就能记录这次拜访并安排下一次。笔记、圣经研读和跟进都集中在一起。',
        alt: '联系人页面，显示下一次拜访、笔记和交谈记录。',
      },
      {
        time: '下午4:00',
        title: '展开，看得更多',
        body: '展开 iPhone Duo，联系人和他们的往来记录就并排显示。',
        alt: 'iPhone Duo 展开后，WitnessWork 把联系人和详情并排显示。',
      },
      {
        time: '下午7:30',
        title: '回顾这一天',
        body: '在 iPad 上查看本月和服务年度的情况，再规划接下来的几周。',
        alt: '横向显示的iPad上的WitnessWork，侧边栏旁显示本月进度。',
      },
    ],
  },
  progress: {
    eyebrow: '进度',
    title: '随时清楚自己的进度。',
    body: '时数、圣经研读和目标一目了然。WitnessWork会算出**每天需要多少时间**才能顺利完成目标，正确计入可抵算的时数和LDC活动时数，还能一键发送报告。',
    month: '本月',
    year: '本传道工作年度',
    alt: '本月进度：50 小时中已完成 45.8 小时，每天 1.5 小时即可达成目标，圣经研读 4 个。',
    yearAlt: '服务年度进度：领先 4.4 小时，图表显示已记录和已计划的时数。',
  },
  plan: {
    eyebrow: '计划',
    title: '轻轻一点，规划整月。',
    body: '选出你外出传道的日子，助理会**把目标分摊到这些日子**。定期计划、提醒和同伴的传道安排，帮你稳稳走好每一周。',
    alt: '10月的计划日历：已完成的日子标为绿色，之后的日子显示同伴。',
    detailAlt: '星期六上午用移动书架传道的计划，已邀请两位同伴。',
  },
  visits: {
    eyebrow: '续访',
    title: '不再漏掉任何一次续访。',
    body: '每位住户、每条笔记和每次跟进都在同一个地方，**可看列表，也可看地图**。WitnessWork 会提醒你该去看谁，不会有人被遗忘。',
    note: {
      when: '今天 10:30',
      text: '第3课进行得很顺利。她正提前阅读后面的内容，还问上帝的王国会成就什么。下次：但以理书2:44。',
      next: '下次拜访：星期三 10:30',
    },
    listAlt: '联系人列表：今天要跟进的人、圣经研读和最近的拜访。',
    mapAlt: '地图上以图钉标出的续访。',
  },
  scribe: {
    eyebrow: 'Scribe AI',
    title: '说一句就够了。',
    body: '说出来、打出来或扫描你的笔记，Scribe AI 就会把它们整理成时数、计划、联系人和跟进。**你点“添加”之前，什么都不会加入。**',
    demo: {
      listening: '正在聆听…',
      transcript: '我今天上午传道了一个半小时。明天9点和 Anna 安排两小时。',
      reply: '我会添加以下内容：',
      cards: [
        {
          kind: '时数',
          title: '传道 1.5 小时',
          detail: '今天',
        },
        {
          kind: '计划',
          title: '上午9:00起 2 小时',
          detail: '明天 · 与 Anna 一起',
        },
      ],
      add: '添加 2 项',
      added: '已添加',
    },
    alt: 'Scribe AI 显示一张时数卡片和一张计划卡片，可以添加。',
  },
  buddies: {
    eyebrow: '同伴',
    title: '一起外出传道。',
    body: '和最多五位一起传道的朋友建立联系。查看彼此计划传道的日子，**邀请他们加入你的安排**，知道谁会参加。在iPhone和Android上都采用端到端加密。',
    alt: 'Anna Brooks 的同伴页面，显示未来两周你们都会外出的日子。',
  },
  route: {
    eyebrow: '路线规划',
    title: '最佳路线，按序前往。',
    body: '把一天要去的地方按**最快的驾车顺序**排好，查看到达时间，再用你喜欢的地图应用出发。',
    alt: '一条路线，包含两次续访和到达时间。',
  },
  delight: {
    eyebrow: '连续记录、徽章和宠物',
    title: '为坚持不懈而欢庆。',
    body: '保持你的连续记录，赢得从**铜级到珍珠级**不断升级的徽章，还能养一只为你加油的小伙伴。',
    petAlt: '待在自己房间里的小狮子 Leo。',
    badgesAlt: '因每月参加传道和提交报告而获得的徽章。',
  },
  more: {
    title: '还有更多。',
    items: [
      {
        title: '小工具',
        body: '在主屏幕和锁定屏幕上查看你的时数和日历。',
      },
      {
        title: 'Siri 和快捷指令',
        body: '“在 WitnessWork 里添加时间。”搞定。',
      },
      {
        title: '里程',
        body: '记录行程，查看本月的油费。',
      },
      {
        title: '应用锁',
        body: '用面容、指纹或密码守护你的记录。',
      },
      {
        title: '导入你的数据',
        body: '几分钟内就能从 MyTime 和其他应用导入。',
      },
      {
        title: '日历同步',
        body: '在日历里查看计划和跟进。',
      },
      {
        title: '备份',
        body: '加密备份，只有你的设备才能读取。',
      },
      {
        title: '丰富的笔记',
        body: '为笔记设置格式，还能添加照片。',
      },
      {
        title: '按你的喜好',
        body: '重新排列主页、选择标签页，并选用浅色或深色。',
      },
      {
        title: '无障碍',
        body: '支持更大的字体、粗体文本和屏幕阅读器。',
      },
    ],
    widgetAlt: '主屏幕上的 WitnessWork 日历小工具，显示本周的计划。',
    appleOnly: 'iPhone 和 iPad',
  },
  devices: {
    eyebrow: '所有设备',
    title: '一个应用，所有屏幕。',
    body: '每一块屏幕，WitnessWork都自在融入。',
    poses: {
      closed: '合上',
      half: '半开',
    },
    tabs: {
      iphone: {
        name: 'iPhone',
        title: '一切尽在口袋里。',
        body: '时数、计划、联系人和进度一点即达，内置小工具和 Siri。',
      },
      ipad: {
        name: 'iPad',
        title: '有空间好好规划。',
        body: '侧边栏、并排视图、键盘快捷键和指针支持，让规划成为乐事。',
      },
      duo: {
        name: 'iPhone Duo',
        title: '展开你的传道工作。',
        body: '合上时是口袋里的好帮手；展开后，联系人、计划和进度会铺成贴合折痕的两栏。',
      },
      watch: {
        name: 'Apple Watch',
        title: '传道情况，一眼尽览。',
        body: '在手腕上查看本月时数、添加时间、启动计时器，还能看“接下来”的安排。',
      },
      android: {
        name: 'Android',
        title: '在 Android 上同样出色。',
        body: '同一个应用，适用于 Android 手机和平板，还有 Wear OS 应用和 Google Drive 同步。',
      },
    },
    ipadAlt: 'iPad 上的 WitnessWork，显示侧边栏和计划。',
    duoClosedAlt: 'WitnessWork 显示在 iPhone Duo 的外屏上。',
    duoOpenAlt: 'iPhone Duo 展开后，WitnessWork 以两栏显示。',
    watchAlt: 'Apple Watch 上的 WitnessWork。',
    androidAlt: 'Android 手机上的 WitnessWork。',
  },
  sync: {
    eyebrow: '云同步',
    title: '随处记录，随处查看。',
    body: '在手表上添加时数，或在iPad上制定计划，转眼就能在手机上看到，**iPhone和Android之间也能同步**。只有你的设备能读取数据。',
    demo: {
      added: '已添加 +2 小时',
      on: '来自 Apple Watch',
      encrypted: '已加密',
      month: '10月',
      before: '45.8',
      after: '47.8',
      alt: '在 Apple Watch 上添加的 2 小时经加密传到 iPhone、iPhone Duo、iPad 和一部 Android 手机，每台设备都从 45.8 小时更新为 47.8 小时。',
    },
  },
  supporter: {
    included: '支持者方案已包含。',
  },
  privacy: {
    eyebrow: '隐私',
    title: '从设计起就注重隐私。',
    body: '你的传道记录属于个人隐私，WitnessWork 也这样对待。',
    items: [
      {
        title: '无需注册，没有广告。',
        body: '你的账户是匿名的：不需要邮箱、手机号码或密码。',
      },
      {
        title: '保存在你的设备上',
        body: '你的记录保存在你的设备上，是否同步或备份由你决定。',
      },
      {
        title: '端到端加密',
        body: '同步和备份的记录只有你的设备能读取，你与同伴分享的内容也只有他们能读取。',
      },
      {
        title: '想锁就锁',
        body: '用面容、指纹或密码锁定 WitnessWork。',
      },
      {
        title: '零数据留存',
        body: 'Scribe AI 只与不保存你所发送内容的服务商合作。',
      },
      {
        title: '开源',
        body: '任何人都可以在 GitHub 上查看 WitnessWork 的代码。',
      },
    ],
  },
  languages: {
    eyebrow: '语言',
    title: '说你的语言。',
    body: '支持19种语言。',
  },
  pricing: {
    eyebrow: '价格',
    title: '所需的一切，全部免费。',
    body: '没有广告，不用注册，也没有隐藏条件。传道所需的每一项功能，人人都能免费使用。',
    freeItems: [
      '时数和报告',
      '目标和每日进度',
      '续访和圣经研读',
      '地图上的拜访地点',
      '计划和提醒',
      '同伴',
      '每月有额度的 Scribe AI',
      'Apple Watch 和 Wear OS',
      '小工具和 Siri（iPhone 和 iPad）',
      '加密备份',
      '日历同步',
      '连续记录、徽章和宠物',
    ],
    supporterTitle: '是否成为支持者，由你决定。',
    supporterBody:
      '如果WitnessWork对你的传道有帮助，订阅能支持它继续运作。为表感谢，支持者可享有：',
    supporterItems: [
      '在所有设备间同步',
      '当天的最佳路线',
      '更多Scribe AI额度',
      '强调色，以及 iPhone 和 iPad 上的应用图标',
      '支持者徽章',
    ],
    supporterNote: '在应用内订阅即可查看你所在国家或地区的价格，随时可以取消。',
  },
  faq: {
    eyebrow: '常见问题',
    title: '有疑问？有解答。',
    more: '前往帮助中心',
    open: '阅读完整解答',
  },
  cta: {
    title: '传道安排，稳步向前。',
    body: '免费下载 WitnessWork，支持 iPhone、iPad、Apple Watch 和 Android。',
    qr: '扫码下载',
  },
  footer: {
    contact: '联系我们',
    source: '源代码',
    privacy: '隐私政策',
    terms: '使用条款',
    independent:
      'WitnessWork 是一款独立的应用，与 Watch Tower Bible and Tract Society of Pennsylvania 没有任何关联。',
    trademarks:
      'Apple、iPhone、iPad、Apple Watch、Face ID、Siri 和 iCloud 是 Apple Inc. 在美国及其他国家和地区注册的商标。App Store 是 Apple Inc. 的服务标记。Google Play、Android、Wear OS 和 Google Drive 是 Google LLC 的商标。',
  },
}

export default zhCN
