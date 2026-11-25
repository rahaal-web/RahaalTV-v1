import {
  HOME_CARD_STYLE_3D_IDS,
  HomeCardStyle,
  HomeCardStyle3D,
  RECENTLY_WATCHED_CARD_STYLE_IDS,
  RecentlyWatchedCardStyle,
} from '../types/media';

export interface MainCardStyleMeta {
  id: HomeCardStyle;
  is3D: boolean;
  index: number;
  name: string;
  englishName: string;
  description: string;
  accentHex: string;
  surfaceHex: string;
  badgeText: string;
}

export interface RecentlyWatchedCardStyleMeta {
  id: RecentlyWatchedCardStyle;
  index: number;
  name: string;
  englishName: string;
  description: string;
  accentHex: string;
  surfaceHex: string;
}

export const MAIN_CARD_STYLE_CLEAN_META: MainCardStyleMeta = {
  id: 'clean',
  is3D: false,
  index: 0,
  name: 'الشكل الافتراضي النظيف',
  englishName: 'Classic Flat Clean',
  description: 'الشكل الأساسي البسيط والسريع بدون تأثيرات 3D.',
  accentHex: '#E50914',
  surfaceHex: '#181818',
  badgeText: 'افتراضي',
};

export const MAIN_3D_CARD_STYLES: MainCardStyleMeta[] = [
  {
    id: 'classic',
    is3D: true,
    index: 1,
    name: 'العمق السينمائي الكلاسيكي 3D',
    englishName: '3D Classic Lift',
    description: 'ارتفاع ثلاثي الأبعاد ناعم مع ظل غاطس وشريط تفاصيل أسفل البوستر.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #01',
  },
  {
    id: 'showcase',
    is3D: true,
    index: 2,
    name: 'العرض الثلاثي المتوهج 3D',
    englishName: '3D Showcase Prism',
    description: 'حافة نيون متوهجة مع إزاحة عمودية وميلان تفاعلي عند اللمس.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #02',
  },
  {
    id: '3d-obsidian-tilt',
    is3D: true,
    index: 3,
    name: 'ستارة البوستر الصاعدة',
    englishName: 'Slide-Up Curtain Stage',
    description: 'بوستر كامل بدون شريط سفلي ثابت؛ تنزلق ستارة القصة وأزرار المشاهدة للأعلى عند التمرير.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #03',
  },
  {
    id: '3d-cinema-stage',
    is3D: true,
    index: 4,
    name: 'الشاشة العريضة والمنمنم',
    englishName: 'Widescreen Dual Stage',
    description: 'خلفية مشهد عريضة بالأعلى مع بوستر مصغّر متداخل ومنصة تفاصيل كاملة.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #04',
  },
  {
    id: '3d-neon-prism',
    is3D: true,
    index: 5,
    name: 'العنوان العلوي المشطوف',
    englishName: 'Top-Header Chamfer Cut',
    description: 'زوايا مقصوصة هندسياً مع رأس عنوان يسبق البوستر وشريط تقييم وأزرار سفلي.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #05',
  },
  {
    id: '3d-glass-float',
    is3D: true,
    index: 6,
    name: 'الرصيف الزجاجي العائم',
    englishName: 'Floating Glass Dock',
    description: 'بوستر ممتد بكامل البطاقة يحتضن كبسولة زجاجية عائمة تنفتح بأزرار المشاهدة والتحميل.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #06',
  },
  {
    id: '3d-gold-bevel',
    is3D: true,
    index: 7,
    name: 'لوحة الجوائز المزدوجة',
    englishName: 'Double-Frame Crown Plaque',
    description: 'إطار مزدوج بتاج نجمي علوي وعنوان متوسّط كلاسيكي.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #07',
  },
  {
    id: '3d-stacked-deck',
    is3D: true,
    index: 8,
    name: 'الأوراق المتفرقة 3D',
    englishName: 'Dynamic Fan-Out Deck',
    description: 'بطاقتان مائلتان بالخلف تتفرعان بمروحة ثلاثية الأبعاد عند التمرير.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #08',
  },
  {
    id: '3d-hologram-edge',
    is3D: true,
    index: 9,
    name: 'العمود الجانبي المدمج',
    englishName: 'Vertical Side-Spine Rail',
    description: 'شريط بيانات عمودي بجانب البوستر يعرض السنة والجودة والتقييم والمفضلة.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #09',
  },
  {
    id: '3d-theater-curtain',
    is3D: true,
    index: 10,
    name: 'ستائر المسرح المنفرجة',
    englishName: 'Parting Theater Curtains',
    description: 'ستارتان قرمزيّتان على الجانبين تنفرجان عند التمرير لتكشف الشاشة مع لوحة عنوان.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #10',
  },
  {
    id: '3d-poster-lift',
    is3D: true,
    index: 11,
    name: 'البوستر المحلّق فوق القاعدة',
    englishName: 'Levitating Poster Pedestal',
    description: 'بوستر مستقل يقفز للأمام في المحور العمودي فوق قاعدة معلومات ثابتة داكنة.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #11',
  },
  {
    id: '3d-dual-flip',
    is3D: true,
    index: 12,
    name: 'الكتاب ذو الوجهين 180°',
    englishName: 'Dual-Face Flip Card',
    description: 'بطاقة بقلبة 180 درجة تفاعلية تعرض خلفية التقييم المفصل والقصة وأزرار التحميل.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #12',
  },
  {
    id: '3d-corner-fold',
    is3D: true,
    index: 13,
    name: 'تذكرة السينما المثقوبة',
    englishName: 'Perforated Cinema Ticket',
    description: 'قصّة تذكرة حقيقية بثقوب جانبية وخط فصل متقطع مع كعب سفلي قابل للفتح.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #13',
  },
  {
    id: '3d-cyber-frame',
    is3D: true,
    index: 14,
    name: 'عدسة الكاميرا المحددة',
    englishName: 'Cinema Viewfinder HUD',
    description: 'أربع زوايا تحديد دقيقة تتسع مع حلقة تصويب وسطية وبيانات تقنية علوية.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #14',
  },
  {
    id: '3d-velvet-depth',
    is3D: true,
    index: 15,
    name: 'القبة المقوّسة الفاخرة',
    englishName: 'Arched Marquee Dome',
    description: 'إطار بوستر مقوّس من الأعلى كشرفات السينما الكلاسيكية مع قاعدة متوازنة.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #15',
  },
  {
    id: '3d-chrome-plate',
    is3D: true,
    index: 16,
    name: 'شريط الفيلم 35mm',
    englishName: '35mm Filmstrip Reel',
    description: 'حواف مثقبة كشريط السينما الكلاسيكي مع لوح علوي وسفلي بأسلوب الكلاكيت.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #16',
  },
  {
    id: '3d-spotlight-arc',
    is3D: true,
    index: 17,
    name: 'الميدالية الدائرية المضيئة',
    englishName: 'Circular Spotlight Portal',
    description: 'بوستر دائري بارز تحت إضاءة كشاف علوي فوق قاعدة منحوتة للتفاصيل والأزرار.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #17',
  },
  {
    id: '3d-polaroid-slab',
    is3D: true,
    index: 18,
    name: 'صورة بولارويد الفورية',
    englishName: 'Cinema Polaroid Print',
    description: 'إطار فوتوغرافي مائل بدرجة خفيفة يعتدل عند اللمس مع ختم جودة مائل بالأسفل.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #18',
  },
  {
    id: '3d-split-slice',
    is3D: true,
    index: 19,
    name: 'القصّة القطرية المائلة',
    englishName: 'Diagonal Split Wedge',
    description: 'انقسام قطري حاد يفصل البوستر عن إسفين المعلومات السفلي المتحرك.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #19',
  },
  {
    id: '3d-metallic-crest',
    is3D: true,
    index: 20,
    name: 'الصحيفة السينمائية',
    englishName: 'Editorial Broadsheet',
    description: 'تصميم مجلة حاد الزوايا مع ترويسة علوية، بوستر نقي، ومقتطف قصة مع زر قراءة.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
    badgeText: '3D #20',
  },
];

export const RECENTLY_WATCHED_3D_STYLES: RecentlyWatchedCardStyleMeta[] = [
  {
    id: 'rw-3d-tilt',
    index: 1,
    name: 'الميلان السينمائي 3D',
    englishName: '3D Cinema Tilt',
    description: 'بطاقة مجسمة ترتفع بزاوية ثلاثية الأبعاد مع شريط تقدم واضح.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
  },
  {
    id: 'rw-3d-glass',
    index: 2,
    name: 'الزجاج العائم 3D',
    englishName: '3D Frosted Glass',
    description: 'لوح زجاجي متدرج العمق مع كبسولة استئناف بارزة فوق البوستر.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
  },
  {
    id: 'rw-3d-stacked',
    index: 3,
    name: 'الطبقات المتراكمة 3D',
    englishName: '3D Stacked Layers',
    description: 'بطاقة بخلفيات متراكبة تعطي إحساس الألبوم السينمائي السميك.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
  },
  {
    id: 'rw-3d-neon-bevel',
    index: 4,
    name: 'الحافة المضيئة 3D',
    englishName: '3D Crimson Bevel',
    description: 'إطار مشطوف أنيق مع خط تقدم قرمزي يناسب العرض السريع.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
  },
  {
    id: 'rw-3d-floating-stage',
    index: 5,
    name: 'المنصة العائمة 3D',
    englishName: '3D Floating Stage',
    description: 'بوستر مرتفع عن قاعدة معلومات منحوتة بظل عميق تحته.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
  },
  {
    id: 'rw-3d-prism',
    index: 6,
    name: 'المنشور المصقول 3D',
    englishName: '3D Crystal Prism',
    description: 'لمعان بلوري وانعكاس متدرج يبرز الحلقة والموسم بوضوح تام.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
  },
  {
    id: 'rw-3d-velvet-arch',
    index: 7,
    name: 'القوس المخملي 3D',
    englishName: '3D Velvet Arch',
    description: 'تصميم مقوّس فخم بحواف دائرية عميقة وأزرار لمس كبيرة للهاتف.',
    accentHex: '#E50914',
    surfaceHex: '#181818',
  },
];

const MAIN_3D_SET = new Set<string>(HOME_CARD_STYLE_3D_IDS);
const RW_3D_SET = new Set<string>(RECENTLY_WATCHED_CARD_STYLE_IDS);

export function normalizeHomeCardStyle(raw: unknown): HomeCardStyle {
  if (typeof raw === 'string') {
    const clean = raw.trim();
    if (clean === 'clean') return 'clean';
    if (MAIN_3D_SET.has(clean)) return clean as HomeCardStyle3D;
  }
  return 'clean';
}

export function normalizeRecentlyWatchedCardStyle(raw: unknown): RecentlyWatchedCardStyle {
  if (typeof raw === 'string') {
    const clean = raw.trim();
    if (RW_3D_SET.has(clean)) return clean as RecentlyWatchedCardStyle;
  }
  return 'rw-3d-tilt';
}

export function getMainCardStyleMeta(style: HomeCardStyle): MainCardStyleMeta {
  if (style === 'clean') return MAIN_CARD_STYLE_CLEAN_META;
  return (
    MAIN_3D_CARD_STYLES.find((entry) => entry.id === style) || MAIN_CARD_STYLE_CLEAN_META
  );
}

export function getRecentlyWatchedStyleMeta(
  style: RecentlyWatchedCardStyle
): RecentlyWatchedCardStyleMeta {
  return (
    RECENTLY_WATCHED_3D_STYLES.find((entry) => entry.id === style) ||
    RECENTLY_WATCHED_3D_STYLES[0]
  );
}
