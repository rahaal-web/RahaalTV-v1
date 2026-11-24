// Exact 9-group RTL Admin Navigation Architecture, Group Accent Colors, Icons & Permission Mapping.

import type { ModeratorSubPermissions } from '../../lib/adminPreferences';

export type AdminTab =
  | 'overview'
  | 'notifications'
  | 'analytics'
  | 'catalog'
  | 'categories'
  | 'bulk_editor'
  | 'images'
  | 'content_audit'
  | 'watch_servers'
  | 'player_theme'
  | 'popup_shield'
  | 'scraper'
  | 'site_scraper'
  | 'scraper_adapters'
  | 'crawl_operations'
  | 'website_branding'
  | 'cards_themes'
  | 'image_placeholders'
  | 'slider_customization'
  | 'home_builder'
  | 'typography'
  | 'admin_appearance'
  | 'admin_nav_order'
  | 'display_modes'
  | 'requests'
  | 'users'
  | 'security_rules'
  | 'audit_logs'
  | 'database_manager'
  | 'system_health'
  | 'backup_restore'
  | 'settings'
  | 'ai_editor';

export type AdminNavGroupId =
  | 'dashboard'
  | 'content'
  | 'player_servers'
  | 'crawlers'
  | 'design'
  | 'community'
  | 'security'
  | 'system'
  | 'settings_group';

export interface AdminNavItem {
  id: AdminTab;
  groupId: AdminNavGroupId;
  label: string;
  shortLabel: string;
  description: string;
  keywords: string[];
  iconName: string;
  ownerOnly?: boolean;
  moderatorPermKey?: keyof ModeratorSubPermissions;
}

export interface AdminNavGroup {
  id: AdminNavGroupId;
  label: string;
  accentColor: string;
  iconName: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'dashboard',
    label: 'لوحة القيادة والتحليلات',
    accentColor: '#3b82f6', // Calm Azure Blue
    iconName: 'LayoutDashboard',
    items: [
      {
        id: 'overview',
        groupId: 'dashboard',
        label: 'لوحة القيادة التنفيذية',
        shortLabel: 'نظرة عامة',
        description: 'مؤشرات الأداء اليومية، صحة المحتوى، وتنبيهات النظام السريعة',
        keywords: ['overview', 'dashboard', 'نظرة', 'احصائيات', 'لوحة'],
        iconName: 'Gauge',
        ownerOnly: true,
      },
      {
        id: 'notifications',
        groupId: 'dashboard',
        label: 'مركز الإشعارات والتنبيهات',
        shortLabel: 'الإشعارات',
        description: 'تنبيهات الطلبات المعلّقة، السيرفرات المعطلة، مهام الجلب، وأخطاء النظام',
        keywords: ['notifications', 'alerts', 'اشعارات', 'تنبيهات', 'تحذيرات'],
        iconName: 'BellRing',
      },
      {
        id: 'analytics',
        groupId: 'dashboard',
        label: 'التحليلات المتقدمة',
        shortLabel: 'التحليلات',
        description: 'أعلى الأعمال مشاهدة وتقييماً وتوزيع التصنيفات والجودات',
        keywords: ['analytics', 'views', 'ratings', 'تحليلات', 'مشاهدات', 'تقييمات'],
        iconName: 'BarChart3',
        moderatorPermKey: 'allowAnalyticsRead',
      },
    ],
  },
  {
    id: 'content',
    label: 'إدارة المحتوى والكتالوج',
    accentColor: '#10b981', // Calm Emerald
    iconName: 'Film',
    items: [
      {
        id: 'catalog',
        groupId: 'content',
        label: 'الأفلام والمسلسلات',
        shortLabel: 'الكتالوج',
        description: 'إضافة، تعديل، تثبيت، وفرز كافة الأعمال والحلقات',
        keywords: ['catalog', 'movies', 'series', 'افلام', 'مسلسلات', 'كتالوج'],
        iconName: 'Clapperboard',
      },
      {
        id: 'categories',
        groupId: 'content',
        label: 'التصنيفات والأقسام والوسوم',
        shortLabel: 'التصنيفات',
        description: 'إحصائيات الأقسام والأنواع والجودات والدمج أو إعادة التسمية الجماعية',
        keywords: ['categories', 'genres', 'tags', 'تصنيفات', 'اقسام', 'انواع'],
        iconName: 'Tags',
        moderatorPermKey: 'allowBulkEditor',
      },
      {
        id: 'bulk_editor',
        groupId: 'content',
        label: 'التعديل الجماعي السريع',
        shortLabel: 'تعديل جماعي',
        description: 'تحديد عدة أعمال وتعديل الجودة/القسم/التصنيف/الحالة دفعة واحدة مع تراجع فوري',
        keywords: ['bulk', 'edit', 'batch', 'تعديل جماعي', 'تحديث'],
        iconName: 'Layers',
        moderatorPermKey: 'allowBulkEditor',
      },
      {
        id: 'images',
        groupId: 'content',
        label: 'جودة وإدارة الصور',
        shortLabel: 'الصور',
        description: 'فحص ومعالجة البوسترات وخلفيات العرض بدقة عالية',
        keywords: ['images', 'posters', 'backdrops', 'صور', 'بوسترات'],
        iconName: 'ImageIcon',
      },
      {
        id: 'content_audit',
        groupId: 'content',
        label: 'فحص جودة المحتوى',
        shortLabel: 'فحص المحتوى',
        description: 'كشف التكرارات، الحلقات الناقصة، السيرفرات المفقودة والبيانات غير المكتملة',
        keywords: ['audit', 'duplicates', 'gaps', 'فحص', 'تكرار', 'ناقص'],
        iconName: 'CheckSquare',
        moderatorPermKey: 'allowContentAudit',
      },
    ],
  },
  {
    id: 'player_servers',
    label: 'المشاهدة والسيرفرات والحماية',
    accentColor: '#0ea5e9', // Calm Sky
    iconName: 'Tv',
    items: [
      {
        id: 'watch_servers',
        groupId: 'player_servers',
        label: 'صحة وسيرفرات المشاهدة',
        shortLabel: 'السيرفرات',
        description: 'جرد النطاقات، فحص الروابط المعطلة جماعياً، وكشف الروابط المشبوهة',
        keywords: ['servers', 'health', 'links', 'سيرفرات', 'روابط', 'مشاهدة'],
        iconName: 'Server',
        moderatorPermKey: 'allowWatchServers',
      },
      {
        id: 'player_theme',
        groupId: 'player_servers',
        label: 'تخصيص ثيم المشغّل',
        shortLabel: 'مظهر المشغل',
        description: 'ألوان إطار المشاهدة، الحواف، التوهج، واسم العلامة التجارية',
        keywords: ['player', 'theme', 'colors', 'مشغل', 'ثيم', 'الوان'],
        iconName: 'MonitorPlay',
        ownerOnly: true,
      },
      {
        id: 'popup_shield',
        groupId: 'player_servers',
        label: 'درع النوافذ المنبثقة',
        shortLabel: 'درع الإعلانات',
        description: 'قواعد عزل الإطارات (Sandbox) وحماية المشاهد من النوافذ المنبثقة',
        keywords: ['shield', 'popup', 'sandbox', 'درع', 'نوافذ', 'اعلانات'],
        iconName: 'ShieldCheck',
        ownerOnly: true,
      },
    ],
  },
  {
    id: 'crawlers',
    label: 'أدوات الجلب والاستيراد',
    accentColor: '#8b5cf6', // Calm Violet
    iconName: 'DownloadCloud',
    items: [
      {
        id: 'scraper',
        groupId: 'crawlers',
        label: 'جلب عمل واحد (رابط)',
        shortLabel: 'جلب عمل',
        description: 'استيراد فيلم أو مسلسل من رابط مباشر أو مصدر HTML',
        keywords: ['scraper', 'single', 'import', 'جلب', 'استيراد', 'رابط'],
        iconName: 'Link2',
      },
      {
        id: 'site_scraper',
        groupId: 'crawlers',
        label: 'جلب موقع بالكامل (Crawler)',
        shortLabel: 'جلب موقع',
        description: 'مسح أقسام كاملة وجلب قائمة أعمال ونشرها دفعة واحدة',
        keywords: ['crawler', 'site', 'bulk import', 'جلب موقع', 'زاحف'],
        iconName: 'Globe',
        moderatorPermKey: 'allowSiteScraper',
      },
      {
        id: 'scraper_adapters',
        groupId: 'crawlers',
        label: 'تطوير مصادر الجلب',
        shortLabel: 'المحولات',
        description: 'إنشاء وتخصيص قواعد استخراج المواقع الخارجية (Adapters)',
        keywords: ['adapters', 'builder', 'sources', 'مصادر', 'محولات'],
        iconName: 'Wrench',
        moderatorPermKey: 'allowAdapters',
      },
      {
        id: 'crawl_operations',
        groupId: 'crawlers',
        label: 'عمليات ومهام الجلب',
        shortLabel: 'المهام الحية',
        description: 'متابعة مهام الجلب الجارية وإيقافها ومراجعة سجل العمليات السابقة',
        keywords: ['tasks', 'jobs', 'queue', 'cancel', 'عمليات', 'مهام'],
        iconName: 'Activity',
        moderatorPermKey: 'allowCrawlOperations',
      },
      {
        id: 'ai_editor',
        groupId: 'crawlers',
        label: 'المساعد الذكي المحلي',
        shortLabel: 'المساعد الذكي',
        description: 'تعديل ذكي بالأوامر العربية للمحتوى والسيرفرات',
        keywords: ['ai', 'assistant', 'smart', 'مساعد', 'ذكي'],
        iconName: 'Sparkles',
        ownerOnly: true,
      },
    ],
  },
  {
    id: 'design',
    label: 'التصميم والهوية والأجهزة',
    accentColor: '#14b8a6', // Calm Teal
    iconName: 'Palette',
    items: [
      {
        id: 'website_branding',
        groupId: 'design',
        label: 'إعدادات هوية الموقع (Website Branding)',
        shortLabel: 'هوية الموقع',
        description: 'إدارة الشعار، اسم الموقع وخطه ولونه، وأيقونة المتصفح Favicon مع معاينة فورية',
        keywords: ['branding', 'logo', 'favicon', 'identity', 'site name', 'هوية', 'لوجو', 'شعار', 'اسم الموقع', 'ايقونة'],
        iconName: 'BadgeCheck',
        ownerOnly: true,
      },
      {
        id: 'cards_themes',
        groupId: 'design',
        label: 'استوديو البطاقات وأشكال الموقع',
        shortLabel: 'البطاقات والثيمات',
        description: '20 شكل 3D للبطاقات الرئيسية، 7 أشكال 3D لشاهدته مؤخراً، و25 مظهراً مختلفاً للموقع',
        keywords: ['cards', '3d', 'themes', 'styles', 'recently watched', 'بطاقات', 'ثيمات', 'اشكال', 'شاهدته'],
        iconName: 'Palette',
        ownerOnly: true,
      },
      {
        id: 'image_placeholders',
        groupId: 'design',
        label: 'إعدادات الصور والخلفيات المؤقتة',
        shortLabel: 'خلفيات الصور',
        description: 'تخصيص خلفية التحميل المؤقتة، تأثير Shimmer، الشعار المائي، وصورة بديلة للأخطاء',
        keywords: ['images', 'placeholder', 'shimmer', 'fallback', 'تجميل', 'صور', 'خلفية مؤقتة', 'بديل'],
        iconName: 'ImageIcon',
        ownerOnly: true,
      },
      {
        id: 'slider_customization',
        groupId: 'design',
        label: 'إعدادات السلايدر الرئيسي',
        shortLabel: 'تخصيص السلايدر',
        description: 'التحكم الدقيق في إظهار/إخفاء الوصف، أحجام الخطوط، التموضع، وشارات وأزرار السلايدر',
        keywords: ['slider', 'hero', 'description', 'heroShowDescription', 'سلايدر', 'وصف', 'عرض', 'واجهة'],
        iconName: 'SlidersHorizontal',
        ownerOnly: true,
      },
      {
        id: 'home_builder',
        groupId: 'design',
        label: 'الصفحة الرئيسية والأقسام',
        shortLabel: 'الرئيسية',
        description: 'ترتيب أقسام الرئيسية ووضع البطل واختيار شرائح العرض',
        keywords: ['home', 'hero', 'slider', 'sections', 'رئيسية', 'اقسام'],
        iconName: 'LayoutTemplate',
        ownerOnly: true,
      },
      {
        id: 'typography',
        groupId: 'design',
        label: 'خطوط وحجم نصوص الموقع',
        shortLabel: 'خطوط الموقع',
        description: 'تخصيص الخطوط العربية واللاتينية وأحجام العناوين لواجهة الموقع فقط',
        keywords: ['typography', 'fonts', 'size', 'خطوط', 'نصوص', 'موقع'],
        iconName: 'Type',
        ownerOnly: true,
      },
      {
        id: 'admin_appearance',
        groupId: 'design',
        label: 'راحة العين ومظهر لوحة الإدارة',
        shortLabel: 'مظهر الإدارة',
        description: 'أوضاع Dark/Light/Soft Gray/Comfortable Eye، الألوان، التباين، والخطوط للوحة الإدارة فقط',
        keywords: ['admin', 'appearance', 'theme', 'eye comfort', 'soft gray', 'fonts', 'مظهر', 'راحة العين'],
        iconName: 'Eye',
        ownerOnly: true,
      },
      {
        id: 'admin_nav_order',
        groupId: 'design',
        label: 'ترتيب أقسام لوحة الإدارة',
        shortLabel: 'ترتيب الأقسام',
        description: 'سحب وإفلات لإعادة ترتيب أقسام الإدارة، تثبيت المفضلة، إنشاء مجموعات جديدة، وإخفاء العناصر',
        keywords: ['navigation', 'order', 'sidebar', 'groups', 'ترتيب', 'اقسام', 'قائمة'],
        iconName: 'ListOrdered',
        ownerOnly: true,
      },
      {
        id: 'display_modes',
        groupId: 'design',
        label: 'أوضاع الموبايل والتلفاز (TV)',
        shortLabel: 'أوضاع العرض',
        description: 'تفعيل وضع Android TV / Google TV، وضع الأجهزة الضعيفة، وتشخيص المتصفح',
        keywords: ['tv', 'mobile', 'android', 'dpad', 'compat', 'تلفاز', 'موبايل', 'توافق'],
        iconName: 'Smartphone',
        ownerOnly: true,
      },
    ],
  },
  {
    id: 'community',
    label: 'الجمهور والطلبات',
    accentColor: '#f59e0b', // Muted Amber (icon/dot accent only)
    iconName: 'MessageSquare',
    items: [
      {
        id: 'requests',
        groupId: 'community',
        label: 'طلبات الزوار',
        shortLabel: 'الطلبات',
        description: 'مراجعة واعتماد وتنفيذ طلبات الأفلام والمسلسلات',
        keywords: ['requests', 'visitors', 'طلبات', 'زوار'],
        iconName: 'Inbox',
        ownerOnly: true,
      },
    ],
  },
  {
    id: 'security',
    label: 'الأمان والصلاحيات والسجلات',
    accentColor: '#6366f1', // Calm Indigo
    iconName: 'Shield',
    items: [
      {
        id: 'users',
        groupId: 'security',
        label: 'الأعضاء والمشرفين (RBAC)',
        shortLabel: 'الصلاحيات',
        description: 'إدارة حسابات المشرفين ومصفوفة الصلاحيات الدقيقة وقائمة الأعضاء',
        keywords: ['users', 'admins', 'rbac', 'roles', 'مشرفين', 'اعضاء', 'صلاحيات'],
        iconName: 'Users',
        ownerOnly: true,
      },
      {
        id: 'security_rules',
        groupId: 'security',
        label: 'قواعد أمان Firestore',
        shortLabel: 'قواعد Firestore',
        description: 'معاينة ونسخ قواعد أمان قاعدة البيانات والتحقق من النشر',
        keywords: ['firestore', 'rules', 'security', 'قواعد', 'امان'],
        iconName: 'Lock',
        ownerOnly: true,
      },
      {
        id: 'audit_logs',
        groupId: 'security',
        label: 'سجل النشاطات والأخطاء',
        shortLabel: 'السجلات',
        description: 'سجل عمليات الإدارة السحابي + أخطاء المتصفح والعميل المسجلة',
        keywords: ['logs', 'audit', 'errors', 'سجل', 'نشاطات', 'اخطاء'],
        iconName: 'FileText',
        ownerOnly: true,
      },
    ],
  },
  {
    id: 'system',
    label: 'قواعد البيانات وصحة النظام',
    accentColor: '#06b6d4', // Calm Cyan
    iconName: 'Database',
    items: [
      {
        id: 'database_manager',
        groupId: 'system',
        label: 'إدارة قواعد البيانات والاتصال',
        shortLabel: 'قواعد البيانات',
        description: 'إضافة وتبديل واختبار قواعد البيانات، مخزن الأسرار الآمن، الترحيل، والحماية من الانقطاع',
        keywords: ['database', 'firestore', 'realtime', 'connection', 'secrets', 'vault', 'migration', 'قواعد', 'بيانات', 'اتصال', 'تبديل'],
        iconName: 'HardDrive',
        ownerOnly: true,
      },
      {
        id: 'system_health',
        groupId: 'system',
        label: 'مركز صحة النظام والربط',
        shortLabel: 'صحة النظام',
        description: 'فحص فوري لـ Firebase Auth و Firestore و Worker والخادم والقدرات',
        keywords: ['health', 'diagnostics', 'firebase', 'worker', 'صحة', 'فحص', 'اتصال'],
        iconName: 'HeartPulse',
        ownerOnly: true,
      },
      {
        id: 'backup_restore',
        groupId: 'system',
        label: 'النسخ الاحتياطي والاستعادة',
        shortLabel: 'النسخ الاحتياطي',
        description: 'تصدير JSON موثّق ببصمة FNV-1a ومعاينة الفروقات قبل الاستعادة',
        keywords: ['backup', 'restore', 'export', 'import', 'نسخ', 'استعادة'],
        iconName: 'ArchiveRestore',
        ownerOnly: true,
      },
    ],
  },
  {
    id: 'settings_group',
    label: 'الإعدادات العامة',
    accentColor: '#64748b', // Calm Slate
    iconName: 'Settings',
    items: [
      {
        id: 'settings',
        groupId: 'settings_group',
        label: 'إعدادات المنصة والبروكسي',
        shortLabel: 'الإعدادات',
        description: 'اسم الموقع، شريط الأخبار، وضع الصيانة، وبروكسي Cloudflare Worker',
        keywords: ['settings', 'maintenance', 'worker', 'proxy', 'اعدادات', 'صيانة'],
        iconName: 'Sliders',
        ownerOnly: true,
      },
    ],
  },
];

export function getAllAdminNavItems(): AdminNavItem[] {
  return ADMIN_NAV_GROUPS.flatMap((g) => g.items);
}

export function findAdminNavItem(tab: AdminTab): {
  group: AdminNavGroup;
  item: AdminNavItem;
} | null {
  for (const group of ADMIN_NAV_GROUPS) {
    const item = group.items.find((i) => i.id === tab);
    if (item) return { group, item };
  }
  return null;
}

export function isTabAccessible(
  tab: AdminTab,
  isOwner: boolean,
  moderatorPerms: ModeratorSubPermissions
): boolean {
  if (isOwner) return true;
  const found = findAdminNavItem(tab);
  if (!found) return false;
  if (found.item.ownerOnly) return false;
  if (found.item.moderatorPermKey) {
    return Boolean(moderatorPerms[found.item.moderatorPermKey]);
  }
  return true;
}
