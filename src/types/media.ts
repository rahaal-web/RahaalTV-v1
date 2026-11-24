export type MediaKind = 'movie' | 'series' | 'tv' | 'wrestling';

export interface CastMember {
  name: string;
  role: string;
  initials: string;
  avatarUrl?: string;
}

export interface EpisodeItem {
  number: number;
  title: string;
  duration: string;
  quality: string;
  thumbnailUrl?: string;
  watchUrl?: string;
  sourceUrl?: string;
  watchSubpageUrl?: string;
  embedCode?: string;
  servers?: StreamServer[];
}

export interface SeasonItem {
  seasonNumber: number;
  label: string;
  year: string;
  episodes: EpisodeItem[];
}

export interface StreamServer {
  id: string;
  name: string;
  mode?: 'url' | 'embed';
  url?: string;
  embedCode?: string;
  quality: string;
  speed: string;
  tag: string;
}

export interface DownloadMirror {
  id: string;
  host: string;
  quality: string;
  size: string;
  format: string;
  url?: string;
}

export type ImageQualityStatus =
  | 'high'
  | 'medium'
  | 'low'
  | 'missing_backdrop'
  | 'unknown';

export interface MediaItem {
  id: string;
  slug: string;
  title: string;
  englishTitle: string;
  kind: MediaKind;
  categories: string[];
  genres: string[];
  year: string;
  country: string;
  language: string;
  quality: string;
  duration: string;
  imdb: number;
  votes: string;
  views: number;
  likes: number;
  pinned?: boolean;
  isNew?: boolean;
  comingSoon?: boolean;
  poster: string;
  backdrop: string;
  poster_url?: string;
  backdrop_url?: string;
  poster_width?: number;
  poster_height?: number;
  backdrop_width?: number;
  backdrop_height?: number;
  image_source?: string;
  image_quality_status?: ImageQualityStatus;
  tagline: string;
  story: string;
  shortUrl: string;
  trailerUrl?: string;
  trailerLabel: string;
  trailerDuration: string;
  cast: CastMember[];
  seasons?: SeasonItem[];
  franchiseIds?: string[];
  servers: StreamServer[];
  downloads: DownloadMirror[];
  communityRating?: {
    average: number;
    count: number;
  };
  ageRating?: string;
  director?: string;
  reviewSummary?: {
    average10?: number;
    count?: number;
  };
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface CatalogFilterState {
  query: string;
  category: string;
  genre: string;
  year: string;
  country: string;
  language: string;
  quality: string;
  minImdb: number;
  preset: 'latest' | 'pinned' | 'views' | 'rating' | 'likes' | '';
}

export interface NavSubItem {
  label: string;
  category: string;
}

export interface NavMenuItem {
  id: string;
  label: string;
  category?: string;
  subItems?: NavSubItem[];
}

export type RequestStatus = 'pending' | 'approved' | 'completed' | 'rejected';

export interface VisitorRequest {
  id: string;
  userId?: string;
  requesterName?: string;
  title: string;
  type: 'فيلم' | 'مسلسل' | 'عرض مصارعة' | 'مسرحية';
  notes: string;
  status: RequestStatus;
  adminNote: string;
  createdAt: string;
}

export type PlayerThemePresetId =
  | 'rahaltv-crimson'
  | 'cinema-gold'
  | 'midnight-blue'
  | 'emerald-neon'
  | 'custom';

export interface PlayerThemeConfig {
  presetId: PlayerThemePresetId;
  brandLabel: string;
  accentColor: string;
  frameBgColor: string;
  modalBgColor: string;
  borderRadius: 'sharp' | 'rounded' | 'cinema';
  glowIntensity: 'none' | 'soft' | 'strong';
  showHeaderBar: boolean;
  showFooterBar: boolean;
  showBrandBadge: boolean;
}

export type HomeHeroMode = 'auto' | 'manual' | 'brand';

export type HomeSectionSource =
  | 'latest'
  | 'movies'
  | 'series'
  | 'top_rated'
  | 'trending'
  | 'ramadan'
  | 'wrestling'
  | 'category'
  | 'custom';

export interface HomeSectionConfig {
  id: string;
  title: string;
  subtitle: string;
  enabled: boolean;
  source: HomeSectionSource;
  categoryFilter?: string;
  customMediaIds?: string[];
  limit: number;
  layout: 'grid' | 'row';
}

export type HeroTextAlign = 'right' | 'center' | 'left';
export type HeroImageFitMode = 'contain' | 'cover' | 'contain_blur';
export type HeroInfoPosition =
  | 'bottom-right'
  | 'bottom-center'
  | 'bottom-left'
  | 'middle-right'
  | 'middle-center'
  | 'middle-left';

export type HomeCardStyle = 'clean' | 'classic' | 'showcase';

export interface HomeLayoutConfig {
  showHero: boolean;
  heroMode: HomeHeroMode;
  heroMediaId: string;
  heroBadgeText: string;
  heroHeadline: string;
  heroDescription: string;
  heroPrimaryCta: string;
  heroShowHighlights: boolean;
  heroAutoPlay?: boolean;
  heroSlideIntervalSec?: number;
  heroShowProgressBar?: boolean;
  heroShowThumbnails?: boolean;
  heroShowArrows?: boolean;
  heroPauseOnHover?: boolean;
  heroMaxSlides?: number;
  heroSlideIds?: string[];
  // Dedicated Hero Slider Customization controls
  heroImageFit?: HeroImageFitMode;
  heroBackdropBlurPx?: number;
  heroBackdropDimPct?: number;
  heroShowDescription?: boolean;
  heroTitleSizePx?: number;
  heroDescriptionSizePx?: number;
  heroDescriptionLines?: 1 | 2 | 3 | 4 | 5;
  heroTextAlign?: HeroTextAlign;
  heroInfoPosition?: HeroInfoPosition;
  heroTextMaxWidthPx?: number;
  heroShowBadge?: boolean;
  heroShowRating?: boolean;
  heroShowYear?: boolean;
  heroShowDuration?: boolean;
  heroShowGenres?: boolean;
  heroShowQuality?: boolean;
  heroShowWatchBtn?: boolean;
  heroShowDetailsBtn?: boolean;
  heroShowWatchlistBtn?: boolean;
  showQuickFilters: boolean;
  showCategoryBar: boolean;
  showFullLibrary: boolean;
  showRequestBanner: boolean;
  cardsPerRow: 4 | 5 | 6;
  cardStyle: HomeCardStyle;
  sections: HomeSectionConfig[];
}

export type LogoDisplayMode = 'image_and_text' | 'image_only' | 'text_only' | 'hidden';
export type LogoPlacement = 'before_text' | 'after_text' | 'above_text';
export type HeaderLogoAlign = 'start' | 'center';
export type FaviconMode = 'default' | 'custom' | 'none';

export interface WebsiteBrandingConfig {
  // Logo settings
  logoMode: LogoDisplayMode;
  logoUrl: string;
  logoWidthPx: number;
  logoHeightPx: number;
  logoPlacement: LogoPlacement;
  headerAlign: HeaderLogoAlign;
  logoTextGapPx: number;
  // Site name settings
  siteName: string;
  siteNameColor: string;
  siteNameFont: string;
  siteNameSizePx: number;
  siteNameWeight: 400 | 500 | 600 | 700 | 800 | 900;
  siteNameLetterSpacingPx: number;
  // Favicon settings
  faviconMode: FaviconMode;
  faviconUrl: string;
  faviconMimeType?: string;
}

export type CustomFontSlot = 'arabic' | 'english';

export type CustomFontFormat = 'woff2' | 'woff' | 'truetype' | 'opentype' | 'css';

export interface CustomFontRecord {
  id: CustomFontSlot;
  family: string;
  fileName: string;
  format: CustomFontFormat;
  sourceUrl: string;
  updatedBy?: string;
}

export interface TypographyConfig {
  arabicFont: string;
  englishFont: string;
  baseFontSizePx: number;
  heroTitleSizePx: number;
  detailTitleSizePx: number;
  cardTitleSizePx: number;
  sectionTitleSizePx: number;
}

export type PopupShieldProfileMode =
  | 'strict_sandbox'
  | 'redirect_guard'
  | 'direct_unrestricted'
  | 'direct_media';

export type PopupShieldCompatibility =
  | 'compatible'
  | 'partial'
  | 'incompatible'
  | 'untested';

export interface PopupShieldHostRule {
  hostname: string;
  mode: Exclude<PopupShieldProfileMode, 'direct_media'>;
  compatibility: PopupShieldCompatibility;
  note?: string;
  adSignals?: string[];
  lastTestedAt?: string;
}

export interface PopupShieldConfig {
  enabled: boolean;
  defaultStrategy: 'adaptive' | 'strict_when_safe' | 'observe_only';
  defaultWatchMode?: Exclude<PopupShieldProfileMode, 'direct_media'>;
  blockWindowOpen: boolean;
  guardBlankLinks: boolean;
  autoFallbackOnReject: boolean;
  showPlayerBadge: boolean;
  hostRules: Record<string, PopupShieldHostRule>;
}

export interface PopupShieldLogEntry {
  id: string;
  timestamp: string;
  kind:
    | 'blocked_window_open'
    | 'blocked_blank_link'
    | 'sandbox_rejected_fallback'
    | 'observed_external_blur'
    | 'compatibility_tested';
  prevented: boolean;
  serverHost: string;
  serverName?: string;
  mediaTitle?: string;
  targetUrl?: string;
  detail: string;
}

export interface PopupShieldServerInspection {
  hostname: string;
  url: string;
  reachable: boolean;
  compatibility: PopupShieldCompatibility;
  recommendedMode: PopupShieldProfileMode;
  antiSandboxDetected: boolean;
  adScriptDetected: boolean;
  adSignals: string[];
  directStreamUrl?: string | null;
  reason: string;
  testedAt: string;
}

export interface SiteSettings {
  siteName: string;
  tagline: string;
  announcementText: string;
  tickerEnabled: boolean;
  featuredLimit: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  playerTheme?: PlayerThemeConfig;
  homeConfig?: HomeLayoutConfig;
  typography?: TypographyConfig;
  popupShield?: PopupShieldConfig;
  branding?: WebsiteBrandingConfig;
}

export interface UserProfileRecord {
  uid: string;
  displayName: string;
  photoURL: string;
  watchlistIds: string[];
  role: 'member' | 'admin';
}

export type AdminPrivilegeRole = 'owner' | 'moderator';

export interface AdminRoleRecord {
  uid: string;
  displayName: string;
  addedBy: string;
  role?: AdminPrivilegeRole;
}

export interface MediaRatingRecord {
  id: string;
  mediaId: string;
  userId: string;
  stars: number;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export type NotificationCategory =
  | 'new_season'
  | 'new_episode'
  | 'watchlist_update'
  | 'favorite_genre'
  | 'site_update'
  | 'admin_notice';

export interface NotificationPreferences {
  new_season: boolean;
  new_episode: boolean;
  watchlist_update: boolean;
  favorite_genre: boolean;
  site_update: boolean;
  admin_notice: boolean;
  browserPushEnabled: boolean;
}

export interface UserNotificationRecord {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  mediaId?: string;
  readByUids?: string[];
  createdAtMs?: number;
}

export type AgeRatingTier = 'all' | '18+' | '16+' | '13+' | 'kids';

export interface UserSubProfile {
  id: string;
  userId: string;
  name: string;
  avatarEmoji: string;
  avatarColor: string;
  isKids: boolean;
  maxAgeRating: AgeRatingTier;
  hasPin: boolean;
  pinHash?: string;
  pinSalt?: string;
  watchlistIds: string[];
  createdAtMs: number;
  updatedAtMs: number;
}

export interface MediaReviewRecord {
  id?: string;
  mediaId: string;
  userId: string;
  rating10: number;
  comment?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
}

export interface WatchProgressRecord {
  id: string;
  userId: string;
  profileId: string;
  mediaId: string;
  mediaTitle: string;
  kind: MediaKind;
  seasonNumber?: number;
  episodeNumber?: number;
  positionSec: number;
  durationSec: number;
  progressPct: number;
  completed: boolean;
  hiddenFromContinueWatching: boolean;
  lastServerUrl?: string;
  updatedAtMs: number;
}

export interface AnalyticsDailyRecord {
  id: string;
  playbackStarts: number;
  playbackCompletes: number;
  watchlistAdds: number;
  mediaCounts: Record<string, number>;
  episodeCounts: Record<string, number>;
  genreCounts: Record<string, number>;
  updatedAtMs: number;
}

export type ServerWatchMode = PopupShieldProfileMode;

export interface ServerHealthRecord {
  id: string;
  url: string;
  host: string;
  mediaId?: string;
  mediaTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  serverName: string;
  status:
    | 'confirmed_playing'
    | 'page_available'
    | 'needs_manual_check'
    | 'broken'
    | 'iframe_blocked'
    | 'unknown_error';
  connectivityStatus: string;
  httpStatus: number;
  canEmbedInIframe: boolean;
  pageLoadStatus: string;
  playerInitResult: string;
  triedModes: ServerWatchMode[];
  lastSuccessfulMode: ServerWatchMode | '';
  videoPlaybackConfirmed: boolean;
  latencyMs: number;
  lastFailureReason: string;
  lastCheckedAtMs: number;
  ttlMs: number;
  checkedBy?: string;
}

export type ImageSlotType =
  | 'card_small'
  | 'card_grid'
  | 'detail_poster'
  | 'slider_backdrop'
  | 'backdrop_card'
  | 'backdrop_detail'
  | 'hero_thumb'
  | 'episode_thumb'
  | 'cast_avatar'
  | 'admin_thumb';

export type ImagePlaceholderMode =
  | 'solid'
  | 'gradient'
  | 'shimmer'
  | 'logo_badge'
  | 'custom_image';

export type ImagePlaceholderSlotKey = 'poster' | 'backdrop' | 'cast' | 'episode';

export interface ImagePlaceholderSlotOverride {
  enabled: boolean;
  mode: ImagePlaceholderMode;
  primaryColor: string;
  secondaryColor: string;
  gradientAngle: number;
  customImageUrl: string;
  errorFallbackImageUrl: string;
  dimOpacityPct: number;
  showLogoOverlay: boolean;
  showFallbackIcon: boolean;
}

export interface ImagePlaceholderConfig {
  mode: ImagePlaceholderMode;
  primaryColor: string;
  secondaryColor: string;
  gradientAngle: number;
  shimmerEnabled: boolean;
  shimmerSpeed: 'slow' | 'normal' | 'fast';
  showLogoOverlay: boolean;
  logoOverlayOpacityPct: number;
  customImageUrl: string;
  errorFallbackImageUrl: string;
  backdropDimPct: number;
  showFallbackIcon: boolean;
  fadeInDurationMs: number;
  slotOverrides: Record<ImagePlaceholderSlotKey, ImagePlaceholderSlotOverride>;
}

export interface RecentlyWatchedRecord {
  id: string;
  userId: string;
  mediaId: string;
  tmdbId?: string;
  slug?: string;
  title: string;
  englishTitle?: string;
  kind: MediaKind;
  year?: string;
  quality?: string;
  poster?: string;
  backdrop?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  positionSec: number;
  durationSec: number;
  progressPct: number;
  completed: boolean;
  lastServerIndex?: number;
  lastServerUrl?: string;
  lastWatchedAtMs: number;
  createdAtMs: number;
}

export interface RecentlyWatchedPreferences {
  maxItems: number;
  hideCompleted: boolean;
}

export type RecentlyWatchedDeviceKey = 'mobile' | 'tablet' | 'desktop' | 'tv';
export type RecentlyWatchedCardSizePreset = 'small' | 'medium' | 'large' | 'custom';
export type RecentlyWatchedAspectRatio = '2/3' | '3/4' | '16/9' | '4/3' | '1/1';
export type RecentlyWatchedSortOrder = 'newest_first' | 'oldest_first' | 'custom';

export interface RecentlyWatchedDeviceLayoutConfig {
  cardWidthPx: number;
  cardGapPx: number;
  initialVisibleCount: number;
}

export interface RecentlyWatchedUiConfig {
  enabled: boolean;
  showTitle: boolean;
  showViewAllButton: boolean;
  showArrows: boolean;
  enableDrag: boolean;
  autoScroll: boolean;
  autoScrollIntervalSec: number;
  scrollDirection: 'rtl' | 'ltr';
  enableWheelScroll: boolean;
  cardSizePreset: RecentlyWatchedCardSizePreset;
  cardWidthPx: number;
  cardGapPx: number;
  aspectRatio: RecentlyWatchedAspectRatio;
  showMediaTitle: boolean;
  showWatchedAt: boolean;
  showProgressBar: boolean;
  showEpisodeInfo: boolean;
  maxStoredItems: number;
  initialVisibleCount: number;
  loadMoreOnScrollEnd: boolean;
  loadMoreBatchSize: number;
  sortOrder: RecentlyWatchedSortOrder;
  customOrderIds: string[];
  hideCompleted: boolean;
  deduplicateItems: boolean;
  deviceMode: 'unified' | 'per_device';
  deviceSettings: Record<RecentlyWatchedDeviceKey, RecentlyWatchedDeviceLayoutConfig>;
}

export * from './scraperAdapter';
