import { CSSProperties, FormEvent, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  Bell,
  BellRing,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  Clapperboard,
  Code2,
  Command,
  Copy,
  Database,
  Download,
  DownloadCloud,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Film,
  FolderKanban,
  Gauge,
  Globe,
  GripVertical,
  HardDrive,
  HeartPulse,
  Image as ImageIcon,
  Inbox,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  ListOrdered,
  Loader2,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  MonitorPlay,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  StopCircle,
  Tags,
  Trash2,
  Tv,
  Type,
  Upload,
  Users,
  Wand2,
  Wrench,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { ASSETS, CATALOG_ITEMS } from '../data/catalog';
import { MediaPreviewModal } from './MediaPreviewModal';
import {
  ADMIN_NAV_GROUPS,
  type AdminTab,
  findAdminNavItem,
  getAllAdminNavItems,
  isTabAccessible,
} from './admin/adminNavigation';
import { ConfirmDialog, GlobalCommandPalette } from './admin/AdminSharedUi';

export type { AdminTab } from './admin/adminNavigation';

const AdminAiBulkEditor = lazy(() =>
  import('./AdminAiBulkEditor').then((m) => ({ default: m.AdminAiBulkEditor }))
);
const AdminImageManagerPanel = lazy(() =>
  import('./AdminImageManagerPanel').then((m) => ({ default: m.AdminImageManagerPanel }))
);
const HomeBuilderPanel = lazy(() =>
  import('./HomeBuilderPanel').then((m) => ({ default: m.HomeBuilderPanel }))
);
const PopupShieldPanel = lazy(() =>
  import('./PopupShieldPanel').then((m) => ({ default: m.PopupShieldPanel }))
);
const ScraperAdapterBuilderPanel = lazy(() =>
  import('./ScraperAdapterBuilderPanel').then((m) => ({ default: m.ScraperAdapterBuilderPanel }))
);
const TypographyPanel = lazy(() =>
  import('./TypographyPanel').then((m) => ({ default: m.TypographyPanel }))
);

const AdminExecutiveOverview = lazy(() =>
  import('./admin/AdminExecutiveOverview').then((m) => ({ default: m.AdminExecutiveOverview }))
);
const AdminCatalogPanel = lazy(() =>
  import('./admin/AdminCatalogPanel').then((m) => ({ default: m.AdminCatalogPanel }))
);
const AdminCategoriesPanel = lazy(() =>
  import('./admin/AdminCategoriesPanel').then((m) => ({ default: m.AdminCategoriesPanel }))
);
const AdminNotificationsPanel = lazy(() =>
  import('./admin/AdminNotificationsPanel').then((m) => ({ default: m.AdminNotificationsPanel }))
);
const AdminBulkEditorPanel = lazy(() =>
  import('./admin/AdminBulkEditorPanel').then((m) => ({ default: m.AdminBulkEditorPanel }))
);
const AdminContentAuditPanel = lazy(() =>
  import('./admin/AdminContentAuditPanel').then((m) => ({ default: m.AdminContentAuditPanel }))
);
const AdminWatchServersPanel = lazy(() =>
  import('./admin/AdminWatchServersPanel').then((m) => ({ default: m.AdminWatchServersPanel }))
);
const AdminCrawlOperationsPanel = lazy(() =>
  import('./admin/AdminCrawlOperationsPanel').then((m) => ({
    default: m.AdminCrawlOperationsPanel,
  }))
);
const AdminDisplayModesPanel = lazy(() =>
  import('./admin/AdminDisplayModesPanel').then((m) => ({ default: m.AdminDisplayModesPanel }))
);
const AdminSecurityLogsPanel = lazy(() =>
  import('./admin/AdminSecurityLogsPanel').then((m) => ({ default: m.AdminSecurityLogsPanel }))
);
const AdminSystemHealthPanel = lazy(() =>
  import('./admin/AdminSystemHealthPanel').then((m) => ({ default: m.AdminSystemHealthPanel }))
);
const AdminDatabaseManagerPanel = lazy(() =>
  import('./admin/AdminDatabaseManagerPanel').then((m) => ({
    default: m.AdminDatabaseManagerPanel,
  }))
);
const AdminBackupRestorePanel = lazy(() =>
  import('./admin/AdminBackupRestorePanel').then((m) => ({ default: m.AdminBackupRestorePanel }))
);
const AdminAppearancePanel = lazy(() =>
  import('./admin/AdminAppearancePanel').then((m) => ({ default: m.AdminAppearancePanel }))
);
const AdminNavOrderPanel = lazy(() =>
  import('./admin/AdminNavOrderPanel').then((m) => ({ default: m.AdminNavOrderPanel }))
);
const WebsiteBrandingPanel = lazy(() =>
  import('./admin/WebsiteBrandingPanel').then((m) => ({ default: m.WebsiteBrandingPanel }))
);
const SliderCustomizationPanel = lazy(() =>
  import('./admin/SliderCustomizationPanel').then((m) => ({
    default: m.SliderCustomizationPanel,
  }))
);
const AdminImagePlaceholderPanel = lazy(() =>
  import('./admin/AdminImagePlaceholderPanel').then((m) => ({
    default: m.AdminImagePlaceholderPanel,
  }))
);
const AdminCardsAndThemesPanel = lazy(() =>
  import('./admin/AdminCardsAndThemesPanel').then((m) => ({
    default: m.AdminCardsAndThemesPanel,
  }))
);

import {
  optimizeTmdbUrl,
  evaluateImageQuality,
  getBackdropInfo,
  getMediaImageQualityStatus,
  getPosterUrl,
  IMAGE_QUALITY_BADGE_MAP,
  probeImageDimensionsInBrowser,
  ResolvedImageBundle,
  resolveHighResImagesClient,
  upgradeKnownImageUrl,
} from '../lib/mediaImages';
import {
  bulkDeleteMediaFromFirestore,
  bulkSaveMediaToFirestore,
  bulkUpdateMediaInFirestore,
  createAdminAccountInFirebase,
  deleteCustomFontFromFirestore,
  deleteMediaFromFirestore,
  deleteVisitorRequestFromFirestore,
  diagnoseFirestoreSettingsRules,
  FirestoreConnectionStatus,
  formatFirestoreWriteError,
  getActiveFirebaseConfig,
  getFirebaseAuthErrorMessage,
  grantAdminRoleInFirestore,
  revokeAdminRoleFromFirestore,
  saveCustomFontToFirestore,
  saveHeroSliderVariantToFirestore,
  saveImagePlaceholderConfigToFirestore,
  saveMediaToFirestore,
  saveRecentlyWatchedUiConfigToFirestore,
  saveSiteSettingsToFirestore,
  saveSiteThemeToFirestore,
  saveStreamV4SliderConfigToFirestore,
  seedCatalogToFirestore,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutFirebase,
  updateAdminRoleInFirestore,
  updateVisitorRequestInFirestore,
} from '../lib/firebase';
import {
  buildDedicatedMediaUrl,
  generateCleanSlug,
  resolveDisplayShortUrl,
} from '../lib/permalink';
import {
  checkServerUrlsInBrowser,
  CLOUDFLARE_WORKER_SOURCE,
  findTrailerInBrowser,
  getCustomApiBaseUrl,
  isLikelyNonVideoWebsiteUrl,
  resolveApiEndpoint,
  ScrapedPayload,
  scrapeSingleInBrowser,
  scrapeSiteInBrowser,
  setCustomApiBaseUrl,
  shouldSkipBackendApiCalls,
  testCloudflareWorkerConnection,
  verifyAndFilterItemServers,
} from '../lib/clientScraper';
import {
  loadStoredPlayerTheme,
  normalizePlayerTheme,
  saveStoredPlayerTheme,
} from '../lib/playerTheme';
import {
  loadStoredHomeConfig,
  normalizeHomeConfig,
  saveStoredHomeConfig,
} from '../lib/homeConfig';
import {
  getStreamV4MovieDuration,
  getStreamV4MoviePngLogo,
  loadStreamV4SliderConfig,
  setStreamV4MovieDuration,
  setStreamV4MoviePngLogo,
  uploadTransparentSliderPng,
} from '../lib/streamV4SliderConfig';
import { loadStoredRecentlyWatchedUiConfig } from '../lib/recentlyWatchedConfig';
import {
  applyTypographyToDocument,
  loadStoredCustomFonts,
  loadStoredTypographyConfig,
  normalizeTypographyConfig,
  saveStoredCustomFonts,
  saveStoredTypographyConfig,
} from '../lib/typographyConfig';
import {
  loadStoredPopupShieldConfig,
  normalizePopupShieldConfig,
  saveStoredPopupShieldConfig,
} from '../lib/popupShield';
import {
  matchAdapterForUrl,
} from '../lib/scraperAdapterUtils';
import {
  loadLocalScraperAdapters,
  subscribeScraperAdapters,
  syncAdaptersToBackendRegistry,
} from '../lib/scraperAdaptersDb';
import {
  HeroSliderVariant,
  loadMobileHeroSliderVariant,
  saveHeroSliderDeviceVariants,
} from '../lib/heroSliderMode';
import {
  AdminWorkspacePrefs,
  CatalogTablePrefs,
  DEFAULT_MODERATOR_SUB_PERMS,
  loadAdminNotifications,
  loadAdminWorkspacePrefs,
  ModeratorSubPermissions,
  normalizeModeratorSubPermissions,
  pushAdminNotification,
  saveAdminWorkspacePrefs,
  subscribeModeratorPermissionsFromFirestore,
  syncModeratorPermissionsToFirestore,
} from '../lib/adminPreferences';
import {
  cancelTrackedCrawlTask,
  finishTrackedCrawlTask,
  isTaskCancelled,
  loadCrawlTasks,
  startTrackedCrawlTask,
  subscribeCrawlTasks,
  updateTrackedCrawlTask,
} from '../lib/crawlTasksDb';
import {
  normalizeTitleForDuplicateCheck,
  runCatalogContentAudit,
} from '../lib/contentAudit';
import { reportClientError } from '../lib/clientLogger';
import {
  loadDatabaseRegistry,
  rollbackDatabaseConnection,
} from '../lib/dbConnectionManager';
import {
  AdminAppearanceConfig,
  buildAdminAppearanceCssVars,
  ensureAdminFontResources,
  loadAdminAppearance,
  subscribeAdminAppearance,
  subscribeAdminAppearanceFromFirestore,
} from '../lib/adminAppearance';
import {
  AdminNavLayoutConfig,
  loadAdminNavLayout,
  moveGroupInLayout,
  moveItemInLayout,
  reorderPinnedTabsInLayout,
  resetAdminNavLayout,
  resolveSidebarGroupsForRender,
  saveAdminNavLayout,
  subscribeAdminNavLayout,
  subscribeAdminNavLayoutFromFirestore,
  syncAdminNavLayoutToFirestore,
  togglePinnedTabInLayout,
} from '../lib/adminNavLayout';
import {
  applyWebsiteFaviconToDocument,
  ensureWebsiteBrandingFontLoaded,
  loadStoredWebsiteBranding,
  normalizeWebsiteBranding,
  saveStoredWebsiteBranding,
} from '../lib/websiteBranding';
import {
  loadStoredPlaceholderConfig,
  normalizeImagePlaceholderConfig,
  saveStoredPlaceholderConfig,
} from '../lib/placeholderConfig';
import {
  getSiteThemeDefinition,
  loadStoredSiteThemeId,
  normalizeSiteThemeId,
  saveStoredSiteThemeId,
} from '../lib/siteThemes';
import {
  AdminPrivilegeRole,
  AdminRoleRecord,
  CastMember,
  CustomFontRecord,
  CustomFontSlot,
  DownloadMirror,
  EpisodeItem,
  HomeLayoutConfig,
  ImagePlaceholderConfig,
  MediaItem,
  MediaKind,
  PlayerThemeConfig,
  PopupShieldConfig,
  RequestStatus,
  ScraperAdapter,
  SeasonItem,
  SiteSettings,
  SiteThemeId,
  StreamServer,
  TypographyConfig,
  UserProfileRecord,
  VisitorRequest,
  WebsiteBrandingConfig,
} from '../types/media';

const ADMIN_SIDEBAR_ICON_MAP: Record<string, typeof LayoutDashboard> = {
  Activity,
  ArchiveRestore,
  BadgeCheck,
  BarChart3,
  BellRing,
  CheckSquare,
  Clapperboard,
  Database,
  DownloadCloud,
  Eye,
  FileText,
  Film,
  FolderKanban,
  Gauge,
  Globe,
  HardDrive,
  HeartPulse,
  ImageIcon,
  Inbox,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  ListOrdered,
  Lock,
  MessageSquare,
  MonitorPlay,
  Palette,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tags,
  Tv,
  Type,
  Users,
  Wrench,
};

function renderAdminSidebarIcon(
  iconName: string | undefined,
  className = 'w-4 h-4 shrink-0',
  color?: string
) {
  const IconComp = (iconName && ADMIN_SIDEBAR_ICON_MAP[iconName]) || FolderKanban;
  return <IconComp className={className} style={color ? { color } : undefined} />;
}

const MODERATOR_PERM_LABELS: {
  key: keyof ModeratorSubPermissions;
  title: string;
  desc: string;
}[] = [
  {
    key: 'allowBulkEditor',
    title: 'التعديل الجماعي والتصنيفات',
    desc: 'إتاحة تعديل الجودات والأقسام وإعادة التسمية الجماعية',
  },
  {
    key: 'allowContentAudit',
    title: 'فحص جودة المحتوى',
    desc: 'إتاحة كشف التكرارات والحلقات الناقصة والصور المفقودة',
  },
  {
    key: 'allowWatchServers',
    title: 'صحة وسيرفرات المشاهدة',
    desc: 'إتاحة جرد النطاقات وفحص السيرفرات المعطلة',
  },
  {
    key: 'allowAnalyticsRead',
    title: 'قراءة التحليلات المتقدمة',
    desc: 'عرض رسوم وتقارير المشاهدات والتقييمات',
  },
  {
    key: 'allowSiteScraper',
    title: 'جلب موقع بالكامل (Crawler)',
    desc: 'استيراد أقسام ومواقع كاملة دفعة واحدة',
  },
  {
    key: 'allowAdapters',
    title: 'تطوير مصادر الجلب (Adapters)',
    desc: 'إنشاء وتعديل قواعد استخراج المواقع الخارجية',
  },
  {
    key: 'allowCrawlOperations',
    title: 'عمليات ومهام الجلب',
    desc: 'مراقبة وإيقاف مهام الجلب الحية ومراجعة سجلها',
  },
];

interface AdminDashboardViewProps {
  user: User | null;
  isAdmin: boolean;
  adminRole?: AdminPrivilegeRole | null;
  authLoading: boolean;
  catalog: MediaItem[];
  isFirestoreSeeded: boolean;
  dbConnectionStatus?: FirestoreConnectionStatus;
  dbConnectionError?: string | null;
  onReconnectDatabase?: () => Promise<void> | void;
  hasDismissedStarters: boolean;
  requests: VisitorRequest[];
  usersList: UserProfileRecord[];
  adminsList: AdminRoleRecord[];
  siteSettings: SiteSettings;
  customFonts?: Partial<Record<CustomFontSlot, CustomFontRecord>>;
  onCustomFontsChange?: (next: Partial<Record<CustomFontSlot, CustomFontRecord>>) => void;
  onPopupShieldChange?: (next: PopupShieldConfig) => void;
  imagePlaceholderConfig?: ImagePlaceholderConfig;
  siteThemeId?: SiteThemeId;
  onSiteThemeChange?: (next: SiteThemeId) => void;
  recentlyWatchedUiConfig?: import('../types/media').RecentlyWatchedUiConfig;
  recentlyWatchedItems?: import('../types/media').RecentlyWatchedRecord[];
  onRecentlyWatchedUiChange?: (next: import('../types/media').RecentlyWatchedUiConfig) => void;
  requestedTab?: { tab: AdminTab; nonce: number };
  onTabChange?: (tab: AdminTab) => void;
  onExitDashboard: () => void;
  onPreviewMedia: (item: MediaItem) => void;
  onDeleteStarterItems: (ids: string[]) => void;
  onClearAllStarterItems: () => void;
  onRestoreStarterItems: () => void;
  onNotify: (msg: string) => void;
}

type EditorSubTab = 'basic' | 'servers' | 'downloads' | 'seasons_cast';

const POSTER_CHOICES = [
  { label: 'أكشن مستقبلي (Running Man)', url: ASSETS.runningMan },
  { label: 'أعماق المحيط (Fantasy)', url: ASSETS.oceanFantasy },
  { label: 'دراما رمضانية (Saraya)', url: ASSETS.ramadanEpic },
  { label: 'تحقيقات القاهرة (Noir)', url: ASSETS.arabianDrama },
  { label: 'ساموراي وضباب (Action)', url: ASSETS.samuraiAction },
  { label: 'فضاء وخيال علمي (Eclipse)', url: ASSETS.spaceOdyssey },
  { label: 'أنميشن ومغامرات (Clouds)', url: ASSETS.animatedAdventure },
  { label: 'رعب وغموض (Mansion)', url: ASSETS.horrorMansion },
  { label: 'حلبة المصارعة (Wrestling)', url: ASSETS.wrestlingArena },
];

const KIND_LABELS: Record<MediaKind, string> = {
  movie: 'فيلم',
  series: 'مسلسل',
  tv: 'برنامج / مسرحية',
  wrestling: 'مصارعة حرة',
};

const REQUEST_STATUS_LABELS: Record<RequestStatus, { label: string; cls: string }> = {
  pending: { label: 'قيد المراجعة', cls: 'bg-[#f9c400]/15 text-[#f9c400] border-[#f9c400]/30' },
  approved: { label: 'تمت الموافقة', cls: 'bg-sky-500/15 text-sky-300 border-sky-400/30' },
  completed: { label: 'تمت الإضافة', cls: 'bg-[#4CAF50]/15 text-[#4CAF50] border-[#4CAF50]/30' },
  rejected: { label: 'مرفوض', cls: 'bg-[#D92321]/15 text-[#D92321] border-[#D92321]/30' },
};

interface ServerStatusEntry {
  status: 'checking' | 'working' | 'warning' | 'broken';
  httpStatus?: number;
  label: string;
  detail?: string;
  sandboxBlocked?: boolean;
}

function extractIframeSrcPreview(embedCode?: string): string | null {
  if (!embedCode) return null;
  const match = embedCode.match(/src\s*=\s*["']([^"']+)["']/i);
  if (match) return match[1].trim();
  if (/^https?:\/\//i.test(embedCode.trim())) return embedCode.trim();
  return null;
}

function resolveWatchServerUrl(srv?: { mode?: 'url' | 'embed'; url?: string; embedCode?: string; watchUrl?: string }): string {
  if (!srv) return '';
  const fromEmbed = extractIframeSrcPreview(srv.embedCode);
  if (srv.mode === 'embed' && fromEmbed) return fromEmbed;
  if (srv.url && /^https?:\/\//i.test(srv.url.trim())) return srv.url.trim();
  if (srv.watchUrl && /^https?:\/\//i.test(srv.watchUrl.trim())) return srv.watchUrl.trim();
  if (fromEmbed) return fromEmbed;
  return (srv.url || srv.watchUrl || '').trim();
}

function renumberServers(servers: StreamServer[]): StreamServer[] {
  return servers.map((srv, idx) => {
    const existing = (srv.name || '').trim();
    const isGeneric =
      !existing ||
      /^سيرفر\s*\d*$/i.test(existing) ||
      /^server\s*\d*$/i.test(existing) ||
      existing === 'مستورد' ||
      existing.toLowerCase() === 'embed';
    return {
      ...srv,
      name: isGeneric ? `سيرفر ${idx + 1}` : existing,
    };
  });
}

function createEmptyMedia(): MediaItem {
  const id = `work-${Date.now()}`;
  return {
    id,
    slug: id,
    title: '',
    englishTitle: '',
    kind: 'movie',
    categories: ['افلام', 'افلام اجنبية'],
    genres: ['اكشن', 'إثارة'],
    year: '2026',
    country: 'الولايات المتحدة',
    language: 'الانجليزية',
    quality: 'WEB-DL',
    duration: '125 دقيقة',
    imdb: 0,
    votes: '0',
    views: 1500,
    likes: 240,
    pinned: false,
    isNew: true,
    comingSoon: false,
    poster: ASSETS.runningMan,
    poster_url: ASSETS.runningMan,
    backdrop: ASSETS.heroBackdrop,
    backdrop_url: ASSETS.heroBackdrop,
    poster_width: 0,
    poster_height: 0,
    backdrop_width: 0,
    backdrop_height: 0,
    image_source: 'manual',
    image_quality_status: 'unknown',
    tagline: '',
    story: '',
    shortUrl: buildDedicatedMediaUrl({ id, slug: id }),
    trailerUrl: '',
    trailerLabel: 'الإعلان الرسمي المترجم',
    trailerDuration: '02:15',
    cast: [{ name: 'نجم العمل', role: 'البطل', initials: 'RT' }],
    seasons: [],
    franchiseIds: [],
    servers: [
      {
        id: `srv-${Date.now()}-1`,
        name: 'سيرفر 1',
        mode: 'url',
        url: '',
        embedCode: '',
        quality: '1080p Full HD',
        speed: 'فائق السرعة',
        tag: 'رئيسي',
      },
    ],
    downloads: [
      {
        id: `dl-${Date.now()}-1`,
        host: 'رابط تحميل مباشر',
        quality: '1080p',
        size: '1.8 GB',
        format: 'MP4',
        url: '',
      },
    ],
  };
}

function sanitizeImportedEpisode(ep: EpisodeItem, fallbackQuality: string): EpisodeItem {
  const cleanEpServers = renumberServers(
    (ep.servers || []).filter((srv) => {
      const resolved = resolveWatchServerUrl(srv);
      return Boolean(resolved && !isLikelyNonVideoWebsiteUrl(resolved));
    })
  );
  const rawWatch = (ep.watchUrl || '').trim();
  const safeWatch =
    rawWatch && !isLikelyNonVideoWebsiteUrl(rawWatch)
      ? rawWatch
      : cleanEpServers[0]?.url || '';
  return {
    ...ep,
    quality: ep.quality || fallbackQuality || 'WEB-DL',
    watchUrl: safeWatch,
    embedCode: (ep.embedCode || cleanEpServers[0]?.embedCode || '').trim(),
    servers: cleanEpServers,
  };
}

function scrapedToMediaItem(scraped: ScrapedPayload, indexOffset = 0): MediaItem {
  const id = `imported-${Date.now()}-${indexOffset}-${Math.random().toString(36).slice(2, 6)}`;
  const slug = generateCleanSlug(scraped.englishTitle, scraped.title, id);
  const cleanSeasons: SeasonItem[] = (scraped.seasons || []).map((season) => ({
    ...season,
    episodes: (season.episodes || []).map((ep) =>
      sanitizeImportedEpisode(ep, scraped.quality || 'WEB-DL')
    ),
  }));

  let cleanRootServers = renumberServers(
    (scraped.servers || []).filter((srv) => {
      const resolved = resolveWatchServerUrl(srv);
      return Boolean(resolved && !isLikelyNonVideoWebsiteUrl(resolved));
    })
  );

  if (cleanRootServers.length === 0 && cleanSeasons[0]?.episodes?.[0]?.servers?.length) {
    cleanRootServers = renumberServers(
      cleanSeasons[0].episodes[0].servers.map((srv, idx) => ({
        ...srv,
        id: srv.id || `srv-ep1-${Date.now()}-${idx}`,
      }))
    );
  }

  const posterCandidate =
    upgradeKnownImageUrl(scraped.poster_url || scraped.poster || ASSETS.runningMan) ||
    ASSETS.runningMan;
  const rawBackdropCandidate = upgradeKnownImageUrl(scraped.backdrop_url || scraped.backdrop || '');
  const isBackdropSameAsPoster =
    Boolean(rawBackdropCandidate) && rawBackdropCandidate === posterCandidate;
  const isBackdropPortrait =
    Number(scraped.backdrop_width) > 0 &&
    Number(scraped.backdrop_height) > 0 &&
    Number(scraped.backdrop_width) <= Number(scraped.backdrop_height);
  const cleanBackdropUrl =
    rawBackdropCandidate && !isBackdropSameAsPoster && !isBackdropPortrait
      ? rawBackdropCandidate
      : '';
  const pw = Number(scraped.poster_width) || 0;
  const ph = Number(scraped.poster_height) || 0;
  const bw = cleanBackdropUrl ? Number(scraped.backdrop_width) || 0 : 0;
  const bh = cleanBackdropUrl ? Number(scraped.backdrop_height) || 0 : 0;

  return {
    id,
    slug,
    title: scraped.title || 'عمل مستورد جديد',
    englishTitle: scraped.englishTitle || scraped.title || 'Imported Title',
    kind: scraped.kind || 'movie',
    categories: scraped.categories?.length ? scraped.categories : ['افلام'],
    genres: scraped.genres?.length ? scraped.genres : ['دراما'],
    year: scraped.year || '2026',
    country: scraped.country || 'الولايات المتحدة',
    language: scraped.language || 'مترجم للعربية',
    quality: scraped.quality || 'WEB-DL',
    duration: scraped.duration || '120 دقيقة',
    imdb: 0,
    votes: '0',
    views: 0,
    likes: 0,
    pinned: false,
    isNew: true,
    comingSoon: false,
    poster: posterCandidate,
    poster_url: posterCandidate,
    backdrop: cleanBackdropUrl || ASSETS.heroBackdrop,
    backdrop_url: cleanBackdropUrl,
    poster_width: pw,
    poster_height: ph,
    backdrop_width: bw,
    backdrop_height: bh,
    image_source: scraped.image_source || 'scraper',
    image_quality_status:
      scraped.image_quality_status ||
      evaluateImageQuality({
        posterUrl: posterCandidate,
        backdropUrl: cleanBackdropUrl,
        posterWidth: pw,
        posterHeight: ph,
        backdropWidth: bw,
        backdropHeight: bh,
      }),
    tagline: scraped.tagline || scraped.story?.slice(0, 120) || '',
    story: scraped.story || scraped.title,
    shortUrl: buildDedicatedMediaUrl({ id, slug }),
    trailerUrl: scraped.trailerUrl || '',
    trailerLabel: `إعلان ${scraped.title}`,
    trailerDuration: '02:00',
    cast: scraped.cast?.length ? scraped.cast : [{ name: 'طاقم العمل', role: 'تمثيل', initials: 'RT' }],
    seasons: cleanSeasons,
    franchiseIds: [],
    servers: cleanRootServers,
    downloads:
      scraped.downloads?.length > 0
        ? scraped.downloads
        : [
            {
              id: `dl-${Date.now()}`,
              host: 'رابط تحميل مباشر',
              quality: scraped.quality || '1080p',
              size: 'حسب السيرفر',
              format: 'MP4',
              url: '',
            },
          ],
  };
}

export function AdminDashboardView({
  user,
  isAdmin,
  adminRole,
  authLoading,
  catalog,
  isFirestoreSeeded,
  dbConnectionStatus,
  dbConnectionError,
  onReconnectDatabase,
  hasDismissedStarters,
  requests,
  usersList,
  adminsList,
  siteSettings,
  customFonts,
  onCustomFontsChange,
  onPopupShieldChange,
  imagePlaceholderConfig,
  siteThemeId,
  onSiteThemeChange,
  recentlyWatchedUiConfig,
  recentlyWatchedItems,
  onRecentlyWatchedUiChange,
  requestedTab,
  onTabChange,
  onExitDashboard,
  onPreviewMedia,
  onDeleteStarterItems,
  onClearAllStarterItems,
  onRestoreStarterItems,
  onNotify,
}: AdminDashboardViewProps) {
  const effectiveRole: AdminPrivilegeRole | null =
    adminRole !== undefined ? adminRole : isAdmin ? 'owner' : null;
  const isOwner = effectiveRole === 'owner';
  const activeActorUid = user?.uid || '';
  const activeActorName =
    user?.displayName ||
    user?.email ||
    (isOwner ? 'المسؤول الأساسي' : 'مشرف');
  const activeActorEmail = user?.email || '';
  const hasActor = Boolean(user);

  const handleCombinedSignOut = async () => {
    await signOutFirebase().catch(() => undefined);
  };

  const [workspacePrefs, setWorkspacePrefs] = useState<AdminWorkspacePrefs>(() =>
    loadAdminWorkspacePrefs()
  );

  const updateWorkspacePrefs = useCallback((patch: Partial<AdminWorkspacePrefs>) => {
    setWorkspacePrefs((prev) => {
      const next = { ...prev, ...patch };
      saveAdminWorkspacePrefs(next);
      return next;
    });
  }, []);

  const updateCatalogTablePrefs = useCallback((patch: Partial<CatalogTablePrefs>) => {
    setWorkspacePrefs((prev) => {
      const next: AdminWorkspacePrefs = {
        ...prev,
        catalogTable: {
          ...prev.catalogTable,
          ...patch,
          visibleColumns: {
            ...prev.catalogTable.visibleColumns,
            ...(patch.visibleColumns || {}),
          },
        },
      };
      saveAdminWorkspacePrefs(next);
      return next;
    });
  }, []);

  const updateModeratorPerm = useCallback(
    (key: keyof ModeratorSubPermissions, value: boolean) => {
      const nextPerms = normalizeModeratorSubPermissions({
        ...workspacePrefs.moderatorSubPermissions,
        [key]: value,
      });
      setWorkspacePrefs((prev) => {
        const next: AdminWorkspacePrefs = {
          ...prev,
          moderatorSubPermissions: nextPerms,
        };
        saveAdminWorkspacePrefs(next);
        return next;
      });
      if (isOwner && activeActorUid) {
        void syncModeratorPermissionsToFirestore(nextPerms, activeActorUid).then((ok) => {
          if (!ok) {
            onNotifyRef.current('تم حفظ الصلاحية محلياً — تعذرت المزامنة مع Firestore');
          }
        });
      }
    },
    [workspacePrefs.moderatorSubPermissions, isOwner, activeActorUid]
  );

  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    const requestedNonce = requestedTab?.nonce || 0;
    const requested = requestedTab?.tab;
    if (
      requestedNonce > 0 &&
      requested &&
      isTabAccessible(requested, isOwner, workspacePrefs.moderatorSubPermissions)
    ) {
      return requested;
    }
    const stored = workspacePrefs.lastTab as AdminTab;
    if (
      stored &&
      findAdminNavItem(stored) &&
      isTabAccessible(stored, isOwner, workspacePrefs.moderatorSubPermissions)
    ) {
      return stored;
    }
    if (requested && isTabAccessible(requested, isOwner, workspacePrefs.moderatorSubPermissions)) {
      return requested;
    }
    return isOwner ? 'overview' : 'catalog';
  });

  const mainScrollRef = useRef<HTMLElement | null>(null);
  const prevActiveTabRef = useRef<AdminTab>(activeTab);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.scrollY !== 0) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  useLayoutEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      prevActiveTabRef.current = activeTab;
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollTop = 0;
      }
      if (typeof window !== 'undefined' && window.scrollY !== 0) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
  }, [activeTab]);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [localSiteThemeId, setLocalSiteThemeId] = useState<SiteThemeId>(() =>
    normalizeSiteThemeId(siteThemeId || loadStoredSiteThemeId())
  );
  useEffect(() => {
    if (siteThemeId) {
      setLocalSiteThemeId(normalizeSiteThemeId(siteThemeId));
    }
  }, [siteThemeId]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(() =>
    loadAdminNotifications().filter((n) => !n.read).length
  );
  const [runningCrawlCount, setRunningCrawlCount] = useState<number>(() =>
    loadCrawlTasks().filter((t) => t.status === 'running').length
  );
  const [tvModeActive, setTvModeActive] = useState<boolean>(() =>
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-rtv-tv-mode') === 'true'
  );
  const loggedUnauthorizedRef = useRef<Set<string>>(new Set());
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const [adminAppearance, setAdminAppearance] = useState<AdminAppearanceConfig>(() =>
    loadAdminAppearance()
  );
  const [adminNavLayout, setAdminNavLayout] = useState<AdminNavLayoutConfig>(() =>
    loadAdminNavLayout()
  );

  useEffect(() => {
    const unsub = subscribeAdminAppearance(setAdminAppearance);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeAdminNavLayout(setAdminNavLayout);
    return () => unsub();
  }, []);

  useEffect(() => {
    ensureAdminFontResources(adminAppearance, 'active');
  }, [adminAppearance]);

  useEffect(() => {
    const enabled = Boolean(isOwner && dbConnectionStatus === 'connected');
    const unsubApp = subscribeAdminAppearanceFromFirestore(enabled, setAdminAppearance);
    const unsubNav = subscribeAdminNavLayoutFromFirestore(enabled, setAdminNavLayout);
    return () => {
      unsubApp();
      unsubNav();
    };
  }, [isOwner, dbConnectionStatus]);

  useEffect(() => {
    const enabled = Boolean(isAdmin && dbConnectionStatus === 'connected');
    return subscribeModeratorPermissionsFromFirestore(enabled, (remotePerms) => {
      setWorkspacePrefs((prev) => {
        const next: AdminWorkspacePrefs = {
          ...prev,
          moderatorSubPermissions: remotePerms,
        };
        saveAdminWorkspacePrefs(next);
        return next;
      });
    });
  }, [isAdmin, dbConnectionStatus]);

  const adminCssVars = useMemo(
    () => buildAdminAppearanceCssVars(adminAppearance) as CSSProperties,
    [adminAppearance]
  );

  const resolvedSidebarGroups = useMemo(
    () =>
      resolveSidebarGroupsForRender(
        adminNavLayout,
        isOwner,
        workspacePrefs.moderatorSubPermissions
      ),
    [adminNavLayout, isOwner, workspacePrefs.moderatorSubPermissions]
  );

  const accessibleNavItems = useMemo(
    () =>
      getAllAdminNavItems().filter((item) =>
        isTabAccessible(item.id, isOwner, workspacePrefs.moderatorSubPermissions)
      ),
    [isOwner, workspacePrefs.moderatorSubPermissions]
  );

  const currentNavMeta = useMemo(() => {
    const base = findAdminNavItem(activeTab) || {
      group: ADMIN_NAV_GROUPS[0],
      item: ADMIN_NAV_GROUPS[0].items[0],
    };
    const layoutGrp = adminNavLayout.groups.find((g) =>
      g.items.some((entry) => entry.id === base.item.id)
    );
    const canonicalGrp = ADMIN_NAV_GROUPS.find((g) => g.id === (layoutGrp?.id || base.group.id));
    return layoutGrp
      ? {
          group: {
            ...base.group,
            id: layoutGrp.id as typeof base.group.id,
            label: layoutGrp.label,
            accentColor: canonicalGrp?.accentColor || base.group.accentColor,
            iconName: canonicalGrp?.iconName || base.group.iconName,
          },
          item: base.item,
        }
      : base;
  }, [activeTab, adminNavLayout]);

  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [sidebarReorderMode, setSidebarReorderMode] = useState(false);
  const [draggedSidebarGroupId, setDraggedSidebarGroupId] = useState<string | null>(null);
  const [draggedSidebarItemId, setDraggedSidebarItemId] = useState<AdminTab | null>(null);
  const [draggedPinnedTabId, setDraggedPinnedTabId] = useState<AdminTab | null>(null);

  const [openGroupIds, setOpenGroupIds] = useState<string[]>(() => {
    if (Array.isArray(workspacePrefs.openGroupIds) && workspacePrefs.openGroupIds.length > 0) {
      return workspacePrefs.openGroupIds;
    }
    const initMeta = findAdminNavItem(activeTab);
    return [initMeta?.group.id || ADMIN_NAV_GROUPS[0].id];
  });

  const toggleSidebarGroup = useCallback(
    (groupId: string) => {
      setOpenGroupIds((prev) => {
        const isOpen = prev.includes(groupId);
        let next: string[];
        if (isOpen) {
          next = prev.filter((id) => id !== groupId);
        } else if (workspacePrefs.accordionMultiOpen) {
          next = [...prev, groupId];
        } else {
          next = [groupId];
        }
        updateWorkspacePrefs({ openGroupIds: next });
        return next;
      });
    },
    [workspacePrefs.accordionMultiOpen, updateWorkspacePrefs]
  );

  const persistSidebarLayoutUpdate = useCallback(
    (nextLayout: AdminNavLayoutConfig, notifyText?: string) => {
      const saved = saveAdminNavLayout(nextLayout);
      setAdminNavLayout(saved);
      if (isOwner && activeActorUid) {
        void syncAdminNavLayoutToFirestore(saved, activeActorUid);
      }
      if (notifyText) onNotifyRef.current(notifyText);
    },
    [isOwner, activeActorUid]
  );

  const onTabChangeRef = useRef(onTabChange);
  useEffect(() => {
    onTabChangeRef.current = onTabChange;
  }, [onTabChange]);

  const navigateToTab = useCallback(
    (target: AdminTab, options?: { skipRouterSync?: boolean }) => {
      if (!isTabAccessible(target, isOwner, workspacePrefs.moderatorSubPermissions)) {
        const sig = `${activeActorUid || 'anon'}:${target}`;
        if (!loggedUnauthorizedRef.current.has(sig)) {
          loggedUnauthorizedRef.current.add(sig);
          reportClientError({
            source: 'rbac.unauthorized_tab',
            level: 'warn',
            message: `Blocked unauthorized navigation to admin tab "${target}"`,
            context: { targetTab: target, role: effectiveRole || 'none' },
          });
        }
        onNotifyRef.current('ليست لديك صلاحية للوصول إلى هذا القسم.');
        setActiveTab('catalog');
        setMobileDrawerOpen(false);
        if (!options?.skipRouterSync) {
          onTabChangeRef.current?.('catalog');
        }
        return;
      }
      setActiveTab(target);
      setMobileDrawerOpen(false);
      updateWorkspacePrefs({ lastTab: target });
      if (!options?.skipRouterSync) {
        onTabChangeRef.current?.(target);
      }
      const targetLayoutGroup = adminNavLayout.groups.find((g) =>
        g.items.some((entry) => entry.id === target)
      );
      const targetGroupId =
        targetLayoutGroup?.id || findAdminNavItem(target)?.group.id || '';
      if (targetGroupId) {
        setOpenGroupIds((prev) => {
          if (prev.includes(targetGroupId)) return prev;
          const next = workspacePrefs.accordionMultiOpen ? [...prev, targetGroupId] : [targetGroupId];
          updateWorkspacePrefs({ openGroupIds: next });
          return next;
        });
      }
    },
    [
      isOwner,
      workspacePrefs.moderatorSubPermissions,
      workspacePrefs.accordionMultiOpen,
      adminNavLayout.groups,
      activeActorUid,
      effectiveRole,
      updateWorkspacePrefs,
    ]
  );

  const lastHandledNonceRef = useRef<number>(requestedTab?.nonce || 0);
  const navigateToTabRef = useRef(navigateToTab);
  useEffect(() => {
    navigateToTabRef.current = navigateToTab;
  }, [navigateToTab]);

  useEffect(() => {
    const nonce = requestedTab?.nonce || 0;
    if (nonce > 0 && nonce !== lastHandledNonceRef.current && requestedTab?.tab) {
      lastHandledNonceRef.current = nonce;
      navigateToTabRef.current(requestedTab.tab, { skipRouterSync: true });
    }
  }, [requestedTab?.nonce, requestedTab?.tab]);

  useEffect(() => {
    if (!isTabAccessible(activeTab, isOwner, workspacePrefs.moderatorSubPermissions)) {
      const sig = `${activeActorUid || 'anon'}:${activeTab}`;
      if (!loggedUnauthorizedRef.current.has(sig)) {
        loggedUnauthorizedRef.current.add(sig);
        reportClientError({
          source: 'rbac.unauthorized_tab',
          level: 'warn',
          message: `Redirected from restricted tab "${activeTab}"`,
          context: { targetTab: activeTab, role: effectiveRole || 'none' },
        });
      }
      setActiveTab('catalog');
    }
  }, [activeTab, isOwner, workspacePrefs.moderatorSubPermissions, activeActorUid, effectiveRole]);

  useEffect(() => {
    const syncTasks = () => {
      setRunningCrawlCount(loadCrawlTasks().filter((t) => t.status === 'running').length);
      setUnreadNotificationsCount(loadAdminNotifications().filter((n) => !n.read).length);
    };
    syncTasks();
    const unsub = subscribeCrawlTasks(syncTasks);
    return () => unsub();
  }, [activeTab]);

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const syncTv = () =>
      setTvModeActive(document.documentElement.getAttribute('data-rtv-tv-mode') === 'true');
    syncTv();
    const observer = new MutationObserver(syncTv);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-rtv-tv-mode'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      const sig = `admin_gate:${user.uid}`;
      if (!loggedUnauthorizedRef.current.has(sig)) {
        loggedUnauthorizedRef.current.add(sig);
        reportClientError({
          source: 'rbac.unauthorized_admin_gate',
          level: 'warn',
          message: `Authenticated non-admin account attempted to open /admin`,
          context: { uid: user.uid, email: user.email || '' },
        });
      }
    }
  }, [authLoading, user, isAdmin]);

  const [busyAction, setBusyAction] = useState(false);
  const [reconnectingDb, setReconnectingDb] = useState(false);
  const [adminSigningIn, setAdminSigningIn] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [adminLoginEmail, setAdminLoginEmail] = useState('');
  const [adminLoginPassword, setAdminLoginPassword] = useState('');

  // Catalog tab states
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  const [editingSliderPngUrl, setEditingSliderPngUrl] = useState('');
  const [editingSliderDurationSec, setEditingSliderDurationSec] = useState('');
  const [uploadingSliderPng, setUploadingSliderPng] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorSubTab>('basic');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [confirmBulkDeleteMode, setConfirmBulkDeleteMode] = useState<'selected' | 'all' | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (mobileDrawerOpen) {
        e.preventDefault();
        setMobileDrawerOpen(false);
      } else if (editingItem) {
        e.preventDefault();
        setEditingItem(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileDrawerOpen, editingItem]);

  // Categories/Genres helper inputs inside editor modal
  const [categoriesText, setCategoriesText] = useState('');
  const [genresText, setGenresText] = useState('');
  const [quickGenCount, setQuickGenCount] = useState(10);
  const [expandedEpisodeKey, setExpandedEpisodeKey] = useState<string | null>(null);

  // External Content Scraper states (Single Item)
  const [scrapeMode, setScrapeMode] = useState<'url' | 'html'>('url');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeRawHtml, setScrapeRawHtml] = useState('');
  const [scraping, setScraping] = useState(false);
  const [activeSingleCrawlId, setActiveSingleCrawlId] = useState<string | null>(null);
  const singleCrawlAbortRef = useRef<AbortController | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapedResult, setScrapedResult] = useState<ScrapedPayload | null>(null);
  const [editingScrapedServerIdx, setEditingScrapedServerIdx] = useState<number | null>(null);
  const [fetchingTrailer, setFetchingTrailer] = useState(false);
  const [fetchingHqImages, setFetchingHqImages] = useState(false);
  const [probingEditorImages, setProbingEditorImages] = useState(false);
  const [editorImageProposal, setEditorImageProposal] = useState<ResolvedImageBundle | null>(null);

  // Site-Wide Bulk Crawler states (Entire Website)
  const [siteScrapeMode, setSiteScrapeMode] = useState<'url' | 'html'>('url');
  const [siteCrawlUrl, setSiteCrawlUrl] = useState('');
  const [siteCrawlHtml, setSiteCrawlHtml] = useState('');
  const [siteMaxItems, setSiteMaxItems] = useState(30);
  const [siteMaxPages, setSiteMaxPages] = useState(3);
  const [siteDeepScrape, setSiteDeepScrape] = useState(true);
  const [siteCrawling, setSiteCrawling] = useState(false);
  const [activeSiteCrawlId, setActiveSiteCrawlId] = useState<string | null>(null);
  const siteCrawlAbortRef = useRef<AbortController | null>(null);
  const [siteCrawlError, setSiteCrawlError] = useState<string | null>(null);
  const [siteCrawlMeta, setSiteCrawlMeta] = useState<{
    strategy: string;
    siteTitle: string;
    totalDiscovered: number;
  } | null>(null);
  const [siteScrapedItems, setSiteScrapedItems] = useState<
    (ScrapedPayload & { tempKey: string; selected: boolean })[]
  >([]);
  const [siteKindFilter, setSiteKindFilter] = useState<'all' | MediaKind>('all');

  // Smart Scraper Adapters state (Firestore + local fallback + backend registry sync)
  const [scraperAdapters, setScraperAdapters] = useState<ScraperAdapter[]>(() =>
    loadLocalScraperAdapters()
  );
  const [adaptersCloudSynced, setAdaptersCloudSynced] = useState(false);
  const [scrapedAdapterUsed, setScrapedAdapterUsed] = useState<{
    id: string;
    name: string;
    version: number;
  } | null>(null);
  const [siteCrawlAdapterUsed, setSiteCrawlAdapterUsed] = useState<{
    id: string;
    name: string;
    version: number;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeScraperAdapters((list, fromCloud) => {
      setScraperAdapters(list);
      setAdaptersCloudSynced(fromCloud);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!shouldSkipBackendApiCalls()) {
      void syncAdaptersToBackendRegistry(scraperAdapters, user);
    }
  }, [scraperAdapters, user]);

  const matchedSingleAdapter = useMemo(
    () =>
      scrapeMode === 'url' && scrapeUrl.trim()
        ? matchAdapterForUrl(scrapeUrl, scraperAdapters)
        : null,
    [scrapeMode, scrapeUrl, scraperAdapters]
  );

  const matchedSiteAdapter = useMemo(
    () =>
      siteScrapeMode === 'url' && siteCrawlUrl.trim()
        ? matchAdapterForUrl(siteCrawlUrl, scraperAdapters)
        : null,
    [siteScrapeMode, siteCrawlUrl, scraperAdapters]
  );

  // Requests tab states
  const [reqStatusFilter, setReqStatusFilter] = useState<string>('all');
  const [adminReplies, setAdminReplies] = useState<
    Record<string, { status: RequestStatus; note: string }>
  >({});

  // Admins tab states
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<AdminPrivilegeRole>('moderator');
  const [createAdminName, setCreateAdminName] = useState('');
  const [createAdminEmail, setCreateAdminEmail] = useState('');
  const [createAdminPassword, setCreateAdminPassword] = useState('');
  const [createAdminRole, setCreateAdminRole] = useState<AdminPrivilegeRole>('moderator');
  const [createAdminError, setCreateAdminError] = useState<string | null>(null);
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Settings tab state
  const [settingsForm, setSettingsForm] = useState<SiteSettings>(() => ({
    ...siteSettings,
    playerTheme: normalizePlayerTheme(siteSettings.playerTheme || loadStoredPlayerTheme()),
    homeConfig: normalizeHomeConfig(siteSettings.homeConfig || loadStoredHomeConfig()),
    typography: normalizeTypographyConfig(siteSettings.typography || loadStoredTypographyConfig()),
    popupShield: normalizePopupShieldConfig(
      siteSettings.popupShield || loadStoredPopupShieldConfig()
    ),
    branding: normalizeWebsiteBranding(
      siteSettings.branding || loadStoredWebsiteBranding(siteSettings.siteName),
      siteSettings.siteName
    ),
  }));
  const [customApiUrl, setCustomApiUrl] = useState<string>(() => getCustomApiBaseUrl());
  const [testingProxy, setTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  useEffect(() => {
    setSettingsForm({
      ...siteSettings,
      playerTheme: normalizePlayerTheme(siteSettings.playerTheme || loadStoredPlayerTheme()),
      homeConfig: normalizeHomeConfig(siteSettings.homeConfig || loadStoredHomeConfig()),
      typography: normalizeTypographyConfig(siteSettings.typography || loadStoredTypographyConfig()),
      popupShield: normalizePopupShieldConfig(
        siteSettings.popupShield || loadStoredPopupShieldConfig()
      ),
      branding: normalizeWebsiteBranding(
        siteSettings.branding || loadStoredWebsiteBranding(siteSettings.siteName),
        siteSettings.siteName
      ),
    });
  }, [siteSettings]);

  const activeHomeConfig = normalizeHomeConfig(
    settingsForm.homeConfig || siteSettings.homeConfig || loadStoredHomeConfig()
  );

  const activePlayerTheme = normalizePlayerTheme(
    settingsForm.playerTheme || siteSettings.playerTheme || loadStoredPlayerTheme()
  );

  const activeTypography = useMemo(
    () =>
      normalizeTypographyConfig(
        settingsForm.typography || siteSettings.typography || loadStoredTypographyConfig()
      ),
    [settingsForm.typography, siteSettings.typography]
  );

  const activePopupShield = useMemo(
    () =>
      normalizePopupShieldConfig(
        settingsForm.popupShield || siteSettings.popupShield || loadStoredPopupShieldConfig()
      ),
    [settingsForm.popupShield, siteSettings.popupShield]
  );

  const activeBranding = useMemo(
    () =>
      normalizeWebsiteBranding(
        settingsForm.branding ||
          siteSettings.branding ||
          loadStoredWebsiteBranding(settingsForm.siteName || siteSettings.siteName),
        settingsForm.siteName || siteSettings.siteName
      ),
    [settingsForm.branding, settingsForm.siteName, siteSettings.branding, siteSettings.siteName]
  );

  const [localPlaceholderConfig, setLocalPlaceholderConfig] = useState<ImagePlaceholderConfig>(() =>
    normalizeImagePlaceholderConfig(imagePlaceholderConfig || loadStoredPlaceholderConfig())
  );
  useEffect(() => {
    if (imagePlaceholderConfig) {
      setLocalPlaceholderConfig(normalizeImagePlaceholderConfig(imagePlaceholderConfig));
    }
  }, [imagePlaceholderConfig]);

  const [localRwUiConfig, setLocalRwUiConfig] = useState(() =>
    recentlyWatchedUiConfig || null
  );
  useEffect(() => {
    if (recentlyWatchedUiConfig) {
      setLocalRwUiConfig(recentlyWatchedUiConfig);
    }
  }, [recentlyWatchedUiConfig]);

  const effectiveCustomFonts = useMemo(
    () => customFonts || loadStoredCustomFonts(),
    [customFonts]
  );

  useEffect(() => {
    applyTypographyToDocument(activeTypography, effectiveCustomFonts);
  }, [activeTypography, effectiveCustomFonts]);

  const updatePlayerTheme = (patch: Partial<PlayerThemeConfig>, keepPreset = false) => {
    const next = normalizePlayerTheme({
      ...activePlayerTheme,
      ...patch,
      presetId: keepPreset ? (patch.presetId ?? activePlayerTheme.presetId) : 'custom',
    });
    saveStoredPlayerTheme(next);
    setSettingsForm((prev) => ({ ...prev, playerTheme: next }));
  };

  // Pre-Publish Preview Modal state
  const [previewModalState, setPreviewModalState] = useState<{
    item: MediaItem;
    source: 'editor' | 'scraper' | 'site_scraper';
  } | null>(null);

  // Server Status Health Checker State
  const [serverStatuses, setServerStatuses] = useState<Record<string, ServerStatusEntry>>({});
  const serverStatusesRef = useRef<Record<string, ServerStatusEntry>>({});
  const [checkingCatalogLinks, setCheckingCatalogLinks] = useState(false);

  const checkServerUrls = useCallback(async (rawUrls: string[], force = false) => {
    const validUrls = Array.from(
      new Set(
        rawUrls
          .map((u) => u.trim())
          .filter((u) => /^https?:\/\//i.test(u))
      )
    );
    if (validUrls.length === 0) return;

    const currentMap = serverStatusesRef.current;
    const targetsToCheck = validUrls.filter((u) => {
      const existing = currentMap[u];
      if (!existing) return true;
      if (existing.status === 'checking') return false;
      return force;
    });
    if (targetsToCheck.length === 0) return;

    const checkingPatch: Record<string, ServerStatusEntry> = {};
    for (const u of targetsToCheck) {
      checkingPatch[u] = { status: 'checking', label: 'جاري الفحص...' };
    }
    serverStatusesRef.current = { ...serverStatusesRef.current, ...checkingPatch };
    setServerStatuses(serverStatusesRef.current);

    try {
      for (let i = 0; i < targetsToCheck.length; i += 35) {
        const chunk = targetsToCheck.slice(i, i + 35);
        let handledByApi = false;
        if (!shouldSkipBackendApiCalls()) {
          try {
            const response = await fetch(resolveApiEndpoint('/api/check-servers'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ urls: chunk }),
            });
            const contentType = response.headers.get('content-type') || '';
            const data = contentType.includes('application/json')
              ? ((await response.json()) as {
                  ok?: boolean;
                  results?: Record<string, ServerStatusEntry>;
                })
              : null;
            if (response.ok && data?.ok && data.results) {
              serverStatusesRef.current = { ...serverStatusesRef.current, ...data.results };
              setServerStatuses(serverStatusesRef.current);
              handledByApi = true;
            }
          } catch {
            // Fall through to browser check when static hosting is active
          }
        }

        if (!handledByApi) {
          const browserResults = await checkServerUrlsInBrowser(chunk);
          serverStatusesRef.current = { ...serverStatusesRef.current, ...browserResults };
          setServerStatuses(serverStatusesRef.current);
        }
      }
    } catch {
      const errPatch: Record<string, ServerStatusEntry> = {};
      for (const u of targetsToCheck) {
        errPatch[u] = { status: 'warning', label: 'تعذر الفحص', detail: 'تعذر التحقق من الرابط' };
      }
      serverStatusesRef.current = { ...serverStatusesRef.current, ...errPatch };
      setServerStatuses(serverStatusesRef.current);
    }
  }, []);

  // Automatically check server & episode watch URLs whenever editingItem opens or URLs change
  const editingServerUrlsKey = useMemo(() => {
    if (!editingItem) return '';
    const urls: string[] = [];
    (editingItem.servers || []).forEach((s) => {
      const u = resolveWatchServerUrl(s);
      if (/^https?:\/\//i.test(u)) urls.push(u);
    });
    (editingItem.seasons || []).forEach((se) => {
      (se.episodes || []).forEach((ep) => {
        const u = resolveWatchServerUrl(ep);
        if (/^https?:\/\//i.test(u)) urls.push(u);
        (ep.servers || []).forEach((es) => {
          const eu = resolveWatchServerUrl(es);
          if (/^https?:\/\//i.test(eu)) urls.push(eu);
        });
      });
    });
    return Array.from(new Set(urls)).slice(0, 45).join('|');
  }, [editingItem]);

  useEffect(() => {
    if (!editingItem || !editingServerUrlsKey) return;
    const urls = editingServerUrlsKey.split('|').filter(Boolean);
    const timer = setTimeout(() => {
      void checkServerUrls(urls, false);
    }, 450);
    return () => clearTimeout(timer);
  }, [editingItem, editingServerUrlsKey, checkServerUrls]);

  const renderServerStatusBadge = (rawUrl: string, compact = false) => {
    const clean = (rawUrl || '').trim();
    if (!clean) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] font-bold text-[#b7c9ef]/60">
          <span className="h-2 w-2 rounded-full bg-white/30" />
          <span>{compact ? 'فارغ' : 'لم يُضف رابط'}</span>
        </span>
      );
    }
    if (!/^https?:\/\//i.test(clean)) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#D92321]/15 border border-[#D92321]/40 px-2.5 py-1 text-[11px] font-bold text-[#ff8a88]">
          <span className="h-2 w-2 rounded-full bg-[#D92321]" />
          <span>صيغة غير صالحة</span>
        </span>
      );
    }
    const info = serverStatuses[clean];
    if (!info || info.status === 'checking') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/15 border border-sky-400/30 px-2.5 py-1 text-[11px] font-bold text-sky-300">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>جاري الفحص...</span>
        </span>
      );
    }

    const colorCls =
      info.status === 'working'
        ? 'bg-[#4CAF50]/15 border-[#4CAF50]/40 text-[#4CAF50]'
        : info.status === 'warning'
          ? 'bg-[#f9c400]/15 border-[#f9c400]/40 text-[#f9c400]'
          : 'bg-[#D92321]/15 border-[#D92321]/40 text-[#ff8a88]';

    const dotCls =
      info.status === 'working'
        ? 'bg-[#4CAF50]'
        : info.status === 'warning'
          ? 'bg-[#f9c400]'
          : 'bg-[#D92321]';

    return (
      <span
        title={info.detail || info.label}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-extrabold ${colorCls}`}
      >
        <span className={`h-2 w-2 rounded-full ${dotCls}`} />
        <span>{info.label}</span>
        {!compact && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void checkServerUrls([clean], true);
            }}
            title="إعادة فحص هذا الرابط الآن"
            className="mr-0.5 rounded p-0.5 hover:bg-black/20 cursor-pointer"
            aria-label="إعادة فحص السيرفر"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  };

  const pendingRequestsCount = useMemo(
    () => requests.filter((r) => r.status === 'pending').length,
    [requests]
  );

  const catalogAuditSummary = useMemo(() => runCatalogContentAudit(catalog), [catalog]);

  const totalBellBadgeCount = useMemo(() => {
    const computedAlerts =
      (isOwner && !isFirestoreSeeded ? 1 : 0) +
      (isOwner && pendingRequestsCount > 0 ? 1 : 0) +
      (catalogAuditSummary.countsBySeverity.critical > 0 ? 1 : 0);
    return unreadNotificationsCount + computedAlerts;
  }, [unreadNotificationsCount, isOwner, isFirestoreSeeded, pendingRequestsCount, catalogAuditSummary]);

  const existingCatalogByTitle = useMemo(() => {
    const map = new Map<string, MediaItem>();
    for (const item of catalog) {
      const n1 = normalizeTitleForDuplicateCheck(item.title);
      const n2 = normalizeTitleForDuplicateCheck(item.englishTitle);
      if (n1 && !map.has(n1)) map.set(n1, item);
      if (n2 && !map.has(n2)) map.set(n2, item);
    }
    return map;
  }, [catalog]);

  const matchedExistingSingleItem = useMemo(() => {
    if (!scrapedResult) return null;
    const n1 = normalizeTitleForDuplicateCheck(scrapedResult.title);
    const n2 = normalizeTitleForDuplicateCheck(scrapedResult.englishTitle);
    return (n1 ? existingCatalogByTitle.get(n1) : undefined) || (n2 ? existingCatalogByTitle.get(n2) : undefined) || null;
  }, [scrapedResult, existingCatalogByTitle]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.englishTitle.toLowerCase().includes(q) ||
        item.year.includes(q)
      );
    });
  }, [catalog, searchQuery, kindFilter]);

  const filteredRequests = useMemo(() => {
    if (reqStatusFilter === 'all') return requests;
    return requests.filter((r) => r.status === reqStatusFilter);
  }, [requests, reqStatusFilter]);

  const openEditorForNew = () => {
    const fresh = createEmptyMedia();
    setIsCreatingNew(true);
    setEditingItem(fresh);
    setEditingSliderPngUrl('');
    setEditingSliderDurationSec('');
    setEditorImageProposal(null);
    setEditorTab('basic');
    setCategoriesText(fresh.categories.join('، '));
    setGenresText(fresh.genres.join('، '));
  };

  const openEditorForExisting = (item: MediaItem) => {
    setIsCreatingNew(false);
    setEditorImageProposal(null);
    setEditingSliderPngUrl(getStreamV4MoviePngLogo(item.id));
    const existingDuration = getStreamV4MovieDuration(item.id);
    setEditingSliderDurationSec(existingDuration ? String(existingDuration) : '');
    const resolvedPoster = getPosterUrl(item);
    const backdropInfo = getBackdropInfo(item);
    setEditingItem({
      ...item,
      poster: resolvedPoster,
      poster_url: resolvedPoster,
      backdrop: backdropInfo.hasDedicatedBackdrop ? backdropInfo.url : item.backdrop || '',
      backdrop_url: backdropInfo.hasDedicatedBackdrop ? backdropInfo.url : '',
      servers: item.servers ? item.servers.map((s) => ({ ...s })) : [],
      downloads: item.downloads ? item.downloads.map((d) => ({ ...d })) : [],
      seasons: item.seasons
        ? item.seasons.map((se) => ({
            ...se,
            episodes: se.episodes.map((ep) => ({ ...ep })),
          }))
        : [],
      cast: item.cast ? item.cast.map((c) => ({ ...c })) : [],
    });
    setEditorTab('basic');
    setCategoriesText(item.categories.join('، '));
    setGenresText(item.genres.join('، '));
  };

  const openEditorWithScraped = (scraped: ScrapedPayload) => {
    const draft = scrapedToMediaItem(scraped);
    setIsCreatingNew(true);
    setEditingItem(draft);
    setEditingSliderPngUrl('');
    setEditingSliderDurationSec('');
    setEditorImageProposal(null);
    setEditorTab('basic');
    setCategoriesText(draft.categories.join('، '));
    setGenresText(draft.genres.join('، '));
  };

  const handleSeedDatabase = async () => {
    if (!hasActor) return;
    const sourceToSeed = catalog.length > 0 ? catalog : CATALOG_ITEMS;
    setBusyAction(true);
    try {
      await seedCatalogToFirestore(sourceToSeed, activeActorUid);
      onNotify(`تم استيراد جميع الأعمال (${sourceToSeed.length} عمل) إلى قاعدة بيانات Firestore بنجاح`);
    } catch {
      onNotify('تعذر استيراد البيانات — تأكد من صلاحيات المشرف');
    } finally {
      setBusyAction(false);
    }
  };

  const buildFinalItemFromEditor = (): MediaItem | null => {
    if (!editingItem) return null;
    const parsedCats = categoriesText
      .split(/[،,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedGenres = genresText
      .split(/[،,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const slug = generateCleanSlug(
      editingItem.slug || editingItem.englishTitle,
      editingItem.title,
      editingItem.id
    );

    const cleanedServers: StreamServer[] = renumberServers(
      (editingItem.servers || [])
        .map((srv, idx) => ({
          id: srv.id || `srv-${Date.now()}-${idx}`,
          name: (srv.name || '').trim() || `سيرفر ${idx + 1}`,
          mode: srv.mode || (srv.embedCode ? 'embed' : 'url'),
          url: (srv.url || '').trim(),
          embedCode: (srv.embedCode || '').trim(),
          quality: (srv.quality || editingItem.quality || '1080p').trim(),
          speed: (srv.speed || 'سريع').trim(),
          tag: (srv.tag || 'HD').trim(),
        }))
        .filter((srv) => Boolean(resolveWatchServerUrl(srv)))
    );

    const cleanedSeasons: SeasonItem[] = (editingItem.seasons || []).map((season) => ({
      ...season,
      episodes: (season.episodes || []).map((ep) => {
        const cleanEpServers = renumberServers(
          (ep.servers || [])
            .map((srv, idx) => ({
              id: srv.id || `epsrv-${Date.now()}-${ep.number}-${idx}`,
              name: (srv.name || '').trim() || `سيرفر ${idx + 1}`,
              mode: srv.mode || (srv.embedCode ? 'embed' : 'url'),
              url: (srv.url || '').trim(),
              embedCode: (srv.embedCode || '').trim(),
              quality: (srv.quality || ep.quality || editingItem.quality || '1080p').trim(),
              speed: (srv.speed || 'سريع').trim(),
              tag: (srv.tag || 'HD').trim(),
            }))
            .filter((srv) => Boolean(resolveWatchServerUrl(srv)))
        );
        const rawWatch = (ep.watchUrl || '').trim();
        const safeWatch =
          rawWatch && !isLikelyNonVideoWebsiteUrl(rawWatch)
            ? rawWatch
            : cleanEpServers[0]?.url || '';
        return {
          ...ep,
          watchUrl: safeWatch,
          embedCode: (ep.embedCode || '').trim(),
          servers: cleanEpServers,
        };
      }),
    }));

    const cleanedDownloads: DownloadMirror[] = (editingItem.downloads || []).map((dl, idx) => ({
      id: dl.id || `dl-${Date.now()}-${idx}`,
      host: dl.host.trim() || `رابط تحميل ${idx + 1}`,
      quality: (dl.quality || editingItem.quality || '1080p').trim(),
      size: (dl.size || '1.5 GB').trim(),
      format: (dl.format || 'MP4').trim(),
      url: (dl.url || '').trim(),
    }));

    const cleanedCast: CastMember[] = (editingItem.cast || [])
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({
        name: c.name.trim(),
        role: c.role.trim() || 'ممثل',
        initials:
          c.initials?.trim() ||
          c.name
            .trim()
            .split(/\s+/)
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() ||
          'RT',
      }));

    const cleanPoster =
      upgradeKnownImageUrl(editingItem.poster_url || editingItem.poster || ASSETS.runningMan) ||
      ASSETS.runningMan;
    const rawBackdrop = upgradeKnownImageUrl(
      editingItem.backdrop_url !== undefined ? editingItem.backdrop_url : editingItem.backdrop || ''
    );
    const isBackdropSameOrPortrait =
      !rawBackdrop ||
      rawBackdrop === cleanPoster ||
      (Number(editingItem.backdrop_width) > 0 &&
        Number(editingItem.backdrop_height) > 0 &&
        Number(editingItem.backdrop_width) <= Number(editingItem.backdrop_height));
    const cleanBackdrop = isBackdropSameOrPortrait ? '' : rawBackdrop;
    const finalPw = Number(editingItem.poster_width) || 0;
    const finalPh = Number(editingItem.poster_height) || 0;
    const finalBw = cleanBackdrop ? Number(editingItem.backdrop_width) || 0 : 0;
    const finalBh = cleanBackdrop ? Number(editingItem.backdrop_height) || 0 : 0;

    return {
      ...editingItem,
      slug,
      shortUrl: buildDedicatedMediaUrl({ id: editingItem.id, slug }),
      poster: cleanPoster,
      poster_url: cleanPoster,
      backdrop: cleanBackdrop || ASSETS.heroBackdrop,
      backdrop_url: cleanBackdrop,
      poster_width: finalPw,
      poster_height: finalPh,
      backdrop_width: finalBw,
      backdrop_height: finalBh,
      image_source: editingItem.image_source || 'manual',
      image_quality_status: evaluateImageQuality({
        posterUrl: cleanPoster,
        backdropUrl: cleanBackdrop,
        posterWidth: finalPw,
        posterHeight: finalPh,
        backdropWidth: finalBw,
        backdropHeight: finalBh,
      }),
      categories: parsedCats.length ? parsedCats : ['افلام'],
      genres: parsedGenres.length ? parsedGenres : ['دراما'],
      tagline: editingItem.tagline || editingItem.story.slice(0, 120),
      servers: cleanedServers,
      seasons: cleanedSeasons,
      downloads: cleanedDownloads,
      cast: cleanedCast,
    };
  };

  const commitSaveEditorMedia = async () => {
    const finalItem = buildFinalItemFromEditor();
    if (!hasActor || !finalItem) return;
    setBusyAction(true);
    try {
      const verification = await verifyAndFilterItemServers(finalItem);
      if (!verification.cleanedItem.comingSoon && verification.totalValidServers === 0) {
        setEditingItem(verification.cleanedItem);
        setPreviewModalState(null);
        onNotify(
          'تعذر النشر: جميع السيرفرات المضافة تفتح صفحات مواقع أو معطلة — أضف سيرفر فيديو شغالاً أو فعّل خيار قريباً'
        );
        return;
      }

      const existsInDb = isFirestoreSeeded && !isCreatingNew;
      const saveResult = await saveMediaToFirestore(
        verification.cleanedItem,
        activeActorUid,
        !existsInDb
      );
      setStreamV4MoviePngLogo(verification.cleanedItem.id, editingSliderPngUrl);
      const parsedDuration = editingSliderDurationSec.trim()
        ? Number(editingSliderDurationSec.trim())
        : null;
      const nextV4Cfg = setStreamV4MovieDuration(verification.cleanedItem.id, parsedDuration);
      if (isOwner && hasActor && activeActorUid) {
        void saveStreamV4SliderConfigToFirestore(nextV4Cfg, activeActorUid);
      }
      const removedNote =
        verification.removedCount > 0
          ? ` (تم منع واستبعاد ${verification.removedCount} سيرفر معطل أو صفحة موقع تلقائياً)`
          : '';
      const legacyNote = saveResult.usedLegacySchemaFallback
        ? ' — (تم الحفظ بالتوافق السابق؛ حدّث firestore.rules في قاعدة البيانات لتخزين أبعاد الصور الجديدة)'
        : '';
      onNotify(
        (isCreatingNew
          ? 'تم نشر العمل الجديد وحفظ جميع السيرفرات والحلقات في قاعدة البيانات'
          : 'تم تحديث بيانات العمل في قاعدة البيانات بنجاح') +
          removedNote +
          legacyNote
      );
      setPreviewModalState(null);
      setEditingItem(null);
    } catch (err) {
      onNotify(formatFirestoreWriteError(err, 'حدث خطأ أثناء الحفظ في Firestore'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveMedia = async (e: FormEvent) => {
    e.preventDefault();
    await commitSaveEditorMedia();
  };

  const handleOpenEditorPreview = () => {
    const draft = buildFinalItemFromEditor();
    if (!draft) return;
    setPreviewModalState({ item: draft, source: 'editor' });
  };

  const handleCancelSingleScrape = () => {
    if (!activeSingleCrawlId) return;
    cancelTrackedCrawlTask(activeSingleCrawlId);
    singleCrawlAbortRef.current = null;
    setActiveSingleCrawlId(null);
    setScraping(false);
    onNotify('تم إيقاف عملية الجلب الفردية.');
  };

  const handleCancelSiteScrape = () => {
    if (!activeSiteCrawlId) return;
    cancelTrackedCrawlTask(activeSiteCrawlId);
    siteCrawlAbortRef.current = null;
    setActiveSiteCrawlId(null);
    setSiteCrawling(false);
    onNotify('تم إيقاف عملية جلب الموقع.');
  };

  const handleScrapeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setScrapeError(null);
    setScrapedResult(null);
    setScrapedAdapterUsed(null);

    if (scrapeMode === 'url' && !scrapeUrl.trim()) {
      setScrapeError('يرجى إدخال رابط الصفحة المستهدفة أولاً.');
      return;
    }
    if (scrapeMode === 'html' && scrapeRawHtml.trim().length < 30) {
      setScrapeError('يرجى لصق كود HTML الكامل للصفحة (Ctrl+U ثم نسخ الكل).');
      return;
    }

    const { taskId, controller } = startTrackedCrawlTask({
      kind: 'single_page',
      title: scrapeMode === 'url' ? scrapeUrl.trim() : 'جلب صفحة من كود HTML',
      targetUrl: scrapeUrl.trim() || 'manual-html',
      totalItems: 1,
    });
    singleCrawlAbortRef.current = controller;
    setActiveSingleCrawlId(taskId);
    setScraping(true);

    try {
      const matchedHtmlAdapter =
        scrapeMode === 'html' && scrapeUrl.trim()
          ? matchAdapterForUrl(scrapeUrl, scraperAdapters) || undefined
          : undefined;

      const payload =
        scrapeMode === 'url'
          ? {
              url: scrapeUrl.trim(),
              ...(matchedSingleAdapter ? { adapter: matchedSingleAdapter } : {}),
            }
          : {
              rawHtml: scrapeRawHtml,
              url: scrapeUrl.trim() || undefined,
              ...(matchedHtmlAdapter ? { adapter: matchedHtmlAdapter } : {}),
            };

      let data: {
        ok?: boolean;
        error?: string;
        extracted?: ScrapedPayload;
        adapterUsed?: { id: string; name: string; version: number };
      } | null = null;
      let usedBackend = false;

      if (!shouldSkipBackendApiCalls()) {
        try {
          const response = await fetch(resolveApiEndpoint('/api/scrape'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = (await response.json()) as {
              ok?: boolean;
              error?: string;
              service?: string;
              extracted?: ScrapedPayload;
              adapterUsed?: { id: string; name: string; version: number };
            };
            const isRealScrapeApi =
              Boolean(json && typeof json === 'object') &&
              json.service !== 'RahaL TV Proxy Worker' &&
              ('extracted' in json || (!response.ok && typeof json.error === 'string'));
            if (isRealScrapeApi) {
              data = json;
              usedBackend = true;
              if (!response.ok && data.error) {
                setScrapeError(data.error);
                finishTrackedCrawlTask(taskId, 'failed', {
                  failedCount: 1,
                  errorMessage: data.error,
                });
                return;
              }
            }
          }
        } catch (err) {
          if (isTaskCancelled(controller) || (err instanceof Error && err.name === 'AbortError')) {
            return;
          }
          // Static hosting or unreachable backend -> fall back seamlessly to browser engine
        }
      }

      if (isTaskCancelled(controller)) return;

      if (!usedBackend || !data) {
        data = await scrapeSingleInBrowser(payload);
      }

      if (isTaskCancelled(controller)) return;

      if (!data.ok || !data.extracted) {
        const errMsg = data.error || 'تعذر سحب البيانات من الموقع المستهدف. جرّب وضع لصق HTML.';
        setScrapeError(errMsg);
        finishTrackedCrawlTask(taskId, 'failed', {
          failedCount: 1,
          errorMessage: errMsg,
        });
        return;
      }

      setScrapedAdapterUsed(data.adapterUsed || null);
      setScrapedResult({
        ...data.extracted,
        shortUrl: '',
        servers: renumberServers(data.extracted.servers || []),
      });
      setEditingScrapedServerIdx(null);

      finishTrackedCrawlTask(taskId, 'completed', {
        title: data.extracted.title || scrapeUrl.trim() || 'جلب عمل',
        completedItems: 1,
        importedCount: 1,
      });
      pushAdminNotification({
        level: 'success',
        title: 'اكتمل جلب عمل واحد',
        message: `تم استخراج "${data.extracted.title}" (${data.extracted.servers?.length || 0} سيرفر).`,
        tabTarget: 'scraper',
      });

      const extractedUrlsSet = new Set<string>();
      (data.extracted.servers || []).forEach((s) => {
        const u = resolveWatchServerUrl(s);
        if (/^https?:\/\//i.test(u)) extractedUrlsSet.add(u);
      });
      (data.extracted.seasons || []).forEach((se) => {
        (se.episodes || []).forEach((ep) => {
          (ep.servers || []).forEach((es) => {
            const eu = resolveWatchServerUrl(es);
            if (/^https?:\/\//i.test(eu)) extractedUrlsSet.add(eu);
          });
        });
      });
      const extractedUrls = Array.from(extractedUrlsSet).slice(0, 40);
      if (extractedUrls.length > 0) {
        void checkServerUrls(extractedUrls, true);
      }
      onNotify(
        data.adapterUsed
          ? `تم استخراج "${data.extracted.title}" باستخدام Adapter (${data.adapterUsed.name} v${data.adapterUsed.version})!`
          : `تم استخراج "${data.extracted.title}" بنجاح!`
      );
    } catch {
      if (isTaskCancelled(controller)) return;
      const errMsg = 'تعذر تحليل الصفحة المستهدفة. جرّب استخدام وضع لصق كود HTML.';
      setScrapeError(errMsg);
      finishTrackedCrawlTask(taskId, 'failed', {
        failedCount: 1,
        errorMessage: errMsg,
      });
    } finally {
      singleCrawlAbortRef.current = null;
      setActiveSingleCrawlId((curr) => (curr === taskId ? null : curr));
      setScraping(false);
    }
  };

  const handlePublishScrapedDirectly = async () => {
    if (!hasActor || !scrapedResult) return;
    setBusyAction(true);
    try {
      const item = scrapedToMediaItem(scrapedResult);
      const verification = await verifyAndFilterItemServers(item);

      if (verification.totalValidServers === 0) {
        setScrapedResult((prev) =>
          prev
            ? {
                ...prev,
                servers: verification.cleanedItem.servers,
                seasons: verification.cleanedItem.seasons || prev.seasons || [],
              }
            : prev
        );
        onNotify(
          'تعذر النشر: جميع السيرفرات المستخرجة تفتح مواقع وليست فيديو أو لا تعمل حالياً — أضف سيرفراً شغالاً أولاً'
        );
        return;
      }

      const saveResult = await saveMediaToFirestore(verification.cleanedItem, activeActorUid, true);
      const removedNote =
        verification.removedCount > 0
          ? ` (تم حظر ${verification.removedCount} سيرفر معطل أو صفحة موقع)`
          : '';
      const legacyNote = saveResult.usedLegacySchemaFallback
        ? ' — (بانتظار تحديث firestore.rules في القاعدة لحفظ أبعاد الصور)'
        : '';
      onNotify(
        `تم نشر "${verification.cleanedItem.title}" برابط مخصص في قاعدة البيانات!${removedNote}${legacyNote}`
      );
      navigateToTab('catalog');
    } catch (err) {
      onNotify(
        formatFirestoreWriteError(
          err,
          'تعذر الحفظ المباشر — جرّب فتح العمل في المحرر ومراجعة الحقول'
        )
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleSiteScrapeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSiteCrawlError(null);
    setSiteCrawlMeta(null);
    setSiteCrawlAdapterUsed(null);
    setSiteScrapedItems([]);

    if (siteScrapeMode === 'url' && !siteCrawlUrl.trim()) {
      setSiteCrawlError('يرجى إدخال رابط الموقع أو القسم المستهدف أولاً.');
      return;
    }
    if (siteScrapeMode === 'html' && siteCrawlHtml.trim().length < 50) {
      setSiteCrawlError('يرجى لصق كود HTML للصفحة الرئيسية أو صفحة الأرشيف.');
      return;
    }

    const { taskId, controller } = startTrackedCrawlTask({
      kind: 'bulk_site',
      title: siteScrapeMode === 'url' ? siteCrawlUrl.trim() : 'جلب موقع من كود HTML',
      targetUrl: siteCrawlUrl.trim() || 'manual-site-html',
      totalItems: siteMaxItems,
    });
    siteCrawlAbortRef.current = controller;
    setActiveSiteCrawlId(taskId);
    setSiteCrawling(true);

    try {
      const resolvedSiteAdapter =
        matchedSiteAdapter ||
        (siteCrawlUrl.trim() ? matchAdapterForUrl(siteCrawlUrl, scraperAdapters) : null);

      const payload = {
        siteUrl: siteCrawlUrl.trim() || undefined,
        rawHtml: siteScrapeMode === 'html' ? siteCrawlHtml : undefined,
        maxItems: siteMaxItems,
        maxPages: siteMaxPages,
        deepScrape: siteDeepScrape,
        ...(resolvedSiteAdapter ? { adapter: resolvedSiteAdapter } : {}),
      };

      let data: {
        ok?: boolean;
        error?: string;
        strategy?: string;
        siteTitle?: string;
        totalDiscovered?: number;
        items?: ScrapedPayload[];
        adapterUsed?: { id: string; name: string; version: number };
      } | null = null;
      let usedBackend = false;

      if (!shouldSkipBackendApiCalls()) {
        try {
          const response = await fetch(resolveApiEndpoint('/api/scrape-site'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = (await response.json()) as {
              ok?: boolean;
              error?: string;
              service?: string;
              strategy?: string;
              siteTitle?: string;
              totalDiscovered?: number;
              items?: ScrapedPayload[];
              adapterUsed?: { id: string; name: string; version: number };
            };
            const isRealSiteApi =
              Boolean(json && typeof json === 'object') &&
              json.service !== 'RahaL TV Proxy Worker' &&
              (Array.isArray(json.items) || (!response.ok && typeof json.error === 'string'));
            if (isRealSiteApi) {
              data = json;
              usedBackend = true;
              if (!response.ok && data.error) {
                setSiteCrawlError(data.error);
                finishTrackedCrawlTask(taskId, 'failed', {
                  failedCount: 1,
                  errorMessage: data.error,
                });
                return;
              }
            }
          }
        } catch (err) {
          if (isTaskCancelled(controller) || (err instanceof Error && err.name === 'AbortError')) {
            return;
          }
          // Static hosting or unreachable backend -> fall back seamlessly to browser engine
        }
      }

      if (isTaskCancelled(controller)) return;

      if (!usedBackend || !data) {
        updateTrackedCrawlTask(taskId, { completedItems: 1 });
        data = await scrapeSiteInBrowser(payload);
      }

      if (isTaskCancelled(controller)) return;

      if (!data.ok || !Array.isArray(data.items)) {
        const errMsg =
          data.error || 'تعذر سحب محتوى الموقع. جرّب استخدام وضع لصق كود HTML للصفحة الرئيسية.';
        setSiteCrawlError(errMsg);
        finishTrackedCrawlTask(taskId, 'failed', {
          failedCount: 1,
          errorMessage: errMsg,
        });
        return;
      }

      setSiteCrawlAdapterUsed(data.adapterUsed || null);
      setSiteCrawlMeta({
        strategy: data.strategy || 'HTML Crawler',
        siteTitle: data.siteTitle || siteCrawlUrl,
        totalDiscovered: data.totalDiscovered || data.items.length,
      });
      setSiteScrapedItems(
        data.items.map((item, idx) => ({
          ...item,
          tempKey: `site-item-${Date.now()}-${idx}`,
          selected: true,
        }))
      );
      finishTrackedCrawlTask(taskId, 'completed', {
        title: data.siteTitle || siteCrawlUrl.trim() || 'جلب موقع',
        totalItems: data.items.length,
        completedItems: data.items.length,
        importedCount: data.items.length,
      });
      pushAdminNotification({
        level: 'success',
        title: 'اكتمل جلب موقع بالكامل',
        message: `تم جلب ${data.items.length} عملاً من ${data.siteTitle || siteCrawlUrl}.`,
        tabTarget: 'site_scraper',
      });
      onNotify(`تم جلب ${data.items.length} عملًا من الموقع بنجاح!`);
    } catch {
      if (isTaskCancelled(controller)) return;
      const errMsg = 'تعذر سحب الموقع. جرّب وضع "لصق HTML الموقع".';
      setSiteCrawlError(errMsg);
      finishTrackedCrawlTask(taskId, 'failed', {
        failedCount: 1,
        errorMessage: errMsg,
      });
    } finally {
      siteCrawlAbortRef.current = null;
      setActiveSiteCrawlId((curr) => (curr === taskId ? null : curr));
      setSiteCrawling(false);
    }
  };

  const selectedSiteItemsCount = useMemo(
    () => siteScrapedItems.filter((i) => i.selected).length,
    [siteScrapedItems]
  );

  const visibleSiteScrapedItems = useMemo(() => {
    if (siteKindFilter === 'all') return siteScrapedItems;
    return siteScrapedItems.filter((i) => i.kind === siteKindFilter);
  }, [siteScrapedItems, siteKindFilter]);

  const handleBulkPublishSelected = async () => {
    if (!hasActor) return;
    const chosen = siteScrapedItems.filter((i) => i.selected);
    if (chosen.length === 0) {
      onNotify('يرجى تحديد عمل واحد على الأقل قبل النشر.');
      return;
    }

    setBusyAction(true);
    try {
      const prepared = chosen.map((item, idx) => ({
        tempKey: item.tempKey,
        media: scrapedToMediaItem(item, idx),
      }));

      const readyItems: MediaItem[] = [];
      const publishedKeys = new Set<string>();
      let skippedCount = 0;
      let strippedServersCount = 0;

      for (let i = 0; i < prepared.length; i += 4) {
        const batch = prepared.slice(i, i + 4);
        const results = await Promise.all(
          batch.map(async (entry) => ({
            tempKey: entry.tempKey,
            verification: await verifyAndFilterItemServers(entry.media),
          }))
        );
        for (const res of results) {
          strippedServersCount += res.verification.removedCount;
          if (
            res.verification.totalValidServers > 0 ||
            res.verification.cleanedItem.comingSoon
          ) {
            readyItems.push(res.verification.cleanedItem);
            publishedKeys.add(res.tempKey);
          } else {
            skippedCount++;
          }
        }
      }

      if (readyItems.length === 0) {
        onNotify(
          'تعذر النشر: جميع الأعمال المحددة لا تحتوي على سيرفرات فيديو شغالة (تم حظر صفحات المواقع والسيرفرات المعطلة)'
        );
        return;
      }

      const count = await bulkSaveMediaToFirestore(readyItems, activeActorUid);
      const extraNotes: string[] = [];
      if (strippedServersCount > 0) {
        extraNotes.push(`استُبعد ${strippedServersCount} سيرفر معطل/موقع`);
      }
      if (skippedCount > 0) {
        extraNotes.push(`تُخطي ${skippedCount} عمل بدون سيرفرات شغالة`);
      }
      const noteSuffix = extraNotes.length > 0 ? ` (${extraNotes.join('، ')})` : '';
      onNotify(`تم نشر وحفظ ${count} عملًا في قاعدة بيانات Firestore دفعة واحدة!${noteSuffix}`);
      setSiteScrapedItems((prev) => prev.filter((i) => !publishedKeys.has(i.tempKey)));
      if (skippedCount === 0) {
        navigateToTab('catalog');
      }
    } catch (err) {
      onNotify(formatFirestoreWriteError(err, 'حدث خطأ أثناء الحفظ الجماعي في Firestore'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleTogglePin = async (item: MediaItem) => {
    if (!hasActor) return;
    if (!isFirestoreSeeded) {
      onNotify('قم أولاً باستيراد المكتبة لقاعدة البيانات لتفعيل التعديلات المباشرة');
      return;
    }
    try {
      await saveMediaToFirestore({ ...item, pinned: !item.pinned }, activeActorUid, false);
      onNotify(
        !item.pinned ? `تم تثبيت "${item.title}" في السلايدر` : `تم إلغاء تثبيت "${item.title}"`
      );
    } catch (err) {
      onNotify(formatFirestoreWriteError(err, 'تعذر تحديث حالة التثبيت'));
    }
  };

  const handleDeleteMedia = async (id: string) => {
    if (!isFirestoreSeeded) {
      onDeleteStarterItems([id]);
      setConfirmDeleteId(null);
      setSelectedMediaIds((prev) => prev.filter((itemId) => itemId !== id));
      onNotify('تم حذف العمل المبدئي بنجاح');
      return;
    }

    setBusyAction(true);
    try {
      await deleteMediaFromFirestore(id);
      setConfirmDeleteId(null);
      setSelectedMediaIds((prev) => prev.filter((itemId) => itemId !== id));
      onNotify('تم حذف العمل من قاعدة البيانات نهائيًا');
    } catch {
      onNotify('تعذر حذف العمل');
    } finally {
      setBusyAction(false);
    }
  };

  const toggleMediaSelection = (id: string) => {
    setSelectedMediaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredCatalog.map((item) => item.id);
    setSelectedMediaIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  };

  const handleSelectAllCatalog = () => {
    setSelectedMediaIds(catalog.map((item) => item.id));
  };

  const handleClearMediaSelection = () => {
    setSelectedMediaIds([]);
  };

  const handleConfirmBulkDelete = async () => {
    if (!confirmBulkDeleteMode) return;
    if (confirmBulkDeleteMode === 'all' && !isOwner) {
      setConfirmBulkDeleteMode(null);
      onNotify('حذف كل المحتوى دفعة واحدة متاح للمسؤول فقط');
      return;
    }
    const targetIds =
      confirmBulkDeleteMode === 'all'
        ? catalog.map((item) => item.id)
        : selectedMediaIds.filter((id) => catalog.some((item) => item.id === id));

    if (targetIds.length === 0) {
      setConfirmBulkDeleteMode(null);
      return;
    }

    if (!isFirestoreSeeded) {
      if (confirmBulkDeleteMode === 'all') {
        onClearAllStarterItems();
      } else {
        onDeleteStarterItems(targetIds);
      }
      setSelectedMediaIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      setConfirmBulkDeleteMode(null);
      onNotify(`تم حذف ${targetIds.length} عملًا من المحتوى المبدئي بنجاح`);
      return;
    }

    setBusyAction(true);
    try {
      const deletedCount = await bulkDeleteMediaFromFirestore(targetIds);
      if (confirmBulkDeleteMode === 'all') {
        onClearAllStarterItems();
      }
      setSelectedMediaIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      setConfirmBulkDeleteMode(null);
      onNotify(`تم حذف ${deletedCount} عملًا من قاعدة بيانات Firestore نهائيًا`);
    } catch {
      onNotify('تعذر إتمام الحذف الجماعي — تأكد من صلاحيات المشرف');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteMediaIds = async (ids: string[]) => {
    const targetIds = ids.filter((id) => catalog.some((item) => item.id === id));
    if (targetIds.length === 0) return;

    if (!isFirestoreSeeded) {
      onDeleteStarterItems(targetIds);
      setSelectedMediaIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      onNotify(`تم حذف ${targetIds.length} نسخة مكررة من المحتوى المبدئي بنجاح`);
      return;
    }

    setBusyAction(true);
    try {
      const deletedCount = await bulkDeleteMediaFromFirestore(targetIds);
      setSelectedMediaIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      onNotify(`تم حذف ${deletedCount} نسخة مكررة من قاعدة بيانات Firestore نهائيًا`);
    } catch (err) {
      onNotify(formatFirestoreWriteError(err, 'تعذر حذف النسخ المكررة'));
    } finally {
      setBusyAction(false);
    }
  };

  const handleUpdateRequest = async (req: VisitorRequest) => {
    const draft = adminReplies[req.id] || { status: req.status, note: req.adminNote || '' };
    setBusyAction(true);
    try {
      await updateVisitorRequestInFirestore(req.id, draft.status, draft.note);
      onNotify(`تم تحديث حالة طلب "${req.title}"`);
    } catch {
      onNotify('تعذر تحديث حالة الطلب');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    setBusyAction(true);
    try {
      await deleteVisitorRequestFromFirestore(id);
      onNotify('تم حذف الطلب');
    } catch {
      onNotify('تعذر حذف الطلب');
    } finally {
      setBusyAction(false);
    }
  };

  const handleGrantAdmin = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasActor || !isOwner || !newAdminUid.trim()) return;
    setBusyAction(true);
    try {
      await grantAdminRoleInFirestore(newAdminUid, newAdminName, activeActorUid, newAdminRole);
      setNewAdminUid('');
      setNewAdminName('');
      onNotify(
        newAdminRole === 'owner'
          ? 'تمت إضافة المسؤول الجديد بكامل الصلاحيات'
          : 'تمت إضافة المشرف الجديد (صلاحية النشر والتعديل والحذف والجلب)'
      );
    } catch {
      onNotify('تعذر إضافة العضو — تأكد من صحة معرف UID');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateAdminAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasActor || !isOwner || !createAdminEmail.trim() || createAdminPassword.length < 6) {
      setCreateAdminError('يرجى إدخال البريد/اسم المستخدم وكلمة مرور لا تقل عن 6 أحرف.');
      return;
    }
    setCreateAdminError(null);
    setCreatingAdmin(true);
    try {
      const created = await createAdminAccountInFirebase(
        createAdminEmail,
        createAdminPassword,
        createAdminName,
        activeActorUid,
        createAdminRole
      );
      setCreateAdminName('');
      setCreateAdminEmail('');
      setCreateAdminPassword('');
      onNotify(
        created.role === 'owner'
          ? `تم إنشاء حساب المسؤول (${created.email}) بكامل الصلاحيات!`
          : `تم إنشاء حساب المشرف (${created.email}) بصلاحيات النشر والجلب والتعديل!`
      );
    } catch (err: unknown) {
      setCreateAdminError(getFirebaseAuthErrorMessage(err));
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleToggleExistingAdminRole = async (adm: AdminRoleRecord) => {
    if (!isOwner || adm.uid === activeActorUid) return;
    const currentRole: AdminPrivilegeRole = adm.role === 'moderator' ? 'moderator' : 'owner';
    const nextRole: AdminPrivilegeRole = currentRole === 'owner' ? 'moderator' : 'owner';
    setBusyAction(true);
    try {
      await updateAdminRoleInFirestore(adm.uid, nextRole);
      onNotify(
        nextRole === 'owner'
          ? `تمت ترقية "${adm.displayName}" إلى مسؤول بكامل الصلاحيات`
          : `تم تعيين "${adm.displayName}" كمشرف (النشر والتعديل والحذف والجلب فقط)`
      );
    } catch {
      onNotify('تعذر تحديث صلاحية العضو');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasActor) return;
    setBusyAction(true);
    try {
      const normalizedTheme = saveStoredPlayerTheme(activePlayerTheme);
      const normalizedHome = saveStoredHomeConfig(activeHomeConfig);
      const normalizedTypography = saveStoredTypographyConfig(activeTypography);
      const normalizedShield = saveStoredPopupShieldConfig(activePopupShield);
      const normalizedBranding = saveStoredWebsiteBranding(
        normalizeWebsiteBranding(
          {
            ...activeBranding,
            siteName: settingsForm.siteName.trim() || activeBranding.siteName,
          },
          settingsForm.siteName
        )
      );
      onPopupShieldChange?.(normalizedShield);
      const res = await saveSiteSettingsToFirestore(
        {
          ...settingsForm,
          playerTheme: normalizedTheme,
          homeConfig: normalizedHome,
          typography: normalizedTypography,
          popupShield: normalizedShield,
          branding: normalizedBranding,
        },
        activeActorUid
      );
      onNotify(
        res.rejectedSections.length > 0
          ? `تم حفظ الإعدادات الأساسية في (${res.projectId}/${res.databaseId}) — الأقسام التالية مرفوضة من قواعد Firebase (${res.rejectedSections.join(', ')}): حدّث وانشر firestore.rules الكاملة`
          : 'تم حفظ الإعدادات وتخصيص الرئيسية والهوية والخطوط ودرع النوافذ وثيم المشغّل بنجاح'
      );
    } catch {
      onNotify('تعذر حفظ الإعدادات');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveWebsiteBranding = async (nextBranding: WebsiteBrandingConfig) => {
    const cleanBranding = saveStoredWebsiteBranding(
      normalizeWebsiteBranding(nextBranding, nextBranding.siteName || settingsForm.siteName)
    );
    const nextSiteName = cleanBranding.siteName || settingsForm.siteName;
    setSettingsForm((prev) => ({
      ...prev,
      siteName: nextSiteName,
      branding: cleanBranding,
    }));
    applyWebsiteFaviconToDocument(cleanBranding);
    ensureWebsiteBrandingFontLoaded(cleanBranding.siteNameFont);
    if (!hasActor) {
      onNotify('تم تطبيق إعدادات هوية الموقع محلياً — سجّل الدخول كمشرف لمزامنتها للجميع');
      return;
    }
    setBusyAction(true);
    try {
      const normalizedTheme = saveStoredPlayerTheme(activePlayerTheme);
      const normalizedHome = saveStoredHomeConfig(activeHomeConfig);
      const normalizedTypography = saveStoredTypographyConfig(activeTypography);
      const normalizedShield = saveStoredPopupShieldConfig(activePopupShield);
      const res = await saveSiteSettingsToFirestore(
        {
          ...settingsForm,
          siteName: nextSiteName,
          playerTheme: normalizedTheme,
          homeConfig: normalizedHome,
          typography: normalizedTypography,
          popupShield: normalizedShield,
          branding: cleanBranding,
        },
        activeActorUid
      );
      onNotify(
        !res.syncedBrandingToCloud
          ? `تم تطبيق هوية الموقع محلياً — قواعد (${res.projectId}/${res.databaseId}) رفضت حقل branding؛ انسخ أحدث firestore.rules واضغط Publish`
          : 'تم حفظ هوية الموقع والشعار والأيقونة ومزامنتها لجميع الزوار بنجاح!'
      );
    } catch {
      onNotify('تم تطبيق الهوية محلياً — تعذرت المزامنة مع Firestore');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveImagePlaceholders = async (nextConfig: ImagePlaceholderConfig) => {
    const clean = saveStoredPlaceholderConfig(normalizeImagePlaceholderConfig(nextConfig));
    setLocalPlaceholderConfig(clean);
    if (!hasActor) {
      onNotify('تم حفظ إعدادات الصور والخلفيات المؤقتة محلياً — سجّل الدخول كمشرف للمزامنة');
      return;
    }
    setBusyAction(true);
    try {
      const res = await saveImagePlaceholderConfigToFirestore(clean, activeActorUid);
      onNotify(
        res.ok
          ? `تم حفظ إعدادات الخلفيات المؤقتة وصورة الفشل ومزامنتها لجميع الزوار على (${res.projectId} / ${res.databaseId}) بنجاح!`
          : `تم حفظ الإعدادات محلياً — قواعد (${res.projectId} / ${res.databaseId}) رفضت الكتابة إلى settings/image_placeholders (${res.errorCode || 'permission-denied'}). انسخ أحدث firestore.rules من تبويب «قواعد Firestore» واضغط Publish ثم أعد «فحص تطابق القواعد الآن».`
      );
    } catch {
      onNotify('تم الحفظ محلياً — تعذرت المزامنة السحابية لإعدادات الخلفيات المؤقتة');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveRecentlyWatchedUiConfig = async (
    nextConfig: import('../types/media').RecentlyWatchedUiConfig
  ) => {
    const {
      normalizeRecentlyWatchedUiConfig,
      saveStoredRecentlyWatchedUiConfig,
      setRecentlyWatchedPreviewOverride,
    } = await import('../lib/recentlyWatchedConfig');
    const clean = saveStoredRecentlyWatchedUiConfig(
      normalizeRecentlyWatchedUiConfig(nextConfig)
    );
    setRecentlyWatchedPreviewOverride(null);
    setLocalRwUiConfig(clean);
    onRecentlyWatchedUiChange?.(clean);

    if (!hasActor) {
      onNotify('تم حفظ إعدادات قسم شاهدته مؤخراً محلياً — سجّل الدخول كمشرف للمزامنة');
      return;
    }
    setBusyAction(true);
    try {
      const res = await saveRecentlyWatchedUiConfigToFirestore(clean, activeActorUid);
      onNotify(
        res.ok
          ? `تم حفظ إعدادات شريط شاهدته مؤخراً ومزامنتها لجميع الزوار على (${res.projectId} / ${res.databaseId}) بنجاح!`
          : `تم حفظ الإعدادات محلياً — قواعد (${res.projectId} / ${res.databaseId}) رفضت الكتابة إلى settings/recently_watched_ui (${res.errorCode || 'permission-denied'}). انسخ أحدث firestore.rules من تبويب «قواعد Firestore» واضغط Publish.`
      );
    } catch {
      onNotify('تم الحفظ محلياً — تعذرت المزامنة السحابية لإعدادات شاهدته مؤخراً');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveSiteTheme = async (nextThemeId: SiteThemeId) => {
    const clean = saveStoredSiteThemeId(nextThemeId);
    setLocalSiteThemeId(clean);
    onSiteThemeChange?.(clean);
    const themeMeta = getSiteThemeDefinition(clean);
    if (!hasActor) {
      onNotify(`تم تطبيق ثيم «${themeMeta.name}» محلياً — سجّل الدخول كمشرف للمزامنة`);
      return;
    }
    setBusyAction(true);
    try {
      const res = await saveSiteThemeToFirestore(clean, activeActorUid);
      onNotify(
        res.ok
          ? `تم تفعيل ثيم «${themeMeta.name}» ومزامنته لجميع الزوار على (${res.projectId} / ${res.databaseId}) بنجاح!`
          : `تم تطبيق ثيم «${themeMeta.name}» محلياً — قواعد (${res.projectId} / ${res.databaseId}) رفضت الكتابة إلى settings/site_theme (${res.errorCode || 'permission-denied'}). حدّث وانشر firestore.rules.`
      );
    } catch {
      onNotify('تم تطبيق الثيم محلياً — تعذرت المزامنة السحابية مع Firestore');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveHomeConfig = async (nextHome: HomeLayoutConfig) => {
    const cleanHome = saveStoredHomeConfig(nextHome);
    setSettingsForm((prev) => ({ ...prev, homeConfig: cleanHome }));
    if (!hasActor) {
      onNotify('تم حفظ تخطيط الصفحة الرئيسية محلياً — سجّل الدخول كمشرف للمزامنة');
      return;
    }
    setBusyAction(true);
    try {
      const normalizedTheme = saveStoredPlayerTheme(activePlayerTheme);
      const normalizedTypography = saveStoredTypographyConfig(activeTypography);
      const normalizedShield = saveStoredPopupShieldConfig(activePopupShield);
      const normalizedBranding = saveStoredWebsiteBranding(activeBranding);
      const res = await saveSiteSettingsToFirestore(
        {
          ...settingsForm,
          playerTheme: normalizedTheme,
          homeConfig: cleanHome,
          typography: normalizedTypography,
          popupShield: normalizedShield,
          branding: normalizedBranding,
        },
        activeActorUid
      );
      onNotify(
        !res.syncedHomeToCloud
          ? `تم تطبيق تخطيط الرئيسية والسلايدر محلياً — قواعد (${res.projectId}/${res.databaseId}) رفضت homeConfig؛ تأكد من نشر firestore.rules بالضغط على Publish في Firebase Console`
          : 'تم حفظ تخطيط الصفحة الرئيسية وإعدادات السلايدر ومزامنتها للجميع في Firestore بنجاح!'
      );
    } catch {
      onNotify('تم حفظ التعديلات محلياً — تعذرت المزامنة مع Firestore');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveHeroSliderVariant = useCallback(
    async (
      variant: HeroSliderVariant,
      mobileVariant?: HeroSliderVariant
    ): Promise<boolean> => {
      const targetMobile = mobileVariant ?? loadMobileHeroSliderVariant();
      const clean = saveHeroSliderDeviceVariants(variant, targetMobile);
      if (!hasActor || !activeActorUid) {
        onNotifyRef.current(
          'تم تفعيل نمط السلايدر محلياً فقط — يرجى تسجيل الدخول بحساب المالك لمزامنته مع الموبايل'
        );
        return false;
      }
      if (!isOwner) {
        onNotifyRef.current(
          'تم تفعيل نمط السلايدر محلياً فقط — يلزم حساب المالك لحفظه على السحابة للموبايل'
        );
        return false;
      }
      try {
        const res = await saveHeroSliderVariantToFirestore(
          clean.desktop,
          activeActorUid,
          clean.mobile
        );
        if (!res.ok) {
          onNotifyRef.current(
            `تم تفعيل نمط السلايدر محلياً — قواعد (${res.projectId}/${res.databaseId}) رفضت الكتابة إلى settings/hero_slider_mode. انسخ firestore.rules واضغط Publish في Firebase Console.`
          );
          return false;
        }
        return true;
      } catch {
        onNotifyRef.current('تم تفعيل نمط السلايدر محلياً — تعذرت المزامنة مع Firestore');
        return false;
      }
    },
    [isOwner, hasActor, activeActorUid]
  );

  const handleSaveTypography = async (nextTypography: TypographyConfig) => {
    const cleanTypography = saveStoredTypographyConfig(nextTypography);
    setSettingsForm((prev) => ({ ...prev, typography: cleanTypography }));
    applyTypographyToDocument(cleanTypography, effectiveCustomFonts);
    if (!hasActor) {
      onNotify('تم تطبيق الخطوط وأحجام النصوص محلياً — سجّل الدخول كمشرف لحفظها للجميع');
      return;
    }
    setBusyAction(true);
    try {
      const normalizedTheme = saveStoredPlayerTheme(activePlayerTheme);
      const normalizedHome = saveStoredHomeConfig(activeHomeConfig);
      const normalizedShield = saveStoredPopupShieldConfig(activePopupShield);
      const normalizedBranding = saveStoredWebsiteBranding(activeBranding);
      const res = await saveSiteSettingsToFirestore(
        {
          ...settingsForm,
          playerTheme: normalizedTheme,
          homeConfig: normalizedHome,
          typography: cleanTypography,
          popupShield: normalizedShield,
          branding: normalizedBranding,
        },
        activeActorUid
      );
      onNotify(
        !res.syncedTypographyToCloud
          ? `تم تطبيق الخطوط وأحجام النصوص محلياً — قواعد (${res.projectId}/${res.databaseId}) رفضت typography؛ تأكد من نشر أحدث firestore.rules (Publish) في القاعدة الصحيحة`
          : res.rejectedSections.length > 0
            ? `تم حفظ ومزامنة الخطوط وأحجام النصوص لجميع الزوار! (ملاحظة: قواعد Firebase رفضت مزامنة: ${res.rejectedSections.join(', ')})`
            : 'تم حفظ أحجام وأنواع الخطوط ومزامنتها لجميع الزوار بنجاح!'
      );
    } catch {
      onNotify('تم تطبيق الخطوط محلياً — تعذرت المزامنة السحابية مع Firestore');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSavePopupShield = async (nextShield: PopupShieldConfig) => {
    const cleanShield = saveStoredPopupShieldConfig(nextShield);
    setSettingsForm((prev) => ({ ...prev, popupShield: cleanShield }));
    onPopupShieldChange?.(cleanShield);
    if (!hasActor) {
      onNotify('تم تطبيق إعدادات درع النوافذ المنبثقة محلياً — سجّل الدخول للمزامنة السحابية');
      return;
    }
    setBusyAction(true);
    try {
      const normalizedTheme = saveStoredPlayerTheme(activePlayerTheme);
      const normalizedHome = saveStoredHomeConfig(activeHomeConfig);
      const normalizedTypography = saveStoredTypographyConfig(activeTypography);
      const normalizedBranding = saveStoredWebsiteBranding(activeBranding);
      const res = await saveSiteSettingsToFirestore(
        {
          ...settingsForm,
          playerTheme: normalizedTheme,
          homeConfig: normalizedHome,
          typography: normalizedTypography,
          popupShield: cleanShield,
          branding: normalizedBranding,
        },
        activeActorUid
      );
      onNotify(
        !res.syncedPopupShieldToCloud
          ? `تم تفعيل إعدادات Smart Popup Shield محلياً — قواعد (${res.projectId}/${res.databaseId}) رفضت popupShield؛ انشر أحدث firestore.rules`
          : 'تم حفظ ومزامنة إعدادات Smart Popup Shield لجميع المشاهدين بنجاح!'
      );
    } catch {
      onNotify('تم تطبيق إعدادات الدرع محلياً — تعذرت المزامنة مع Firestore');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUploadCustomFont = async (font: CustomFontRecord) => {
    const nextFonts = saveStoredCustomFonts({
      ...effectiveCustomFonts,
      [font.id]: font,
    });
    onCustomFontsChange?.(nextFonts);

    const nextTypo = saveStoredTypographyConfig({
      ...activeTypography,
      ...(font.id === 'arabic' ? { arabicFont: 'custom' } : { englishFont: 'custom' }),
    });
    setSettingsForm((prev) => ({ ...prev, typography: nextTypo }));
    applyTypographyToDocument(nextTypo, nextFonts);

    if (!hasActor) {
      onNotify(`تم تفعيل الخط "${font.fileName}" محلياً — سجّل الدخول للمزامنة السحابية`);
      return;
    }
    setBusyAction(true);
    try {
      await saveCustomFontToFirestore(font, activeActorUid);
      const normalizedTheme = saveStoredPlayerTheme(activePlayerTheme);
      const normalizedHome = saveStoredHomeConfig(activeHomeConfig);
      const normalizedShield = saveStoredPopupShieldConfig(activePopupShield);
      const normalizedBranding = saveStoredWebsiteBranding(activeBranding);
      await saveSiteSettingsToFirestore(
        {
          ...settingsForm,
          playerTheme: normalizedTheme,
          homeConfig: normalizedHome,
          typography: nextTypo,
          popupShield: normalizedShield,
          branding: normalizedBranding,
        },
        activeActorUid
      );
      onNotify(`تم رفع وحفظ الخط "${font.fileName}" في السحابة وتفعيله بنجاح!`);
    } catch {
      onNotify(
        `تم تفعيل الخط "${font.fileName}" محلياً على جهازك — يرجى نشر تحديث firestore.rules في Firebase Console لمزامنة الخطوط مع الزوار.`
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteCustomFont = async (slot: CustomFontSlot) => {
    const clone = { ...effectiveCustomFonts };
    delete clone[slot];
    const nextFonts = saveStoredCustomFonts(clone);
    onCustomFontsChange?.(nextFonts);
    applyTypographyToDocument(activeTypography, nextFonts);

    if (!hasActor) {
      onNotify('تم حذف الخط المخصص محلياً');
      return;
    }
    setBusyAction(true);
    try {
      await deleteCustomFontFromFirestore(slot);
      onNotify('تم حذف الخط المخصص من السحابة بنجاح');
    } catch {
      onNotify('تم حذف الخط المخصص محلياً');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSavePlayerThemeOnly = async (themeToSave: PlayerThemeConfig) => {
    const clean = saveStoredPlayerTheme(themeToSave);
    setSettingsForm((prev) => ({ ...prev, playerTheme: clean }));
    if (!hasActor) {
      onNotify('تم تطبيق الثيم محلياً — سجّل الدخول كمشرف لحفظه لكل الزوار');
      return;
    }
    setBusyAction(true);
    try {
      const normalizedHome = saveStoredHomeConfig(activeHomeConfig);
      const normalizedTypography = saveStoredTypographyConfig(activeTypography);
      const normalizedShield = saveStoredPopupShieldConfig(activePopupShield);
      const normalizedBranding = saveStoredWebsiteBranding(activeBranding);
      await saveSiteSettingsToFirestore(
        {
          ...settingsForm,
          playerTheme: clean,
          homeConfig: normalizedHome,
          typography: normalizedTypography,
          popupShield: normalizedShield,
          branding: normalizedBranding,
        },
        activeActorUid
      );
      onNotify('تم حفظ وتطبيق ثيم المشغّل الداخلي تلقائياً على جميع مشغّلات الموقع!');
    } catch {
      onNotify('تعذر حفظ الثيم في قاعدة البيانات');
    } finally {
      setBusyAction(false);
    }
  };

  /* ---------------- Editor Sub-builders ---------------- */
  const addServerRow = () => {
    if (!editingItem) return;
    const current = editingItem.servers || [];
    const next: StreamServer = {
      id: `srv-${Date.now()}`,
      name: `سيرفر ${current.length + 1}`,
      mode: 'url',
      url: '',
      embedCode: '',
      quality: editingItem.quality || '1080p',
      speed: 'سريع',
      tag: 'HD',
    };
    setEditingItem({ ...editingItem, servers: renumberServers([...current, next]) });
  };

  const updateServerRow = (idx: number, patch: Partial<StreamServer>) => {
    if (!editingItem) return;
    const next = [...(editingItem.servers || [])];
    const existingName = (next[idx]?.name || '').trim();
    next[idx] = {
      ...next[idx],
      ...patch,
      name: patch.name !== undefined ? patch.name : existingName || `سيرفر ${idx + 1}`,
    };
    setEditingItem({ ...editingItem, servers: next });
  };

  const removeServerRow = (idx: number) => {
    if (!editingItem) return;
    const remaining = (editingItem.servers || []).filter((_, i) => i !== idx);
    setEditingItem({
      ...editingItem,
      servers: renumberServers(remaining),
    });
  };

  const moveServerRow = (idx: number, direction: -1 | 1) => {
    if (!editingItem) return;
    const list = [...(editingItem.servers || [])];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const [moved] = list.splice(idx, 1);
    list.splice(targetIdx, 0, moved);
    setEditingItem({
      ...editingItem,
      servers: renumberServers(list),
    });
  };

  /* ---------------- Scraped Preview Server & Trailer Builders ---------------- */
  const addScrapedServerRow = () => {
    if (!scrapedResult) return;
    const nextIdx = (scrapedResult.servers || []).length;
    const nextSrv: StreamServer = {
      id: `srv-scraped-${Date.now()}`,
      name: `سيرفر ${nextIdx + 1}`,
      mode: 'url',
      url: '',
      embedCode: '',
      quality: scrapedResult.quality || '1080p',
      speed: 'سريع',
      tag: 'HD',
    };
    setScrapedResult({
      ...scrapedResult,
      servers: renumberServers([...(scrapedResult.servers || []), nextSrv]),
    });
    setEditingScrapedServerIdx(nextIdx);
  };

  const updateScrapedServerRow = (idx: number, patch: Partial<StreamServer>) => {
    if (!scrapedResult) return;
    const next = [...(scrapedResult.servers || [])];
    const existingName = (next[idx]?.name || '').trim();
    next[idx] = {
      ...next[idx],
      ...patch,
      name: patch.name !== undefined ? patch.name : existingName || `سيرفر ${idx + 1}`,
    };
    setScrapedResult({ ...scrapedResult, servers: next });
  };

  const removeScrapedServerRow = (idx: number) => {
    if (!scrapedResult) return;
    const remaining = (scrapedResult.servers || []).filter((_, i) => i !== idx);
    setScrapedResult({
      ...scrapedResult,
      servers: renumberServers(remaining),
    });
    setEditingScrapedServerIdx((prev) => {
      if (prev === null) return null;
      if (prev === idx) return null;
      return prev > idx ? prev - 1 : prev;
    });
  };

  const moveScrapedServerRow = (idx: number, direction: -1 | 1) => {
    if (!scrapedResult) return;
    const list = [...(scrapedResult.servers || [])];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const [moved] = list.splice(idx, 1);
    list.splice(targetIdx, 0, moved);
    setScrapedResult({
      ...scrapedResult,
      servers: renumberServers(list),
    });
    setEditingScrapedServerIdx((prev) => {
      if (prev === idx) return targetIdx;
      if (prev === targetIdx) return idx;
      return prev;
    });
  };

  const handleStripBrokenScrapedServers = () => {
    if (!scrapedResult) return;
    const keepServer = (srv: StreamServer) => {
      const url = resolveWatchServerUrl(srv);
      if (!url || isLikelyNonVideoWebsiteUrl(url)) return false;
      const st = serverStatuses[url];
      if (st?.status === 'broken') return false;
      return true;
    };

    const nextRoot = renumberServers((scrapedResult.servers || []).filter(keepServer));
    const nextSeasons = (scrapedResult.seasons || []).map((se) => ({
      ...se,
      episodes: (se.episodes || []).map((ep) => {
        const filteredEpServers = renumberServers((ep.servers || []).filter(keepServer));
        return {
          ...ep,
          servers: filteredEpServers,
          watchUrl:
            ep.watchUrl && !isLikelyNonVideoWebsiteUrl(ep.watchUrl) && serverStatuses[ep.watchUrl]?.status !== 'broken'
              ? ep.watchUrl
              : filteredEpServers[0]?.url || '',
        };
      }),
    }));

    const removedRoot = (scrapedResult.servers || []).length - nextRoot.length;
    setScrapedResult({
      ...scrapedResult,
      servers: nextRoot,
      seasons: nextSeasons,
    });
    setEditingScrapedServerIdx(null);
    onNotify(
      removedRoot > 0
        ? `تم حذف ${removedRoot} سيرفر معطل أو صفحة موقع وتحديث الترقيم تلقائياً`
        : 'تمت تنقية السيرفرات وتنظيف الحلقات'
    );
  };

  const handleStripBrokenEditorServers = () => {
    if (!editingItem) return;
    const keepServer = (srv: StreamServer) => {
      const url = resolveWatchServerUrl(srv);
      if (!url || isLikelyNonVideoWebsiteUrl(url)) return false;
      const st = serverStatuses[url];
      if (st?.status === 'broken') return false;
      return true;
    };
    const nextRoot = renumberServers((editingItem.servers || []).filter(keepServer));
    const nextSeasons = (editingItem.seasons || []).map((se) => ({
      ...se,
      episodes: (se.episodes || []).map((ep) => ({
        ...ep,
        servers: renumberServers((ep.servers || []).filter(keepServer)),
      })),
    }));
    const removedCount = (editingItem.servers || []).length - nextRoot.length;
    setEditingItem({
      ...editingItem,
      servers: nextRoot,
      seasons: nextSeasons,
    });
    onNotify(
      removedCount > 0
        ? `تم حذف ${removedCount} سيرفر معطل أو صفحة موقع`
        : 'تم تنظيف السيرفرات وإعادة ترقيمها'
    );
  };

  const handleAutoFetchTrailerForScraped = async () => {
    if (!scrapedResult || fetchingTrailer) return;
    setFetchingTrailer(true);
    try {
      const found = await findTrailerInBrowser({
        title: scrapedResult.title,
        englishTitle: scrapedResult.englishTitle,
        year: scrapedResult.year,
        kind: scrapedResult.kind,
      });
      if (found) {
        setScrapedResult((prev) => (prev ? { ...prev, trailerUrl: found } : prev));
        onNotify('تم جلب رابط التريلر تلقائياً!');
      } else {
        onNotify('لم يُعثر على تريلر تلقائي — يمكنك لصق رابط يوتيوب يدوياً');
      }
    } finally {
      setFetchingTrailer(false);
    }
  };

  const handleAutoFetchTrailerForEditor = async () => {
    if (!editingItem || fetchingTrailer) return;
    setFetchingTrailer(true);
    try {
      const found = await findTrailerInBrowser({
        title: editingItem.title,
        englishTitle: editingItem.englishTitle,
        year: editingItem.year,
        kind: editingItem.kind,
      });
      if (found) {
        setEditingItem((prev) => (prev ? { ...prev, trailerUrl: found } : prev));
        onNotify('تم جلب رابط التريلر تلقائياً!');
      } else {
        onNotify('لم يُعثر على تريلر تلقائي — يمكنك لصق رابط يوتيوب يدوياً');
      }
    } finally {
      setFetchingTrailer(false);
    }
  };

  const handleFetchHqImagesForEditor = async () => {
    if (!editingItem || fetchingHqImages) return;
    if (!editingItem.title.trim() && !editingItem.englishTitle.trim()) {
      onNotify('أدخل اسم الفيلم أو المسلسل أولاً للبحث عن صوره عالية الجودة');
      return;
    }
    setFetchingHqImages(true);
    try {
      const currentPoster = editingItem.poster_url || editingItem.poster;
      const currentBackdrop =
        editingItem.backdrop_url !== undefined ? editingItem.backdrop_url : editingItem.backdrop;
      const resolved = await resolveHighResImagesClient({
        title: editingItem.title,
        englishTitle: editingItem.englishTitle,
        year: editingItem.year,
        kind: editingItem.kind,
        currentPoster,
        currentBackdrop,
        preferOfficial: true,
      });
      setEditorImageProposal(resolved);
      onNotify('تم فحص وإحضار أفضل الصور المقترحة — راجع المعاينة قبل الاعتماد');
    } catch {
      onNotify('تعذر البحث عن صور عالية الجودة الآن');
    } finally {
      setFetchingHqImages(false);
    }
  };

  const handleProbeEditorImageDimensions = async () => {
    if (!editingItem || probingEditorImages) return;
    setProbingEditorImages(true);
    try {
      const posterTarget = upgradeKnownImageUrl(editingItem.poster_url || editingItem.poster);
      const backdropTarget = upgradeKnownImageUrl(
        editingItem.backdrop_url !== undefined ? editingItem.backdrop_url : editingItem.backdrop
      );
      const [pDims, bDims] = await Promise.all([
        posterTarget ? probeImageDimensionsInBrowser(posterTarget) : Promise.resolve(null),
        backdropTarget && backdropTarget !== posterTarget
          ? probeImageDimensionsInBrowser(backdropTarget)
          : Promise.resolve(null),
      ]);
      const isBackdropPortrait = Boolean(bDims && bDims.width <= bDims.height);
      const validBackdrop = !isBackdropPortrait && backdropTarget && backdropTarget !== posterTarget
        ? backdropTarget
        : '';
      const nextPw = pDims?.width || 0;
      const nextPh = pDims?.height || 0;
      const nextBw = validBackdrop && bDims ? bDims.width : 0;
      const nextBh = validBackdrop && bDims ? bDims.height : 0;

      setEditingItem((prev) =>
        prev
          ? {
              ...prev,
              poster: posterTarget || prev.poster,
              poster_url: posterTarget || prev.poster,
              backdrop: validBackdrop || prev.backdrop,
              backdrop_url: validBackdrop,
              poster_width: nextPw,
              poster_height: nextPh,
              backdrop_width: nextBw,
              backdrop_height: nextBh,
              image_quality_status: evaluateImageQuality({
                posterUrl: posterTarget || prev.poster,
                backdropUrl: validBackdrop,
                posterWidth: nextPw,
                posterHeight: nextPh,
                backdropWidth: nextBw,
                backdropHeight: nextBh,
              }),
            }
          : prev
      );
      if (isBackdropPortrait) {
        onNotify('تنبيه: رابط الخلفية المُدخل عمودي (Portrait) وليس عريضاً 16:9 — تم فصله عن الخلفية العريضة');
      } else {
        onNotify('تم قياس الأبعاد الفعلية للصور وتحديث تقييم الجودة');
      }
    } finally {
      setProbingEditorImages(false);
    }
  };

  const addDownloadRow = () => {
    if (!editingItem) return;
    const next: DownloadMirror = {
      id: `dl-${Date.now()}`,
      host: 'MediaFire / Direct',
      quality: editingItem.quality || '1080p',
      size: '1.8 GB',
      format: 'MP4',
      url: '',
    };
    setEditingItem({ ...editingItem, downloads: [...(editingItem.downloads || []), next] });
  };

  const updateDownloadRow = (idx: number, patch: Partial<DownloadMirror>) => {
    if (!editingItem) return;
    const next = [...(editingItem.downloads || [])];
    next[idx] = { ...next[idx], ...patch };
    setEditingItem({ ...editingItem, downloads: next });
  };

  const removeDownloadRow = (idx: number) => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      downloads: (editingItem.downloads || []).filter((_, i) => i !== idx),
    });
  };

  const addSeason = () => {
    if (!editingItem) return;
    const current = editingItem.seasons || [];
    const nextNum = current.length + 1;
    const newSeason: SeasonItem = {
      seasonNumber: nextNum,
      label: `الموسم ${String(nextNum).padStart(2, '0')}`,
      year: editingItem.year || '2026',
      episodes: [
        {
          number: 1,
          title: 'الحلقة 01',
          duration: '45 دقيقة',
          quality: editingItem.quality || 'WEB-DL',
          watchUrl: '',
          embedCode: '',
        },
      ],
    };
    setEditingItem({ ...editingItem, seasons: [...current, newSeason] });
  };

  const removeSeason = (seasonIdx: number) => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      seasons: (editingItem.seasons || []).filter((_, i) => i !== seasonIdx),
    });
  };

  const addEpisodeToSeason = (seasonIdx: number) => {
    if (!editingItem) return;
    const seasons = [...(editingItem.seasons || [])];
    const target = seasons[seasonIdx];
    const nextNum = target.episodes.length + 1;
    seasons[seasonIdx] = {
      ...target,
      episodes: [
        ...target.episodes,
        {
          number: nextNum,
          title: `الحلقة ${String(nextNum).padStart(2, '0')}`,
          duration: '45 دقيقة',
          quality: editingItem.quality || 'WEB-DL',
          watchUrl: '',
          embedCode: '',
        },
      ],
    };
    setEditingItem({ ...editingItem, seasons });
  };

  const generateEpisodesForSeason = (seasonIdx: number, count: number) => {
    if (!editingItem || count <= 0) return;
    const seasons = [...(editingItem.seasons || [])];
    const target = seasons[seasonIdx];
    const startNum = target.episodes.length + 1;
    const generated: EpisodeItem[] = Array.from({ length: Math.min(60, count) }, (_, i) => {
      const n = startNum + i;
      return {
        number: n,
        title: `الحلقة ${String(n).padStart(2, '0')}`,
        duration: '45 دقيقة',
        quality: editingItem.quality || 'WEB-DL',
        watchUrl: '',
        embedCode: '',
      };
    });
    seasons[seasonIdx] = {
      ...target,
      episodes: [...target.episodes, ...generated],
    };
    setEditingItem({ ...editingItem, seasons });
  };

  const updateEpisode = (seasonIdx: number, epIdx: number, patch: Partial<EpisodeItem>) => {
    if (!editingItem) return;
    const seasons = [...(editingItem.seasons || [])];
    const eps = [...seasons[seasonIdx].episodes];
    eps[epIdx] = { ...eps[epIdx], ...patch };
    seasons[seasonIdx] = { ...seasons[seasonIdx], episodes: eps };
    setEditingItem({ ...editingItem, seasons });
  };

  const removeEpisode = (seasonIdx: number, epIdx: number) => {
    if (!editingItem) return;
    const seasons = [...(editingItem.seasons || [])];
    seasons[seasonIdx] = {
      ...seasons[seasonIdx],
      episodes: seasons[seasonIdx].episodes.filter((_, i) => i !== epIdx),
    };
    setEditingItem({ ...editingItem, seasons });
  };

  const addEpisodeServerRow = (seasonIdx: number, epIdx: number) => {
    if (!editingItem) return;
    const seasons = [...(editingItem.seasons || [])];
    const ep = seasons[seasonIdx].episodes[epIdx];
    const current = ep.servers || [];
    const nextSrv: StreamServer = {
      id: `epsrv-${Date.now()}-${current.length + 1}`,
      name: `سيرفر ${current.length + 1}`,
      mode: 'url',
      url: '',
      embedCode: '',
      quality: ep.quality || editingItem.quality || '1080p',
      speed: 'سريع',
      tag: 'HD',
    };
    updateEpisode(seasonIdx, epIdx, {
      servers: renumberServers([...current, nextSrv]),
    });
  };

  const updateEpisodeServerRow = (
    seasonIdx: number,
    epIdx: number,
    srvIdx: number,
    patch: Partial<StreamServer>
  ) => {
    if (!editingItem) return;
    const ep = editingItem.seasons?.[seasonIdx]?.episodes[epIdx];
    if (!ep) return;
    const current = [...(ep.servers || [])];
    const existingName = (current[srvIdx]?.name || '').trim();
    current[srvIdx] = {
      ...current[srvIdx],
      ...patch,
      name: patch.name !== undefined ? patch.name : existingName || `سيرفر ${srvIdx + 1}`,
    };
    updateEpisode(seasonIdx, epIdx, { servers: current });
  };

  const removeEpisodeServerRow = (seasonIdx: number, epIdx: number, srvIdx: number) => {
    if (!editingItem) return;
    const ep = editingItem.seasons?.[seasonIdx]?.episodes[epIdx];
    if (!ep) return;
    const remaining = (ep.servers || []).filter((_, i) => i !== srvIdx);
    updateEpisode(seasonIdx, epIdx, { servers: renumberServers(remaining) });
  };

  const addCastMember = () => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      cast: [...(editingItem.cast || []), { name: '', role: 'ممثل', initials: 'RT' }],
    });
  };

  const updateCastMember = (idx: number, patch: Partial<CastMember>) => {
    if (!editingItem) return;
    const next = [...(editingItem.cast || [])];
    next[idx] = { ...next[idx], ...patch };
    setEditingItem({ ...editingItem, cast: next });
  };

  const removeCastMember = (idx: number) => {
    if (!editingItem) return;
    setEditingItem({
      ...editingItem,
      cast: (editingItem.cast || []).filter((_, i) => i !== idx),
    });
  };

  /* ---------------- Standalone Auth / Access Gate ---------------- */
  if (authLoading) {
    return (
      <div
        data-rtv-scope="admin"
        data-admin-theme={adminAppearance.colorMode}
        style={adminCssVars}
        className="rtv-admin-root min-h-screen bg-[#06131c] text-white flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md rounded-3xl bg-[#0c1821] border border-white/10 p-10 text-center shadow-2xl">
          <Database className="w-10 h-10 text-[#D92321] mx-auto mb-3 animate-pulse" />
          <p className="text-sm font-bold text-[#b7c9ef]">
            جاري التحقق من صلاحيات المشرف والاتصال بقاعدة البيانات...
          </p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div
        data-rtv-scope="admin"
        data-admin-theme={adminAppearance.colorMode}
        style={adminCssVars}
        className="rtv-admin-root min-h-screen bg-[#06131c] text-white flex flex-col items-center justify-center p-4"
      >
        <div className="w-full max-w-lg rounded-3xl bg-[#0c1821] border border-white/10 p-8 shadow-2xl text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D92321]/15 border border-[#D92321]/40 text-[#D92321]">
            <Lock className="w-8 h-8" />
          </div>

          <div>
            <span className="font-latin inline-block rounded-lg bg-white/5 border border-white/10 px-3 py-1 text-[11px] font-bold text-[#f9c400] mb-3">
              RahaL TV • /admin
            </span>
            <h1 className="font-display text-2xl font-extrabold text-white">
              بوابة إدارة RahaL TV
            </h1>
            <p className="mt-2 text-sm text-[#b7c9ef] leading-relaxed">
              {!user
                ? 'سجّل الدخول بحساب الإدارة المصرّح له للوصول إلى لوحة التحكم وإدارة المحتوى وقواعد البيانات.'
                : `الحساب الحالي (${user.email}) لا يمتلك صلاحيات المشرف في قاعدة البيانات.`}
            </p>
          </div>

          {user && (
            <div className="space-y-3 text-right rounded-2xl bg-[#1a242e]/80 border border-white/10 p-4">
              <p className="font-bold text-xs text-white">معرّف الحساب الحالي (UID) في Firebase:</p>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[#06131c] px-3 py-2 border border-white/10">
                <span className="font-latin text-xs font-bold text-[#f9c400] select-all truncate" dir="ltr">
                  {user.uid}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(user.uid);
                    onNotify('تم نسخ UID بنجاح');
                  }}
                  className="shrink-0 rounded-md bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                >
                  نسخ
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleCombinedSignOut()}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#06131c] hover:bg-[#D92321] border border-white/10 py-2.5 text-xs font-extrabold text-white transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج من Firebase</span>
              </button>
            </div>
          )}

          <div className="space-y-3 text-right">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!adminLoginEmail.trim() || !adminLoginPassword) {
                  setAdminAuthError('يرجى إدخال اسم المستخدم/البريد الإلكتروني وكلمة المرور.');
                  return;
                }
                setAdminAuthError(null);
                setAdminSigningIn(true);
                try {
                  await signInWithEmailPassword(adminLoginEmail, adminLoginPassword);
                } catch (err: unknown) {
                  setAdminAuthError(getFirebaseAuthErrorMessage(err));
                } finally {
                  setAdminSigningIn(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  البريد الإلكتروني أو اسم المستخدم
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={adminLoginEmail}
                  onChange={(e) => setAdminLoginEmail(e.target.value)}
                  placeholder="admin@rahaltv.com"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-4 py-3 text-sm text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                  كلمة المرور
                </label>
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={adminLoginPassword}
                  onChange={(e) => setAdminLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-4 py-3 text-sm text-white focus:border-[#D92321] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={adminSigningIn}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[#D92321] hover:bg-[#dc0e30] disabled:opacity-60 py-3.5 px-6 text-sm font-extrabold text-white shadow-lg transition-colors cursor-pointer"
              >
                {adminSigningIn ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
                <span>{adminSigningIn ? 'جاري تسجيل الدخول...' : 'دخول إلى لوحة التحكم'}</span>
              </button>
            </form>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] font-bold text-[#b7c9ef]/60">أو</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              disabled={adminSigningIn}
              onClick={async () => {
                setAdminAuthError(null);
                setAdminSigningIn(true);
                try {
                  await signInWithGoogle();
                } catch (err: unknown) {
                  setAdminAuthError(getFirebaseAuthErrorMessage(err));
                } finally {
                  setAdminSigningIn(false);
                }
              }}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl bg-[#1a242e] hover:bg-[#23313f] border border-white/15 disabled:opacity-60 py-3 px-6 text-sm font-extrabold text-white transition-colors cursor-pointer"
            >
              <Globe className="w-4 h-4 text-[#f9c400]" />
              <span>تسجيل الدخول بحساب Google</span>
            </button>

            {adminAuthError && (
              <div className="rounded-xl bg-[#D92321]/15 border border-[#D92321]/40 p-3 text-xs leading-relaxed text-red-200">
                {adminAuthError}
              </div>
            )}

            <p className="text-[11px] text-[#b7c9ef]/70 text-center leading-relaxed pt-1">
              إذا كتبت اسم مستخدم بدون @ سيتم إلحاق <span className="font-latin text-white/90">@rahaltv.com</span> تلقائيًا.
            </p>
          </div>

          <button
            type="button"
            onClick={onExitDashboard}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى الموقع الرئيسي</span>
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- Standalone Authenticated /admin Dashboard ---------------- */
  const handleSelectSidebarTab = (tabId: AdminTab) => {
    navigateToTab(tabId);
    if (
      tabId === 'settings' ||
      tabId === 'home_builder' ||
      tabId === 'cards_themes' ||
      tabId === 'typography' ||
      tabId === 'popup_shield' ||
      tabId === 'player_theme' ||
      tabId === 'website_branding' ||
      tabId === 'slider_customization'
    ) {
      setSettingsForm({
        ...siteSettings,
        playerTheme: normalizePlayerTheme(
          siteSettings.playerTheme || loadStoredPlayerTheme()
        ),
        homeConfig: normalizeHomeConfig(
          siteSettings.homeConfig || loadStoredHomeConfig()
        ),
        typography: normalizeTypographyConfig(
          siteSettings.typography || loadStoredTypographyConfig()
        ),
        popupShield: normalizePopupShieldConfig(
          siteSettings.popupShield || loadStoredPopupShieldConfig()
        ),
        branding: normalizeWebsiteBranding(
          siteSettings.branding || loadStoredWebsiteBranding(siteSettings.siteName),
          siteSettings.siteName
        ),
      });
    }
  };

  const renderSidebarNavContent = (collapsed: boolean) => {
    const normalizedQuery = sidebarSearchQuery.trim().toLowerCase();
    const isSearching = normalizedQuery.length > 0;

    const pinnedEntries = (adminNavLayout.pinnedTabs || [])
      .filter((tabId) => isTabAccessible(tabId, isOwner, workspacePrefs.moderatorSubPermissions))
      .map((tabId) => {
        const found = findAdminNavItem(tabId);
        if (!found) return null;
        const grpMeta = resolvedSidebarGroups.find((g) => g.items.some((i) => i.id === tabId));
        return {
          item: found.item,
          accentColor: grpMeta?.accentColor || found.group.accentColor,
        };
      })
      .filter(
        (entry): entry is { item: NonNullable<ReturnType<typeof findAdminNavItem>>['item']; accentColor: string } =>
          Boolean(entry)
      );

    const visibleGroups = resolvedSidebarGroups
      .map((group) => {
        if (!isSearching) return group;
        const groupMatched = group.label.toLowerCase().includes(normalizedQuery);
        const filteredItems = groupMatched
          ? group.items
          : group.items.filter(
              (item) =>
                item.label.toLowerCase().includes(normalizedQuery) ||
                item.shortLabel.toLowerCase().includes(normalizedQuery) ||
                item.description.toLowerCase().includes(normalizedQuery) ||
                item.id.toLowerCase().includes(normalizedQuery) ||
                item.keywords.some((kw) => kw.toLowerCase().includes(normalizedQuery))
            );
        if (filteredItems.length === 0) return null;
        return { ...group, items: filteredItems };
      })
      .filter((g): g is NonNullable<typeof g> => Boolean(g));

    const getBadgeInfo = (
      tabId: AdminTab
    ): { text: string; tone: 'alert' | 'warn' | 'calm' } | null => {
      if (tabId === 'catalog') return { text: String(catalog.length), tone: 'calm' };
      if (tabId === 'notifications' && totalBellBadgeCount > 0) {
        return { text: String(totalBellBadgeCount), tone: 'alert' };
      }
      if (tabId === 'requests' && pendingRequestsCount > 0) {
        return { text: String(pendingRequestsCount), tone: 'calm' };
      }
      if (tabId === 'crawl_operations' && runningCrawlCount > 0) {
        return { text: String(runningCrawlCount), tone: 'calm' };
      }
      if (tabId === 'scraper_adapters' && scraperAdapters.length > 0) {
        return { text: String(scraperAdapters.length), tone: 'calm' };
      }
      if (tabId === 'popup_shield' && activePopupShield.enabled) {
        return { text: 'نشط', tone: 'calm' };
      }
      if (tabId === 'database_manager' && dbConnectionStatus && dbConnectionStatus !== 'connected') {
        return {
          text: dbConnectionStatus === 'connecting' ? 'جارٍ' : 'تنبيه',
          tone: dbConnectionStatus === 'connecting' ? 'calm' : 'warn',
        };
      }
      return null;
    };

    return (
      <nav aria-label="أقسام لوحة التحكم" className="space-y-3">
        {/* Sidebar Quick Search & Layout Controls */}
        {!collapsed && (
          <div className="space-y-2 pb-1 border-b border-white/[0.08]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#b7c9ef] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={sidebarSearchQuery}
                onChange={(e) => setSidebarSearchQuery(e.target.value)}
                placeholder="بحث داخل القائمة..."
                aria-label="بحث داخل القائمة الجانبية"
                className="w-full rounded-xl bg-[#1a242e] border border-white/10 pr-8 pl-7 py-1.5 text-[11px] font-bold text-white placeholder:text-[#b7c9ef]/60 focus:outline-none"
              />
              {sidebarSearchQuery && (
                <button
                  type="button"
                  onClick={() => setSidebarSearchQuery('')}
                  aria-label="مسح البحث"
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-[#b7c9ef] hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
              <button
                type="button"
                onClick={() => {
                  const nextMulti = !workspacePrefs.accordionMultiOpen;
                  const nextOpen = nextMulti ? openGroupIds : [currentNavMeta.group.id];
                  setOpenGroupIds(nextOpen);
                  updateWorkspacePrefs({
                    accordionMultiOpen: nextMulti,
                    openGroupIds: nextOpen,
                  });
                }}
                title={
                  workspacePrefs.accordionMultiOpen
                    ? 'السماح بفتح أكثر من مجموعة معاً'
                    : 'فتح مجموعة واحدة فقط عند الضغط'
                }
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold border cursor-pointer transition-colors ${
                  workspacePrefs.accordionMultiOpen
                    ? 'rtv-admin-accent-soft border-white/15 rtv-admin-accent-text'
                    : 'bg-[#1a242e]/70 border-white/10 text-[#b7c9ef] hover:text-white'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>{workspacePrefs.accordionMultiOpen ? 'فتح متعدد' : 'مجموعة واحدة'}</span>
              </button>

              {isOwner && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSidebarReorderMode((v) => !v)}
                    title="تفعيل إعادة الترتيب بالسحب والإفلات"
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold border cursor-pointer transition-colors ${
                      sidebarReorderMode
                        ? 'rtv-admin-accent-bg border-transparent text-white'
                        : 'bg-[#1a242e]/70 border-white/10 text-[#b7c9ef] hover:text-white'
                    }`}
                  >
                    <GripVertical className="w-3 h-3" />
                    <span>{sidebarReorderMode ? 'إنهاء السحب' : 'ترتيب'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const reset = resetAdminNavLayout();
                      setAdminNavLayout(reset);
                      const targetGrp = findAdminNavItem(activeTab)?.group.id || ADMIN_NAV_GROUPS[0].id;
                      setOpenGroupIds([targetGrp]);
                      updateWorkspacePrefs({ openGroupIds: [targetGrp] });
                      if (activeActorUid) {
                        void syncAdminNavLayoutToFirestore(reset, activeActorUid);
                      }
                      onNotifyRef.current('تمت استعادة الترتيب الافتراضي للقائمة الجانبية');
                    }}
                    title="استعادة الترتيب الافتراضي"
                    className="inline-flex items-center gap-1 rounded-lg bg-[#1a242e]/70 hover:bg-white/10 border border-white/10 px-2 py-1 font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>افتراضي</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pinned Favorite Sections */}
        {!isSearching && pinnedEntries.length > 0 && (
          <div className="space-y-1.5 pb-2 border-b border-white/[0.08]">
            {!collapsed && (
              <div className="flex items-center justify-between px-2 text-[10px] font-black text-[#b7c9ef]/80">
                <span className="inline-flex items-center gap-1">
                  <Pin className="w-3 h-3 rtv-admin-accent-text" />
                  <span>الأقسام المثبتة ({pinnedEntries.length})</span>
                </span>
              </div>
            )}
            <div className="space-y-1">
              {pinnedEntries.map(({ item, accentColor }, idx) => {
                const active = activeTab === item.id;
                return (
                  <div
                    key={`pinned-${item.id}`}
                    draggable={!collapsed && isOwner}
                    onDragStart={() => setDraggedPinnedTabId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!draggedPinnedTabId || draggedPinnedTabId === item.id) return;
                      const fromIdx = (adminNavLayout.pinnedTabs || []).indexOf(draggedPinnedTabId);
                      const toIdx = idx;
                      if (fromIdx !== -1) {
                        persistSidebarLayoutUpdate(
                          reorderPinnedTabsInLayout(adminNavLayout, fromIdx, toIdx)
                        );
                      }
                      setDraggedPinnedTabId(null);
                    }}
                    onDragEnd={() => setDraggedPinnedTabId(null)}
                    className="group relative flex items-center"
                  >
                    <button
                      type="button"
                      title={collapsed ? `مثبت: ${item.label}` : item.description}
                      onClick={() => handleSelectSidebarTab(item.id)}
                      style={
                        active
                          ? {
                              backgroundColor: `color-mix(in srgb, ${accentColor} 16%, transparent)`,
                              borderInlineStartColor: accentColor,
                            }
                          : undefined
                      }
                      className={`rtv-admin-sidebar-item flex w-full items-center ${
                        collapsed ? 'justify-center px-2' : 'justify-between px-3'
                      } gap-2 rounded-xl py-2 text-xs font-bold transition-colors cursor-pointer ${
                        active
                          ? 'text-white border-r-[3px] shadow-sm'
                          : 'text-[#b7c9ef] hover:bg-[#1a242e] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {renderAdminSidebarIcon(
                          item.iconName,
                          'w-4 h-4 shrink-0',
                          active ? accentColor : undefined
                        )}
                        {!collapsed && <span className="truncate">{item.shortLabel}</span>}
                      </span>
                    </button>
                    {!collapsed && (
                      <button
                        type="button"
                        onClick={() =>
                          persistSidebarLayoutUpdate(
                            togglePinnedTabInLayout(adminNavLayout, item.id)
                          )
                        }
                        title="إلغاء التثبيت"
                        aria-label={`إلغاء تثبيت ${item.label}`}
                        className="absolute left-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-[#b7c9ef]/60 hover:text-white hover:bg-white/10 opacity-70 group-hover:opacity-100 cursor-pointer"
                      >
                        <PinOff className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Accordion Groups */}
        {visibleGroups.length === 0 ? (
          <div className="rounded-xl bg-[#1a242e]/60 p-3 text-center text-[11px] font-bold text-[#b7c9ef]">
            لا توجد أقسام مطابقة للبحث
          </div>
        ) : (
          visibleGroups.map((group) => {
            const groupOpen = isSearching || openGroupIds.includes(group.id);
            const hasActiveChild = group.items.some((i) => i.id === activeTab);

            return (
              <div
                key={group.id}
                onDragOver={(e) => {
                  if (!collapsed && isOwner && (draggedSidebarGroupId || draggedSidebarItemId)) {
                    e.preventDefault();
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isOwner) return;
                  if (draggedSidebarGroupId && draggedSidebarGroupId !== group.id) {
                    const fromIdx = adminNavLayout.groups.findIndex(
                      (g) => g.id === draggedSidebarGroupId
                    );
                    const toIdx = adminNavLayout.groups.findIndex((g) => g.id === group.id);
                    if (fromIdx !== -1 && toIdx !== -1) {
                      persistSidebarLayoutUpdate(moveGroupInLayout(adminNavLayout, fromIdx, toIdx));
                    }
                    setDraggedSidebarGroupId(null);
                  } else if (draggedSidebarItemId) {
                    persistSidebarLayoutUpdate(moveItemInLayout(adminNavLayout, draggedSidebarItemId, group.id));
                    setDraggedSidebarItemId(null);
                  }
                }}
                className="space-y-1 rounded-2xl transition-colors"
              >
                {!collapsed && (
                  <div
                    draggable={isOwner}
                    onDragStart={() => setDraggedSidebarGroupId(group.id)}
                    onDragEnd={() => setDraggedSidebarGroupId(null)}
                    className={`flex items-center gap-1 rounded-xl px-2 py-1.5 transition-colors ${
                      hasActiveChild ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    {sidebarReorderMode && isOwner && (
                      <GripVertical className="w-3.5 h-3.5 shrink-0 text-[#b7c9ef]/60 cursor-grab" />
                    )}
                    <button
                      type="button"
                      onClick={() => toggleSidebarGroup(group.id)}
                      aria-expanded={groupOpen}
                      className="flex flex-1 min-w-0 items-center justify-between gap-2 text-[11px] font-extrabold text-white/90 hover:text-white cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: group.accentColor }}
                        />
                        {renderAdminSidebarIcon(group.iconName, 'w-3.5 h-3.5 shrink-0', group.accentColor)}
                        <span className="truncate">{group.label}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <span className="font-latin text-[10px] font-bold text-[#b7c9ef]/70">
                          {group.items.length}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform text-[#b7c9ef]/80 ${
                            groupOpen ? '' : 'rotate-90'
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                )}

                {(groupOpen || collapsed) && (
                  <div className="rtv-admin-sidebar-list space-y-1">
                    {group.items.map((item) => {
                      const active = activeTab === item.id;
                      const badge = getBadgeInfo(item.id);
                      const isPinned = (adminNavLayout.pinnedTabs || []).includes(item.id);

                      return (
                        <div
                          key={item.id}
                          draggable={!collapsed && isOwner}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDraggedSidebarItemId(item.id);
                          }}
                          onDragOver={(e) => {
                            if (!collapsed && isOwner && draggedSidebarItemId) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                          onDrop={(e) => {
                            if (!isOwner || !draggedSidebarItemId || draggedSidebarItemId === item.id) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const targetLayoutGrp = adminNavLayout.groups.find((g) => g.id === group.id);
                            const targetIdx = targetLayoutGrp
                              ? targetLayoutGrp.items.findIndex((entry) => entry.id === item.id)
                              : undefined;
                            persistSidebarLayoutUpdate(
                              moveItemInLayout(
                                adminNavLayout,
                                draggedSidebarItemId,
                                group.id,
                                targetIdx !== undefined && targetIdx >= 0 ? targetIdx : undefined
                              )
                            );
                            setDraggedSidebarItemId(null);
                          }}
                          onDragEnd={() => setDraggedSidebarItemId(null)}
                          className="group/item relative flex items-center"
                        >
                          <button
                            type="button"
                            title={collapsed ? item.label : item.description}
                            onClick={() => handleSelectSidebarTab(item.id)}
                            style={
                              active
                                ? {
                                    backgroundColor: `color-mix(in srgb, ${group.accentColor} 16%, transparent)`,
                                    borderInlineStartColor: group.accentColor,
                                  }
                                : undefined
                            }
                            className={`rtv-admin-sidebar-item flex w-full items-center ${
                              collapsed ? 'justify-center px-2' : 'justify-between px-3'
                            } gap-2 rounded-xl py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                              active
                                ? 'text-white border-r-[3px] shadow-sm'
                                : 'text-[#b7c9ef] hover:bg-[#1a242e] hover:text-white'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              {sidebarReorderMode && !collapsed && isOwner && (
                                <GripVertical className="w-3 h-3 shrink-0 text-[#b7c9ef]/50 cursor-grab" />
                              )}
                              {renderAdminSidebarIcon(
                                item.iconName,
                                'w-4 h-4 shrink-0',
                                active ? group.accentColor : undefined
                              )}
                              {!collapsed && <span className="truncate">{item.label}</span>}
                            </span>
                            {!collapsed && (
                              <span className="flex items-center gap-1 shrink-0">
                                {badge && (
                                  <span
                                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                                      badge.tone === 'alert'
                                        ? 'bg-[#D92321] text-white'
                                        : badge.tone === 'warn'
                                          ? 'bg-amber-500/20 border border-amber-400/40 text-amber-200'
                                          : 'bg-white/10 text-white/90'
                                    }`}
                                  >
                                    {badge.text}
                                  </span>
                                )}
                                {isOwner && (
                                  <span
                                    role="button"
                                    tabIndex={-1}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      persistSidebarLayoutUpdate(
                                        togglePinnedTabInLayout(adminNavLayout, item.id)
                                      );
                                    }}
                                    title={isPinned ? 'إلغاء التثبيت' : 'تثبيت في الأعلى'}
                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-md transition-opacity ${
                                      isPinned
                                        ? 'opacity-100 rtv-admin-accent-text'
                                        : 'opacity-0 group-hover/item:opacity-80 hover:opacity-100 text-[#b7c9ef]'
                                    }`}
                                  >
                                    <Pin className="w-3 h-3" />
                                  </span>
                                )}
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>
    );
  };

  return (
    <div
      data-rtv-scope="admin"
      data-admin-theme={adminAppearance.colorMode}
      style={adminCssVars}
      className="rtv-admin-root rtv-admin-tone-target rtv-admin-viewport w-full overflow-hidden bg-[#06131c] text-white flex flex-col"
    >
      {/* Dedicated Standalone Admin Top Bar (Pinned at Top) */}
      <header className="shrink-0 z-40 border-b border-white/10 bg-[#0c1821]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="فتح قائمة أقسام الإدارة"
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a242e] border border-white/10 text-white hover:bg-white/10 cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() =>
                updateWorkspacePrefs({ sidebarCollapsed: !workspacePrefs.sidebarCollapsed })
              }
              title={
                workspacePrefs.sidebarCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'
              }
              aria-label="تبديل عرض القائمة الجانبية"
              className="hidden lg:inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a242e] border border-white/10 text-[#b7c9ef] hover:text-white cursor-pointer shrink-0"
            >
              {workspacePrefs.sidebarCollapsed ? (
                <PanelRightOpen className="w-4 h-4" />
              ) : (
                <PanelRightClose className="w-4 h-4" />
              )}
            </button>

            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-2xl rtv-admin-accent-bg text-white shadow-lg shrink-0">
              <LayoutDashboard className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="font-display text-sm sm:text-lg font-extrabold text-white truncate max-w-[42vw] sm:max-w-none">
                  إدارة {activeBranding.siteName || settingsForm.siteName || 'RahaL TV'}
                </h1>
                <span className="hidden sm:inline-block font-latin rounded-lg rtv-admin-accent-soft border border-white/15 px-2 py-0.5 text-[10px] font-black rtv-admin-accent-text">
                  /admin
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-extrabold border ${
                    isOwner
                      ? 'rtv-admin-accent-soft border-white/15 rtv-admin-accent-text'
                      : 'bg-sky-500/15 border-sky-400/35 text-sky-300'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{isOwner ? 'مسؤول' : 'مشرف'}</span>
                </span>
                {tvModeActive && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 border border-sky-400/35 px-2 py-0.5 text-[10px] font-extrabold text-sky-300">
                    <Tv className="w-3 h-3" />
                    <span>TV D-Pad</span>
                  </span>
                )}
              </div>

              {/* Breadcrumb */}
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-[#b7c9ef] mt-0.5">
                <span className="inline-flex items-center gap-1 text-[#b7c9ef]/80">
                  <span
                    className="h-2 w-2 rounded-full inline-block"
                    style={{ backgroundColor: currentNavMeta.group.accentColor }}
                  />
                  <span>{currentNavMeta.group.label}</span>
                </span>
                <ChevronLeft className="w-3 h-3 text-[#b7c9ef]/50" />
                <span className="font-extrabold text-white">{currentNavMeta.item.label}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Global Command Palette Button */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="بحث وانتقال سريع"
              className="inline-flex h-10 sm:h-auto w-10 sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 sm:px-3 sm:py-2 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              <Command className="w-4 h-4 sm:w-3.5 sm:h-3.5 rtv-admin-accent-text" />
              <span className="hidden md:inline">بحث وانتقال سريع</span>
              <span className="hidden lg:inline font-latin rounded bg-[#0c1821] px-1.5 py-0.5 text-[10px] rtv-admin-accent-text">
                Ctrl+K
              </span>
            </button>

            {/* Notifications Bell */}
            <button
              type="button"
              onClick={() => navigateToTab('notifications')}
              aria-label="مركز الإشعارات والتنبيهات"
              className={`relative inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl border cursor-pointer shrink-0 ${
                activeTab === 'notifications'
                  ? 'rtv-admin-accent-bg border-transparent text-white'
                  : 'bg-[#1a242e] border-white/10 text-[#b7c9ef] hover:text-white'
              }`}
            >
              <Bell className="w-4 h-4" />
              {totalBellBadgeCount > 0 && (
                <span className="absolute -top-1.5 -left-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-[#D92321] px-1 text-[10px] font-black text-white tabular-nums">
                  {totalBellBadgeCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={openEditorForNew}
              aria-label="إضافة عمل جديد"
              className="inline-flex h-10 sm:h-auto w-10 sm:w-auto items-center justify-center gap-1.5 rounded-xl rtv-admin-accent-bg hover:opacity-90 sm:px-3.5 sm:py-2 text-xs font-extrabold text-white shadow-md cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">إضافة عمل جديد</span>
            </button>

            <button
              type="button"
              onClick={onExitDashboard}
              aria-label="معاينة الموقع"
              className="inline-flex h-10 sm:h-auto w-10 sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 sm:px-3 sm:py-2 text-xs font-bold text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">معاينة الموقع</span>
            </button>

            <div className="hidden xl:flex items-center gap-2 rounded-xl bg-[#1a242e] border border-white/10 px-3 py-1.5">
              {user?.photoURL && (
                <img
                  src={user.photoURL}
                  alt={activeActorName}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-6 w-6 rounded-full object-cover"
                />
              )}
              <div className="text-right leading-tight">
                <p className="text-[11px] font-extrabold text-white truncate max-w-[130px]">
                  {activeActorName}
                </p>
                <p className="font-latin text-[10px] text-[#b7c9ef] truncate max-w-[160px]">
                  {activeActorEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCombinedSignOut()}
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
                className="mr-1 rounded-lg p-1 text-[#b7c9ef] hover:bg-[#D92321] hover:text-white cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Compact Quick Navigation Strip (< 1024px) — eliminates excessive scrolling on phones */}
      <div className="lg:hidden shrink-0 border-b border-white/10 bg-[#09131c]/95 backdrop-blur-md">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-2.5 pt-2 pb-1.5">
          {resolvedSidebarGroups.map((group) => {
            const isActiveGroup = currentNavMeta.group.id === group.id;
            const firstItem = group.items[0];
            return (
              <button
                key={`mob-grp-${group.id}`}
                type="button"
                onClick={() => {
                  if (!isActiveGroup && firstItem) {
                    handleSelectSidebarTab(firstItem.id);
                  } else if (firstItem) {
                    setOpenGroupIds([group.id]);
                  }
                }}
                style={
                  isActiveGroup
                    ? {
                        backgroundColor: `color-mix(in srgb, ${group.accentColor} 18%, transparent)`,
                        borderColor: group.accentColor,
                      }
                    : undefined
                }
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  isActiveGroup
                    ? 'text-white shadow-sm'
                    : 'bg-[#121e28] border-white/10 text-[#b7c9ef]'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: group.accentColor }}
                />
                <span>{group.label}</span>
              </button>
            );
          })}
        </div>

        {(() => {
          const activeMobGroup =
            resolvedSidebarGroups.find((g) => g.id === currentNavMeta.group.id) ||
            resolvedSidebarGroups[0];
          if (!activeMobGroup) return null;
          return (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-2.5 pb-2">
              {activeMobGroup.items.map((item) => {
                const isItemActive = activeTab === item.id;
                return (
                  <button
                    key={`mob-tab-${item.id}`}
                    type="button"
                    onClick={() => handleSelectSidebarTab(item.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold whitespace-nowrap shrink-0 border cursor-pointer transition-colors ${
                      isItemActive
                        ? 'rtv-admin-accent-bg border-transparent text-white shadow'
                        : 'bg-[#17232e] border-white/[0.08] text-[#b7c9ef]'
                    }`}
                  >
                    {renderAdminSidebarIcon(
                      item.iconName,
                      'w-3.5 h-3.5 shrink-0',
                      isItemActive ? '#ffffff' : activeMobGroup.accentColor
                    )}
                    <span>{item.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Mobile Slide-Over Sidebar Drawer */}
      {mobileDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="قائمة أقسام الإدارة"
          data-rtv-focus-trap="true"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <aside className="rtv-admin-sidebar-shell rtv-admin-sidebar-scroll relative z-10 w-80 max-w-[88vw] h-full bg-[#0c1821] border-l border-white/10 p-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="font-display text-sm font-extrabold text-white">أقسام RahaL TV</span>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="إغلاق القائمة"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-[#D92321] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderSidebarNavContent(false)}
          </aside>
        </div>
      )}

      {/* Main Split App-Shell Workspace (Independent Sidebar Scroll + Independent Main Scroll) */}
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        <div className="mx-auto h-full w-full max-w-[1600px] px-2.5 sm:px-6 flex flex-col lg:flex-row gap-3 lg:gap-6 items-stretch">
          {/* Desktop 9-Group Collapsible Sidebar (Independent Scroll) */}
          <aside className="hidden lg:flex lg:flex-col shrink-0 h-full py-4">
            <div
              className={`rtv-admin-sidebar-shell rtv-admin-sidebar-scroll flex-1 min-h-0 rounded-3xl bg-[#0c1821] border border-white/[0.08] p-3 overflow-y-auto overflow-x-hidden transition-all ${
                workspacePrefs.sidebarCollapsed ? 'w-24' : 'rtv-admin-sidebar-expanded'
              }`}
            >
              {renderSidebarNavContent(workspacePrefs.sidebarCollapsed)}
            </div>
          </aside>

          {/* Active Tab Workspace (Independent Scroll, Always Resets to Top on Tab Switch) */}
          <main
            ref={mainScrollRef}
            className="rtv-admin-main-scroll flex-1 min-w-0 min-h-0 h-full overflow-y-auto overflow-x-hidden py-2.5 sm:py-6 space-y-4 sm:space-y-6"
          >
            {dbConnectionStatus && dbConnectionStatus !== 'connected' && (() => {
              const activeFirebaseConfig = getActiveFirebaseConfig();
              const dbReg = loadDatabaseRegistry();
              return (
              <div
                className={`rounded-2xl border px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg ${
                  dbConnectionStatus === 'connecting'
                    ? 'bg-[#1a242e] border-sky-400/35 text-sky-100'
                    : 'bg-[#D92321]/15 border-[#D92321]/45 text-red-100'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  {dbConnectionStatus === 'connecting' ? (
                    <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0 mt-0.5" />
                  ) : (
                    <Database className="w-4 h-4 text-[#f9c400] shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 text-xs min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-extrabold text-white">
                      <span>
                        {dbConnectionStatus === 'connecting'
                          ? 'جاري الاتصال بقاعدة بيانات Firestore...'
                          : dbConnectionStatus === 'quota_exceeded'
                            ? 'توقف الاتصال: تم تجاوز الحصة اليومية المجانية لقراءة Firestore (Quota exceeded)'
                            : dbConnectionStatus === 'permission_denied'
                              ? 'توقف الاتصال: قواعد الأمان (firestore.rules) الحالية ترفض القراءة'
                              : dbConnectionStatus === 'offline'
                                ? 'تعذر الوصول إلى خادم قاعدة بيانات Firestore'
                                : 'تنبيه اتصال قاعدة بيانات Firestore'}
                      </span>
                      <span className="font-latin text-[10px] rounded-md bg-black/30 px-2 py-0.5 text-[#b7c9ef]">
                        {activeFirebaseConfig.projectId}
                      </span>
                    </div>
                    {dbConnectionError && (
                      <p className="text-[11px] leading-relaxed text-white/85">{dbConnectionError}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isOwner && activeTab !== 'database_manager' && (
                    <button
                      type="button"
                      onClick={() => navigateToTab('database_manager')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/15 border border-white/15 px-3 py-2 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
                    >
                      <Database className="w-3.5 h-3.5 text-[#f9c400]" />
                      <span>إدارة قواعد البيانات</span>
                    </button>
                  )}
                  {isOwner && dbReg.previousConnectionId && dbConnectionStatus !== 'connecting' && (
                    <button
                      type="button"
                      disabled={reconnectingDb}
                      onClick={async () => {
                        setReconnectingDb(true);
                        try {
                          const res = await rollbackDatabaseConnection({
                            uid: activeActorUid,
                            name: activeActorName,
                          });
                          if (res.ok) {
                            onNotify(
                              `تمت استعادة الاتصال بالقاعدة السابقة (${res.targetName || ''}) بنجاح`
                            );
                            await onReconnectDatabase?.();
                          } else {
                            onNotify(res.error || 'تعذر الرجوع إلى القاعدة السابقة');
                          }
                        } finally {
                          setReconnectingDb(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 px-3 py-2 text-xs font-extrabold text-amber-200 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>الرجوع للقاعدة السابقة</span>
                    </button>
                  )}
                  {dbConnectionStatus === 'quota_exceeded' && (
                    <a
                      href={`https://console.firebase.google.com/project/${activeFirebaseConfig.projectId}/firestore/databases/${activeFirebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-3 py-2 text-xs font-black text-[#06131c] whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>فتح خيارات ترقية الحصة</span>
                    </a>
                  )}
                  {dbConnectionStatus === 'permission_denied' && (
                    <a
                      href={`https://console.firebase.google.com/project/${activeFirebaseConfig.projectId}/firestore/databases/${activeFirebaseConfig.firestoreDatabaseId}/rules`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-3 py-2 text-xs font-black text-[#06131c] whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>فتح قواعد Firestore Rules</span>
                    </a>
                  )}
                  {onReconnectDatabase && (
                    <button
                      type="button"
                      disabled={reconnectingDb || dbConnectionStatus === 'connecting'}
                      onClick={async () => {
                        setReconnectingDb(true);
                        try {
                          await onReconnectDatabase();
                        } finally {
                          setReconnectingDb(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-60 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
                    >
                      {reconnectingDb ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>إعادة الاتصال بقاعدة البيانات</span>
                    </button>
                  )}
                </div>
              </div>
              );
            })()}
            <div key={activeTab} className="space-y-6">
            <Suspense
              fallback={
                <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-12 flex flex-col items-center justify-center gap-3 text-xs font-bold text-[#b7c9ef]">
                  <Loader2 className="w-6 h-6 text-[#D92321] animate-spin" />
                  <span>جاري تحميل وحدة التحكم...</span>
                </div>
              }
            >
              {/* GROUP 1: OVERVIEW & ANALYTICS */}
              {isOwner && activeTab === 'overview' && (
                <AdminExecutiveOverview
                  mode="overview"
                  catalog={catalog}
                  requests={requests}
                  usersList={usersList}
                  adminsList={adminsList}
                  siteSettings={siteSettings}
                  isFirestoreSeeded={isFirestoreSeeded}
                  busyAction={busyAction}
                  customApiUrl={customApiUrl}
                  onSeedDatabase={handleSeedDatabase}
                  onNavigateTab={navigateToTab}
                  onOpenNewMedia={openEditorForNew}
                  onEditMedia={openEditorForExisting}
                />
              )}

              {activeTab === 'analytics' &&
                isTabAccessible('analytics', isOwner, workspacePrefs.moderatorSubPermissions) && (
                  <AdminExecutiveOverview
                    mode="analytics"
                    catalog={catalog}
                    requests={requests}
                    usersList={usersList}
                    adminsList={adminsList}
                    siteSettings={siteSettings}
                    isFirestoreSeeded={isFirestoreSeeded}
                    busyAction={busyAction}
                    customApiUrl={customApiUrl}
                    onSeedDatabase={handleSeedDatabase}
                    onNavigateTab={navigateToTab}
                    onOpenNewMedia={openEditorForNew}
                    onEditMedia={openEditorForExisting}
                  />
                )}

              {activeTab === 'notifications' && (
                <AdminNotificationsPanel
                  catalog={catalog}
                  requests={requests}
                  isOwner={isOwner}
                  isFirestoreSeeded={isFirestoreSeeded}
                  onNavigateTab={navigateToTab}
                  onNotify={(msg) => {
                    onNotify(msg);
                    setUnreadNotificationsCount(
                      loadAdminNotifications().filter((n) => !n.read).length
                    );
                  }}
                />
              )}

              {/* GROUP 2: CONTENT & CATALOG */}
              {activeTab === 'catalog' && (
                <AdminCatalogPanel
                  catalog={catalog}
                  filteredCatalog={filteredCatalog}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  kindFilter={kindFilter}
                  onKindFilterChange={setKindFilter}
                  selectedMediaIds={selectedMediaIds}
                  onToggleSelection={toggleMediaSelection}
                  onSelectFiltered={handleSelectAllFiltered}
                  onSelectAllCatalog={handleSelectAllCatalog}
                  onClearSelection={handleClearMediaSelection}
                  onSetSelectedIds={setSelectedMediaIds}
                  tablePrefs={workspacePrefs.catalogTable}
                  onUpdateTablePrefs={updateCatalogTablePrefs}
                  serverStatuses={serverStatuses}
                  checkingCatalogLinks={checkingCatalogLinks}
                  onCheckCatalogLinks={async () => {
                    const urls = filteredCatalog
                      .slice(0, 20)
                      .flatMap((it) => (it.servers || []).map((s) => resolveWatchServerUrl(s)))
                      .filter((u) => /^https?:\/\//i.test(u));
                    if (urls.length === 0) {
                      onNotify('لا توجد روابط مشاهدة لفحصها في النتائج المعروضة');
                      return;
                    }
                    setCheckingCatalogLinks(true);
                    await checkServerUrls(urls, true);
                    setCheckingCatalogLinks(false);
                    onNotify(`تم فحص ${Math.min(urls.length, 40)} رابط مشاهدة`);
                  }}
                  onCheckItemServers={(urls) => void checkServerUrls(urls, true)}
                  resolveWatchServerUrl={resolveWatchServerUrl}
                  isOwner={isOwner}
                  isFirestoreSeeded={isFirestoreSeeded}
                  hasDismissedStarters={hasDismissedStarters}
                  busyAction={busyAction}
                  onSeedDatabase={handleSeedDatabase}
                  onRestoreStarterItems={onRestoreStarterItems}
                  onOpenNewMedia={openEditorForNew}
                  onOpenBulkDelete={(mode) => setConfirmBulkDeleteMode(mode)}
                  onTogglePin={handleTogglePin}
                  onPreviewMedia={onPreviewMedia}
                  onEditMedia={openEditorForExisting}
                  onRequestDeleteMedia={(id) => setConfirmDeleteId(id)}
                  onNavigateTab={navigateToTab}
                  onNotify={onNotify}
                  onDeleteDuplicateIds={handleDeleteMediaIds}
                />
              )}

              {activeTab === 'categories' &&
                isTabAccessible('categories', isOwner, workspacePrefs.moderatorSubPermissions) && (
                  <AdminCategoriesPanel
                    catalog={catalog}
                    adminUid={activeActorUid}
                    adminName={activeActorName}
                    isFirestoreSeeded={isFirestoreSeeded}
                    onNavigateTab={navigateToTab}
                    onNotify={onNotify}
                  />
                )}

              {activeTab === 'bulk_editor' &&
                isTabAccessible('bulk_editor', isOwner, workspacePrefs.moderatorSubPermissions) && (
                  <AdminBulkEditorPanel
                    catalog={catalog}
                    adminUid={activeActorUid}
                    adminName={activeActorName}
                    isFirestoreSeeded={isFirestoreSeeded}
                    onDeleteStarterItems={onDeleteStarterItems}
                    onNotify={onNotify}
                  />
                )}

              {activeTab === 'images' && (
                <AdminImageManagerPanel
                  user={user}
                  catalog={catalog}
                  isFirestoreSeeded={isFirestoreSeeded}
                  onNotify={onNotify}
                />
              )}

              {activeTab === 'content_audit' &&
                isTabAccessible(
                  'content_audit',
                  isOwner,
                  workspacePrefs.moderatorSubPermissions
                ) && (
                  <AdminContentAuditPanel
                    catalog={catalog}
                    busyAction={busyAction}
                    onEditMedia={openEditorForExisting}
                    onDeleteMediaIds={handleDeleteMediaIds}
                    onNavigateImages={() => navigateToTab('images')}
                  />
                )}

              {/* GROUP 3: PLAYER, SERVERS & SHIELD */}
              {activeTab === 'watch_servers' &&
                isTabAccessible(
                  'watch_servers',
                  isOwner,
                  workspacePrefs.moderatorSubPermissions
                ) && (
                  <AdminWatchServersPanel
                    mode="watch_servers"
                    catalog={catalog}
                    activePlayerTheme={activePlayerTheme}
                    busyAction={busyAction}
                    onEditMedia={openEditorForExisting}
                    onUpdatePlayerTheme={updatePlayerTheme}
                    onSavePlayerTheme={handleSavePlayerThemeOnly}
                    onNotify={onNotify}
                  />
                )}

              {isOwner && activeTab === 'player_theme' && (
                <AdminWatchServersPanel
                  mode="player_theme"
                  catalog={catalog}
                  activePlayerTheme={activePlayerTheme}
                  busyAction={busyAction}
                  onEditMedia={openEditorForExisting}
                  onUpdatePlayerTheme={updatePlayerTheme}
                  onSavePlayerTheme={handleSavePlayerThemeOnly}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'popup_shield' && (
                <PopupShieldPanel
                  catalog={catalog}
                  shieldConfig={activePopupShield}
                  busyAction={busyAction}
                  onChangeShieldConfig={(next) => {
                    const clean = saveStoredPopupShieldConfig(next);
                    setSettingsForm((prev) => ({ ...prev, popupShield: clean }));
                    onPopupShieldChange?.(clean);
                  }}
                  onSaveShieldConfig={handleSavePopupShield}
                  onNotify={onNotify}
                />
              )}

              {/* GROUP 4 (Partial): CRAWL OPERATIONS & AI EDITOR */}
              {activeTab === 'crawl_operations' &&
                isTabAccessible(
                  'crawl_operations',
                  isOwner,
                  workspacePrefs.moderatorSubPermissions
                ) && (
                  <AdminCrawlOperationsPanel onNavigateTab={navigateToTab} onNotify={onNotify} />
                )}

              {isOwner && activeTab === 'ai_editor' && (
                <AdminAiBulkEditor
                  user={user}
                  catalog={catalog}
                  isFirestoreSeeded={isFirestoreSeeded}
                  onNotify={onNotify}
                  onPreviewMedia={onPreviewMedia}
                />
              )}

              {/* GROUP 5: DESIGN & DEVICE MODES */}
              {isOwner && activeTab === 'website_branding' && (
                <WebsiteBrandingPanel
                  branding={activeBranding}
                  siteNameFallback={settingsForm.siteName}
                  busy={busyAction}
                  onSaveBranding={handleSaveWebsiteBranding}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'image_placeholders' && (
                <AdminImagePlaceholderPanel
                  config={localPlaceholderConfig}
                  sampleMedia={catalog.slice(0, 6)}
                  busy={busyAction}
                  onSaveConfig={handleSaveImagePlaceholders}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'slider_customization' && (
                <SliderCustomizationPanel
                  homeConfig={activeHomeConfig}
                  catalog={catalog}
                  busy={busyAction}
                  actorUid={activeActorUid}
                  hasActor={hasActor}
                  isOwner={isOwner}
                  onGetAuthToken={async () => {
                    if (user && typeof (user as User).getIdToken === 'function') {
                      return await (user as User).getIdToken();
                    }
                    return undefined;
                  }}
                  onSaveHomeConfig={handleSaveHomeConfig}
                  onSaveHeroSliderVariant={handleSaveHeroSliderVariant}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'cards_themes' && (
                <AdminCardsAndThemesPanel
                  catalog={catalog}
                  homeConfig={activeHomeConfig}
                  recentlyWatchedUiConfig={
                    localRwUiConfig || recentlyWatchedUiConfig || loadStoredRecentlyWatchedUiConfig()
                  }
                  siteThemeId={localSiteThemeId}
                  busyAction={busyAction}
                  onChangeHomeConfig={(next) =>
                    setSettingsForm((prev) => ({ ...prev, homeConfig: next }))
                  }
                  onSaveHomeConfig={handleSaveHomeConfig}
                  onChangeRecentlyWatchedUiConfig={(next) => {
                    setLocalRwUiConfig(next);
                    onRecentlyWatchedUiChange?.(next);
                  }}
                  onSaveRecentlyWatchedUiConfig={handleSaveRecentlyWatchedUiConfig}
                  onSaveSiteTheme={handleSaveSiteTheme}
                  onPreviewOnSite={onExitDashboard}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'home_builder' && (
                <HomeBuilderPanel
                  catalog={catalog}
                  homeConfig={activeHomeConfig}
                  tickerEnabled={settingsForm.tickerEnabled}
                  recentlyWatchedUiConfig={localRwUiConfig || recentlyWatchedUiConfig}
                  recentlyWatchedItems={recentlyWatchedItems}
                  busyAction={busyAction}
                  onChangeHomeConfig={(next) =>
                    setSettingsForm((prev) => ({ ...prev, homeConfig: next }))
                  }
                  onChangeTickerEnabled={(enabled) =>
                    setSettingsForm((prev) => ({ ...prev, tickerEnabled: enabled }))
                  }
                  onChangeRecentlyWatchedUiConfig={(next) => {
                    setLocalRwUiConfig(next);
                    onRecentlyWatchedUiChange?.(next);
                  }}
                  onSaveRecentlyWatchedUiConfig={handleSaveRecentlyWatchedUiConfig}
                  onSaveHomeConfig={handleSaveHomeConfig}
                  onPreviewHome={onExitDashboard}
                  onOpenTypographyTab={() => navigateToTab('typography')}
                  onOpenSliderCustomization={() => navigateToTab('slider_customization')}
                  onOpenCardsAndThemesTab={() => navigateToTab('cards_themes')}
                  onSaveHeroSliderVariant={handleSaveHeroSliderVariant}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'typography' && (
                <TypographyPanel
                  typography={activeTypography}
                  customFonts={effectiveCustomFonts}
                  busyAction={busyAction}
                  onChangeTypography={(next) =>
                    setSettingsForm((prev) => ({ ...prev, typography: next }))
                  }
                  onSaveTypography={handleSaveTypography}
                  onUploadCustomFont={handleUploadCustomFont}
                  onDeleteCustomFont={handleDeleteCustomFont}
                  onPreviewHome={onExitDashboard}
                  onOpenAdminAppearance={() => navigateToTab('admin_appearance')}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'admin_appearance' && (
                <AdminAppearancePanel
                  appearance={adminAppearance}
                  navLayout={adminNavLayout}
                  actorUid={activeActorUid}
                  onChangeApplied={setAdminAppearance}
                  onOpenSiteTypography={() => navigateToTab('typography')}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'admin_nav_order' && (
                <AdminNavOrderPanel
                  navLayout={adminNavLayout}
                  actorUid={activeActorUid}
                  onChangeLayout={setAdminNavLayout}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'display_modes' && (
                <AdminDisplayModesPanel onNotify={onNotify} />
              )}

              {/* GROUP 7 (Logs & Rules), GROUP 8 (System Health & Backup) */}
              {isOwner && activeTab === 'security_rules' && (
                <AdminSecurityLogsPanel
                  mode="security_rules"
                  onNotify={onNotify}
                  onRunRulesDiagnostic={() =>
                    diagnoseFirestoreSettingsRules(
                      {
                        ...settingsForm,
                        playerTheme: saveStoredPlayerTheme(activePlayerTheme),
                        homeConfig: saveStoredHomeConfig(activeHomeConfig),
                        typography: saveStoredTypographyConfig(activeTypography),
                        popupShield: saveStoredPopupShieldConfig(activePopupShield),
                        branding: saveStoredWebsiteBranding(activeBranding),
                      },
                      activeActorUid,
                      localPlaceholderConfig,
                      localRwUiConfig || recentlyWatchedUiConfig
                    )
                  }
                />
              )}

              {isOwner && activeTab === 'audit_logs' && (
                <AdminSecurityLogsPanel mode="audit_logs" onNotify={onNotify} />
              )}

              {isOwner && activeTab === 'database_manager' && (
                <AdminDatabaseManagerPanel
                  user={user}
                  dbConnectionStatus={dbConnectionStatus}
                  dbConnectionError={dbConnectionError}
                  customApiUrl={customApiUrl}
                  onReconnectDatabase={onReconnectDatabase}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'system_health' && (
                <AdminSystemHealthPanel
                  user={user}
                  catalog={catalog}
                  adapters={scraperAdapters}
                  customApiUrl={customApiUrl}
                  onNotify={onNotify}
                />
              )}

              {isOwner && activeTab === 'backup_restore' && (
                <AdminBackupRestorePanel
                  catalog={catalog}
                  siteSettings={siteSettings}
                  adapters={scraperAdapters}
                  requests={requests}
                  adminUid={activeActorUid}
                  adminName={activeActorName}
                  onNotify={onNotify}
                />
              )}

            {/* TAB 3: EXTERNAL CONTENT SCRAPER */}
            {activeTab === 'scraper' && (
              <div className="space-y-6">
                <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <h2 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
                        <Wand2 className="w-5 h-5 text-[#4CAF50]" />
                        أداة جلب وسحب المحتوى من المواقع الأخرى
                      </h2>
                      <p className="text-xs text-[#b7c9ef] mt-1">
                        ضع رابط صفحة الفيلم أو المسلسل على أي موقع آخر وسيتم استخراج البوستر، القصة،
                        التقييم، التصنيفات، أكواد iframe للسيرفرات، روابط التحميل، والحلقات تلقائيًا.
                      </p>
                    </div>

                    <div className="flex rounded-xl bg-[#1a242e] p-1 border border-white/10 shrink-0">
                      <button
                        type="button"
                        onClick={() => setScrapeMode('url')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                          scrapeMode === 'url'
                            ? 'bg-[#D92321] text-white'
                            : 'text-[#b7c9ef] hover:text-white'
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>جلب بالرابط (URL)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScrapeMode('html')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                          scrapeMode === 'html'
                            ? 'bg-[#D92321] text-white'
                            : 'text-[#b7c9ef] hover:text-white'
                        }`}
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        <span>لصق كود HTML</span>
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleScrapeSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                        {scrapeMode === 'url'
                          ? 'رابط صفحة الفيلم أو المسلسل في الموقع المصدر'
                          : 'رابط الصفحة المصدر (اختياري - لحل المسارات النسبية)'}
                      </label>
                      <input
                        type="url"
                        dir="ltr"
                        required={scrapeMode === 'url'}
                        value={scrapeUrl}
                        onChange={(e) => setScrapeUrl(e.target.value)}
                        placeholder="https://example.com/movie/running-man-2026"
                        className="font-latin w-full rounded-xl bg-[#1a242e] border border-white/10 px-4 py-3 text-sm text-white focus:border-[#4CAF50] focus:outline-none"
                      />
                    </div>

                    {scrapeMode === 'html' && (
                      <div>
                        <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                          كود الصفحة المصدر (HTML / View-Source) — مفيد إذا كان الموقع محميًا بـ Cloudflare
                        </label>
                        <textarea
                          rows={7}
                          dir="ltr"
                          required
                          value={scrapeRawHtml}
                          onChange={(e) => setScrapeRawHtml(e.target.value)}
                          placeholder="<!DOCTYPE html><html>... الصق كود السورس هنا ..."
                          className="font-latin w-full rounded-xl bg-[#1a242e] border border-white/10 p-3.5 text-xs text-white focus:border-[#4CAF50] focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="submit"
                          disabled={scraping}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-60 px-6 py-3 text-xs font-extrabold text-white shadow-lg cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {scraping ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Wand2 className="w-4 h-4" />
                          )}
                          <span>{scraping ? 'جاري تحليل واستخراج البيانات...' : 'استخراج البيانات الآن'}</span>
                        </button>

                        {scraping && activeSingleCrawlId && (
                          <button
                            type="button"
                            onClick={handleCancelSingleScrape}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] px-4 py-3 text-xs font-extrabold text-white shadow cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <StopCircle className="w-4 h-4" />
                            <span>إيقاف الجلب</span>
                          </button>
                        )}
                      </div>

                      {matchedSingleAdapter ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#4CAF50]/35 bg-[#4CAF50]/10 px-3 py-1.5 text-[11px] text-[#4CAF50]">
                          <Wrench className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            سيعمل بـ Adapter مفعّل: <strong className="font-latin text-white">{matchedSingleAdapter.name}</strong> (v{matchedSingleAdapter.version})
                          </span>
                          <button
                            type="button"
                            onClick={() => navigateToTab('scraper_adapters')}
                            className="underline font-bold text-[#f9c400] cursor-pointer"
                          >
                            تعديل في مطوّر المصادر
                          </button>
                        </div>
                      ) : scrapeMode === 'url' && scrapeUrl.trim() ? (
                        <button
                          type="button"
                          onClick={() => navigateToTab('scraper_adapters')}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1a242e] hover:border-[#f9c400]/40 px-3 py-1.5 text-[11px] font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                        >
                          <Wrench className="w-3.5 h-3.5 text-[#f9c400]" />
                          <span>إنشاء Adapter مخصص لهذا الموقع</span>
                        </button>
                      ) : null}
                    </div>
                  </form>

                  {scrapeError && (
                    <div className="rounded-2xl bg-[#D92321]/15 border border-[#D92321]/40 p-4 text-xs font-bold text-[#ff8a88] space-y-2.5">
                      <p>{scrapeError}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {scrapeMode === 'url' && (
                          <button
                            type="button"
                            onClick={() => setScrapeMode('html')}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#D92321] px-3 py-1.5 text-[11px] font-extrabold text-white cursor-pointer"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                            <span>التبديل إلى وضع لصق كود HTML</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => navigateToTab('settings')}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#f9c400] hover:bg-[#dfb20b] px-3 py-1.5 text-[11px] font-black text-[#06131c] cursor-pointer"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>إعداد بروكسي Cloudflare المجاني في الإعدادات</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Scraped Results Preview */}
                {scrapedResult && (
                  <div className="rounded-3xl bg-[#0c1821] border border-[#4CAF50]/40 p-6 space-y-5 shadow-2xl">
                    {matchedExistingSingleItem && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#f9c400]/15 border border-[#f9c400]/40 px-4 py-2.5 text-xs">
                        <span className="font-bold text-[#fde68a] flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-[#f9c400] shrink-0" />
                          <span>
                            موجود مسبقاً في الكتالوج: <strong className="text-white">{matchedExistingSingleItem.title}</strong> ({matchedExistingSingleItem.year})
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => openEditorForExisting(matchedExistingSingleItem)}
                          className="rounded-lg bg-[#f9c400] hover:bg-[#dfb20b] px-3 py-1 text-[11px] font-black text-[#06131c] cursor-pointer"
                        >
                          تعديل العمل الموجود
                        </button>
                      </div>
                    )}
                    <div className="flex flex-col md:flex-row gap-5">
                      {scrapedResult.poster_url || scrapedResult.poster ? (
                        <img
                          src={optimizeTmdbUrl(scrapedResult.poster_url || scrapedResult.poster, 'w342')}
                          alt={scrapedResult.title}
                          loading="lazy"
                          decoding="async"
                          className="h-64 w-44 rounded-2xl object-cover object-top border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="h-64 w-44 rounded-2xl bg-[#1a242e] flex items-center justify-center text-xs text-[#b7c9ef] shrink-0">
                          لا يوجد بوستر
                        </div>
                      )}

                      <div className="flex-1 space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-[#D92321] px-2.5 py-1 text-[11px] font-black text-white">
                            {KIND_LABELS[scrapedResult.kind]}
                          </span>
                          <span className="rounded-lg bg-[#1a242e] px-2.5 py-1 text-[11px] font-bold text-white">
                            {scrapedResult.year} • {scrapedResult.quality}
                          </span>
                          <span className="rounded-lg bg-[#1a242e] px-2.5 py-1 text-[11px] font-bold text-[#b7c9ef]">
                            {scrapedResult.duration}
                          </span>
                          {scrapedAdapterUsed && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-[#4CAF50]/15 border border-[#4CAF50]/35 px-2.5 py-1 text-[11px] font-bold text-[#4CAF50]">
                              <Wrench className="w-3 h-3" />
                              <span className="font-latin">
                                Adapter: {scrapedAdapterUsed.name} v{scrapedAdapterUsed.version}
                              </span>
                            </span>
                          )}
                        </div>

                        <h3 className="font-display text-xl font-extrabold text-white">
                          {scrapedResult.title}
                        </h3>
                        <p className="font-latin text-xs text-[#b7c9ef]">{scrapedResult.englishTitle}</p>

                        <div className="rounded-xl bg-[#1a242e]/85 border border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[#f9c400]">
                            الرابط المخصص للعمل بعد النشر:
                          </span>
                          <span className="font-latin text-[11px] text-[#4CAF50] truncate" dir="ltr">
                            {buildDedicatedMediaUrl({
                              id: 'preview',
                              slug: generateCleanSlug(
                                scrapedResult.englishTitle,
                                scrapedResult.title,
                                'work'
                              ),
                            })}
                          </span>
                        </div>

                        <p className="text-xs leading-relaxed text-[#b7c9ef] line-clamp-4">
                          {scrapedResult.story}
                        </p>

                        <div className="flex flex-wrap gap-1.5">
                          {scrapedResult.categories.map((c) => (
                            <span
                              key={c}
                              className="rounded-md bg-[#1a242e] border border-white/10 px-2 py-0.5 text-[11px] font-bold text-white"
                            >
                              {c}
                            </span>
                          ))}
                          {scrapedResult.genres.map((g) => (
                            <span
                              key={g}
                              className="rounded-md bg-[#D92321]/15 border border-[#D92321]/30 px-2 py-0.5 text-[11px] font-bold text-[#ff8a88]"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Extracted Trailer Control Bar */}
                    <div className="rounded-2xl bg-[#1a242e]/85 border border-[#D92321]/30 p-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-extrabold text-white flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[#D92321] text-white">
                            <Play className="w-3 h-3 fill-current" />
                          </span>
                          <span>تريلر العمل (Trailer)</span>
                          {scrapedResult.trailerUrl ? (
                            <span className="rounded-md bg-[#4CAF50]/15 border border-[#4CAF50]/35 px-2 py-0.5 text-[10px] font-bold text-[#4CAF50]">
                              مُستخرج تلقائياً
                            </span>
                          ) : (
                            <span className="rounded-md bg-[#f9c400]/15 border border-[#f9c400]/35 px-2 py-0.5 text-[10px] font-bold text-[#f9c400]">
                              غير متوفر بالصفحة
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={fetchingTrailer}
                            onClick={() => void handleAutoFetchTrailerForScraped()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D92321] hover:bg-[#dc0e30] disabled:opacity-50 px-3 py-1.5 text-[11px] font-extrabold text-white cursor-pointer"
                          >
                            {fetchingTrailer ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="w-3.5 h-3.5" />
                            )}
                            <span>{fetchingTrailer ? 'جاري البحث...' : 'جلب التريلر تلقائياً'}</span>
                          </button>
                          {scrapedResult.trailerUrl && (
                            <a
                              href={scrapedResult.trailerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-[#b7c9ef] hover:text-white"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>تجربة</span>
                            </a>
                          )}
                        </div>
                      </div>
                      <input
                        type="text"
                        dir="ltr"
                        value={scrapedResult.trailerUrl || ''}
                        onChange={(e) =>
                          setScrapedResult({ ...scrapedResult, trailerUrl: e.target.value })
                        }
                        placeholder="https://www.youtube.com/watch?v=... أو رابط MP4"
                        className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#D92321] focus:outline-none"
                      />
                    </div>

                    {/* Extracted Assets Summary + Full Interactive Server Manager */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-white/10">
                      {/* Full Interactive Watch Servers Manager */}
                      <div className="lg:col-span-7 rounded-2xl bg-[#1a242e]/85 border border-white/10 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
                            <Server className="w-4 h-4 text-[#D92321]" />
                            <span>إدارة سيرفرات المشاهدة ({scrapedResult.servers.length})</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {scrapedResult.servers.length > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const urls = scrapedResult.servers
                                      .map((s) => resolveWatchServerUrl(s))
                                      .filter((u) => /^https?:\/\//i.test(u));
                                    void checkServerUrls(urls, true);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] border border-sky-400/30 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/15 cursor-pointer"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>فحص</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleStripBrokenScrapedServers}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] border border-[#D92321]/40 px-2.5 py-1 text-[11px] font-bold text-[#ff8a88] hover:bg-[#D92321]/20 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>حذف المعطل والمواقع</span>
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={addScrapedServerRow}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#4CAF50] hover:bg-[#43a047] px-2.5 py-1 text-[11px] font-extrabold text-white cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>إضافة سيرفر</span>
                            </button>
                          </div>
                        </div>

                        {scrapedResult.servers.length === 0 ? (
                          <div className="space-y-1.5 rounded-xl bg-[#0c1821]/60 p-3">
                            <p className="text-[11px] text-[#b7c9ef]">
                              لم يُعثر على سيرفرات صالحة في الصفحة (أو تم استبعاد روابط الصفحات الرئيسية تلقائياً).
                            </p>
                            {!customApiUrl && (
                              <p className="text-[10px] leading-relaxed text-[#f9c400]/90">
                                بعض المواقع تضع السيرفرات في صفحة <span className="font-latin">/watch</span> منفصلة؛ فعّل{' '}
                                <button
                                  type="button"
                                  onClick={() => navigateToTab('settings')}
                                  className="underline font-bold cursor-pointer"
                                >
                                  Cloudflare Worker المجاني
                                </button>{' '}
                                في الإعدادات لجلبها تلقائياً من GitHub Pages.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                            {scrapedResult.servers.map((s, idx) => {
                              const srvUrl = resolveWatchServerUrl(s);
                              const isPortal = Boolean(srvUrl && isLikelyNonVideoWebsiteUrl(srvUrl));
                              const isEditingThis = editingScrapedServerIdx === idx;
                              const srvMode = s.mode || (s.embedCode ? 'embed' : 'url');
                              return (
                                <div
                                  key={s.id || idx}
                                  className={`rounded-xl border p-2.5 space-y-2 ${
                                    isPortal
                                      ? 'bg-[#D92321]/10 border-[#D92321]/45'
                                      : 'bg-[#0c1821]/85 border-white/10'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                                      <span className="inline-flex items-center gap-1 rounded-lg bg-[#D92321] px-2.5 py-0.5 text-[11px] font-black text-white tabular-nums">
                                        {s.name || `سيرفر ${idx + 1}`}
                                      </span>
                                      <span className="font-latin rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-[#f9c400]">
                                        {s.quality || 'HD'}
                                      </span>
                                      {renderServerStatusBadge(srvUrl, true)}
                                      {isPortal && (
                                        <span className="rounded bg-[#D92321]/25 px-1.5 py-0.5 text-[10px] font-bold text-[#ff8a88]">
                                          صفحة موقع وليست فيديو
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={idx === 0}
                                        onClick={() => moveScrapedServerRow(idx, -1)}
                                        title="تحريك لأعلى"
                                        className="rounded-md bg-[#1a242e] p-1 text-[#b7c9ef] hover:text-white disabled:opacity-30 cursor-pointer"
                                      >
                                        <ArrowUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={idx === scrapedResult.servers.length - 1}
                                        onClick={() => moveScrapedServerRow(idx, 1)}
                                        title="تحريك لأسفل"
                                        className="rounded-md bg-[#1a242e] p-1 text-[#b7c9ef] hover:text-white disabled:opacity-30 cursor-pointer"
                                      >
                                        <ArrowDown className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingScrapedServerIdx(isEditingThis ? null : idx)
                                        }
                                        title="تعديل السيرفر"
                                        className={`rounded-md p-1 cursor-pointer ${
                                          isEditingThis
                                            ? 'bg-sky-500 text-white'
                                            : 'bg-[#1a242e] text-sky-300 hover:bg-sky-500 hover:text-white'
                                        }`}
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeScrapedServerRow(idx)}
                                        title="حذف السيرفر"
                                        className="rounded-md bg-[#1a242e] p-1 text-[#D92321] hover:bg-[#D92321] hover:text-white cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  <p className="truncate font-latin text-[10px] text-[#b7c9ef]/75" dir="ltr">
                                    {srvUrl || 'لم يُضف رابط بعد'}
                                  </p>

                                  {isEditingThis && (
                                    <div className="space-y-2 pt-2 border-t border-white/10">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex rounded-lg bg-[#1a242e] p-0.5 border border-white/10">
                                          <button
                                            type="button"
                                            onClick={() => updateScrapedServerRow(idx, { mode: 'url' })}
                                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                                              srvMode === 'url'
                                                ? 'bg-[#4CAF50] text-white'
                                                : 'text-[#b7c9ef]'
                                            }`}
                                          >
                                            رابط مباشر
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateScrapedServerRow(idx, { mode: 'embed' })
                                            }
                                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold cursor-pointer ${
                                              srvMode === 'embed'
                                                ? 'bg-[#f9c400] text-[#06131c]'
                                                : 'text-[#b7c9ef]'
                                            }`}
                                          >
                                            كود Iframe
                                          </button>
                                        </div>
                                        <input
                                          type="text"
                                          value={s.quality}
                                          onChange={(e) =>
                                            updateScrapedServerRow(idx, { quality: e.target.value })
                                          }
                                          placeholder="الجودة (1080p)"
                                          className="w-28 rounded-lg bg-[#1a242e] border border-white/10 px-2.5 py-1 text-[11px] text-white"
                                        />
                                      </div>

                                      {srvMode === 'url' ? (
                                        <input
                                          type="text"
                                          dir="ltr"
                                          value={s.url || ''}
                                          onChange={(e) =>
                                            updateScrapedServerRow(idx, { url: e.target.value })
                                          }
                                          placeholder="https://..."
                                          className="font-latin w-full rounded-lg bg-[#1a242e] border border-white/10 px-2.5 py-1.5 text-[11px] text-white focus:border-[#4CAF50] focus:outline-none"
                                        />
                                      ) : (
                                        <textarea
                                          rows={2}
                                          dir="ltr"
                                          value={s.embedCode || ''}
                                          onChange={(e) =>
                                            updateScrapedServerRow(idx, {
                                              embedCode: e.target.value,
                                            })
                                          }
                                          placeholder='<iframe src="https://..." allowfullscreen></iframe>'
                                          className="font-latin w-full rounded-lg bg-[#1a242e] border border-white/10 p-2 text-[11px] text-white focus:border-[#f9c400] focus:outline-none"
                                        />
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Downloads & Seasons/Cast Summary */}
                      <div className="lg:col-span-5 grid grid-cols-1 gap-4">
                        <div className="rounded-2xl bg-[#1a242e]/80 p-3.5">
                          <p className="text-xs font-extrabold text-white flex items-center gap-1.5 mb-2">
                            <Download className="w-4 h-4 text-[#4CAF50]" />
                            روابط التحميل ({scrapedResult.downloads.length})
                          </p>
                          {scrapedResult.downloads.length === 0 ? (
                            <p className="text-[11px] text-[#b7c9ef]">لم يُعثر على روابط تحميل مباشرة</p>
                          ) : (
                            <ul className="space-y-1 text-[11px] text-[#b7c9ef]">
                              {scrapedResult.downloads.slice(0, 5).map((d) => (
                                <li key={d.id} className="truncate font-latin">
                                  • {d.host} ({d.quality})
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="rounded-2xl bg-[#1a242e]/80 p-3.5 space-y-2">
                          <p className="text-xs font-extrabold text-white flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-[#f9c400]" />
                            <span>الحلقات وطاقم العمل</span>
                          </p>
                          <p className="text-[11px] text-[#b7c9ef] tabular-nums">
                            المواسم:{' '}
                            <strong className="text-white">{scrapedResult.seasons?.length || 0}</strong>
                            {' • '}
                            حلقات مستخرجة:{' '}
                            <strong className="text-white">
                              {(scrapedResult.seasons || []).reduce(
                                (sum, s) => sum + (s.episodes?.length || 0),
                                0
                              )}
                            </strong>
                            {' • '}
                            ممثلون:{' '}
                            <strong className="text-white">{scrapedResult.cast.length}</strong>
                          </p>
                          {scrapedResult.cast.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {scrapedResult.cast.slice(0, 12).map((actor, cIdx) => (
                                <span
                                  key={`${actor.name}-${cIdx}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white"
                                >
                                  {actor.avatarUrl ? (
                                    <img
                                      src={actor.avatarUrl}
                                      alt={actor.name}
                                      className="w-3.5 h-3.5 rounded-full object-cover"
                                    />
                                  ) : null}
                                  <span>{actor.name}</span>
                                </span>
                              ))}
                              {scrapedResult.cast.length > 12 && (
                                <span className="text-[10px] font-bold text-[#f9c400]">
                                  +{scrapedResult.cast.length - 12}
                                </span>
                              )}
                            </div>
                          )}
                          {(scrapedResult.seasons || []).some((s) => (s.episodes?.length || 0) > 0) && (
                            <div className="max-h-40 overflow-y-auto space-y-1.5 pt-1 border-t border-white/10">
                              {(scrapedResult.seasons || []).map((season) => (
                                <div key={season.seasonNumber} className="space-y-1">
                                  {(scrapedResult.seasons?.length || 0) > 1 && (
                                    <p className="text-[10px] font-extrabold text-[#f9c400] px-1">
                                      {season.label} ({season.episodes.length} حلقة)
                                    </p>
                                  )}
                                  {season.episodes.map((ep) => (
                                    <div
                                      key={`${season.seasonNumber}-${ep.number}`}
                                      className="flex items-center justify-between text-[10px] text-[#b7c9ef] bg-[#0c1821]/70 rounded-lg px-2 py-1"
                                    >
                                      <span className="truncate font-bold text-white">
                                        {ep.title || `الحلقة ${ep.number}`}
                                      </span>
                                      <span className="shrink-0 font-bold text-[#4CAF50] tabular-nums">
                                        {ep.servers?.length || (ep.watchUrl ? 1 : 0)} سيرفر
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewModalState({
                            item: scrapedToMediaItem(scrapedResult),
                            source: 'scraper',
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-5 py-3 text-xs font-black text-[#06131c] shadow-lg cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        <span>معاينة قبل النشر</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditorWithScraped(scrapedResult)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#1a242e] hover:bg-sky-500 border border-white/15 px-5 py-3 text-xs font-extrabold text-white cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                        <span>مراجعة وتعديل في المحرر الكامل</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => void handlePublishScrapedDirectly()}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-6 py-3 text-xs font-extrabold text-white shadow-lg cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>حفظ ونشر فورًا في قاعدة البيانات</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3B: SITE-WIDE BULK CRAWLER */}
            {activeTab === 'site_scraper' && (
              <div className="space-y-6">
                <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                      <h2 className="font-display text-lg font-extrabold text-white flex items-center gap-2">
                        <Globe className="w-5 h-5 text-[#f9c400]" />
                        أداة جلب محتوى موقع بالكامل (Bulk Site Crawler)
                      </h2>
                      <p className="text-xs text-[#b7c9ef] mt-1">
                        ضع رابط موقع أفلام/مسلسلات أو قسم كامل، وستقوم الأداة بفحص الموقع (Blogger
                        Feed / WordPress API / صفحات التصفح / Sitemap) وسحب جميع الأعمال وسيرفراتها
                        دفعة واحدة.
                      </p>
                    </div>

                    <div className="flex rounded-xl bg-[#1a242e] p-1 border border-white/10 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSiteScrapeMode('url')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                          siteScrapeMode === 'url'
                            ? 'bg-[#D92321] text-white'
                            : 'text-[#b7c9ef] hover:text-white'
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>رابط الموقع (URL)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSiteScrapeMode('html')}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                          siteScrapeMode === 'html'
                            ? 'bg-[#D92321] text-white'
                            : 'text-[#b7c9ef] hover:text-white'
                        }`}
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        <span>لصق HTML الموقع</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#4CAF50]/10 border border-[#4CAF50]/30 px-4 py-3 text-xs text-[#b7c9ef] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span>
                      <strong className="text-[#4CAF50]">وضع التشغيل المدمج (متوافق مع GitHub Pages):</strong>{' '}
                      لجلب أقسام المواقع المحمية مع جميع سيرفرات المشاهدة (<span className="font-latin text-white">/watch</span>) مثل <span className="font-latin text-white">akwams.org/movies/</span> على GitHub Pages، فعّل رابط <strong className="text-white">Cloudflare Worker المجاني</strong> من الإعدادات.
                    </span>
                    <button
                      type="button"
                      onClick={() => navigateToTab('settings')}
                      className="shrink-0 rounded-lg bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer"
                    >
                      إعداد بروكسي Cloudflare المجاني
                    </button>
                  </div>

                  <form onSubmit={handleSiteScrapeSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                        {siteScrapeMode === 'url'
                          ? 'رابط الموقع أو القسم المستهدف (مثال: https://mooveg.blogspot.com)'
                          : 'رابط الموقع الأساسي (لتحويل الروابط النسبية إلى كاملة)'}
                      </label>
                      <input
                        type="url"
                        dir="ltr"
                        required={siteScrapeMode === 'url'}
                        value={siteCrawlUrl}
                        onChange={(e) => setSiteCrawlUrl(e.target.value)}
                        placeholder="https://example.com"
                        className="font-latin w-full rounded-xl bg-[#1a242e] border border-white/10 px-4 py-3 text-sm text-white focus:border-[#f9c400] focus:outline-none"
                      />
                    </div>

                    {siteScrapeMode === 'html' && (
                      <div>
                        <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                          كود HTML للصفحة الرئيسية أو الأرشيف (لاستخراج كل البطاقات والروابط منه)
                        </label>
                        <textarea
                          rows={6}
                          dir="ltr"
                          required
                          value={siteCrawlHtml}
                          onChange={(e) => setSiteCrawlHtml(e.target.value)}
                          placeholder="<!DOCTYPE html><html>... الصق سورس الصفحة الرئيسية هنا ..."
                          className="font-latin w-full rounded-xl bg-[#1a242e] border border-white/10 p-3.5 text-xs text-white focus:border-[#f9c400] focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl bg-[#1a242e]/60 border border-white/[0.07] p-4">
                      <div>
                        <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                          أقصى عدد للأعمال المسحوبة
                        </label>
                        <select
                          value={siteMaxItems}
                          onChange={(e) => setSiteMaxItems(Number(e.target.value))}
                          className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs font-bold text-white"
                        >
                          <option value={10}>10 أعمال</option>
                          <option value={20}>20 عملًا</option>
                          <option value={30}>30 عملًا (موصى به)</option>
                          <option value={50}>50 عملًا</option>
                          <option value={80}>80 عملًا (الحد الأقصى)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                          عدد صفحات التصفح (Pagination)
                        </label>
                        <select
                          value={siteMaxPages}
                          onChange={(e) => setSiteMaxPages(Number(e.target.value))}
                          className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs font-bold text-white"
                        >
                          <option value={1}>الصفحة الأولى فقط</option>
                          <option value={3}>حتى 3 صفحات</option>
                          <option value={5}>حتى 5 صفحات</option>
                          <option value={8}>حتى 8 صفحات</option>
                        </select>
                      </div>

                      <div className="flex items-center">
                        <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                          <input
                            type="checkbox"
                            checked={siteDeepScrape}
                            onChange={(e) => setSiteDeepScrape(e.target.checked)}
                            className="h-4 w-4 accent-[#4CAF50]"
                          />
                          <span>فحص عميق لكل عمل (جلب القصة + iframe السيرفرات + التحميل)</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="submit"
                          disabled={siteCrawling}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] disabled:opacity-60 px-6 py-3 text-xs font-black text-[#06131c] shadow-lg cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {siteCrawling ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Globe className="w-4 h-4" />
                          )}
                          <span>
                            {siteCrawling
                              ? 'جاري فحص الموقع وجلب جميع المحتويات...'
                              : 'بدء جلب جميع محتوى الموقع الآن'}
                          </span>
                        </button>

                        {siteCrawling && activeSiteCrawlId && (
                          <button
                            type="button"
                            onClick={handleCancelSiteScrape}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] px-4 py-3 text-xs font-extrabold text-white shadow cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <StopCircle className="w-4 h-4" />
                            <span>إيقاف الجلب</span>
                          </button>
                        )}
                      </div>

                      {matchedSiteAdapter && (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#4CAF50]/35 bg-[#4CAF50]/10 px-3 py-1.5 text-[11px] text-[#4CAF50]">
                          <Wrench className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            سيُستخدم Adapter مفعّل: <strong className="font-latin text-white">{matchedSiteAdapter.name}</strong> (v{matchedSiteAdapter.version})
                          </span>
                          <button
                            type="button"
                            onClick={() => navigateToTab('scraper_adapters')}
                            className="underline font-bold text-[#f9c400] cursor-pointer"
                          >
                            إدارة الـ Adapter
                          </button>
                        </div>
                      )}
                    </div>
                  </form>

                  {siteCrawlError && (
                    <div className="rounded-2xl bg-[#D92321]/15 border border-[#D92321]/40 p-4 text-xs font-bold text-[#ff8a88] space-y-2.5">
                      <p>{siteCrawlError}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {siteScrapeMode === 'url' && (
                          <button
                            type="button"
                            onClick={() => setSiteScrapeMode('html')}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#D92321] px-3 py-1.5 text-[11px] font-extrabold text-white cursor-pointer"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                            <span>التبديل إلى وضع لصق HTML الصفحة</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => navigateToTab('settings')}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#f9c400] hover:bg-[#dfb20b] px-3 py-1.5 text-[11px] font-black text-[#06131c] cursor-pointer"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          <span>إعداد بروكسي Cloudflare المجاني</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Crawled Website Results Toolbar + Bulk Publish */}
                {siteScrapedItems.length > 0 && siteCrawlMeta && (
                  <div className="rounded-3xl bg-[#0c1821] border border-[#4CAF50]/40 p-5 space-y-5 shadow-2xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base font-extrabold text-white">
                            تم اكتشاف {siteCrawlMeta.totalDiscovered} عملًا من:{' '}
                            <span className="text-[#f9c400]">{siteCrawlMeta.siteTitle}</span>
                          </h3>
                          <span className="font-latin rounded-md bg-[#4CAF50]/15 border border-[#4CAF50]/35 px-2 py-0.5 text-[11px] font-bold text-[#4CAF50]">
                            {siteCrawlMeta.strategy}
                          </span>
                          {siteCrawlAdapterUsed && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/15 border border-sky-400/35 px-2 py-0.5 text-[11px] font-bold text-sky-300">
                              <Wrench className="w-3 h-3" />
                              <span className="font-latin">
                                {siteCrawlAdapterUsed.name} v{siteCrawlAdapterUsed.version}
                              </span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#b7c9ef] mt-1">
                          حدد الأعمال المطلوبة أو عدّل أي عمل قبل النشر الجماعي في قاعدة البيانات.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={busyAction || selectedSiteItemsCount === 0}
                        onClick={() => void handleBulkPublishSelected()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-50 px-5 py-3 text-xs font-extrabold text-white shadow-lg cursor-pointer shrink-0"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {busyAction
                            ? 'جاري النشر في Firestore...'
                            : `نشر المحدد دفعة واحدة (${selectedSiteItemsCount} عمل)`}
                        </span>
                      </button>
                    </div>

                    {!customApiUrl &&
                      siteDeepScrape &&
                      siteScrapedItems.every((item) => item.servers.length === 0) && (
                        <div className="rounded-2xl bg-[#f9c400]/10 border border-[#f9c400]/35 px-4 py-3 text-xs text-[#fde68a] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <span>
                            تم جلب بيانات الأعمال، لكن المتصفح مُنع من فتح صفحات السيرفرات الداخلية (<span className="font-latin">/watch</span>) لهذا الموقع على الاستضافة الثابتة. لإحضار جميع سيرفرات المشاهدة تلقائياً، أضف رابط <strong>Cloudflare Worker المجاني</strong> من الإعدادات.
                          </span>
                          <button
                            type="button"
                            onClick={() => navigateToTab('settings')}
                            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-3.5 py-2 text-[11px] font-black text-[#06131c] cursor-pointer"
                          >
                            <Settings className="w-3.5 h-3.5" />
                            <span>تفعيل Cloudflare Worker الآن</span>
                          </button>
                        </div>
                      )}

                    {/* Selection & Filter Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSiteScrapedItems((prev) =>
                              prev.map((item) => ({ ...item, selected: true }))
                            )
                          }
                          className="rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                        >
                          تحديد الكل ({siteScrapedItems.length})
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSiteScrapedItems((prev) =>
                              prev.map((item) => ({ ...item, selected: false }))
                            )
                          }
                          className="rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold text-[#b7c9ef] cursor-pointer"
                        >
                          إلغاء التحديد
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            { id: 'all', label: 'الكل' },
                            { id: 'movie', label: 'أفلام' },
                            { id: 'series', label: 'مسلسلات' },
                            { id: 'wrestling', label: 'مصارعة' },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setSiteKindFilter(f.id)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer ${
                              siteKindFilter === f.id
                                ? 'bg-[#D92321] text-white'
                                : 'bg-[#1a242e] text-[#b7c9ef]'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Items Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[560px] overflow-y-auto pr-1">
                      {visibleSiteScrapedItems.map((item) => (
                        <div
                          key={item.tempKey}
                          className={`flex gap-3.5 rounded-2xl border p-3.5 transition-colors ${
                            item.selected
                              ? 'bg-[#1a242e] border-[#4CAF50]/50'
                              : 'bg-[#1a242e]/45 border-white/10 opacity-70'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={(e) =>
                                setSiteScrapedItems((prev) =>
                                  prev.map((x) =>
                                    x.tempKey === item.tempKey
                                      ? { ...x, selected: e.target.checked }
                                      : x
                                  )
                                )
                              }
                              aria-label={`تحديد ${item.title}`}
                              className="h-4 w-4 accent-[#4CAF50] cursor-pointer"
                            />
                            <img
                              src={optimizeTmdbUrl(item.poster_url || item.poster, 'w185') || ASSETS.runningMan}
                              alt={item.title}
                              loading="lazy"
                              decoding="async"
                              className="h-24 w-16 rounded-xl object-cover object-top border border-white/10"
                            />
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                <span className="rounded-md bg-[#D92321] px-2 py-0.5 text-[10px] font-black text-white">
                                  {KIND_LABELS[item.kind]}
                                </span>
                                <span className="rounded-md bg-[#0c1821] px-2 py-0.5 text-[10px] font-bold text-[#b7c9ef]">
                                  {item.year} • {item.quality}
                                </span>
                                {(existingCatalogByTitle.has(normalizeTitleForDuplicateCheck(item.title)) ||
                                  existingCatalogByTitle.has(
                                    normalizeTitleForDuplicateCheck(item.englishTitle)
                                  )) && (
                                  <span className="rounded-md bg-[#f9c400]/20 border border-[#f9c400]/45 px-2 py-0.5 text-[10px] font-black text-[#f9c400]">
                                    موجود مسبقاً
                                  </span>
                                )}
                              </div>
                              <h4 className="text-xs sm:text-sm font-extrabold text-white line-clamp-1">
                                {item.title}
                              </h4>
                              <p className="text-[11px] text-[#b7c9ef] line-clamp-2 mt-0.5">
                                {item.story}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                              <span className="text-[10px] font-bold text-[#4CAF50]">
                                {item.servers.length} سيرفر • {item.downloads.length} تحميل
                                {item.seasons?.[0]?.episodes.length
                                  ? ` • ${item.seasons[0].episodes.length} حلقة`
                                  : ''}
                                {item.trailerUrl ? ' • تريلر متاح' : ''}
                              </span>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewModalState({
                                      item: scrapedToMediaItem(item),
                                      source: 'site_scraper',
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#f9c400]/15 hover:bg-[#f9c400] px-2.5 py-1 text-[11px] font-bold text-[#f9c400] hover:text-[#06131c] cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>معاينة</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditorWithScraped(item)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] hover:bg-sky-500 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:text-white cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>تعديل</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSiteScrapedItems((prev) =>
                                      prev.filter((x) => x.tempKey !== item.tempKey)
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] hover:bg-[#D92321] px-2 py-1 text-[11px] font-bold text-[#D92321] hover:text-white cursor-pointer"
                                  aria-label="استبعاد"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3C: SMART SCRAPER ADAPTER BUILDER */}
            {activeTab === 'scraper_adapters' && (
              <ScraperAdapterBuilderPanel
                user={user}
                adapters={scraperAdapters}
                cloudSynced={adaptersCloudSynced}
                onAdaptersChanged={(next) => {
                  setScraperAdapters(next);
                  if (!shouldSkipBackendApiCalls()) {
                    void syncAdaptersToBackendRegistry(next, user);
                  }
                }}
                onOpenInSingleScraper={(targetUrl) => {
                  setScrapeMode('url');
                  setScrapeUrl(targetUrl);
                  navigateToTab('scraper');
                }}
                onNotify={onNotify}
              />
            )}

            {/* TAB 4: VISITOR REQUESTS (OWNER ONLY) */}
            {isOwner && activeTab === 'requests' && (
              <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-extrabold text-white">
                    إدارة طلبات الزوار المباشرة
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'الكل' },
                        { id: 'pending', label: 'قيد المراجعة' },
                        { id: 'approved', label: 'موافق عليه' },
                        { id: 'completed', label: 'مكتمل' },
                        { id: 'rejected', label: 'مرفوض' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setReqStatusFilter(st.id)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer ${
                          reqStatusFilter === st.id
                            ? 'bg-[#D92321] text-white'
                            : 'bg-[#1a242e] text-[#b7c9ef]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredRequests.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center text-xs text-[#b7c9ef]">
                    لا توجد طلبات زوار في هذه الحالة حاليًا.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRequests.map((req) => {
                      const draft = adminReplies[req.id] || {
                        status: req.status,
                        note: req.adminNote || '',
                      };
                      const badge = REQUEST_STATUS_LABELS[req.status];
                      return (
                        <div
                          key={req.id}
                          className="rounded-2xl bg-[#1a242e]/80 border border-white/[0.08] p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-extrabold text-white">{req.title}</h3>
                                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white">
                                  {req.type}
                                </span>
                                <span
                                  className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}
                                >
                                  {badge.label}
                                </span>
                              </div>
                              <p className="text-xs text-[#b7c9ef] mt-1">
                                مقدم الطلب:{' '}
                                <strong className="text-white">{req.requesterName || 'زائر'}</strong>
                                {req.notes ? ` — ملاحظات: ${req.notes}` : ''}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => void handleDeleteRequest(req.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c1821] text-[#D92321] hover:bg-[#D92321] hover:text-white cursor-pointer"
                              aria-label="حذف الطلب"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-2 border-t border-white/[0.06]">
                            <select
                              value={draft.status}
                              onChange={(e) =>
                                setAdminReplies((prev) => ({
                                  ...prev,
                                  [req.id]: {
                                    ...draft,
                                    status: e.target.value as RequestStatus,
                                  },
                                }))
                              }
                              aria-label="تحديث حالة الطلب"
                              className="sm:col-span-3 rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs font-bold text-white"
                            >
                              <option value="pending">قيد المراجعة</option>
                              <option value="approved">تمت الموافقة</option>
                              <option value="completed">تمت الإضافة للموقع</option>
                              <option value="rejected">مرفوض</option>
                            </select>

                            <input
                              type="text"
                              value={draft.note}
                              onChange={(e) =>
                                setAdminReplies((prev) => ({
                                  ...prev,
                                  [req.id]: { ...draft, note: e.target.value },
                                }))
                              }
                              placeholder="رد الإدارة للزائر (اختياري)..."
                              className="sm:col-span-6 rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#4CAF50] focus:outline-none"
                            />

                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => void handleUpdateRequest(req)}
                              className="sm:col-span-3 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] py-2 px-3 text-xs font-extrabold text-white cursor-pointer"
                            >
                              حفظ التحديث
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: USERS & ADMINS RBAC (OWNER ONLY) */}
            {isOwner && activeTab === 'users' && (
              <div className="space-y-6">
                {/* Role Definitions Guide */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#0c1821] border border-[#f9c400]/30 p-4">
                    <p className="text-xs font-black text-[#f9c400] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      <span>مسؤول (Owner / صلاحيات كاملة)</span>
                    </p>
                    <p className="text-[11px] text-[#b7c9ef] mt-1 leading-relaxed">
                      يمتلك كل الصلاحيات: إدارة الإعدادات، تعديل الصفحة الرئيسية، المساعد الذكي المحلي، طلبات الزوار، إدارة الصلاحيات، والنشر والتعديل والحذف والجلب.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#0c1821] border border-sky-400/30 p-4">
                    <p className="text-xs font-black text-sky-300 flex items-center gap-1.5">
                      <Edit3 className="w-4 h-4" />
                      <span>مشرف (Moderator / نشر وجلب فقط)</span>
                    </p>
                    <p className="text-[11px] text-[#b7c9ef] mt-1 leading-relaxed">
                      صلاحياته محددة فقط في نشر الأفلام والمسلسلات وتعديلها وحذفها واستخدام أدوات الجلب (عمل واحد أو موقع كامل)، دون الوصول للإعدادات أو الصلاحيات.
                    </p>
                  </div>
                </div>

                {/* Create New Admin/Moderator Directly with Email/Username & Password */}
                <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-4">
                  <div>
                    <h2 className="font-display text-base font-extrabold text-white">
                      إنشاء حساب مسؤول أو مشرف جديد (باسم وباسورد مباشرة)
                    </h2>
                    <p className="text-xs text-[#b7c9ef] mt-1">
                      يتم إنشاء الحساب في Firebase Auth ومنحه الرتبة المحددة فورًا بدون تسجيل خروجك.
                    </p>
                  </div>

                  <form onSubmit={handleCreateAdminAccount} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <input
                      type="text"
                      required
                      value={createAdminName}
                      onChange={(e) => setCreateAdminName(e.target.value)}
                      placeholder="الاسم (مثال: أحمد)"
                      className="sm:col-span-3 rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs text-white focus:border-[#D92321] focus:outline-none"
                    />
                    <input
                      type="text"
                      required
                      dir="ltr"
                      value={createAdminEmail}
                      onChange={(e) => setCreateAdminEmail(e.target.value)}
                      placeholder="البريد أو اسم المستخدم (mod@rahaltv.com)"
                      className="sm:col-span-3 rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs text-white focus:border-[#D92321] focus:outline-none"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      dir="ltr"
                      value={createAdminPassword}
                      onChange={(e) => setCreateAdminPassword(e.target.value)}
                      placeholder="كلمة المرور (6 أحرف+)"
                      className="sm:col-span-2 rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs text-white focus:border-[#D92321] focus:outline-none"
                    />
                    <select
                      value={createAdminRole}
                      onChange={(e) => setCreateAdminRole(e.target.value as AdminPrivilegeRole)}
                      aria-label="نوع الصلاحية"
                      className="sm:col-span-2 rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
                    >
                      <option value="moderator">مشرف (نشر وتعديل وجلب)</option>
                      <option value="owner">مسؤول (صلاحيات كاملة)</option>
                    </select>
                    <button
                      type="submit"
                      disabled={creatingAdmin}
                      className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-60 py-2.5 px-4 text-xs font-extrabold text-white cursor-pointer"
                    >
                      {creatingAdmin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>إضافة الحساب</span>
                    </button>
                  </form>

                  {createAdminError && (
                    <div className="rounded-xl bg-[#D92321]/15 border border-[#D92321]/40 p-3 text-xs text-red-200">
                      {createAdminError}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-4">
                  <h2 className="font-display text-base font-extrabold text-white">
                    أو منح صلاحية لمستخدم موجود عبر معرف المستخدم (UID)
                  </h2>
                  <form onSubmit={handleGrantAdmin} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <input
                      type="text"
                      required
                      value={newAdminUid}
                      onChange={(e) => setNewAdminUid(e.target.value)}
                      placeholder="معرّف المستخدم (Firebase UID)"
                      className="sm:col-span-4 rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs text-white focus:border-[#D92321] focus:outline-none"
                    />
                    <input
                      type="text"
                      required
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="الاسم المعروض"
                      className="sm:col-span-3 rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs text-white focus:border-[#D92321] focus:outline-none"
                    />
                    <select
                      value={newAdminRole}
                      onChange={(e) => setNewAdminRole(e.target.value as AdminPrivilegeRole)}
                      aria-label="اختيار الرتبة"
                      className="sm:col-span-3 rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
                    >
                      <option value="moderator">مشرف (نشر وتعديل وجلب)</option>
                      <option value="owner">مسؤول (صلاحيات كاملة)</option>
                    </select>
                    <button
                      type="submit"
                      disabled={busyAction}
                      className="sm:col-span-2 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] py-2.5 px-4 text-xs font-extrabold text-white cursor-pointer"
                    >
                      منح الصلاحية
                    </button>
                  </form>

                  {adminsList.length > 0 && (
                    <div className="pt-3 border-t border-white/10 space-y-2">
                      <p className="text-xs font-bold text-[#b7c9ef]">
                        فريق الإدارة المضاف ({adminsList.length}):
                      </p>
                      {adminsList.map((adm) => {
                        const roleVal: AdminPrivilegeRole =
                          adm.role === 'moderator' ? 'moderator' : 'owner';
                        return (
                          <div
                            key={adm.uid}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#1a242e] px-3.5 py-2.5 text-xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-extrabold text-white">{adm.displayName}</span>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-black border ${
                                  roleVal === 'owner'
                                    ? 'bg-[#f9c400]/15 border-[#f9c400]/40 text-[#f9c400]'
                                    : 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                                }`}
                              >
                                {roleVal === 'owner' ? 'مسؤول (كامل)' : 'مشرف (نشر وجلب)'}
                              </span>
                              {adm.uid === activeActorUid && (
                                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-black text-white">
                                  حسابك الحالي
                                </span>
                              )}
                              <span className="text-[#b7c9ef] font-latin" dir="ltr">
                                ({adm.uid})
                              </span>
                            </div>
                            {adm.uid !== activeActorUid && (
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={() => void handleToggleExistingAdminRole(adm)}
                                  className="text-xs font-bold text-sky-300 hover:underline cursor-pointer"
                                >
                                  {roleVal === 'owner' ? 'تحويل لمشرف' : 'ترقية لمسؤول'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={() => void revokeAdminRoleFromFirestore(adm.uid)}
                                  className="text-xs font-bold text-[#D92321] hover:underline cursor-pointer"
                                >
                                  سحب الصلاحية
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Granular Moderator Sub-Permissions Matrix */}
                <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div>
                      <h2 className="font-display text-base font-extrabold text-white">
                        مصفوفة الصلاحيات الدقيقة للمشرفين (Moderator Sub-Permissions)
                      </h2>
                      <p className="text-xs text-[#b7c9ef] mt-1">
                        تحكّم في الأدوات الفرعية المتاحة للمشرفين (Moderator) على مساحة العمل دون التأثير على صلاحيات المالك الكاملة.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const defaults = { ...DEFAULT_MODERATOR_SUB_PERMS };
                        updateWorkspacePrefs({
                          moderatorSubPermissions: defaults,
                        });
                        if (isOwner && activeActorUid) {
                          void syncModeratorPermissionsToFirestore(defaults, activeActorUid).then(
                            (ok) => {
                              if (!ok) {
                                onNotifyRef.current(
                                  'تمت استعادة الصلاحيات محلياً — تعذرت المزامنة مع Firestore'
                                );
                              }
                            }
                          );
                        }
                        onNotify('تمت استعادة الصلاحيات الافتراضية للمشرفين');
                      }}
                      className="rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3 py-1.5 text-[11px] font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                    >
                      استعادة الافتراضي
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {MODERATOR_PERM_LABELS.map((perm) => {
                      const enabled = Boolean(workspacePrefs.moderatorSubPermissions[perm.key]);
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 cursor-pointer transition-colors ${
                            enabled
                              ? 'bg-[#1a242e]/85 border-[#4CAF50]/40'
                              : 'bg-[#1a242e]/40 border-white/10 opacity-80'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-white">{perm.title}</p>
                            <p className="text-[11px] text-[#b7c9ef] mt-0.5">{perm.desc}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => {
                              updateModeratorPerm(perm.key, e.target.checked);
                              onNotify(
                                e.target.checked
                                  ? `تم تفعيل صلاحية "${perm.title}" للمشرفين`
                                  : `تم تعطيل صلاحية "${perm.title}" للمشرفين`
                              );
                            }}
                            className="h-4 w-4 accent-[#4CAF50] shrink-0 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5">
                  <h2 className="font-display text-base font-extrabold text-white mb-4">
                    الأعضاء المسجلون في قاعدة البيانات ({usersList.length})
                  </h2>
                  {usersList.length === 0 ? (
                    <p className="text-xs text-[#b7c9ef]">لم يسجل أي عضو دخولًا بعد.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {usersList.map((u) => (
                        <div
                          key={u.uid}
                          className="flex items-center justify-between gap-3 rounded-2xl bg-[#1a242e]/70 p-3.5 border border-white/[0.06]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {u.photoURL ? (
                              <img
                                src={u.photoURL}
                                alt={u.displayName}
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                className="h-10 w-10 rounded-xl object-cover shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-xl bg-[#D92321]/20 flex items-center justify-center text-xs font-black text-white shrink-0">
                                {u.displayName.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-white truncate">
                                {u.displayName}
                              </p>
                              <p className="font-latin text-[10px] text-[#b7c9ef] truncate select-all">
                                {u.uid}
                              </p>
                            </div>
                          </div>
                          <span className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[#4CAF50] shrink-0">
                            قائمتي: {u.watchlistIds?.length || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 6: SITE SETTINGS (OWNER ONLY) */}
            {isOwner && activeTab === 'settings' && (
              <form
                onSubmit={handleSaveSettings}
                className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-6 space-y-5"
              >
                <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
                  <Tv className="w-5 h-5 text-[#D92321]" />
                  <h2 className="font-display text-lg font-extrabold text-white">
                    إعدادات منصة RahaL TV العامة
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                      اسم المنصة
                    </label>
                    <input
                      type="text"
                      required
                      value={settingsForm.siteName}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          siteName: e.target.value,
                          branding: {
                            ...activeBranding,
                            siteName: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                      عدد الأعمال المثبتة في السلايدر
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={settingsForm.featuredLimit}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          featuredLimit: Number(e.target.value) || 5,
                        })
                      }
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                    الوصف التعريفي للموقع (Tagline)
                  </label>
                  <textarea
                    rows={3}
                    value={settingsForm.tagline}
                    onChange={(e) => setSettingsForm({ ...settingsForm, tagline: e.target.value })}
                    className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#b7c9ef] mb-1.5">
                    شريط تنبيهات وإعلانات المشاهدين (اختياري)
                  </label>
                  <input
                    type="text"
                    value={settingsForm.announcementText}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, announcementText: e.target.value })
                    }
                    placeholder="مثال: تمت إضافة حلقات جديدة من مسلسلات رمضان 2026 بجودة BluRay"
                    className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
                  />
                </div>

                <label className="flex items-center gap-2.5 text-xs font-bold text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsForm.tickerEnabled}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, tickerEnabled: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#D92321]"
                  />
                  <span>تفعيل شريط التنبيهات في الصفحة الرئيسية</span>
                </label>

                {/* Maintenance Mode Section */}
                <div
                  className={`rounded-2xl border p-5 space-y-4 transition-colors ${
                    settingsForm.maintenanceMode
                      ? 'bg-[#D92321]/10 border-[#D92321]/45'
                      : 'bg-[#1a242e]/65 border-white/10'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                          settingsForm.maintenanceMode
                            ? 'bg-[#D92321]/20 border-[#D92321]/50 text-[#ff8a88]'
                            : 'bg-[#0c1821] border-white/10 text-[#f9c400]'
                        }`}
                      >
                        <Wrench className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-extrabold text-white">وضع الصيانة (Maintenance Mode)</h3>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                              settingsForm.maintenanceMode
                                ? 'bg-[#D92321] text-white'
                                : 'bg-[#4CAF50]/20 text-[#4CAF50]'
                            }`}
                          >
                            {settingsForm.maintenanceMode ? 'مُفعّل حاليًا' : 'متوقف'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#b7c9ef] mt-0.5">
                          عند التفعيل، تظهر رسالة الصيانة للزوار العاديين فقط بينما يظل الموقع ولوحة التحكم متاحَين لك كأدمن.
                        </p>
                      </div>
                    </div>

                    {/* Interactive Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settingsForm.maintenanceMode}
                      aria-label="تبديل وضع الصيانة"
                      onClick={() =>
                        setSettingsForm({
                          ...settingsForm,
                          maintenanceMode: !settingsForm.maintenanceMode,
                        })
                      }
                      className={`relative inline-flex h-7 w-13 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                        settingsForm.maintenanceMode
                          ? 'bg-[#D92321] border-[#ff5a58]'
                          : 'bg-[#0c1821] border-white/20'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                          settingsForm.maintenanceMode ? '-translate-x-7' : '-translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-[#b7c9ef]">
                        نص رسالة الصيانة المخصصة للمستخدمين
                      </label>
                      <span className="font-latin text-[10px] font-bold text-[#b7c9ef]">
                        {(settingsForm.maintenanceMessage || '').length} / 500
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={settingsForm.maintenanceMessage}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          maintenanceMessage: e.target.value,
                        })
                      }
                      placeholder="اكتب الرسالة التي ستظهر للزوار أثناء وضع الصيانة..."
                      className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a242e]/65 border border-white/10 p-5 space-y-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-[240px]">
                      <h3 className="text-sm font-extrabold text-white">
                        رابط بروكسي السحب (Cloudflare Worker المجاني أو خادم Node.js)
                      </h3>
                      <p className="text-[11px] leading-relaxed text-[#b7c9ef]">
                        مواقع مثل <span className="font-latin text-white">akwams.org</span> تمنع الجلب المباشر من المتصفح وتخفي السيرفرات في صفحة <span className="font-latin text-white">/watch</span>. أنشئ Cloudflare Worker مجانياً (100 ألف طلب يومياً بلا توقف) وضع رابطه هنا لتعمل أداة السحب على GitHub Pages بنفس كفاءة المعاينة تماماً.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (navigator.clipboard?.writeText) {
                          void navigator.clipboard
                            .writeText(CLOUDFLARE_WORKER_SOURCE)
                            .then(() => onNotify('تم نسخ كود Cloudflare Worker المجاني إلى الحافظة!'))
                            .catch(() => onNotify('تعذر النسخ التلقائي — راجع ملف cloudflare-worker.js في المستودع.'));
                        } else {
                          onNotify('افتح ملف cloudflare-worker.js من المستودع وانسخ محتواه.');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3.5 py-2 text-[11px] font-extrabold text-white cursor-pointer shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#f9c400]" />
                      <span>نسخ كود Cloudflare Worker المجاني</span>
                    </button>
                  </div>

                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#b7c9ef] bg-[#0c1821]/70 border border-white/5 rounded-xl p-3">
                    <li>
                      ادخل إلى{' '}
                      <a
                        href="https://dash.cloudflare.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-latin text-[#f9c400] underline inline-flex items-center gap-1"
                      >
                        dash.cloudflare.com
                        <ExternalLink className="w-3 h-3" />
                      </a>{' '}
                      ثم اختر <span className="font-latin text-white">Workers &amp; Pages &larr; Create Worker</span>.
                    </li>
                    <li>احذف الكود الافتراضي والصق الكود المنسوخ بالزر أعلاه ثم اضغط <span className="font-latin text-white">Deploy</span>.</li>
                    <li>انسخ رابط الـ Worker (ينتهي بـ <span className="font-latin text-white">.workers.dev</span>) والصقه بالأسفل ثم احفظ.</li>
                  </ol>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="url"
                      dir="ltr"
                      value={customApiUrl}
                      onChange={(e) => {
                        setCustomApiUrl(e.target.value);
                        setProxyTestResult(null);
                      }}
                      placeholder="https://rahaltv-proxy.yourname.workers.dev"
                      className="font-latin flex-1 rounded-xl bg-[#0c1821] border border-white/10 px-3.5 py-2.5 text-xs text-white focus:border-[#f9c400] focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={testingProxy}
                        onClick={async () => {
                          setTestingProxy(true);
                          setProxyTestResult(null);
                          try {
                            const res = await testCloudflareWorkerConnection(customApiUrl);
                            if (res.normalizedUrl) {
                              setCustomApiUrl(res.normalizedUrl);
                            }
                            setProxyTestResult({ ok: res.ok, message: res.message });
                            if (res.ok) {
                              const saved = setCustomApiBaseUrl(res.normalizedUrl);
                              setCustomApiUrl(saved);
                              onNotify('تم فحص وحفظ رابط Cloudflare Worker بنجاح!');
                            }
                          } finally {
                            setTestingProxy(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 border border-white/15 px-3.5 py-2.5 text-xs font-extrabold text-white cursor-pointer"
                      >
                        {testingProxy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#f9c400]" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 text-[#4CAF50]" />
                        )}
                        <span>{testingProxy ? 'جارٍ الفحص...' : 'اختبار البروكسي'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          const saved = setCustomApiBaseUrl(customApiUrl);
                          setCustomApiUrl(saved);
                          if (!saved) {
                            setProxyTestResult(null);
                            onNotify('تم مسح الرابط — سيعمل السحب بالوضع المدمج في المتصفح');
                            return;
                          }
                          onNotify(`تم حفظ رابط بروكسي السحب: ${saved}`);
                          setTestingProxy(true);
                          try {
                            const res = await testCloudflareWorkerConnection(saved);
                            setProxyTestResult({ ok: res.ok, message: res.message });
                          } finally {
                            setTestingProxy(false);
                          }
                        }}
                        className="rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-4 py-2.5 text-xs font-black text-[#06131c] cursor-pointer"
                      >
                        حفظ رابط البروكسي
                      </button>

                      {customApiUrl.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomApiBaseUrl('');
                            setCustomApiUrl('');
                            setProxyTestResult(null);
                            onNotify('تم مسح رابط البروكسي — يعمل السحب بالوضع المدمج في المتصفح.');
                          }}
                          className="rounded-xl bg-[#0c1821] hover:bg-[#D92321]/20 border border-white/10 px-3 py-2.5 text-xs font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                        >
                          مسح
                        </button>
                      )}
                    </div>
                  </div>

                  {proxyTestResult && (
                    <div
                      className={`rounded-xl border px-3.5 py-2.5 text-[11px] font-bold leading-relaxed ${
                        proxyTestResult.ok
                          ? 'bg-[#4CAF50]/15 border-[#4CAF50]/40 text-[#b6f2b9]'
                          : 'bg-[#D92321]/15 border-[#D92321]/45 text-[#ffb3b1]'
                      }`}
                    >
                      {proxyTestResult.message}
                    </div>
                  )}
                </div>

                {/* Direct Links to Dedicated Security Rules & Player Theme Modules */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-[#1a242e]/65 border border-[#f9c400]/25 p-4 flex flex-col justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#f9c400]" />
                        <span>قواعد أمان Firestore</span>
                      </h3>
                      <p className="text-[11px] text-[#b7c9ef] mt-1 leading-relaxed">
                        تم نقل معاينة ونسخ قواعد أمان القاعدة ورابط محرر Firebase Console إلى القسم المخصص.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigateToTab('security_rules')}
                      className="self-start inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-4 py-2 text-xs font-black text-[#06131c] cursor-pointer"
                    >
                      <span>فتح قواعد أمان Firestore</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="rounded-2xl bg-[#1a242e]/65 border border-white/10 p-4 flex flex-col justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                        <Palette className="w-4 h-4 text-[#D92321]" />
                        <span>تخصيص ثيم المشغّل الداخلي</span>
                      </h3>
                      <p className="text-[11px] text-[#b7c9ef] mt-1 leading-relaxed">
                        تحكّم في ألوان الإطار والحواف والتوهج واسم المشغّل مع معاينة فورية من القسم المخصص.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigateToTab('player_theme')}
                      className="self-start inline-flex items-center gap-1.5 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
                    >
                      <span>فتح مظهر المشغّل</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busyAction}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-6 py-3 text-xs font-extrabold text-white shadow-lg cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{busyAction ? 'جاري الحفظ...' : 'حفظ الإعدادات في Firestore'}</span>
                </button>
              </form>
            )}
            </Suspense>
            </div>
          </main>
        </div>
      </div>

      {/* ---------------- COMPLETE 4-TAB ADD/EDIT MEDIA MODAL ---------------- */}
      {editingItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isCreatingNew ? 'إضافة فيلم أو مسلسل جديد' : `تعديل ${editingItem.title}`}
          data-rtv-focus-trap="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
        >
          <div
            className="fixed inset-0 bg-black/82 backdrop-blur-sm"
            onClick={() => setEditingItem(null)}
          />
          <form
            onSubmit={handleSaveMedia}
            className="relative z-10 w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[#0c1821] border border-white/15 shadow-2xl overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-[#1a242e] px-5 py-3.5 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <Film className="w-5 h-5 text-[#D92321] shrink-0" />
                <h3 className="font-display text-sm sm:text-base font-extrabold text-white truncate">
                  {isCreatingNew
                    ? 'إضافة فيلم / مسلسل جديد إلى RahaL TV'
                    : `تعديل: ${editingItem.title}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-[#D92321] cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 4 Sub-tabs Strip */}
            <div className="flex flex-wrap gap-1.5 bg-[#09131b] px-5 py-2.5 border-b border-white/10">
              {(
                [
                  { id: 'basic', label: '1. البيانات الأساسية والقصة', icon: Film },
                  {
                    id: 'servers',
                    label: `2. سيرفرات المشاهدة (${editingItem.servers?.length || 0})`,
                    icon: Server,
                  },
                  {
                    id: 'downloads',
                    label: `3. روابط التحميل (${editingItem.downloads?.length || 0})`,
                    icon: Download,
                  },
                  {
                    id: 'seasons_cast',
                    label: `4. الحلقات (${editingItem.seasons?.reduce((a, s) => a + s.episodes.length, 0) || 0}) وطاقم العمل`,
                    icon: Layers,
                  },
                ] as const
              ).map((sub) => {
                const SubIcon = sub.icon;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setEditorTab(sub.id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                      editorTab === sub.id
                        ? 'bg-[#D92321] text-white'
                        : 'bg-[#1a242e] text-[#b7c9ef] hover:text-white'
                    }`}
                  >
                    <SubIcon className="w-3.5 h-3.5" />
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Scrollable Body */}
            <div className="overflow-y-auto p-5 sm:p-6 space-y-5 flex-1">
              {/* SUB-TAB 1: BASIC INFO */}
              {editorTab === 'basic' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">
                        اسم العمل (بالعربية) *
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.title}
                        onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                        placeholder="مثال: فيلم Gladiator II 2026"
                        className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">
                        الاسم بالإنجليزية
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={editingItem.englishTitle}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, englishTitle: e.target.value })
                        }
                        placeholder="Gladiator II"
                        className="font-latin w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Dedicated Permalink / Slug Editor */}
                  <div className="rounded-2xl bg-[#1a242e]/70 border border-white/10 p-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[#f9c400] flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5" />
                        <span>الرابط المخصص للفيلم/المسلسل (Slug)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const nextSlug = generateCleanSlug(
                            editingItem.englishTitle,
                            editingItem.title,
                            editingItem.id
                          );
                          setEditingItem({
                            ...editingItem,
                            slug: nextSlug,
                            shortUrl: buildDedicatedMediaUrl({ id: editingItem.id, slug: nextSlug }),
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] hover:bg-white/10 border border-white/10 px-2.5 py-1 text-[10px] font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                      >
                        <Wand2 className="w-3 h-3" />
                        <span>توليد من العنوان تلقائياً</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      value={editingItem.slug || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditingItem({
                          ...editingItem,
                          slug: val,
                          shortUrl: buildDedicatedMediaUrl({ id: editingItem.id, slug: val }),
                        });
                      }}
                      placeholder="gladiator-ii-2026"
                      className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#f9c400] focus:outline-none"
                    />
                    <p className="font-latin text-[11px] text-[#4CAF50] truncate" dir="ltr">
                      {resolveDisplayShortUrl(editingItem)}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">النوع</label>
                      <select
                        value={editingItem.kind}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, kind: e.target.value as MediaKind })
                        }
                        className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs font-bold text-white"
                      >
                        <option value="movie">فيلم</option>
                        <option value="series">مسلسل</option>
                        <option value="tv">برنامج / مسرحية</option>
                        <option value="wrestling">مصارعة حرة</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">السنة</label>
                      <input
                        type="text"
                        value={editingItem.year}
                        onChange={(e) => setEditingItem({ ...editingItem, year: e.target.value })}
                        className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">الجودة</label>
                      <input
                        type="text"
                        value={editingItem.quality}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, quality: e.target.value })
                        }
                        className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">المدة</label>
                      <input
                        type="text"
                        value={editingItem.duration}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, duration: e.target.value })
                        }
                        className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">البلد</label>
                      <input
                        type="text"
                        value={editingItem.country}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, country: e.target.value })
                        }
                        className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">اللغة</label>
                      <input
                        type="text"
                        value={editingItem.language}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, language: e.target.value })
                        }
                        className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  {/* Dual High-Res Poster (2:3) + Backdrop (16:9) Section */}
                  {(() => {
                    const currentPosterUrl = getPosterUrl(editingItem);
                    const backdropInfo = getBackdropInfo(editingItem);
                    const qualityStatus = getMediaImageQualityStatus(editingItem);
                    const qualityBadge = IMAGE_QUALITY_BADGE_MAP[qualityStatus];
                    return (
                      <div className="rounded-2xl bg-[#1a242e]/60 border border-white/[0.08] p-4 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.08] pb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white">
                              <ImageIcon className="w-4 h-4 text-[#E50914]" />
                              <span>إدارة البوستر والخلفية (Dual High-Res Images)</span>
                            </span>
                            <span
                              className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${qualityBadge.badgeClass}`}
                            >
                              {qualityBadge.label}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={probingEditorImages}
                              onClick={() => void handleProbeEditorImageDimensions()}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0c1821] hover:bg-white/10 border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-[#b7c9ef] hover:text-white cursor-pointer disabled:opacity-50"
                            >
                              {probingEditorImages ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Ruler className="w-3.5 h-3.5 text-[#f9c400]" />
                              )}
                              <span>قياس الأبعاد</span>
                            </button>
                            <button
                              type="button"
                              disabled={fetchingHqImages}
                              onClick={() => void handleFetchHqImagesForEditor()}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#E50914] hover:bg-[#f40612] px-3 py-1.5 text-[11px] font-extrabold text-white cursor-pointer disabled:opacity-50"
                            >
                              {fetchingHqImages ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {fetchingHqImages ? 'جاري الجلب...' : 'إعادة جلب صور عالية الجودة'}
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Preview Cards Side-by-Side */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                          {/* Poster 2:3 */}
                          <div className="md:col-span-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-bold text-[#b7c9ef]">
                              <span>البوستر (2:3)</span>
                              <span className="font-latin text-[10px] text-[#f9c400]">
                                {editingItem.poster_width && editingItem.poster_height
                                  ? `${editingItem.poster_width}×${editingItem.poster_height}`
                                  : 'غير مقاس'}
                              </span>
                            </div>
                            <div className="aspect-[2/3] w-28 sm:w-32 mx-auto md:mx-0 overflow-hidden rounded-xl border border-white/15 bg-[#0c1821]">
                              <img
                                src={optimizeTmdbUrl(currentPosterUrl, 'w342')}
                                alt="معاينة البوستر"
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover object-top"
                              />
                            </div>
                          </div>

                          {/* Backdrop 16:9 */}
                          <div className="md:col-span-4 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-bold text-[#b7c9ef]">
                              <span>الخلفية العريضة (16:9)</span>
                              <span className="font-latin text-[10px] text-[#f9c400]">
                                {editingItem.backdrop_width && editingItem.backdrop_height
                                  ? `${editingItem.backdrop_width}×${editingItem.backdrop_height}`
                                  : backdropInfo.hasDedicatedBackdrop
                                    ? 'غير مقاس'
                                    : 'مفقودة'}
                              </span>
                            </div>
                            <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/15 bg-[#0c1821] relative">
                              {backdropInfo.hasDedicatedBackdrop ? (
                                <img
                                  src={optimizeTmdbUrl(backdropInfo.url, 'w780')}
                                  alt="معاينة الخلفية العريضة"
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover object-center"
                                />
                              ) : (
                                <div className="h-full w-full flex flex-col items-center justify-center p-3 text-center gap-1 text-[#f9c400] bg-[#D92321]/10">
                                  <AlertTriangle className="w-4 h-4" />
                                  <span className="text-[10px] font-bold">
                                    لا توجد خلفية عريضة مستقلة — سيتم عرض خلفية سينمائية داكنة دون مط البوستر
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* URL Inputs */}
                          <div className="md:col-span-5 space-y-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                                اختيار سريع من البوسترات الجاهزة
                              </label>
                              <select
                                value={
                                  POSTER_CHOICES.some((p) => p.url === currentPosterUrl)
                                    ? currentPosterUrl
                                    : ''
                                }
                                onChange={(e) => {
                                  if (e.target.value) {
                                    setEditingItem({
                                      ...editingItem,
                                      poster: e.target.value,
                                      poster_url: e.target.value,
                                      poster_width: 0,
                                      poster_height: 0,
                                      image_source: 'preset',
                                    });
                                  }
                                }}
                                className="w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                              >
                                <option value="">-- رابط مخصص أو اختر بوستر --</option>
                                {POSTER_CHOICES.map((p) => (
                                  <option key={p.url} value={p.url}>
                                    {p.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                                رابط البوستر العمودي (poster_url)
                              </label>
                              <input
                                type="text"
                                dir="ltr"
                                value={editingItem.poster_url || editingItem.poster}
                                onChange={(e) =>
                                  setEditingItem({
                                    ...editingItem,
                                    poster: e.target.value,
                                    poster_url: e.target.value,
                                    poster_width: 0,
                                    poster_height: 0,
                                  })
                                }
                                placeholder="https://..."
                                className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                                رابط الخلفية العريضة 16:9 (backdrop_url)
                              </label>
                              <input
                                type="text"
                                dir="ltr"
                                value={
                                  editingItem.backdrop_url !== undefined
                                    ? editingItem.backdrop_url
                                    : backdropInfo.hasDedicatedBackdrop
                                      ? backdropInfo.url
                                      : ''
                                }
                                onChange={(e) =>
                                  setEditingItem({
                                    ...editingItem,
                                    backdrop: e.target.value || ASSETS.heroBackdrop,
                                    backdrop_url: e.target.value,
                                    backdrop_width: 0,
                                    backdrop_height: 0,
                                  })
                                }
                                placeholder="https://image.tmdb.org/t/p/original/..."
                                className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Safe Proposal Review Box (Before / After — Keep Old on Cancel) */}
                        {editorImageProposal && (
                          <div className="rounded-xl border border-[#f9c400]/40 bg-[#0c1821] p-3.5 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-extrabold text-[#f9c400] flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>
                                  معاينة الصور المقترحة (المصدر: {editorImageProposal.image_source}) — لن تتغير صورك الحالية إلا عند الاعتماد
                                </span>
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditorImageProposal(null)}
                                  className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                                >
                                  إبقاء الصور الحالية
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItem((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            poster: editorImageProposal.poster_url || prev.poster,
                                            poster_url:
                                              editorImageProposal.poster_url || prev.poster,
                                            backdrop:
                                              editorImageProposal.backdrop_url ||
                                              prev.backdrop ||
                                              ASSETS.heroBackdrop,
                                            backdrop_url: editorImageProposal.backdrop_url || '',
                                            poster_width: editorImageProposal.poster_width,
                                            poster_height: editorImageProposal.poster_height,
                                            backdrop_width: editorImageProposal.backdrop_width,
                                            backdrop_height: editorImageProposal.backdrop_height,
                                            image_source: editorImageProposal.image_source,
                                            image_quality_status:
                                              editorImageProposal.image_quality_status,
                                          }
                                        : prev
                                    );
                                    setEditorImageProposal(null);
                                    onNotify('تم تطبيق الصور المقترحة في المحرر — اضغط حفظ لإثباتها');
                                  }}
                                  className="rounded-lg bg-[#4CAF50] hover:bg-[#43a047] px-3 py-1 text-[11px] font-extrabold text-white cursor-pointer"
                                >
                                  اعتماد الصور الجديدة
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                              <div className="flex items-center gap-3 rounded-lg bg-[#1a242e] p-2">
                                {editorImageProposal.poster_url ? (
                                  <img
                                    src={optimizeTmdbUrl(editorImageProposal.poster_url, 'w185')}
                                    alt="البوستر المقترح"
                                    loading="lazy"
                                    decoding="async"
                                    className="h-16 w-11 rounded object-cover object-top shrink-0"
                                  />
                                ) : null}
                                <div className="min-w-0">
                                  <p className="font-bold text-white">البوستر المقترح</p>
                                  <p className="font-latin text-[#4CAF50]">
                                    {editorImageProposal.poster_width &&
                                    editorImageProposal.poster_height
                                      ? `${editorImageProposal.poster_width}×${editorImageProposal.poster_height}`
                                      : 'رابط محسّن'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 rounded-lg bg-[#1a242e] p-2">
                                {editorImageProposal.backdrop_url ? (
                                  <img
                                    src={optimizeTmdbUrl(editorImageProposal.backdrop_url, 'w300')}
                                    alt="الخلفية المقترحة"
                                    loading="lazy"
                                    decoding="async"
                                    className="h-14 w-24 rounded object-cover object-center shrink-0"
                                  />
                                ) : null}
                                <div className="min-w-0">
                                  <p className="font-bold text-white">الخلفية العريضة المقترحة</p>
                                  <p className="font-latin text-[#4CAF50]">
                                    {editorImageProposal.backdrop_url
                                      ? editorImageProposal.backdrop_width &&
                                        editorImageProposal.backdrop_height
                                        ? `${editorImageProposal.backdrop_width}×${editorImageProposal.backdrop_height}`
                                        : 'متوفرة'
                                      : 'لم يتوفر Backdrop عريض 16:9'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Slider-Only PNG Title Logo Upload (Appears ONLY when movie is placed in 4th Slider) */}
                        <div className="rounded-xl border border-white/10 bg-[#0c1821]/90 p-3.5 space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-extrabold text-white">
                                صورة شعار الفيلم PNG (للسلايدر الرابع فقط)
                              </span>
                              <p className="text-[11px] text-[#b7c9ef]/85 mt-0.5">
                                تظهر هذه الصورة بدلاً من اسم الفيلم فقط عند إضافة الفيلم إلى السلايدر، ولا تظهر على بطاقات الموقع.
                              </p>
                            </div>
                            <div className="h-11 w-32 shrink-0 rounded-lg bg-[#060608] border border-white/15 flex items-center justify-center p-1 overflow-hidden">
                              {editingSliderPngUrl ? (
                                <img
                                  src={editingSliderPngUrl}
                                  alt="معاينة شعار السلايدر PNG"
                                  referrerPolicy="no-referrer"
                                  className="max-h-full max-w-full object-contain"
                                />
                              ) : (
                                <span className="text-[10px] font-bold text-white/40">بدون PNG</span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="url"
                              dir="ltr"
                              value={
                                editingSliderPngUrl.startsWith('data:')
                                  ? ''
                                  : editingSliderPngUrl
                              }
                              onChange={(e) => setEditingSliderPngUrl(e.target.value)}
                              placeholder={
                                editingSliderPngUrl.startsWith('data:')
                                  ? 'تم رفع صورة PNG — أو الصق رابطاً جديداً'
                                  : 'https://.../movie-title-logo.png'
                              }
                              className="flex-1 min-w-[180px] rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 font-latin text-xs text-white focus:border-[#E50914] focus:outline-none"
                            />
                            <label className="inline-flex items-center gap-1.5 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer shrink-0">
                              {uploadingSliderPng ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              <span>{uploadingSliderPng ? 'جاري الرفع...' : 'رفع PNG'}</span>
                              <input
                                type="file"
                                accept="image/png,image/webp,image/svg+xml"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file) return;
                                  setUploadingSliderPng(true);
                                  try {
                                    const token =
                                      user && typeof (user as User).getIdToken === 'function'
                                        ? await (user as User).getIdToken().catch(() => undefined)
                                        : undefined;
                                    const res = await uploadTransparentSliderPng(file, token);
                                    setEditingSliderPngUrl(res.url);
                                    if (!isCreatingNew && editingItem?.id) {
                                      const nextV4Cfg = setStreamV4MoviePngLogo(
                                        editingItem.id,
                                        res.url
                                      );
                                      if (isOwner && hasActor && activeActorUid) {
                                        const syncRes = await saveStreamV4SliderConfigToFirestore(
                                          nextV4Cfg,
                                          activeActorUid
                                        ).catch(() => null);
                                        if (!syncRes?.ok) {
                                          onNotify(
                                            'تم حفظ الشعار محلياً، لكن تعذرت المزامنة السحابية للسلايدر الرابع'
                                          );
                                          return;
                                        }
                                      }
                                    }
                                    onNotify('تم تجهيز صورة الشعار PNG للسلايدر ومزامنتها بنجاح');
                                  } catch (err) {
                                    onNotify(
                                      err instanceof Error
                                        ? err.message
                                        : 'تعذر معالجة صورة PNG المختارة.'
                                    );
                                  } finally {
                                    setUploadingSliderPng(false);
                                  }
                                }}
                              />
                            </label>
                            {editingSliderPngUrl && (
                              <button
                                type="button"
                                onClick={async () => {
                                  setEditingSliderPngUrl('');
                                  if (!isCreatingNew && editingItem?.id) {
                                    const nextV4Cfg = setStreamV4MoviePngLogo(editingItem.id, '');
                                    if (isOwner && hasActor && activeActorUid) {
                                      const syncRes = await saveStreamV4SliderConfigToFirestore(
                                        nextV4Cfg,
                                        activeActorUid
                                      ).catch(() => null);
                                      if (!syncRes?.ok) {
                                        onNotify(
                                          'تمت إزالة الشعار محلياً، لكن تعذرت المزامنة السحابية للسلايدر الرابع'
                                        );
                                        return;
                                      }
                                    }
                                  }
                                  onNotify('تمت إزالة شعار السلايدر PNG ومزامنته');
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#1a242e] hover:bg-red-600/25 border border-white/10 text-red-400 cursor-pointer shrink-0"
                                title="إزالة صورة PNG"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                            <span className="text-[11px] font-bold text-[#b7c9ef]">
                              وقت ظهور الفيلم في السلايدر الرابع (ثانية — اتركه فارغاً للافتراضي):
                            </span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={2}
                                max={60}
                                value={editingSliderDurationSec}
                                onChange={(e) => setEditingSliderDurationSec(e.target.value)}
                                placeholder={String(
                                  loadStreamV4SliderConfig().defaultSlideDurationSec ||
                                    activeHomeConfig.heroSlideIntervalSec ||
                                    6
                                )}
                                className="w-20 rounded-lg bg-[#1a242e] border border-white/10 px-2.5 py-1 text-center font-latin text-xs font-bold text-white tabular-nums focus:border-[#E50914] focus:outline-none"
                              />
                              <span className="text-[11px] text-[#b7c9ef]">ثانية</span>
                              {editingSliderDurationSec && (
                                <button
                                  type="button"
                                  onClick={() => setEditingSliderDurationSec('')}
                                  className="rounded-lg bg-[#1a242e] hover:bg-white/10 border border-white/10 px-2 py-1 text-[10px] font-bold text-[#b7c9ef] hover:text-white cursor-pointer"
                                >
                                  افتراضي
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Trailer Row */}
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="block text-[11px] font-bold text-[#b7c9ef]">
                              رابط التريلر (YouTube أو MP4)
                            </label>
                            <button
                              type="button"
                              disabled={fetchingTrailer}
                              onClick={() => void handleAutoFetchTrailerForEditor()}
                              className="inline-flex items-center gap-1 rounded-md bg-[#D92321]/20 hover:bg-[#D92321] border border-[#D92321]/40 px-2 py-0.5 text-[10px] font-bold text-[#ff8a88] hover:text-white cursor-pointer"
                            >
                              {fetchingTrailer ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Wand2 className="w-3 h-3" />
                              )}
                              <span>{fetchingTrailer ? 'جاري البحث...' : 'جلب تلقائي'}</span>
                            </button>
                          </div>
                          <input
                            type="text"
                            dir="ltr"
                            value={editingItem.trailerUrl || ''}
                            onChange={(e) =>
                              setEditingItem({ ...editingItem, trailerUrl: e.target.value })
                            }
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                          />
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">
                        التصنيفات (افصل بفاصلة)
                      </label>
                      <input
                        type="text"
                        value={categoriesText}
                        onChange={(e) => setCategoriesText(e.target.value)}
                        placeholder="افلام، افلام اجنبية"
                        className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#b7c9ef] mb-1">
                        الأنواع الفنية (افصل بفاصلة)
                      </label>
                      <input
                        type="text"
                        value={genresText}
                        onChange={(e) => setGenresText(e.target.value)}
                        placeholder="اكشن، خيال علمي، إثارة"
                        className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#b7c9ef] mb-1">
                      قصة العمل *
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={editingItem.story}
                      onChange={(e) => setEditingItem({ ...editingItem, story: e.target.value })}
                      placeholder="اكتب نبذة مشوقة عن أحداث الفيلم أو المسلسل..."
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 text-sm text-white focus:border-[#D92321] focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap gap-5 pt-1">
                    <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingItem.pinned)}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, pinned: e.target.checked })
                        }
                        className="h-4 w-4 accent-[#f9c400]"
                      />
                      <span>تثبيت في السلايدر الرئيسي</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingItem.isNew)}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, isNew: e.target.checked })
                        }
                        className="h-4 w-4 accent-[#4CAF50]"
                      />
                      <span>إضافة شارة جديد (أحدث الإضافات)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingItem.comingSoon)}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, comingSoon: e.target.checked })
                        }
                        className="h-4 w-4 accent-[#D92321]"
                      />
                      <span>عرض في قسم قريباً</span>
                    </label>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: WATCH SERVERS (URL OR IFRAME EMBED CODE) */}
              {editorTab === 'servers' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-extrabold text-white">
                        سيرفرات المشاهدة (روابط مباشرة أو أكواد iframe)
                      </h4>
                      <p className="text-xs text-[#b7c9ef]">
                        أضف عددًا غير محدود من السيرفرات، ويتم فحص حالة كل رابط تلقائيًا (يعمل / تحذير تضمين / معطل 404).
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(editingItem.servers || []).length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const urls = (editingItem.servers || [])
                                .map((s) => resolveWatchServerUrl(s))
                                .filter((u) => /^https?:\/\//i.test(u));
                              void checkServerUrls(urls, true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-sky-500/20 border border-sky-400/30 px-3.5 py-2 text-xs font-extrabold text-sky-300 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>فحص كل السيرفرات الآن</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleStripBrokenEditorServers}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-[#D92321]/20 border border-[#D92321]/40 px-3.5 py-2 text-xs font-extrabold text-[#ff8a88] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف السيرفرات المعطلة والمواقع</span>
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={addServerRow}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة سيرفر مشاهدة</span>
                      </button>
                    </div>
                  </div>

                  {(editingItem.servers || []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/15 py-10 text-center text-xs text-[#b7c9ef]">
                      لا توجد سيرفرات مشاهدة مضافة بعد. اضغط على "إضافة سيرفر مشاهدة" أعلاه.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(editingItem.servers || []).map((srv, idx) => {
                        const mode = srv.mode || (srv.embedCode ? 'embed' : 'url');
                        const detectedSrc = extractIframeSrcPreview(srv.embedCode);
                        const effectiveUrl = resolveWatchServerUrl(srv);
                        const isPortalUrl = Boolean(effectiveUrl && isLikelyNonVideoWebsiteUrl(effectiveUrl));
                        return (
                          <div
                            key={srv.id || idx}
                            className={`rounded-2xl border p-4 space-y-3 ${
                              isPortalUrl
                                ? 'bg-[#D92321]/10 border-[#D92321]/50'
                                : 'bg-[#1a242e]/85 border-white/10'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-lg bg-[#D92321] px-2.5 py-0.5 text-[11px] font-black text-white tabular-nums">
                                  سيرفر {idx + 1}
                                </span>
                                {renderServerStatusBadge(effectiveUrl)}
                                {isPortalUrl && (
                                  <span className="rounded-md bg-[#D92321]/20 border border-[#D92321]/40 px-2 py-0.5 text-[10px] font-bold text-[#ff8a88]">
                                    تحذير: رابط موقع رئيسي وليس فيديو
                                  </span>
                                )}
                                <div className="flex rounded-lg bg-[#0c1821] p-0.5 border border-white/10">
                                  <button
                                    type="button"
                                    onClick={() => updateServerRow(idx, { mode: 'url' })}
                                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                                      mode === 'url'
                                        ? 'bg-[#4CAF50] text-white'
                                        : 'text-[#b7c9ef] hover:text-white'
                                    }`}
                                  >
                                    <Link2 className="w-3 h-3" />
                                    <span>رابط (URL / MP4)</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateServerRow(idx, { mode: 'embed' })}
                                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                                      mode === 'embed'
                                        ? 'bg-[#f9c400] text-[#06131c]'
                                        : 'text-[#b7c9ef] hover:text-white'
                                    }`}
                                  >
                                    <Code2 className="w-3 h-3" />
                                    <span>كود تضمين (Iframe)</span>
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => moveServerRow(idx, -1)}
                                  title="تحريك لأعلى"
                                  className="rounded-lg bg-[#0c1821] p-1.5 text-[#b7c9ef] hover:text-white disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === (editingItem.servers || []).length - 1}
                                  onClick={() => moveServerRow(idx, 1)}
                                  title="تحريك لأسفل"
                                  className="rounded-lg bg-[#0c1821] p-1.5 text-[#b7c9ef] hover:text-white disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeServerRow(idx)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] px-2.5 py-1.5 text-[11px] font-bold text-[#D92321] hover:bg-[#D92321] hover:text-white cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف السيرفر</span>
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                              <input
                                type="text"
                                readOnly
                                value={`سيرفر ${idx + 1}`}
                                title="يُرقّم تلقائياً: سيرفر 1، سيرفر 2..."
                                className="rounded-xl bg-[#0c1821]/70 border border-[#D92321]/30 px-3 py-2 text-xs font-extrabold text-white/90"
                              />
                              <input
                                type="text"
                                value={srv.quality}
                                onChange={(e) => updateServerRow(idx, { quality: e.target.value })}
                                placeholder="الجودة (1080p)"
                                className="rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                              />
                              <input
                                type="text"
                                value={srv.speed}
                                onChange={(e) => updateServerRow(idx, { speed: e.target.value })}
                                placeholder="السرعة (فائق السرعة)"
                                className="rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                              />
                              <input
                                type="text"
                                value={srv.tag}
                                onChange={(e) => updateServerRow(idx, { tag: e.target.value })}
                                placeholder="الشارة (MP4 / Embed)"
                                className="rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                              />
                            </div>

                            {mode === 'url' ? (
                              <div>
                                <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                                  رابط المشاهدة أو ملف الفيديو المباشر (https://...)
                                </label>
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={srv.url || ''}
                                  onChange={(e) => updateServerRow(idx, { url: e.target.value })}
                                  placeholder="https://example.com/embed/video123 أو https://cdn.../movie.mp4"
                                  className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2.5 text-xs text-white focus:border-[#4CAF50] focus:outline-none"
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="block text-[11px] font-bold text-[#b7c9ef] mb-1">
                                  كود التضمين (&lt;iframe src=&quot;...&quot;&gt;&lt;/iframe&gt;)
                                </label>
                                <textarea
                                  rows={2}
                                  dir="ltr"
                                  value={srv.embedCode || ''}
                                  onChange={(e) =>
                                    updateServerRow(idx, { embedCode: e.target.value })
                                  }
                                  placeholder='<iframe src="https://vidstream.example/e/abc" width="100%" height="100%" allowfullscreen></iframe>'
                                  className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 p-2.5 text-xs text-white focus:border-[#f9c400] focus:outline-none"
                                />
                                {srv.embedCode && (
                                  <p className="mt-1 text-[11px] text-[#4CAF50] font-latin truncate">
                                    {detectedSrc
                                      ? `✓ تم استخراج رابط التضمين الآمن: ${detectedSrc}`
                                      : '⚠ تأكد من وجود src="https://..." داخل كود iframe'}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 3: DOWNLOAD MIRRORS */}
              {editorTab === 'downloads' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-extrabold text-white">روابط وسيرفرات التحميل</h4>
                      <p className="text-xs text-[#b7c9ef]">
                        أضف روابط التحميل المباشرة (MediaFire, Mega, Google Drive, GoFile وغيرها).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addDownloadRow}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة رابط تحميل</span>
                    </button>
                  </div>

                  {(editingItem.downloads || []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/15 py-10 text-center text-xs text-[#b7c9ef]">
                      لا توجد روابط تحميل مضافة بعد.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(editingItem.downloads || []).map((dl, idx) => (
                        <div
                          key={dl.id || idx}
                          className="rounded-2xl bg-[#1a242e]/85 border border-white/10 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="rounded-lg bg-[#4CAF50]/20 px-2.5 py-0.5 text-[11px] font-black text-[#4CAF50]">
                              رابط تحميل #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeDownloadRow(idx)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D92321] hover:underline cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            <input
                              type="text"
                              value={dl.host}
                              onChange={(e) => updateDownloadRow(idx, { host: e.target.value })}
                              placeholder="المضيف (MediaFire)"
                              className="rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                            />
                            <input
                              type="text"
                              value={dl.quality}
                              onChange={(e) => updateDownloadRow(idx, { quality: e.target.value })}
                              placeholder="الجودة (1080p)"
                              className="rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                            />
                            <input
                              type="text"
                              value={dl.size}
                              onChange={(e) => updateDownloadRow(idx, { size: e.target.value })}
                              placeholder="الحجم (1.8 GB)"
                              className="rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                            />
                            <input
                              type="text"
                              value={dl.format}
                              onChange={(e) => updateDownloadRow(idx, { format: e.target.value })}
                              placeholder="الصيغة (MP4 / MKV)"
                              className="rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2 text-xs text-white"
                            />
                          </div>

                          <input
                            type="text"
                            dir="ltr"
                            value={dl.url || ''}
                            onChange={(e) => updateDownloadRow(idx, { url: e.target.value })}
                            placeholder="https://download.example.com/file.mp4"
                            className="font-latin w-full rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2.5 text-xs text-white focus:border-[#4CAF50] focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 4: SEASONS, EPISODES & CAST */}
              {editorTab === 'seasons_cast' && (
                <div className="space-y-6">
                  {/* Seasons & Episodes Section */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-extrabold text-white">
                          إدارة المواسم والحلقات (للمسلسلات والبرامج)
                        </h4>
                        <p className="text-xs text-[#b7c9ef]">
                          يمكنك إضافة مواسم وتوليد حلقات تلقائيًا، مع وضع رابط أو كود iframe خاص بكل حلقة.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addSeason}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321] hover:bg-[#dc0e30] px-4 py-2 text-xs font-extrabold text-white cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة موسم جديد</span>
                      </button>
                    </div>

                    {(editingItem.seasons || []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/15 py-6 text-center text-xs text-[#b7c9ef]">
                        لا توجد مواسم مضافة (مناسب للأفلام الفردية). اضغط "إضافة موسم جديد" إذا كان
                        العمل مسلسلًا.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(editingItem.seasons || []).map((season, sIdx) => (
                          <div
                            key={sIdx}
                            className="rounded-2xl bg-[#1a242e]/80 border border-white/10 p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  value={season.label}
                                  onChange={(e) => {
                                    const seasons = [...(editingItem.seasons || [])];
                                    seasons[sIdx] = { ...season, label: e.target.value };
                                    setEditingItem({ ...editingItem, seasons });
                                  }}
                                  className="rounded-lg bg-[#0c1821] border border-white/10 px-3 py-1.5 text-xs font-extrabold text-white w-36"
                                />
                                <input
                                  type="text"
                                  value={season.year}
                                  onChange={(e) => {
                                    const seasons = [...(editingItem.seasons || [])];
                                    seasons[sIdx] = { ...season, year: e.target.value };
                                    setEditingItem({ ...editingItem, seasons });
                                  }}
                                  className="rounded-lg bg-[#0c1821] border border-white/10 px-3 py-1.5 text-xs text-white w-20"
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1">
                                  <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={quickGenCount}
                                    onChange={(e) =>
                                      setQuickGenCount(Math.max(1, Number(e.target.value) || 1))
                                    }
                                    className="w-12 bg-transparent text-center text-xs font-bold text-white focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => generateEpisodesForSeason(sIdx, quickGenCount)}
                                    className="rounded-md bg-[#4CAF50] px-2.5 py-1 text-[11px] font-extrabold text-white cursor-pointer"
                                  >
                                    توليد حلقات
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => addEpisodeToSeason(sIdx)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500 hover:text-white px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>حلقة</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => removeSeason(sIdx)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] text-[#D92321] hover:bg-[#D92321] hover:text-white px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف الموسم</span>
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                              {season.episodes.map((ep, epIdx) => {
                                const epKey = `${sIdx}-${epIdx}`;
                                const isExpanded = expandedEpisodeKey === epKey;
                                const epServers = ep.servers || [];
                                return (
                                  <div
                                    key={epIdx}
                                    className="rounded-xl bg-[#0c1821] p-2.5 border border-white/[0.06] space-y-2"
                                  >
                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                      <input
                                        type="number"
                                        min={1}
                                        value={ep.number}
                                        onChange={(e) =>
                                          updateEpisode(sIdx, epIdx, {
                                            number: Number(e.target.value) || 1,
                                          })
                                        }
                                        className="sm:col-span-1 rounded-lg bg-[#1a242e] px-2 py-1.5 text-center text-xs font-bold text-[#f9c400]"
                                        aria-label="رقم الحلقة"
                                      />
                                      <input
                                        type="text"
                                        value={ep.title}
                                        onChange={(e) =>
                                          updateEpisode(sIdx, epIdx, { title: e.target.value })
                                        }
                                        placeholder="عنوان الحلقة"
                                        className="sm:col-span-3 rounded-lg bg-[#1a242e] px-2.5 py-1.5 text-xs text-white"
                                      />
                                      <input
                                        type="text"
                                        value={ep.duration}
                                        onChange={(e) =>
                                          updateEpisode(sIdx, epIdx, { duration: e.target.value })
                                        }
                                        placeholder="المدة"
                                        className="sm:col-span-2 rounded-lg bg-[#1a242e] px-2.5 py-1.5 text-xs text-white"
                                      />
                                      <div className="sm:col-span-4 flex flex-wrap items-center gap-1.5">
                                        <input
                                          type="text"
                                          dir="ltr"
                                          value={ep.embedCode || ep.watchUrl || ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val.includes('<iframe')) {
                                              updateEpisode(sIdx, epIdx, { embedCode: val, watchUrl: '' });
                                            } else {
                                              updateEpisode(sIdx, epIdx, { watchUrl: val, embedCode: '' });
                                            }
                                          }}
                                          placeholder="رابط الفيديو الأساسي للحلقة"
                                          className="font-latin flex-1 min-w-[140px] rounded-lg bg-[#1a242e] px-2.5 py-1.5 text-xs text-white"
                                        />
                                        {resolveWatchServerUrl(ep) &&
                                          renderServerStatusBadge(resolveWatchServerUrl(ep), true)}
                                      </div>
                                      <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedEpisodeKey(isExpanded ? null : epKey)
                                          }
                                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-extrabold cursor-pointer ${
                                            isExpanded
                                              ? 'bg-[#D92321] text-white'
                                              : 'bg-[#1a242e] text-[#4CAF50] hover:bg-[#4CAF50]/20'
                                          }`}
                                          title="إدارة سيرفرات هذه الحلقة"
                                        >
                                          <Server className="w-3 h-3" />
                                          <span>سيرفرات ({epServers.length})</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeEpisode(sIdx, epIdx)}
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#D92321] hover:bg-[#D92321] hover:text-white cursor-pointer"
                                          aria-label="حذف الحلقة"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {isExpanded && (
                                      <div className="rounded-xl bg-[#1a242e]/85 border border-white/10 p-3 space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <span className="text-[11px] font-extrabold text-white">
                                            سيرفرات مشاهدة {ep.title || `الحلقة ${ep.number}`} ({epServers.length})
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => addEpisodeServerRow(sIdx, epIdx)}
                                            className="inline-flex items-center gap-1 rounded-lg bg-[#4CAF50] px-2.5 py-1 text-[10px] font-extrabold text-white cursor-pointer"
                                          >
                                            <Plus className="w-3 h-3" />
                                            <span>إضافة سيرفر للحلقة</span>
                                          </button>
                                        </div>

                                        {epServers.length === 0 ? (
                                          <p className="text-[10px] text-[#b7c9ef]">
                                            لا توجد سيرفرات منفصلة لهذه الحلقة. اضغط &quot;إضافة سيرفر للحلقة&quot; لإضافة روابط خاصة بها.
                                          </p>
                                        ) : (
                                          <div className="space-y-1.5">
                                            {epServers.map((esrv, esIdx) => {
                                              const esUrl = resolveWatchServerUrl(esrv);
                                              return (
                                                <div
                                                  key={esrv.id || esIdx}
                                                  className="flex flex-wrap items-center gap-2 rounded-lg bg-[#0c1821] p-2 border border-white/5"
                                                >
                                                  <span className="rounded bg-[#D92321] px-2 py-0.5 text-[10px] font-black text-white">
                                                    سيرفر {esIdx + 1}
                                                  </span>
                                                  <input
                                                    type="text"
                                                    dir="ltr"
                                                    value={esrv.embedCode || esrv.url || ''}
                                                    onChange={(e) => {
                                                      const val = e.target.value;
                                                      if (val.includes('<iframe')) {
                                                        updateEpisodeServerRow(sIdx, epIdx, esIdx, {
                                                          mode: 'embed',
                                                          embedCode: val,
                                                          url: '',
                                                        });
                                                      } else {
                                                        updateEpisodeServerRow(sIdx, epIdx, esIdx, {
                                                          mode: 'url',
                                                          url: val,
                                                          embedCode: '',
                                                        });
                                                      }
                                                    }}
                                                    placeholder="رابط الفيديو أو كود <iframe>"
                                                    className="font-latin flex-1 min-w-[180px] rounded-md bg-[#1a242e] px-2.5 py-1 text-[11px] text-white"
                                                  />
                                                  {esUrl && renderServerStatusBadge(esUrl, true)}
                                                  <button
                                                    type="button"
                                                    onClick={() => removeEpisodeServerRow(sIdx, epIdx, esIdx)}
                                                    className="rounded p-1 text-[#D92321] hover:bg-[#D92321] hover:text-white cursor-pointer"
                                                    aria-label="حذف سيرفر الحلقة"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cast Section */}
                  <div className="space-y-3 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-white">طاقم العمل والممثلون</h4>
                      <button
                        type="button"
                        onClick={addCastMember}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة ممثل</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(editingItem.cast || []).map((c, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 rounded-xl bg-[#1a242e]/80 border border-white/10 p-2.5"
                        >
                          <input
                            type="text"
                            value={c.name}
                            onChange={(e) => updateCastMember(idx, { name: e.target.value })}
                            placeholder="اسم الممثل"
                            className="flex-1 rounded-lg bg-[#0c1821] px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            type="text"
                            value={c.role}
                            onChange={(e) => updateCastMember(idx, { role: e.target.value })}
                            placeholder="الدور"
                            className="w-28 rounded-lg bg-[#0c1821] px-2.5 py-1.5 text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={() => removeCastMember(idx)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#D92321] hover:bg-[#D92321] hover:text-white cursor-pointer"
                            aria-label="إزالة ممثل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1a242e] px-5 py-3.5 border-t border-white/10">
              <div className="text-[11px] text-[#b7c9ef]">
                السيرفرات: <strong className="text-white">{editingItem.servers?.length || 0}</strong>{' '}
                • التحميل: <strong className="text-white">{editingItem.downloads?.length || 0}</strong>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-xl bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs font-bold text-[#b7c9ef] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleOpenEditorPreview}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] px-4 py-2.5 text-xs font-black text-[#06131c] shadow-lg cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>معاينة قبل النشر</span>
                </button>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-5 py-2.5 text-xs font-extrabold text-white shadow-lg cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {busyAction
                      ? 'جاري الحفظ...'
                      : isCreatingNew
                        ? 'نشر وحفظ العمل في Firestore'
                        : 'حفظ التعديلات'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ---------------- ACCESSIBLE DELETE & BULK CONFIRM DIALOGS ---------------- */}
      <ConfirmDialog
        isOpen={Boolean(confirmDeleteId)}
        title="تأكيد حذف العمل نهائيًا؟"
        description="سيتم حذف هذا العمل وسيرفراته من قاعدة بيانات Firestore ولن يظهر للزوار بعد الآن."
        confirmLabel={busyAction ? 'جاري الحذف...' : 'نعم، احذف العمل'}
        busy={busyAction}
        danger
        onConfirm={() => {
          if (confirmDeleteId) void handleDeleteMedia(confirmDeleteId);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(confirmBulkDeleteMode)}
        title={
          confirmBulkDeleteMode === 'all'
            ? `تأكيد حذف كل المحتوى (${catalog.length} عمل)؟`
            : `تأكيد حذف الأعمال المحددة (${selectedMediaIds.length} عمل)؟`
        }
        description={
          confirmBulkDeleteMode === 'all'
            ? 'سيتم مسح جميع الأفلام والمسلسلات والعروض وسيرفراتها نهائيًا من قاعدة بيانات Firestore ولا يمكن التراجع عن هذا الإجراء.'
            : 'سيتم حذف جميع الأعمال التي قمت بتحديدها نهائيًا من قاعدة بيانات Firestore.'
        }
        confirmLabel={
          busyAction
            ? 'جاري الحذف الجماعي...'
            : confirmBulkDeleteMode === 'all'
              ? 'نعم، احذف كل المحتوى'
              : 'نعم، احذف المحدد'
        }
        busy={busyAction}
        danger
        onConfirm={() => void handleConfirmBulkDelete()}
        onCancel={() => setConfirmBulkDeleteMode(null)}
      />

      {/* ---------------- GLOBAL COMMAND PALETTE (Cmd/Ctrl + K) ---------------- */}
      <GlobalCommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        accessibleItems={accessibleNavItems}
        catalog={catalog}
        onNavigateTab={navigateToTab}
        onEditMedia={openEditorForExisting}
      />

      {/* ---------------- PRE-PUBLISH LIVE MEDIA PREVIEW MODAL ---------------- */}
      <MediaPreviewModal
        item={previewModalState?.item || null}
        onClose={() => setPreviewModalState(null)}
        busy={busyAction}
        playerTheme={activePlayerTheme}
        popupShieldConfig={activePopupShield}
        cardStyle={activeHomeConfig.cardStyle}
        publishLabel={
          previewModalState?.source === 'editor' && !isCreatingNew
            ? 'حفظ التعديلات في قاعدة البيانات'
            : 'تأكيد النشر في قاعدة البيانات'
        }
        onConfirmPublish={
          previewModalState?.source === 'editor'
            ? () => void commitSaveEditorMedia()
            : previewModalState?.source === 'scraper'
              ? () => {
                  setPreviewModalState(null);
                  void handlePublishScrapedDirectly();
                }
              : undefined
        }
      />
    </div>
  );
}
