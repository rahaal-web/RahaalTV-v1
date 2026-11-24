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
    accentHex: '#D92321',
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
    surfaceHex: '#141923',
    badgeText: '3D #02',
  },
  {
    id: '3d-obsidian-tilt',
    is3D: true,
    index: 3,
    name: 'أوبسيديان المائل 3D',
    englishName: 'Obsidian Perspective Tilt',
    description: 'ميلان منظوري عميق على قاعدة داكنة مصقولة بحدود زجاجية.',
    accentHex: '#ef4444',
    surfaceHex: '#0b0f17',
    badgeText: '3D #03',
  },
  {
    id: '3d-cinema-stage',
    is3D: true,
    index: 4,
    name: 'منصة السينما البارزة 3D',
    englishName: 'Cinema Stage Elevation',
    description: 'منصة سفلية مائلة تعطي البوستر وقفة مسرحية ثلاثية الأبعاد.',
    accentHex: '#f59e0b',
    surfaceHex: '#16161d',
    badgeText: '3D #04',
  },
  {
    id: '3d-neon-prism',
    is3D: true,
    index: 5,
    name: 'منشور النيون المزدوج 3D',
    englishName: 'Neon Prism Edge',
    description: 'إطار منشوري مزدوج الألوان ينبض بالعمق عند التمرير.',
    accentHex: '#06b6d4',
    surfaceHex: '#0c1622',
    badgeText: '3D #05',
  },
  {
    id: '3d-glass-float',
    is3D: true,
    index: 6,
    name: 'اللوح الزجاجي العائم 3D',
    englishName: 'Frosted Glass Float',
    description: 'بطاقة عائمة بشريط سفلي زجاجي شفاف يطفو أمام الخلفية.',
    accentHex: '#38bdf8',
    surfaceHex: '#111d2c',
    badgeText: '3D #06',
  },
  {
    id: '3d-gold-bevel',
    is3D: true,
    index: 7,
    name: 'الإطار الذهبي المنحوت 3D',
    englishName: 'Royal Gold Bevel',
    description: 'حواف ذهبية مشطوفة مع عمق مجسم يبرز التقييم والجودة.',
    accentHex: '#eab308',
    surfaceHex: '#1a150b',
    badgeText: '3D #07',
  },
  {
    id: '3d-stacked-deck',
    is3D: true,
    index: 8,
    name: 'البطاقات المتراكمة 3D',
    englishName: 'Layered Stacked Deck',
    description: 'طبقتان خلفيتان متدرجتان تمنحان البطاقة سماكة حقيقية.',
    accentHex: '#f43f5e',
    surfaceHex: '#1c1520',
    badgeText: '3D #08',
  },
  {
    id: '3d-hologram-edge',
    is3D: true,
    index: 9,
    name: 'طيف الهولوجرام 3D',
    englishName: 'Hologram Foil Tilt',
    description: 'انعكاس ضوئي متقزح يتحرك بانسيابية مع ارتفاع البطاقة.',
    accentHex: '#a855f7',
    surfaceHex: '#151226',
    badgeText: '3D #09',
  },
  {
    id: '3d-theater-curtain',
    is3D: true,
    index: 10,
    name: 'ستار المسرح الملكي 3D',
    englishName: 'Theater Velvet Frame',
    description: 'إطار مسرحي عميق مع تظليل درامي وإبراز زر التشغيل في المنتصف.',
    accentHex: '#dc2626',
    surfaceHex: '#1c0f13',
    badgeText: '3D #10',
  },
  {
    id: '3d-poster-lift',
    is3D: true,
    index: 11,
    name: 'ارتقاء البوستر الحر 3D',
    englishName: 'Poster Z-Lift Pop',
    description: 'بوستر يقفز للأمام في محور Z مع بقاء قاعدة المعلومات ثابتة.',
    accentHex: '#22c55e',
    surfaceHex: '#111b17',
    badgeText: '3D #11',
  },
  {
    id: '3d-dual-flip',
    is3D: true,
    index: 12,
    name: 'بُعد العمق المزدوج 3D',
    englishName: 'Dual Axis Depth',
    description: 'دوران محوري مزدوج متزن مع بروز لشارات النوع والسنة.',
    accentHex: '#3b82f6',
    surfaceHex: '#0f172a',
    badgeText: '3D #12',
  },
  {
    id: '3d-corner-fold',
    is3D: true,
    index: 13,
    name: 'الطيّ الزاوي الهندسي 3D',
    englishName: 'Beveled Corner Fold',
    description: 'زاوية مشطوفة هندسية مع شريط علوي مدمج وتظليل جانبي.',
    accentHex: '#fb923c',
    surfaceHex: '#1f1612',
    badgeText: '3D #13',
  },
  {
    id: '3d-cyber-frame',
    is3D: true,
    index: 14,
    name: 'الإطار السيبراني 3D',
    englishName: 'Cyber HUD Frame',
    description: 'زوايا رقمية بارزة وإضاءة موجهة عالية التباين.',
    accentHex: '#14b8a6',
    surfaceHex: '#0b1c1c',
    badgeText: '3D #14',
  },
  {
    id: '3d-velvet-depth',
    is3D: true,
    index: 15,
    name: 'العمق المخملي الفاخر 3D',
    englishName: 'Velvet Shadow Vault',
    description: 'ظلال مخملية ناعمة متعددة الطبقات مع شريط عنوان أنيق.',
    accentHex: '#ec4899',
    surfaceHex: '#1d111a',
    badgeText: '3D #15',
  },
  {
    id: '3d-chrome-plate',
    is3D: true,
    index: 16,
    name: 'اللوح الكرومي المصقول 3D',
    englishName: 'Brushed Chrome Slab',
    description: 'حافة معدنية مصقولة ولمعان قطري عند التفاعل.',
    accentHex: '#94a3b8',
    surfaceHex: '#181c22',
    badgeText: '3D #16',
  },
  {
    id: '3d-spotlight-arc',
    is3D: true,
    index: 17,
    name: 'قوس الكشاف الضوئي 3D',
    englishName: 'Spotlight Arc Card',
    description: 'هالة إضاءة علوية تسلط الضوء على البوستر من الأعلى.',
    accentHex: '#facc15',
    surfaceHex: '#16161a',
    badgeText: '3D #17',
  },
  {
    id: '3d-polaroid-slab',
    is3D: true,
    index: 18,
    name: 'اللوح السينمائي البارز 3D',
    englishName: 'Cinema Polaroid Slab',
    description: 'إطار سميك بارز يمنح العمل مظهر بطاقة تذكارية مجسمة.',
    accentHex: '#e11d48',
    surfaceHex: '#1f1d24',
    badgeText: '3D #18',
  },
  {
    id: '3d-split-slice',
    is3D: true,
    index: 19,
    name: 'الشرائح المائلة 3D',
    englishName: 'Dynamic Split Slice',
    description: 'قصّة قطرية ديناميكية تفصل البوستر عن منصة البيانات السفلية.',
    accentHex: '#8b5cf6',
    surfaceHex: '#141221',
    badgeText: '3D #19',
  },
  {
    id: '3d-metallic-crest',
    is3D: true,
    index: 20,
    name: 'الدرع المعدني الملكي 3D',
    englishName: 'Metallic Crest Frame',
    description: 'إطار معدني مزدوج الحواف مع نقش بارز للتقييم والجودة.',
    accentHex: '#f59e0b',
    surfaceHex: '#181411',
    badgeText: '3D #20',
  },
];

export const RECENTLY_WATCHED_3D_STYLES: RecentlyWatchedCardStyleMeta[] = [
  {
    id: 'rw-3d-tilt',
    index: 1,
    name: 'الميلان السينمائي 3D',
    englishName: '3D Cinema Tilt',
    description: 'بطاقة مجسمة ترتفع بزاوية ثلاثية الأبعاد مع شريط تقدم متوهج.',
    accentHex: '#D92321',
    surfaceHex: '#161d26',
  },
  {
    id: 'rw-3d-glass',
    index: 2,
    name: 'الزجاج العائم 3D',
    englishName: '3D Frosted Glass',
    description: 'لوح زجاجي متدرج العمق مع كبسولة استئناف بارزة فوق البوستر.',
    accentHex: '#38bdf8',
    surfaceHex: '#0f1b2b',
  },
  {
    id: 'rw-3d-stacked',
    index: 3,
    name: 'الطبقات المتراكمة 3D',
    englishName: '3D Stacked Layers',
    description: 'بطاقة بخلفيات متراكبة تعطي إحساس الألبوم السينمائي السميك.',
    accentHex: '#f59e0b',
    surfaceHex: '#1a1714',
  },
  {
    id: 'rw-3d-neon-bevel',
    index: 4,
    name: 'الحافة المضيئة 3D',
    englishName: '3D Neon Bevel',
    description: 'إطار مشطوف مضيء مع خط تقدم ليزري يناسب العرض السريع.',
    accentHex: '#a855f7',
    surfaceHex: '#131024',
  },
  {
    id: 'rw-3d-floating-stage',
    index: 5,
    name: 'المنصة العائمة 3D',
    englishName: '3D Floating Stage',
    description: 'بوستر مرتفع عن قاعدة معلومات منحوتة بظل عميق تحته.',
    accentHex: '#22c55e',
    surfaceHex: '#101d18',
  },
  {
    id: 'rw-3d-prism',
    index: 6,
    name: 'المنشور المصقول 3D',
    englishName: '3D Crystal Prism',
    description: 'لمعان بلوري وانعكاس متدرج يبرز الحلقة والموسم بوضوح تام.',
    accentHex: '#06b6d4',
    surfaceHex: '#0c1b22',
  },
  {
    id: 'rw-3d-velvet-arch',
    index: 7,
    name: 'القوس المخملي 3D',
    englishName: '3D Velvet Arch',
    description: 'تصميم مقوّس فخم بحواف دائرية عميقة وأزرار لمس كبيرة للهاتف.',
    accentHex: '#ec4899',
    surfaceHex: '#1e111b',
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
