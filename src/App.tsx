import { CSSProperties, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Compass, Home, Wrench, X } from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  getDocsFromCache,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import type { AdminTab } from './components/AdminDashboardView';
import { isTabAccessible } from './components/admin/adminNavigation';
import { ActorProfileView } from './components/ActorProfileView';
import { CatalogArchiveView } from './components/CatalogArchiveView';
import { Footer, FooterTopic } from './components/Footer';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';

const AdminDashboardView = lazy(() =>
  import('./components/AdminDashboardView').then((m) => ({
    default: m.AdminDashboardView,
  }))
);
import { MaintenanceScreen } from './components/MaintenanceScreen';
import {
  FooterInfoModal,
  LoginModal,
  PlayerModal,
  TrailerModal,
  WatchlistModal,
} from './components/Modals';
import { RecentlyWatchedSection } from './components/RecentlyWatchedSection';
import { RunningRabbitLoader } from './components/RunningRabbitLoader';
import { SearchDrawer } from './components/SearchDrawer';
import { OfflineIndicator } from './components/PWAControls';
import { SingleDetailView } from './components/SingleDetailView';
import { WatchHistoryManagerModal } from './components/WatchHistoryManagerModal';
import { CATALOG_ITEMS } from './data/catalog';
import {
  extractHomeBaseFromRecord,
  extractSliderStyleFromRecord,
  homeConfigHasAllSliderStyleKeys,
  loadStoredHomeConfig,
  normalizeHomeConfig,
  saveStoredHomeConfig,
} from './lib/homeConfig';
import {
  clearCachedCatalogSnapshot,
  configureCatalogCacheFallbacks,
  loadCachedCatalogSnapshot,
  mergeProgressiveMediaItems,
  normalizeFirestoreMediaRecord,
  saveCachedCatalogSnapshot,
  sortMediaCatalog,
} from './lib/catalogCache';
import { FALLBACK_BACKDROP, FALLBACK_POSTER } from './lib/mediaFilters';

configureCatalogCacheFallbacks(FALLBACK_POSTER, FALLBACK_BACKDROP);
import { getPosterUrl } from './lib/mediaImages';
import { loadStoredPlayerTheme, saveStoredPlayerTheme } from './lib/playerTheme';
import {
  applyTypographyToDocument,
  loadStoredCustomFonts,
  loadStoredTypographyConfig,
  saveStoredCustomFonts,
  saveStoredTypographyConfig,
} from './lib/typographyConfig';
import {
  installGlobalPopupShieldGuards,
  loadStoredPopupShieldConfig,
  saveStoredPopupShieldConfig,
  setLiveShieldConfig,
} from './lib/popupShield';
import {
  loadStoredPlaceholderConfig,
  normalizeImagePlaceholderConfig,
  saveStoredPlaceholderConfig,
} from './lib/placeholderConfig';
import {
  clearAllRecentlyWatchedEntries,
  listRecentlyWatchedItems,
  loadRecentlyWatchedPrefs,
  mergeGuestRecentlyWatchedToAccount,
  removeRecentlyWatchedEntry,
  saveRecentlyWatchedPrefs,
} from './lib/recentlyWatched';
import {
  getRecentlyWatchedPreviewOverride,
  loadStoredRecentlyWatchedUiConfig,
  normalizeRecentlyWatchedUiConfig,
  saveStoredRecentlyWatchedUiConfig,
  setRecentlyWatchedPreviewOverride,
  subscribeRecentlyWatchedUiChanges,
} from './lib/recentlyWatchedConfig';
import {
  applyWebsiteFaviconToDocument,
  ensureWebsiteBrandingFontLoaded,
  loadStoredWebsiteBranding,
  normalizeWebsiteBranding,
  saveStoredWebsiteBranding,
} from './lib/websiteBranding';
import {
  buildSiteThemeCssVars,
  getSiteThemeDefinition,
  loadStoredSiteThemeId,
  normalizeSiteThemeId,
  saveStoredSiteThemeId,
} from './lib/siteThemes';
import {
  findMediaByRouteKey,
  getAppBasePrefix,
} from './lib/permalink';
import {
  ActiveOverlayName,
  AppRoute,
  ArchiveSortOption,
  buildRouteHash,
  createNavKey,
  DEFAULT_CATALOG_FILTERS,
  parseRouteFromLocationParts,
  readRouterHistoryState,
  RouterHistoryState,
  ScrollPositionStore,
} from './lib/router';
import {
  applyDisplayDevicePrefs,
  detectClientCapabilities,
  loadDisplayDevicePrefs,
} from './lib/browserCompat';
import { loadAdminWorkspacePrefs } from './lib/adminPreferences';
import {
  enterGuestSession,
  exitGuestSession,
  GuestSession,
  isGuestSessionActive,
  loadGuestSession,
} from './lib/guestSession';
import { installTvSpatialNavigation } from './lib/tvNavigation';
import {
  normalizeHeroSliderVariant,
  saveHeroSliderDeviceVariants,
} from './lib/heroSliderMode';
import { saveStreamV4SliderConfig } from './lib/streamV4SliderConfig';
import {
  appendDatabaseConnectionLog,
  getActiveConnectionProfile,
  getBuiltInDefaultAuth,
  loadDatabaseRegistry,
  recordDatabaseConnected,
  recordDatabaseOutage,
  subscribeActiveDatabaseChange,
  subscribeActiveDatabasePointerFromFirestore,
  subscribeDatabaseRegistryFromFirestore,
} from './lib/dbConnectionManager';
import {
  classifyFirestoreConnectionError,
  FirestoreConnectionStatus,
  getActiveAuth,
  getActiveDatabase,
  getUserAdminRole,
  getUserAdminRoleFromCache,
  handleFirestoreError,
  hydrateUserWatchlistCacheFirst,
  OperationType,
  probeDatabaseConnection,
  sanitizeRatingMediaId,
  saveSiteSettingsToFirestore,
  saveWatchlistToFirestore,
  signOutFirebase,
  submitVisitorRequestToFirestore,
  syncUserProfileToFirestore,
} from './lib/firebase';
import {
  loadPendingGuestServerReports,
  markPendingServerReportsSynced,
  markServerIssueReportedLocally,
} from './lib/serverReports';
import {
  clearAllSensitiveCaches,
  computeUserProfileSyncFingerprint,
  loadCachedUserRecentlyWatched,
  loadCachedUserRequests,
  loadCachedUserWatchlist,
  markProfileSynced,
  normalizeFirestoreRequestRecord,
  purgeSensitiveCachesExcept,
  saveCachedUserRecentlyWatched,
  saveCachedUserRequests,
  saveCachedUserWatchlist,
  shouldRunDeferredProfileSync,
} from './lib/sensitiveDataCache';
import {
  AdminPrivilegeRole,
  AdminRoleRecord,
  CatalogFilterState,
  CustomFontRecord,
  CustomFontSlot,
  HomeLayoutConfig,
  ImagePlaceholderConfig,
  MediaItem,
  PopupShieldHostRule,
  RecentlyWatchedPreferences,
  RecentlyWatchedRecord,
  RecentlyWatchedUiConfig,
  SiteSettings,
  SiteThemeId,
  UserProfileRecord,
  VisitorRequest,
  WebsiteBrandingConfig,
} from './types/media';

const DEFAULT_FILTERS: CatalogFilterState = DEFAULT_CATALOG_FILTERS;

const LEGACY_REMOVED_TAGLINE =
  'افلام ومسلسلات بجودة عالية بدون تقطيع ، تحميل ومشاهدة افلام اجنبية بروابط مباشرة ، مسلسلات اجنبية ، مسلسلات رمضان 2026 وعروض المصارعة الحرة المترجمة.';

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'RahaL TV',
  tagline: '',
  announcementText: '',
  tickerEnabled: false,
  featuredLimit: 5,
  maintenanceMode: false,
  maintenanceMessage:
    'نقوم حاليًا بإجراء أعمال صيانة وتحديثات تقنية لتحسين جودة السيرفرات وتجربة المشاهدة. سنعود للعمل قريبًا، شكرًا لتفهمكم.',
  playerTheme: loadStoredPlayerTheme(),
  homeConfig: loadStoredHomeConfig(),
  typography: loadStoredTypographyConfig(),
  popupShield: loadStoredPopupShieldConfig(),
  branding: loadStoredWebsiteBranding('RahaL TV'),
};

const STORAGE_WATCHLIST = 'moov_watchlist_ids';
const STORAGE_DISMISSED_STARTERS = 'rahaltv_dismissed_starters';
const STORAGE_STARTER_CLEARED = 'rahaltv_starter_cleared';

function readInitialRouteFromWindow() {
  if (typeof window === 'undefined') {
    return {
      route: { view: 'home' } as AppRoute,
      needsCanonicalReplace: false,
    };
  }
  return parseRouteFromLocationParts({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    basePrefix: getAppBasePrefix(),
  });
}

export default function App() {
  const initialRouteParsed = useMemo(() => readInitialRouteFromWindow(), []);
  const initialRoute = initialRouteParsed.route;

  const [view, setView] = useState<'home' | 'archive' | 'single' | 'actor' | 'admin' | 'not_found'>(
    initialRoute.view
  );
  const [actorName, setActorName] = useState<string>(
    initialRoute.view === 'actor' ? initialRoute.actorName : ''
  );
  const [notFoundPath, setNotFoundPath] = useState<string>(
    initialRoute.view === 'not_found' ? initialRoute.rawPath || '' : ''
  );
  const [requestedWatchKey, setRequestedWatchKey] = useState<string | null>(
    initialRoute.view === 'single' ? initialRoute.watchKey : null
  );
  const [selectedMediaId, setSelectedMediaId] = useState<string>(CATALOG_ITEMS[0].id);
  const [routeEpisode, setRouteEpisode] = useState<number | undefined>(
    initialRoute.view === 'single' ? initialRoute.episode : undefined
  );
  const [openDownloadsOnSingle, setOpenDownloadsOnSingle] = useState<boolean>(
    initialRoute.view === 'single' ? Boolean(initialRoute.openDownloads) : false
  );
  const [filters, setFilters] = useState<CatalogFilterState>(
    initialRoute.view === 'archive' ? initialRoute.filters : DEFAULT_FILTERS
  );
  const [archiveSort, setArchiveSort] = useState<ArchiveSortOption>(
    initialRoute.view === 'archive' ? initialRoute.sort : 'latest'
  );
  const [archivePage, setArchivePage] = useState<number>(
    initialRoute.view === 'archive' ? initialRoute.page : 1
  );
  const [archivePageSize, setArchivePageSize] = useState<number>(
    initialRoute.view === 'archive' ? initialRoute.pageSize : 24
  );

  // Unified Overlay Stack synced with browser history
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlayName | null>(null);
  const searchOpen = activeOverlay === 'search';
  const watchlistOpen = activeOverlay === 'watchlist';
  const watchHistoryOpen = activeOverlay === 'watch_history';
  const loginOpen = activeOverlay === 'login';
  const mobileMenuOpen = activeOverlay === 'mobile_menu';
  const iosGuideOpen = activeOverlay === 'ios_guide';

  const [trailerItem, setTrailerItem] = useState<MediaItem | null>(null);
  const [playerState, setPlayerState] = useState<{
    item: MediaItem;
    episode: number;
    serverIndex?: number;
  } | null>(null);
  const [footerTopic, setFooterTopic] = useState<FooterTopic | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [entryTransition, setEntryTransition] = useState<{
    key: number;
    title: string;
    poster: string;
    quality: string;
    year: string;
  } | null>(null);
  const entryTimerRef = useRef<number | null>(null);
  const clientCapabilities = useMemo(() => detectClientCapabilities(), []);
  const [compatBannerDismissed, setCompatBannerDismissed] = useState(false);

  const scrollStoreRef = useRef(new ScrollPositionStore());
  const currentNavKeyRef = useRef<string>(
    typeof window !== 'undefined'
      ? readRouterHistoryState(window.history.state)?.navKey || createNavKey()
      : createNavKey()
  );
  const currentRouteHashRef = useRef<string>(buildRouteHash(initialRoute));

  // Firebase Auth & RBAC State + Client-only Viewer Guest Session
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<AdminPrivilegeRole | null>(null);
  const [guestSession, setGuestSession] = useState<GuestSession | null>(() => loadGuestSession());
  const isGuest = !firebaseUser && isGuestSessionActive(guestSession);
  const effectiveAdminRole = adminRole;
  const canAccessAdmin = effectiveAdminRole !== null;
  const isOwnerAdmin = effectiveAdminRole === 'owner';

  // Live Firestore Data State (hydrates synchronously from compact local cache on repeat visits)
  const [firestoreCatalog, setFirestoreCatalog] = useState<MediaItem[]>(() =>
    loadCachedCatalogSnapshot()
  );
  const [ratingsByMediaId, setRatingsByMediaId] = useState<
    Record<string, { average: number; count: number }>
  >({});
  const [initialMediaLoaded, setInitialMediaLoaded] = useState(false);
  const [dbConnectionStatus, setDbConnectionStatus] =
    useState<FirestoreConnectionStatus>('connecting');
  const [dbConnectionError, setDbConnectionError] = useState<string | null>(null);
  const [dbReconnectNonce, setDbReconnectNonce] = useState(0);
  const [defaultAuthUid, setDefaultAuthUid] = useState<string>(
    () => getBuiltInDefaultAuth().currentUser?.uid || ''
  );

  useEffect(() => {
    const defaultAuth = getBuiltInDefaultAuth();
    return onAuthStateChanged(defaultAuth, (u) => {
      setDefaultAuthUid(u?.uid || '');
    });
  }, []);

  useEffect(() => {
    return subscribeActiveDatabaseChange(() => {
      setFirestoreCatalog(loadCachedCatalogSnapshot());
      setInitialMediaLoaded(false);
      setDbConnectionStatus('connecting');
      setDbConnectionError(null);
      setDbReconnectNonce((n) => n + 1);
    });
  }, []);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [siteThemeId, setSiteThemeId] = useState<SiteThemeId>(() => loadStoredSiteThemeId());
  const siteThemeDef = useMemo(() => getSiteThemeDefinition(siteThemeId), [siteThemeId]);
  const siteThemeVars = useMemo(
    () =>
      siteThemeId !== 'default'
        ? (buildSiteThemeCssVars(siteThemeId) as CSSProperties)
        : undefined,
    [siteThemeId]
  );
  const [imagePlaceholderConfig, setImagePlaceholderConfig] = useState<ImagePlaceholderConfig>(() =>
    loadStoredPlaceholderConfig()
  );
  const [recentlyWatchedPrefs, setRecentlyWatchedPrefs] = useState<RecentlyWatchedPreferences>(() =>
    loadRecentlyWatchedPrefs()
  );
  const [recentlyWatchedUiConfig, setRecentlyWatchedUiConfig] = useState<RecentlyWatchedUiConfig>(() =>
    loadStoredRecentlyWatchedUiConfig()
  );
  const [rwPreviewOverride, setRwPreviewOverride] = useState<RecentlyWatchedUiConfig | null>(() =>
    getRecentlyWatchedPreviewOverride()
  );
  const [cloudRecentlyWatched, setCloudRecentlyWatched] = useState<RecentlyWatchedRecord[]>([]);
  const [recentlyWatchedTick, setRecentlyWatchedTick] = useState(0);
  const mergedGuestForUidRef = useRef<string | null>(null);

  useEffect(() => {
    return subscribeRecentlyWatchedUiChanges(() => {
      setRwPreviewOverride(getRecentlyWatchedPreviewOverride());
    });
  }, []);
  const [customFonts, setCustomFonts] = useState<
    Partial<Record<CustomFontSlot, CustomFontRecord>>
  >(() => loadStoredCustomFonts());
  const [visitorRequests, setVisitorRequests] = useState<VisitorRequest[]>([]);
  const [usersList, setUsersList] = useState<UserProfileRecord[]>([]);
  const [adminsList, setAdminsList] = useState<AdminRoleRecord[]>([]);
  const [adminRequestedTab, setAdminRequestedTab] = useState<{ tab: AdminTab; nonce: number }>(() =>
    initialRoute.view === 'admin' && initialRoute.adminTab
      ? { tab: initialRoute.adminTab, nonce: 1 }
      : { tab: 'overview', nonce: 0 }
  );

  const [watchlistIds, setWatchlistIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_WATCHLIST);
      if (!saved) return ['running-man', 'ramadan-al-saraya'];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : ['running-man', 'ramadan-al-saraya'];
    } catch {
      return ['running-man'];
    }
  });

  const [dismissedStarterIds, setDismissedStarterIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_DISMISSED_STARTERS);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const [starterCleared, setStarterCleared] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_STARTER_CLEARED) === '1';
    } catch {
      return false;
    }
  });

  const isFirestoreSeeded = firestoreCatalog.length > 0;
  const visibleStarterItems = starterCleared
    ? []
    : CATALOG_ITEMS.filter((item) => !dismissedStarterIds.includes(item.id));
  // Never flash demo starter items while initial database load is still in flight
  const rawActiveCatalog = isFirestoreSeeded
    ? firestoreCatalog
    : initialMediaLoaded
      ? visibleStarterItems
      : [];
  const activeCatalog = useMemo(
    () =>
      rawActiveCatalog.map((item) => {
        const agg = ratingsByMediaId[sanitizeRatingMediaId(item.id)];
        return agg ? { ...item, communityRating: agg } : item;
      }),
    [rawActiveCatalog, ratingsByMediaId]
  );
  const matchedSingleMedia = useMemo(() => {
    if (requestedWatchKey) {
      return findMediaByRouteKey(activeCatalog, requestedWatchKey) || null;
    }
    return activeCatalog.find((item) => item.id === selectedMediaId) || activeCatalog[0] || null;
  }, [activeCatalog, requestedWatchKey, selectedMediaId]);

  const selectedMedia = matchedSingleMedia;
  const hasDismissedStarters = starterCleared || dismissedStarterIds.length > 0;

  const clearAllOverlayStates = useCallback(() => {
    setActiveOverlay(null);
    setPlayerState(null);
    setTrailerItem(null);
    setFooterTopic(null);
  }, []);

  const restoreScrollForNavKey = useCallback((navKey: string | undefined) => {
    if (typeof window === 'undefined') return;
    const savedY = scrollStoreRef.current.get(navKey);
    if (typeof savedY === 'number') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: savedY, behavior: 'auto' });
        });
      });
    }
  }, []);

  const applyParsedRouteToState = useCallback((route: AppRoute) => {
    if (route.view === 'home') {
      setView('home');
      setActorName('');
      setNotFoundPath('');
      setRequestedWatchKey(null);
      setRouteEpisode(undefined);
      setOpenDownloadsOnSingle(false);
      setFilters(DEFAULT_FILTERS);
      setArchiveSort('latest');
      setArchivePage(1);
      setArchivePageSize(24);
      return;
    }

    if (route.view === 'archive') {
      setView('archive');
      setActorName('');
      setNotFoundPath('');
      setRequestedWatchKey(null);
      setRouteEpisode(undefined);
      setOpenDownloadsOnSingle(false);
      setFilters(route.filters);
      setArchiveSort(route.sort);
      setArchivePage(route.page);
      setArchivePageSize(route.pageSize);
      return;
    }

    if (route.view === 'single') {
      setView('single');
      setActorName('');
      setNotFoundPath('');
      setRequestedWatchKey(route.watchKey);
      setRouteEpisode(route.episode);
      setOpenDownloadsOnSingle(Boolean(route.openDownloads));
      const matched = findMediaByRouteKey(activeCatalog, route.watchKey);
      if (matched) {
        setSelectedMediaId(matched.id);
      }
      return;
    }

    if (route.view === 'actor') {
      setView('actor');
      setActorName(route.actorName);
      setNotFoundPath('');
      setRequestedWatchKey(null);
      return;
    }

    if (route.view === 'admin') {
      setView('admin');
      setActorName('');
      setNotFoundPath('');
      setRequestedWatchKey(null);
      if (route.adminTab) {
        setAdminRequestedTab((prev) => ({ tab: route.adminTab!, nonce: prev.nonce + 1 }));
      }
      return;
    }

    setView('not_found');
    setActorName('');
    setNotFoundPath(route.rawPath || '');
    setRequestedWatchKey(null);
  }, [activeCatalog]);

  const navigateToRoute = useCallback(
    (
      route: AppRoute,
      options?: { replace?: boolean; scrollTop?: boolean }
    ) => {
      clearAllOverlayStates();
      applyParsedRouteToState(route);

      if (typeof window === 'undefined') return;
      const basePrefix = getAppBasePrefix();
      const nextHash = buildRouteHash(route);
      const canonicalUrl = `${basePrefix}/${nextHash}`;
      const currState = readRouterHistoryState(window.history.state);
      const isOverlayCurrentlyOpen = Boolean(currState?.overlay);

      if (currState && currState.routeHash === nextHash && !isOverlayCurrentlyOpen && !options?.replace) {
        if (options?.scrollTop !== false) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }

      if (options?.replace || isOverlayCurrentlyOpen) {
        const nextKey = isOverlayCurrentlyOpen ? createNavKey() : currentNavKeyRef.current;
        const nextState: RouterHistoryState = {
          __rtv: true,
          navKey: nextKey,
          routeHash: nextHash,
          internalDepth: currState?.internalDepth ?? 0,
          overlay: null,
        };
        window.history.replaceState(nextState, '', canonicalUrl);
        currentNavKeyRef.current = nextKey;
        currentRouteHashRef.current = nextHash;
      } else {
        scrollStoreRef.current.save(currentNavKeyRef.current, window.scrollY);
        const nextKey = createNavKey();
        const nextState: RouterHistoryState = {
          __rtv: true,
          navKey: nextKey,
          routeHash: nextHash,
          internalDepth: (currState?.internalDepth ?? 0) + 1,
          overlay: null,
        };
        window.history.pushState(nextState, '', canonicalUrl);
        currentNavKeyRef.current = nextKey;
        currentRouteHashRef.current = nextHash;
      }

      if (options?.scrollTop !== false) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [applyParsedRouteToState, clearAllOverlayStates]
  );

  const openOverlay = useCallback((name: ActiveOverlayName, setup?: () => void) => {
    if (name !== 'player') setPlayerState(null);
    if (name !== 'trailer') setTrailerItem(null);
    if (name !== 'footer_topic') setFooterTopic(null);
    setup?.();
    setActiveOverlay(name);

    if (typeof window === 'undefined') return;
    const currState = readRouterHistoryState(window.history.state);
    const currRouteHash = currState?.routeHash || currentRouteHashRef.current || '#/';
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (currState?.overlay) {
      const nextState: RouterHistoryState = {
        __rtv: true,
        navKey: currState.navKey,
        routeHash: currRouteHash,
        internalDepth: currState.internalDepth,
        overlay: name,
      };
      window.history.replaceState(nextState, '', currentUrl);
    } else {
      const nextKey = createNavKey();
      const nextState: RouterHistoryState = {
        __rtv: true,
        navKey: nextKey,
        routeHash: currRouteHash,
        internalDepth: (currState?.internalDepth ?? 0) + 1,
        overlay: name,
      };
      window.history.pushState(nextState, '', currentUrl);
    }
  }, []);

  const closeTopOverlay = useCallback(() => {
    if (typeof window !== 'undefined') {
      const currState = readRouterHistoryState(window.history.state);
      if (currState?.overlay && currState.internalDepth > 0) {
        window.history.back();
        return true;
      }
    }
    const hadOverlay =
      Boolean(activeOverlay) || Boolean(playerState) || Boolean(trailerItem) || Boolean(footerTopic);
    clearAllOverlayStates();
    return hadOverlay;
  }, [activeOverlay, playerState, trailerItem, footerTopic, clearAllOverlayStates]);

  const navigateBackFromUI = useCallback(() => {
    if (typeof window !== 'undefined') {
      const currState = readRouterHistoryState(window.history.state);
      if (currState && currState.internalDepth > 0) {
        window.history.back();
        return;
      }
    }
    navigateToRoute({ view: 'home' });
  }, [navigateToRoute]);

  // Initial URL normalization + manual scroll restoration + initial history state stamp
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    const parsed = parseRouteFromLocationParts({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      basePrefix: getAppBasePrefix(),
    });
    const basePrefix = getAppBasePrefix();
    const canonicalHash = buildRouteHash(parsed.route);
    const canonicalUrl = `${basePrefix}/${canonicalHash}`;
    const existing = readRouterHistoryState(window.history.state);

    if (!existing || parsed.needsCanonicalReplace) {
      const stamped: RouterHistoryState = {
        __rtv: true,
        navKey: existing?.navKey || currentNavKeyRef.current,
        routeHash: canonicalHash,
        internalDepth: existing?.internalDepth ?? 0,
        overlay: existing?.overlay ?? null,
      };
      window.history.replaceState(stamped, '', canonicalUrl);
      currentNavKeyRef.current = stamped.navKey;
      currentRouteHashRef.current = canonicalHash;
    } else {
      currentNavKeyRef.current = existing.navKey;
      currentRouteHashRef.current = existing.routeHash;
    }
  }, []);

  // Keep matched media ID synced once Firestore finishes loading
  useEffect(() => {
    if (view === 'single' && requestedWatchKey) {
      const matched = findMediaByRouteKey(activeCatalog, requestedWatchKey);
      if (matched && matched.id !== selectedMediaId) {
        setSelectedMediaId(matched.id);
      }
    }
  }, [view, requestedWatchKey, activeCatalog, selectedMediaId]);

  // Unified popstate & direct manual hashchange synchronization
  useEffect(() => {
    const syncFromHistoryEvent = (eventState: unknown, isHashChange = false) => {
      if (typeof window === 'undefined') return;
      const parsed = parseRouteFromLocationParts({
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        basePrefix: getAppBasePrefix(),
      });
      const rtvState = readRouterHistoryState(eventState ?? window.history.state);
      const nextRouteHash = buildRouteHash(parsed.route);

      if (isHashChange && nextRouteHash === currentRouteHashRef.current && !activeOverlay) {
        return;
      }

      const prevRouteHash = currentRouteHashRef.current;
      currentRouteHashRef.current = nextRouteHash;

      if (rtvState?.navKey) {
        currentNavKeyRef.current = rtvState.navKey;
      }

      if (rtvState?.overlay) {
        const requiresPayload =
          (rtvState.overlay === 'player' && !playerState) ||
          (rtvState.overlay === 'trailer' && !trailerItem) ||
          (rtvState.overlay === 'footer_topic' && !footerTopic);
        if (requiresPayload) {
          // Transient overlay payload is not in memory on Forward; gracefully settle on underlying route
          clearAllOverlayStates();
          applyParsedRouteToState(parsed.route);
          const cleanState: RouterHistoryState = {
            ...rtvState,
            overlay: null,
          };
          window.history.replaceState(cleanState, '', `${getAppBasePrefix()}/${nextRouteHash}`);
          return;
        }
        applyParsedRouteToState(parsed.route);
        setActiveOverlay(rtvState.overlay);
        return;
      }

      clearAllOverlayStates();
      applyParsedRouteToState(parsed.route);

      if (prevRouteHash !== nextRouteHash && !isHashChange) {
        restoreScrollForNavKey(rtvState?.navKey);
      } else if (isHashChange && !rtvState) {
        const curr = readRouterHistoryState(window.history.state);
        const stamped: RouterHistoryState = {
          __rtv: true,
          navKey: createNavKey(),
          routeHash: nextRouteHash,
          internalDepth: (curr?.internalDepth ?? 0) + 1,
          overlay: null,
        };
        currentNavKeyRef.current = stamped.navKey;
        window.history.replaceState(stamped, '', `${getAppBasePrefix()}/${nextRouteHash}`);
      }
    };

    const onPopState = (e: PopStateEvent) => syncFromHistoryEvent(e.state, false);
    const onHashChange = () => syncFromHistoryEvent(window.history.state, true);

    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [
    activeOverlay,
    playerState,
    trailerItem,
    footerTopic,
    applyParsedRouteToState,
    clearAllOverlayStates,
    restoreScrollForNavKey,
  ]);

  const effectiveBrandName =
    siteSettings.branding?.siteName?.trim() || siteSettings.siteName || 'RahaL TV';

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (view === 'admin') {
      document.title = `إدارة ${effectiveBrandName} — لوحة التحكم`;
    } else if (view === 'not_found') {
      document.title = `الصفحة غير موجودة — ${effectiveBrandName}`;
    } else if (view === 'actor' && actorName) {
      document.title = `${actorName} — أعماله على ${effectiveBrandName}`;
    } else if (view === 'single' && matchedSingleMedia) {
      document.title = `${matchedSingleMedia.title} — ${effectiveBrandName}`;
    } else {
      document.title = effectiveBrandName;
    }
  }, [view, actorName, matchedSingleMedia, effectiveBrandName]);

  useEffect(() => {
    applyTypographyToDocument(siteSettings.typography, customFonts);
  }, [siteSettings.typography, customFonts]);

  useEffect(() => {
    const branding = normalizeWebsiteBranding(siteSettings.branding, siteSettings.siteName);
    applyWebsiteFaviconToDocument(branding);
    ensureWebsiteBrandingFontLoaded(branding.siteNameFont);
  }, [siteSettings.branding, siteSettings.siteName]);

  // Apply TV/Mobile/Low-Spec device display prefs and install D-pad spatial navigation
  useEffect(() => {
    applyDisplayDevicePrefs(loadDisplayDevicePrefs());
  }, []);

  useEffect(() => {
    return installTvSpatialNavigation({
      onBack: () => {
        if (closeTopOverlay()) {
          return true;
        }
        if (view !== 'home') {
          navigateBackFromUI();
          return true;
        }
        return false;
      },
    });
  }, [closeTopOverlay, navigateBackFromUI, view]);

  useEffect(() => {
    setLiveShieldConfig(siteSettings.popupShield);
  }, [siteSettings.popupShield]);

  useEffect(() => {
    return installGlobalPopupShieldGuards();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const isProtectedImageTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      const tag = target.tagName;
      if (tag === 'IMG' || tag === 'PICTURE') return true;
      return Boolean(target.closest('picture, [data-rtv-no-img-menu="true"]'));
    };
    const onContextMenuCapture = (e: MouseEvent) => {
      if (isProtectedImageTarget(e.target)) {
        e.preventDefault();
      }
    };
    const onDragStartCapture = (e: DragEvent) => {
      if (isProtectedImageTarget(e.target)) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', onContextMenuCapture, true);
    document.addEventListener('dragstart', onDragStartCapture, true);
    return () => {
      document.removeEventListener('contextmenu', onContextMenuCapture, true);
      document.removeEventListener('dragstart', onDragStartCapture, true);
      if (entryTimerRef.current !== null) {
        window.clearTimeout(entryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(watchlistIds));
    } catch {
      // Ignore storage quota errors
    }
  }, [watchlistIds]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DISMISSED_STARTERS, JSON.stringify(dismissedStarterIds));
    } catch {
      // Ignore storage quota errors
    }
  }, [dismissedStarterIds]);

  useEffect(() => {
    try {
      if (starterCleared) {
        localStorage.setItem(STORAGE_STARTER_CLEARED, '1');
      } else {
        localStorage.removeItem(STORAGE_STARTER_CLEARED);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [starterCleared]);

  // 1. Public Firestore Listeners (Stage-0 cache -> Stage-1 fast slice -> Stage-2 full sync)
  useEffect(() => {
    const activeDb = getActiveDatabase();
    const mediaPath = 'media';
    const settingsPath = 'settings/general';
    let cancelled = false;
    let fullMediaSnapshotReceived = false;
    let secondaryAttached = false;
    const secondaryUnsubs: Array<() => void> = [];

    let cloudGeneralHome: Partial<HomeLayoutConfig> | null = null;
    let cloudSplitHomeLayout: Partial<HomeLayoutConfig> | null = null;
    let cloudSplitSliderStyle: Partial<HomeLayoutConfig> | null = null;
    let cloudGeneralUpdatedMs = 0;
    let cloudSplitHomeUpdatedMs = 0;
    let cloudSplitSliderUpdatedMs = 0;
    let cloudGeneralBranding: WebsiteBrandingConfig | null = null;
    let cloudSplitBranding: WebsiteBrandingConfig | null = null;
    let cloudSplitBrandingUpdatedMs = 0;

    const getStoredPriorityHeroIds = (): string[] => {
      const storedHome = loadStoredHomeConfig();
      return Array.from(
        new Set(
          [storedHome.heroMediaId, ...(storedHome.heroSlideIds || [])].filter(
            (id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
          )
        )
      ).slice(0, 12);
    };

    const readSnapUpdatedMs = (raw: Record<string, unknown> | undefined): number => {
      const ts = raw?.updatedAt as { toMillis?: () => number } | undefined;
      return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
    };

    const mergeLiveHomeConfig = (prevHome?: HomeLayoutConfig): HomeLayoutConfig => {
      const fallbackStored = prevHome || loadStoredHomeConfig();
      const useSplitLayout =
        cloudSplitHomeLayout !== null &&
        (cloudGeneralHome === null || cloudSplitHomeUpdatedMs >= cloudGeneralUpdatedMs);
      const baseSource = useSplitLayout
        ? cloudSplitHomeLayout!
        : cloudGeneralHome
          ? extractHomeBaseFromRecord(cloudGeneralHome)
          : extractHomeBaseFromRecord(fallbackStored);

      const generalHasFullStyle = Boolean(
        cloudGeneralHome && homeConfigHasAllSliderStyleKeys(cloudGeneralHome)
      );
      const useSplitSliderStyle =
        cloudSplitSliderStyle !== null &&
        (!generalHasFullStyle || cloudSplitSliderUpdatedMs >= cloudGeneralUpdatedMs);
      const styleSource = useSplitSliderStyle
        ? cloudSplitSliderStyle!
        : generalHasFullStyle
          ? extractSliderStyleFromRecord(cloudGeneralHome)
          : extractSliderStyleFromRecord(fallbackStored);

      return saveStoredHomeConfig(
        normalizeHomeConfig({
          ...fallbackStored,
          ...baseSource,
          ...styleSource,
        })
      );
    };

    // Lightweight critical settings listeners attach immediately
    const unsubSettings = onSnapshot(
      doc(activeDb, 'settings', 'general'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<SiteSettings> & Record<string, unknown>;
          cloudGeneralUpdatedMs = readSnapUpdatedMs(data);
          cloudGeneralHome = data.homeConfig || null;

          const syncedTheme = data.playerTheme
            ? saveStoredPlayerTheme(data.playerTheme)
            : loadStoredPlayerTheme();
          const syncedTypography = data.typography
            ? saveStoredTypographyConfig(data.typography)
            : loadStoredTypographyConfig();
          const syncedShield = data.popupShield
            ? saveStoredPopupShieldConfig(data.popupShield)
            : loadStoredPopupShieldConfig();
          const resolvedSiteName = data.siteName || DEFAULT_SETTINGS.siteName;
          cloudGeneralBranding = data.branding
            ? normalizeWebsiteBranding(data.branding, resolvedSiteName)
            : null;
          const activeBrandingSource =
            cloudSplitBranding &&
            (!cloudGeneralBranding || cloudSplitBrandingUpdatedMs >= cloudGeneralUpdatedMs)
              ? cloudSplitBranding
              : cloudGeneralBranding;
          const syncedBranding = activeBrandingSource
            ? saveStoredWebsiteBranding(
                normalizeWebsiteBranding(activeBrandingSource, resolvedSiteName),
                resolvedSiteName
              )
            : loadStoredWebsiteBranding(resolvedSiteName);

          setSiteSettings((prev) => {
            const syncedHome = mergeLiveHomeConfig(prev.homeConfig);
            return {
              siteName: syncedBranding.siteName || resolvedSiteName,
              tagline:
                data.tagline && data.tagline.trim() !== LEGACY_REMOVED_TAGLINE
                  ? data.tagline
                  : DEFAULT_SETTINGS.tagline,
              announcementText: data.announcementText || '',
              tickerEnabled: data.tickerEnabled ?? false,
              featuredLimit: data.featuredLimit || 5,
              maintenanceMode: Boolean(data.maintenanceMode),
              maintenanceMessage:
                typeof data.maintenanceMessage === 'string' && data.maintenanceMessage.trim()
                  ? data.maintenanceMessage
                  : DEFAULT_SETTINGS.maintenanceMessage,
              playerTheme: syncedTheme,
              homeConfig: syncedHome,
              typography: syncedTypography,
              popupShield: syncedShield,
              branding: syncedBranding,
            };
          });
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, settingsPath);
        } catch {
          // Fallback to default settings if settings doc cannot be fetched
        }
      }
    );

    const unsubHomeLayout = onSnapshot(
      doc(activeDb, 'settings', 'home_layout'),
      (snap) => {
        if (!snap.exists()) return;
        const raw = snap.data() as Record<string, unknown>;
        cloudSplitHomeUpdatedMs = readSnapUpdatedMs(raw);
        cloudSplitHomeLayout = extractHomeBaseFromRecord(raw);
        setSiteSettings((prev) => ({
          ...prev,
          homeConfig: mergeLiveHomeConfig(prev.homeConfig),
        }));
      },
      () => {
        // Ignore if split settings/home_layout rule is not yet deployed
      }
    );

    const unsubSliderStyle = onSnapshot(
      doc(activeDb, 'settings', 'slider_style'),
      (snap) => {
        if (!snap.exists()) return;
        const raw = snap.data() as Record<string, unknown>;
        cloudSplitSliderUpdatedMs = readSnapUpdatedMs(raw);
        cloudSplitSliderStyle = extractSliderStyleFromRecord(raw);
        setSiteSettings((prev) => ({
          ...prev,
          homeConfig: mergeLiveHomeConfig(prev.homeConfig),
        }));
      },
      () => {
        // Ignore if split settings/slider_style rule is not yet deployed
      }
    );

    const unsubSiteBranding = onSnapshot(
      doc(activeDb, 'settings', 'site_branding'),
      (snap) => {
        if (!snap.exists()) return;
        const raw = snap.data() as Partial<WebsiteBrandingConfig> & Record<string, unknown>;
        cloudSplitBrandingUpdatedMs = readSnapUpdatedMs(raw);
        setSiteSettings((prev) => {
          const fallbackName = prev.siteName || DEFAULT_SETTINGS.siteName;
          cloudSplitBranding = normalizeWebsiteBranding(raw, fallbackName);
          if (cloudGeneralBranding && cloudGeneralUpdatedMs > cloudSplitBrandingUpdatedMs) {
            return prev;
          }
          const syncedBranding = saveStoredWebsiteBranding(cloudSplitBranding, fallbackName);
          return {
            ...prev,
            siteName: syncedBranding.siteName || fallbackName,
            branding: syncedBranding,
          };
        });
      },
      () => {
        // Ignore if split settings/site_branding rule is not yet deployed
      }
    );

    const unsubImagePlaceholders = onSnapshot(
      doc(activeDb, 'settings', 'image_placeholders'),
      (snap) => {
        if (!snap.exists()) return;
        const raw = snap.data() as Partial<ImagePlaceholderConfig>;
        const synced = saveStoredPlaceholderConfig(normalizeImagePlaceholderConfig(raw));
        setImagePlaceholderConfig(synced);
      },
      () => {
        // Ignore if settings/image_placeholders rule is not yet deployed
      }
    );

    const unsubRecentlyWatchedUi = onSnapshot(
      doc(activeDb, 'settings', 'recently_watched_ui'),
      (snap) => {
        if (!snap.exists()) return;
        const raw = snap.data() as Partial<RecentlyWatchedUiConfig>;
        const synced = saveStoredRecentlyWatchedUiConfig(
          normalizeRecentlyWatchedUiConfig(raw)
        );
        setRecentlyWatchedUiConfig(synced);
      },
      () => {
        // Ignore if settings/recently_watched_ui rule is not yet deployed
      }
    );

    const unsubSiteTheme = onSnapshot(
      doc(activeDb, 'settings', 'site_theme'),
      (snap) => {
        if (!snap.exists()) return;
        const raw = snap.data() as { siteThemeId?: unknown };
        const synced = saveStoredSiteThemeId(normalizeSiteThemeId(raw?.siteThemeId));
        setSiteThemeId(synced);
      },
      () => {
        // Ignore if settings/site_theme rule is not yet deployed
      }
    );

    const unsubHeroSliderMode = onSnapshot(
      doc(activeDb, 'settings', 'hero_slider_mode'),
      (snap) => {
        if (!snap.exists()) return;
        const raw = snap.data() as { variant?: unknown; mobileVariant?: unknown };
        const desktop = normalizeHeroSliderVariant(raw?.variant);
        const mobile =
          raw?.mobileVariant !== undefined
            ? normalizeHeroSliderVariant(raw.mobileVariant)
            : desktop;
        saveHeroSliderDeviceVariants(desktop, mobile);
      },
      () => {
        // Ignore if settings/hero_slider_mode rule is not yet deployed
      }
    );

    // Stage 2: full real-time media collection + larger secondary payloads (stream_v4_slider, fonts, ratings)
    const attachSecondaryListeners = () => {
      if (cancelled || secondaryAttached) return;
      secondaryAttached = true;

      const unsubMedia = onSnapshot(
        collection(activeDb, mediaPath),
        (snapshot) => {
          if (cancelled) return;
          fullMediaSnapshotReceived = true;
          const docs = sortMediaCatalog(
            snapshot.docs.map((d) =>
              normalizeFirestoreMediaRecord(d.id, d.data() as Record<string, unknown>)
            )
          );
          setFirestoreCatalog(docs);
          setInitialMediaLoaded(true);
          setDbConnectionStatus('connected');
          setDbConnectionError(null);
          recordDatabaseConnected();
          if (docs.length > 0) {
            // Once Firestore holds live items, prevent initial fallback items from popping back if DB is cleared later
            setStarterCleared(true);
            saveCachedCatalogSnapshot(docs, { priorityIds: getStoredPriorityHeroIds() });
          } else if (!snapshot.metadata.fromCache) {
            clearCachedCatalogSnapshot();
          }
        },
        (error) => {
          if (cancelled) return;
          setInitialMediaLoaded(true);
          const classified = classifyFirestoreConnectionError(error);
          setDbConnectionStatus(classified.status);
          setDbConnectionError(classified.message);
          recordDatabaseOutage(
            classified.status === 'error' || classified.status === 'connecting'
              ? 'offline'
              : classified.status,
            classified.message,
            error instanceof Error ? error.message : String(error)
          );
          try {
            handleFirestoreError(error, OperationType.LIST, mediaPath);
          } catch {
            // Keep fallback catalog visible instead of crashing on network/permission errors
          }
        }
      );
      secondaryUnsubs.push(unsubMedia);

      const unsubStreamV4Slider = onSnapshot(
        doc(activeDb, 'settings', 'stream_v4_slider'),
        (snap) => {
          if (!snap.exists()) return;
          const raw = snap.data() as Record<string, unknown>;
          saveStreamV4SliderConfig(raw);
        },
        () => {
          // Ignore if settings/stream_v4_slider rule is not yet deployed
        }
      );
      secondaryUnsubs.push(unsubStreamV4Slider);

      const fontsPath = 'fonts';
      const unsubFonts = onSnapshot(
        collection(activeDb, fontsPath),
        (snapshot) => {
          const nextFonts: Partial<Record<CustomFontSlot, CustomFontRecord>> = {};
          snapshot.docs.forEach((d) => {
            const raw = d.data() as Partial<CustomFontRecord>;
            const slot: CustomFontSlot | null =
              d.id === 'arabic' || raw.id === 'arabic'
                ? 'arabic'
                : d.id === 'english' || raw.id === 'english'
                  ? 'english'
                  : null;
            if (!slot || !raw.sourceUrl || !raw.family) return;
            nextFonts[slot] = {
              id: slot,
              family: String(raw.family),
              fileName: String(raw.fileName || 'custom-font'),
              format: raw.format || 'woff2',
              sourceUrl: String(raw.sourceUrl),
            };
          });
          saveStoredCustomFonts(nextFonts);
          setCustomFonts(nextFonts);
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, fontsPath);
          } catch {
            // Keep locally stored custom fonts if cloud rules for /fonts are not yet deployed
          }
        }
      );
      secondaryUnsubs.push(unsubFonts);

      const ratingsPath = 'ratings';
      const unsubRatings = onSnapshot(
        collection(activeDb, ratingsPath),
        (snapshot) => {
          const sums: Record<string, { total: number; count: number }> = {};
          snapshot.docs.forEach((d) => {
            const data = d.data() as { mediaId?: unknown; stars?: unknown };
            const mediaKey = sanitizeRatingMediaId(String(data.mediaId || ''));
            const stars = Math.round(Number(data.stars) || 0);
            if (!mediaKey || stars < 1 || stars > 5) return;
            if (!sums[mediaKey]) {
              sums[mediaKey] = { total: 0, count: 0 };
            }
            sums[mediaKey].total += stars;
            sums[mediaKey].count += 1;
          });

          const nextAgg: Record<string, { average: number; count: number }> = {};
          Object.entries(sums).forEach(([key, val]) => {
            nextAgg[key] = {
              average: val.total / val.count,
              count: val.count,
            };
          });
          setRatingsByMediaId(nextAgg);
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, ratingsPath);
          } catch {
            // Keep app functional if ratings rules are not deployed yet
          }
        }
      );
      secondaryUnsubs.push(unsubRatings);
    };

    const stage2FallbackTimer = window.setTimeout(() => {
      attachSecondaryListeners();
    }, 850);

    const runStage1NetworkSlice = () => {
      if (cancelled || fullMediaSnapshotReceived) return;
      const priorityHeroIds = getStoredPriorityHeroIds();
      const initialSingleKey = initialRoute.view === 'single' ? initialRoute.watchKey : null;
      const isInitialKeyValidId =
        typeof initialSingleKey === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(initialSingleKey);

      Promise.all([
        getDocs(query(collection(activeDb, mediaPath), orderBy('updatedAt', 'desc'), limit(48))),
        priorityHeroIds.length > 0
          ? getDocs(
              query(collection(activeDb, mediaPath), where(documentId(), 'in', priorityHeroIds))
            ).catch(() => null)
          : Promise.resolve(null),
        initialSingleKey
          ? getDocs(
              query(collection(activeDb, mediaPath), where('slug', '==', initialSingleKey), limit(1))
            ).catch(() => null)
          : Promise.resolve(null),
        isInitialKeyValidId && initialSingleKey
          ? getDoc(doc(activeDb, mediaPath, initialSingleKey)).catch(() => null)
          : Promise.resolve(null),
      ])
        .then(([latestSnap, heroSnap, singleSlugSnap, singleIdSnap]) => {
          if (cancelled) return;
          if (!fullMediaSnapshotReceived) {
            const collected: MediaItem[] = [];
            latestSnap.docs.forEach((d) =>
              collected.push(normalizeFirestoreMediaRecord(d.id, d.data() as Record<string, unknown>))
            );
            heroSnap?.docs.forEach((d) =>
              collected.push(normalizeFirestoreMediaRecord(d.id, d.data() as Record<string, unknown>))
            );
            singleSlugSnap?.docs.forEach((d) =>
              collected.push(normalizeFirestoreMediaRecord(d.id, d.data() as Record<string, unknown>))
            );
            if (singleIdSnap && singleIdSnap.exists()) {
              collected.push(
                normalizeFirestoreMediaRecord(
                  singleIdSnap.id,
                  singleIdSnap.data() as Record<string, unknown>
                )
              );
            }

            if (collected.length > 0) {
              const stage1Merged = mergeProgressiveMediaItems(collected, []);
              setFirestoreCatalog((prev) => mergeProgressiveMediaItems(stage1Merged, prev));
              setInitialMediaLoaded(true);
              setDbConnectionStatus('connected');
              setDbConnectionError(null);
              recordDatabaseConnected();
              setStarterCleared(true);
              saveCachedCatalogSnapshot(stage1Merged, { priorityIds: priorityHeroIds });
            }
          }
          window.clearTimeout(stage2FallbackTimer);
          attachSecondaryListeners();
        })
        .catch(() => {
          window.clearTimeout(stage2FallbackTimer);
          attachSecondaryListeners();
        });
    };

    // Stage 0: Instant IndexedDB persistent cache read (for repeat visits), falling back to Stage 1 on miss
    getDocsFromCache(collection(activeDb, mediaPath))
      .then((cachedSnap) => {
        if (cancelled || fullMediaSnapshotReceived) return;
        if (cachedSnap.empty) {
          runStage1NetworkSlice();
          return;
        }
        const cachedDocs = sortMediaCatalog(
          cachedSnap.docs.map((d) =>
            normalizeFirestoreMediaRecord(d.id, d.data() as Record<string, unknown>)
          )
        );
        setFirestoreCatalog(cachedDocs);
        setInitialMediaLoaded(true);
        setDbConnectionStatus('connected');
        setDbConnectionError(null);
        setStarterCleared(true);
        window.clearTimeout(stage2FallbackTimer);
        attachSecondaryListeners();
      })
      .catch(() => {
        runStage1NetworkSlice();
      });

    return () => {
      cancelled = true;
      window.clearTimeout(stage2FallbackTimer);
      unsubSettings();
      unsubHomeLayout();
      unsubSliderStyle();
      unsubSiteBranding();
      unsubImagePlaceholders();
      unsubRecentlyWatchedUi();
      unsubSiteTheme();
      unsubHeroSliderMode();
      secondaryUnsubs.forEach((u) => {
        try {
          u();
        } catch {
          // Ignore unsubscribe errors
        }
      });
    };
  }, [dbReconnectNonce]);

  // 1-extra. Fast targeted single-item fetch if user opens an item before Stage-2 finishes (or needs full seasons)
  useEffect(() => {
    if (view !== 'single' || !requestedWatchKey) return;
    const needsFetch =
      !matchedSingleMedia ||
      (matchedSingleMedia.kind === 'series' &&
        (!Array.isArray(matchedSingleMedia.seasons) || matchedSingleMedia.seasons.length === 0));
    if (!needsFetch) return;

    let cancelled = false;
    const activeDb = getActiveDatabase();
    const isKeyValidId = /^[a-zA-Z0-9_-]{1,128}$/.test(requestedWatchKey);
    const idToCheck =
      matchedSingleMedia?.id && /^[a-zA-Z0-9_-]{1,128}$/.test(matchedSingleMedia.id)
        ? matchedSingleMedia.id
        : isKeyValidId
          ? requestedWatchKey
          : null;

    Promise.all([
      getDocs(
        query(collection(activeDb, 'media'), where('slug', '==', requestedWatchKey), limit(1))
      ).catch(() => null),
      idToCheck ? getDoc(doc(activeDb, 'media', idToCheck)).catch(() => null) : Promise.resolve(null),
    ]).then(([slugSnap, idSnap]) => {
      if (cancelled) return;
      const fetched: MediaItem[] = [];
      slugSnap?.docs.forEach((d) =>
        fetched.push(normalizeFirestoreMediaRecord(d.id, d.data() as Record<string, unknown>))
      );
      if (idSnap && idSnap.exists()) {
        fetched.push(
          normalizeFirestoreMediaRecord(idSnap.id, idSnap.data() as Record<string, unknown>)
        );
      }
      if (fetched.length > 0) {
        setFirestoreCatalog((prev) => mergeProgressiveMediaItems(fetched, prev));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [view, requestedWatchKey, matchedSingleMedia, dbReconnectNonce]);

  // 1a. Cross-device database pointer + Stage-2 deferred owner registry synchronization
  useEffect(() => {
    const unsubPointer = subscribeActiveDatabasePointerFromFirestore(true);
    const shouldHydrateRegistry = Boolean(defaultAuthUid || isOwnerAdmin);
    if (!shouldHydrateRegistry) {
      return () => {
        unsubPointer();
      };
    }

    let cancelled = false;
    let unsubRegistry = () => {};
    let deferTimer: number | null = null;
    const attachRegistry = () => {
      if (cancelled) return;
      const seedUid = isOwnerAdmin
        ? defaultAuthUid || firebaseUser?.uid || undefined
        : undefined;
      unsubRegistry = subscribeDatabaseRegistryFromFirestore(true, {
        uidForInitialSeed: seedUid,
      });
    };

    if (view === 'admin' || initialMediaLoaded) {
      attachRegistry();
    } else {
      deferTimer = window.setTimeout(attachRegistry, 700);
    }

    return () => {
      cancelled = true;
      if (deferTimer !== null) window.clearTimeout(deferTimer);
      unsubPointer();
      unsubRegistry();
    };
  }, [defaultAuthUid, isOwnerAdmin, firebaseUser, view, initialMediaLoaded, dbReconnectNonce]);

  // 1b. Automatic Transient Outage Retry Guard
  useEffect(() => {
    if (dbConnectionStatus !== 'offline') return;
    const reg = loadDatabaseRegistry();
    if (!reg.autoRetryEnabled) return;

    let cancelled = false;
    let attempt = 0;
    const delays = [6000, 15000, 30000];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (cancelled || attempt >= delays.length) return;
      const delay = delays[attempt];
      attempt += 1;
      timer = setTimeout(async () => {
        if (cancelled) return;
        const activeProf = getActiveConnectionProfile();
        const probe = await probeDatabaseConnection();
        appendDatabaseConnectionLog({
          event: 'retry',
          connectionId: activeProf.id,
          connectionName: activeProf.name,
          status: probe.ok ? 'success' : 'warning',
          resultStatus: probe.ok ? 'connected' : 'offline',
          message: probe.ok
            ? `نجحت إعادة المحاولة التلقائية (#${attempt}) وتم استرجاع الاتصال.`
            : `فشلت إعادة المحاولة التلقائية (#${attempt}): ${probe.message || 'غير متصل'}`,
        });
        if (probe.ok) {
          setDbReconnectNonce((n) => n + 1);
        } else {
          scheduleNext();
        }
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [dbConnectionStatus, dbReconnectNonce]);

  const currentViewRef = useRef(view);
  currentViewRef.current = view;

  // 2. Sensitive Auth & RBAC Multistage Hydration (Stage 0 cache -> Stage 1 live verify -> Stage 2 deferred profile write)
  useEffect(() => {
    const activeAuth = getActiveAuth();
    let cancelled = false;
    let authSequence = 0;
    let deferredSyncTimer: number | null = null;

    const clearDeferredSync = () => {
      if (deferredSyncTimer !== null) {
        window.clearTimeout(deferredSyncTimer);
        deferredSyncTimer = null;
      }
    };

    const unsubAuth = onAuthStateChanged(activeAuth, async (user) => {
      const seq = ++authSequence;
      clearDeferredSync();
      setFirebaseUser(user);

      if (!user) {
        setAdminRole(null);
        setVisitorRequests([]);
        setUsersList([]);
        setAdminsList([]);
        setCloudRecentlyWatched([]);
        mergedGuestForUidRef.current = null;
        clearAllSensitiveCaches();
        setAuthLoading(false);
        return;
      }

      // Real authenticated account takes precedence over Guest Mode & isolates per-UID caches
      exitGuestSession();
      setGuestSession(null);
      purgeSensitiveCachesExcept(user.uid);

      // Stage 0: Instant scoped sensitive cache hydration (zero network blocking)
      const cachedWatchlist = loadCachedUserWatchlist(user.uid);
      if (cachedWatchlist) {
        setWatchlistIds(cachedWatchlist);
      }
      const cachedRecentlyWatched = loadCachedUserRecentlyWatched(user.uid);
      if (cachedRecentlyWatched) {
        setCloudRecentlyWatched(cachedRecentlyWatched);
      }

      const cachedRoleResult = await getUserAdminRoleFromCache(user);
      if (cancelled || seq !== authSequence) return;
      if (cachedRoleResult.hit) {
        setAdminRole(cachedRoleResult.role);
        if (cachedRoleResult.role !== 'owner') {
          setUsersList([]);
          setAdminsList([]);
        }
      }
      // On public routes, unblock UI immediately using Stage 0 cache while Stage 1 revalidates in background
      if (cachedRoleResult.hit || currentViewRef.current !== 'admin') {
        setAuthLoading(false);
      }

      // Stage 1: Authoritative RBAC verification + cache-first watchlist read (no eager writes)
      const fallbackWatchlist = cachedWatchlist || watchlistIds;
      const [resolvedRole, watchlistRes] = await Promise.all([
        getUserAdminRole(user),
        hydrateUserWatchlistCacheFirst(user, fallbackWatchlist),
      ]);
      if (cancelled || seq !== authSequence) return;

      setAdminRole(resolvedRole);
      if (resolvedRole !== 'owner') {
        setUsersList([]);
        setAdminsList([]);
      }
      setWatchlistIds(watchlistRes.watchlistIds);
      saveCachedUserWatchlist(user.uid, watchlistRes.watchlistIds);
      setAuthLoading(false);

      // Stage 2: Deferred & throttled profile metadata / private info write sync
      const fingerprint = computeUserProfileSyncFingerprint({
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        email: user.email,
        isAdminUser: resolvedRole !== null,
      });

      if (!watchlistRes.docExists || shouldRunDeferredProfileSync(user.uid, fingerprint)) {
        const delayMs = watchlistRes.docExists ? 700 : 120;
        deferredSyncTimer = window.setTimeout(async () => {
          if (cancelled || seq !== authSequence) return;
          try {
            const syncedWatchlist = await syncUserProfileToFirestore(
              user,
              watchlistRes.watchlistIds,
              resolvedRole !== null
            );
            if (cancelled || seq !== authSequence) return;
            setWatchlistIds(syncedWatchlist);
            saveCachedUserWatchlist(user.uid, syncedWatchlist);
            markProfileSynced(user.uid, fingerprint);
          } catch {
            // Handled cleanly inside firebase helper
          }
        }, delayMs);
      }

      const pendingReports = loadPendingGuestServerReports();
      if (pendingReports.length > 0) {
        window.setTimeout(async () => {
          if (cancelled || seq !== authSequence) return;
          const flushedKeys: string[] = [];
          for (const entry of pendingReports.slice(0, 5)) {
            if (cancelled || seq !== authSequence) return;
            try {
              await submitVisitorRequestToFirestore(user, {
                title: entry.payload.title,
                type: entry.payload.type,
                notes: entry.payload.notes,
              });
              flushedKeys.push(entry.dedupeKey);
            } catch {
              break;
            }
          }
          if (flushedKeys.length > 0) {
            markPendingServerReportsSynced(flushedKeys);
          }
        }, 900);
      }
    });

    return () => {
      cancelled = true;
      clearDeferredSync();
      unsubAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReconnectNonce]);

  // 3a. Sensitive User Recently Watched (Stage 0 cache -> Stage 1/2 deferred live listener)
  useEffect(() => {
    if (authLoading || !firebaseUser) return;

    let cancelled = false;
    const activeDb = getActiveDatabase();
    const rwQuery = query(
      collection(activeDb, 'recently_watched'),
      where('userId', '==', firebaseUser.uid)
    );

    const applyRwRecords = (list: RecentlyWatchedRecord[], fromServer: boolean) => {
      if (cancelled) return;
      setCloudRecentlyWatched(list);
      saveCachedUserRecentlyWatched(firebaseUser.uid, list);
      if (fromServer && mergedGuestForUidRef.current !== firebaseUser.uid) {
        mergedGuestForUidRef.current = firebaseUser.uid;
        void mergeGuestRecentlyWatchedToAccount(firebaseUser.uid, list).then((merged) => {
          if (!cancelled && merged.length > 0) {
            setRecentlyWatchedTick((t) => t + 1);
          }
        });
      }
    };

    // Stage 0: Instant IndexedDB persistent cache read before network listener attaches
    getDocsFromCache(rwQuery)
      .then((cachedSnap) => {
        if (cancelled || cachedSnap.empty) return;
        const cachedList = cachedSnap.docs.map((d) => d.data() as RecentlyWatchedRecord);
        applyRwRecords(cachedList, false);
      })
      .catch(() => {
        // Local storage cache already hydrated Stage 0 on auth resolve
      });

    let unsubRecentlyWatched = () => {};
    let attachTimer: number | null = null;

    const attachLiveListener = () => {
      if (cancelled) return;
      unsubRecentlyWatched = onSnapshot(
        rwQuery,
        (snapshot) => {
          const list = snapshot.docs.map((d) => d.data() as RecentlyWatchedRecord);
          applyRwRecords(list, !snapshot.metadata.fromCache);
        },
        () => {
          // Keep local history available even if recently_watched rules are pending deploy
        }
      );
    };

    if (initialMediaLoaded) {
      attachLiveListener();
    } else {
      attachTimer = window.setTimeout(attachLiveListener, 450);
    }

    return () => {
      cancelled = true;
      if (attachTimer !== null) window.clearTimeout(attachTimer);
      unsubRecentlyWatched();
    };
  }, [authLoading, firebaseUser, initialMediaLoaded, dbReconnectNonce]);

  // 3b. High-Sensitivity Owner Collections (/users & /admins): Strictly view-gated to Admin Dashboard
  useEffect(() => {
    if (authLoading || !firebaseUser || !isOwnerAdmin || view !== 'admin') return;

    let cancelled = false;
    const activeDb = getActiveDatabase();

    // Stage 0: Instant IndexedDB cache read on Admin Dashboard entry
    void Promise.all([
      getDocsFromCache(collection(activeDb, 'users')).catch(() => null),
      getDocsFromCache(collection(activeDb, 'admins')).catch(() => null),
    ]).then(([cachedUsers, cachedAdmins]) => {
      if (cancelled) return;
      if (cachedUsers && !cachedUsers.empty) {
        setUsersList(cachedUsers.docs.map((d) => d.data() as UserProfileRecord));
      }
      if (cachedAdmins && !cachedAdmins.empty) {
        setAdminsList(cachedAdmins.docs.map((d) => d.data() as AdminRoleRecord));
      }
    });

    // Stage 2: Live admin-only listeners while viewing Admin Dashboard
    const unsubUsers = onSnapshot(
      collection(activeDb, 'users'),
      (snapshot) => {
        if (!cancelled) {
          setUsersList(snapshot.docs.map((d) => d.data() as UserProfileRecord));
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'users');
        } catch {
          // Ignore background listener permission errors gracefully
        }
      }
    );

    const unsubAdmins = onSnapshot(
      collection(activeDb, 'admins'),
      (snapshot) => {
        if (!cancelled) {
          setAdminsList(snapshot.docs.map((d) => d.data() as AdminRoleRecord));
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'admins');
        } catch {
          // Ignore background listener permission errors gracefully
        }
      }
    );

    return () => {
      cancelled = true;
      unsubUsers();
      unsubAdmins();
    };
  }, [authLoading, firebaseUser, isOwnerAdmin, view, dbReconnectNonce]);

  // 3c. Sensitive Visitor Requests (/requests): On-demand hydration for Admin Dashboard or Requests Modal
  useEffect(() => {
    if (authLoading || !firebaseUser) return;
    if (view !== 'admin' && footerTopic !== 'requests') return;

    let cancelled = false;
    const activeDb = getActiveDatabase();
    const reqPath = 'requests';
    const reqQuery = isOwnerAdmin
      ? query(collection(activeDb, reqPath), orderBy('createdAt', 'desc'))
      : query(collection(activeDb, reqPath), where('userId', '==', firebaseUser.uid));

    // Stage 0: Instant scoped cache + IndexedDB persistent cache
    const cachedReqs = loadCachedUserRequests(firebaseUser.uid, isOwnerAdmin);
    if (cachedReqs) {
      setVisitorRequests(cachedReqs);
    }
    getDocsFromCache(reqQuery)
      .then((cachedSnap) => {
        if (cancelled || cachedSnap.empty) return;
        const list = cachedSnap.docs
          .map((d) => normalizeFirestoreRequestRecord(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => b.createdMs - a.createdMs)
          .map((entry) => entry.item);
        setVisitorRequests(list);
      })
      .catch(() => {
        // Scoped cache already applied if available
      });

    // Stage 2: Live requests listener
    const unsubRequests = onSnapshot(
      reqQuery,
      (snapshot) => {
        if (cancelled) return;
        const list = snapshot.docs
          .map((d) => normalizeFirestoreRequestRecord(d.id, d.data() as Record<string, unknown>))
          .sort((a, b) => b.createdMs - a.createdMs)
          .map((entry) => entry.item);
        setVisitorRequests(list);
        saveCachedUserRequests(firebaseUser.uid, isOwnerAdmin, list);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, reqPath);
        } catch {
          // Ignore background listener permission errors gracefully
        }
      }
    );

    return () => {
      cancelled = true;
      unsubRequests();
    };
  }, [authLoading, firebaseUser, isOwnerAdmin, view, footerTopic, dbReconnectNonce]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);



  const openAdminPage = useCallback(
    (tab?: AdminTab) => {
      const prefs = loadAdminWorkspacePrefs();
      const moderatorPerms = prefs.moderatorSubPermissions;
      const isOwner = effectiveAdminRole === 'owner';
      const fallbackTab: AdminTab = isOwner ? 'overview' : 'catalog';
      const storedLast = prefs.lastTab as AdminTab | undefined;
      const desiredTab =
        tab ||
        (storedLast && isTabAccessible(storedLast, isOwner, moderatorPerms)
          ? storedLast
          : fallbackTab);
      const resolvedTab: AdminTab = isTabAccessible(desiredTab, isOwner, moderatorPerms)
        ? desiredTab
        : fallbackTab;
      setAdminRequestedTab((prev) => ({ tab: resolvedTab, nonce: prev.nonce + 1 }));
      navigateToRoute({ view: 'admin', adminTab: resolvedTab });
    },
    [effectiveAdminRole, navigateToRoute]
  );

  const navigateHome = useCallback(() => {
    navigateToRoute({ view: 'home' });
  }, [navigateToRoute]);

  const handleSelectMedia = useCallback(
    (item: MediaItem, openDownloads = false) => {
      if (typeof window !== 'undefined') {
        const reduced =
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
          document.documentElement.getAttribute('data-rtv-low-spec') === 'true';
        if (!reduced) {
          if (entryTimerRef.current !== null) {
            window.clearTimeout(entryTimerRef.current);
          }
          setEntryTransition({
            key: Date.now(),
            title: item.title,
            poster: getPosterUrl(item, 'detail_poster'),
            quality: item.quality || 'HD',
            year: String(item.year || '2026'),
          });
          entryTimerRef.current = window.setTimeout(() => {
            entryTimerRef.current = null;
            setEntryTransition(null);
          }, 480);
        }
      }
      const watchKey = (item.slug || item.id).trim();
      setSelectedMediaId(item.id);
      navigateToRoute(
        {
          view: 'single',
          watchKey,
          ...(openDownloads ? { openDownloads: true } : {}),
        },
        { scrollTop: !openDownloads }
      );
    },
    [navigateToRoute]
  );

  const handleSelectActor = useCallback(
    (name: string) => {
      const clean = String(name || '').trim();
      if (!clean) return;
      navigateToRoute({ view: 'actor', actorName: clean });
    },
    [navigateToRoute]
  );

  const handleSingleEpisodeChange = useCallback(
    (epNumber: number) => {
      if (view !== 'single' || !requestedWatchKey) return;
      navigateToRoute(
        {
          view: 'single',
          watchKey: requestedWatchKey,
          ...(epNumber > 1 ? { episode: epNumber } : {}),
          ...(openDownloadsOnSingle ? { openDownloads: true } : {}),
        },
        { replace: true, scrollTop: false }
      );
    },
    [view, requestedWatchKey, openDownloadsOnSingle, navigateToRoute]
  );

  const handleApplyFilter = useCallback(
    (partial: Partial<CatalogFilterState>) => {
      const nextFilters: CatalogFilterState = { ...DEFAULT_FILTERS, ...partial };
      const nextSort: ArchiveSortOption = nextFilters.preset || 'latest';
      navigateToRoute({
        view: 'archive',
        filters: nextFilters,
        sort: nextSort,
        page: 1,
        pageSize: archivePageSize,
      });
    },
    [archivePageSize, navigateToRoute]
  );

  const handleUpdateArchiveFilters = useCallback(
    (nextFilters: CatalogFilterState, opts?: { replace?: boolean }) => {
      const nextSort: ArchiveSortOption =
        nextFilters.preset && nextFilters.preset !== archiveSort ? nextFilters.preset : archiveSort;
      navigateToRoute(
        {
          view: 'archive',
          filters: nextFilters,
          sort: nextSort,
          page: 1,
          pageSize: archivePageSize,
        },
        { replace: opts?.replace, scrollTop: false }
      );
    },
    [archiveSort, archivePageSize, navigateToRoute]
  );

  const handleChangeArchivePage = useCallback(
    (nextPage: number) => {
      navigateToRoute(
        {
          view: 'archive',
          filters,
          sort: archiveSort,
          page: Math.max(1, nextPage),
          pageSize: archivePageSize,
        },
        { scrollTop: true }
      );
    },
    [filters, archiveSort, archivePageSize, navigateToRoute]
  );

  const handleChangeArchivePageSize = useCallback(
    (nextPageSize: number) => {
      navigateToRoute(
        {
          view: 'archive',
          filters,
          sort: archiveSort,
          page: 1,
          pageSize: nextPageSize,
        },
        { scrollTop: false }
      );
    },
    [filters, archiveSort, navigateToRoute]
  );

  const handleChangeArchiveSort = useCallback(
    (nextSort: ArchiveSortOption) => {
      const nextFilters: CatalogFilterState =
        nextSort === 'year'
          ? { ...filters, preset: '' }
          : { ...filters, preset: nextSort as CatalogFilterState['preset'] };
      navigateToRoute(
        {
          view: 'archive',
          filters: nextFilters,
          sort: nextSort,
          page: 1,
          pageSize: archivePageSize,
        },
        { scrollTop: false }
      );
    },
    [filters, archivePageSize, navigateToRoute]
  );

  const handleResetArchiveFilters = useCallback(() => {
    navigateToRoute({
      view: 'archive',
      filters: DEFAULT_FILTERS,
      sort: 'latest',
      page: 1,
      pageSize: archivePageSize,
    });
  }, [archivePageSize, navigateToRoute]);

  const handleAdminTabChange = useCallback(
    (tab: AdminTab) => {
      navigateToRoute({ view: 'admin', adminTab: tab });
    },
    [navigateToRoute]
  );

  const handleToggleWatchlist = (item: MediaItem) => {
    setWatchlistIds((prev) => {
      const exists = prev.includes(item.id);
      const next = exists ? prev.filter((id) => id !== item.id) : [item.id, ...prev];
      showToast(
        exists
          ? `تمت إزالة "${item.title}" من قائمتي`
          : `تمت إضافة "${item.title}" إلى قائمتي بنجاح`
      );
      if (firebaseUser) {
        saveCachedUserWatchlist(firebaseUser.uid, next);
        void saveWatchlistToFirestore(firebaseUser.uid, next);
      }
      return next;
    });
  };

  const handleLogout = async () => {
    clearAllSensitiveCaches();
    await signOutFirebase();
    showToast('تم تسجيل الخروج بنجاح');
  };

  const handleContinueAsGuest = () => {
    const session = enterGuestSession();
    setGuestSession(session);
    showToast('تم الدخول بوضع الضيف — يمكنك التصفح والمشاهدة بحرية');
  };

  const handleExitGuest = () => {
    exitGuestSession();
    setGuestSession(null);
    showToast('تم الخروج من وضع الضيف');
  };

  const handleAddRequest = async (req: {
    title: string;
    type: VisitorRequest['type'];
    notes: string;
  }) => {
    if (!firebaseUser) return;
    await submitVisitorRequestToFirestore(firebaseUser, req);
    showToast('تم إرسال طلبك وحفظه في قاعدة البيانات');
  };

  const handleReportBrokenServers = async (req: {
    title: string;
    type: VisitorRequest['type'];
    notes: string;
    dedupeKey: string;
  }): Promise<{ synced: boolean }> => {
    if (!firebaseUser) {
      markServerIssueReportedLocally(req.dedupeKey, req, false);
      return { synced: false };
    }
    try {
      await submitVisitorRequestToFirestore(firebaseUser, {
        title: req.title,
        type: req.type,
        notes: req.notes,
      });
      markServerIssueReportedLocally(req.dedupeKey, req, true);
      return { synced: true };
    } catch {
      markServerIssueReportedLocally(req.dedupeKey, req, false);
      return { synced: false };
    }
  };

  const handleDeleteStarterItems = (ids: string[]) => {
    if (ids.length === 0) return;
    setDismissedStarterIds((prev) => {
      const merged = Array.from(new Set([...prev, ...ids]));
      const remaining = CATALOG_ITEMS.filter((item) => !merged.includes(item.id));
      if (remaining.length === 0) {
        setStarterCleared(true);
      }
      return merged;
    });
  };

  const handleClearAllStarterItems = () => {
    setStarterCleared(true);
    setDismissedStarterIds(CATALOG_ITEMS.map((item) => item.id));
  };

  const handleRestoreStarterItems = () => {
    setStarterCleared(false);
    setDismissedStarterIds([]);
  };

  const handleUpdateHostRule = (rule: PopupShieldHostRule) => {
    const baseShield = siteSettings.popupShield || loadStoredPopupShieldConfig();
    const nextShield = saveStoredPopupShieldConfig({
      ...baseShield,
      hostRules: {
        ...baseShield.hostRules,
        [rule.hostname]: rule,
      },
    });
    const nextSettings: SiteSettings = {
      ...siteSettings,
      popupShield: nextShield,
    };
    setSiteSettings(nextSettings);
    if (isOwnerAdmin && firebaseUser) {
      void saveSiteSettingsToFirestore(nextSettings, firebaseUser.uid).catch(() => undefined);
    }
  };

  const watchlistItems = activeCatalog.filter((i) => watchlistIds.includes(i.id));

  const effectiveRecentlyWatchedUiConfig = rwPreviewOverride || recentlyWatchedUiConfig;
  const effectiveRwMaxItems = effectiveRecentlyWatchedUiConfig.maxStoredItems;
  const effectiveHideCompleted =
    recentlyWatchedPrefs.hideCompleted || effectiveRecentlyWatchedUiConfig.hideCompleted;

  const activeWatchUserId = firebaseUser?.uid || 'guest';
  const recentlyWatchedAllItems = useMemo(
    () =>
      listRecentlyWatchedItems({
        userId: activeWatchUserId,
        isSignedIn: Boolean(firebaseUser),
        cloudRecords: cloudRecentlyWatched,
        maxItems: effectiveRwMaxItems,
        hideCompleted: false,
        sortOrder: effectiveRecentlyWatchedUiConfig.sortOrder,
        customOrderIds: effectiveRecentlyWatchedUiConfig.customOrderIds,
        deduplicateItems: effectiveRecentlyWatchedUiConfig.deduplicateItems,
      }),
    [
      activeWatchUserId,
      firebaseUser,
      cloudRecentlyWatched,
      effectiveRwMaxItems,
      effectiveRecentlyWatchedUiConfig.sortOrder,
      effectiveRecentlyWatchedUiConfig.customOrderIds,
      effectiveRecentlyWatchedUiConfig.deduplicateItems,
      recentlyWatchedTick,
    ]
  );

  const recentlyWatchedItems = useMemo(
    () =>
      effectiveHideCompleted
        ? recentlyWatchedAllItems.filter((rec) => !rec.completed)
        : recentlyWatchedAllItems,
    [recentlyWatchedAllItems, effectiveHideCompleted]
  );

  const handleUpdateRecentlyWatchedPrefs = (patch: Partial<RecentlyWatchedPreferences>) => {
    const next = saveRecentlyWatchedPrefs(patch);
    setRecentlyWatchedPrefs(next);
  };

  const handleResumeRecentlyWatched = (rec: RecentlyWatchedRecord, matchedMedia?: MediaItem) => {
    const target = matchedMedia || activeCatalog.find((m) => m.id === rec.mediaId);
    if (!target) {
      showToast('لم يعد هذا العمل متوفراً في الكتالوج الحالي');
      return;
    }
    openOverlay('player', () =>
      setPlayerState({
        item: target,
        episode: rec.episodeNumber || 1,
        serverIndex: rec.lastServerIndex || 0,
      })
    );
  };

  const handleOpenRecentlyWatchedDetails = (
    rec: RecentlyWatchedRecord,
    matchedMedia?: MediaItem
  ) => {
    const target = matchedMedia || activeCatalog.find((m) => m.id === rec.mediaId);
    if (!target) {
      showToast('لم يعد هذا العمل متوفراً في الكتالوج الحالي');
      return;
    }
    handleSelectMedia(target);
  };

  const handleRemoveRecentlyWatched = async (rec: RecentlyWatchedRecord) => {
    await removeRecentlyWatchedEntry({
      mediaId: rec.mediaId,
      userId: activeWatchUserId,
      isSignedIn: Boolean(firebaseUser),
    });
    setRecentlyWatchedTick((t) => t + 1);
    showToast('تمت إزالة العمل من سجل المشاهدة');
  };

  const handleClearAllRecentlyWatched = async () => {
    await clearAllRecentlyWatchedEntries({
      userId: activeWatchUserId,
      isSignedIn: Boolean(firebaseUser),
    });
    setRecentlyWatchedTick((t) => t + 1);
    showToast('تم مسح سجل المشاهدة بالكامل');
  };

  /* ---------------- Dedicated Standalone /admin Page (No Header / No Footer) ---------------- */
  if (view === 'admin') {
    return (
      <>
        <Suspense
          fallback={
            <RunningRabbitLoader
              variant="fullscreen"
              label="جاري تحميل لوحة الإدارة..."
              delayMs={100}
            />
          }
        >
          <AdminDashboardView
            user={firebaseUser}
            isAdmin={canAccessAdmin}
            adminRole={effectiveAdminRole}
            authLoading={authLoading}
            catalog={activeCatalog}
            isFirestoreSeeded={isFirestoreSeeded}
            dbConnectionStatus={dbConnectionStatus}
            dbConnectionError={dbConnectionError}
            onReconnectDatabase={async () => {
              setDbConnectionStatus('connecting');
              setDbConnectionError(null);
              const probe = await probeDatabaseConnection();
              setDbReconnectNonce((n) => n + 1);
              if (!probe.ok && probe.status !== 'connected') {
                setDbConnectionStatus(probe.status);
                setDbConnectionError(probe.message || null);
                showToast(probe.message || 'تعذر إعادة الاتصال بقاعدة البيانات');
              } else {
                showToast('تم إرسال طلب إعادة الاتصال بقاعدة بيانات Firestore');
              }
            }}
            hasDismissedStarters={hasDismissedStarters}
            requests={visitorRequests}
            usersList={usersList}
            adminsList={adminsList}
            siteSettings={siteSettings}
            imagePlaceholderConfig={imagePlaceholderConfig}
            siteThemeId={siteThemeId}
            onSiteThemeChange={(next) => setSiteThemeId(saveStoredSiteThemeId(next))}
            recentlyWatchedUiConfig={effectiveRecentlyWatchedUiConfig}
            recentlyWatchedItems={recentlyWatchedAllItems}
            onRecentlyWatchedUiChange={(next) => {
              const clean = saveStoredRecentlyWatchedUiConfig(next);
              setRecentlyWatchedPreviewOverride(null);
              setRecentlyWatchedUiConfig(clean);
            }}
            customFonts={customFonts}
            onCustomFontsChange={(next) => {
              saveStoredCustomFonts(next);
              setCustomFonts(next);
            }}
            onPopupShieldChange={(next) => {
              const clean = saveStoredPopupShieldConfig(next);
              setSiteSettings((prev) => ({ ...prev, popupShield: clean }));
            }}
            requestedTab={adminRequestedTab}
            onTabChange={handleAdminTabChange}
            onExitDashboard={navigateHome}
            onPreviewMedia={(item) => handleSelectMedia(item, false)}
            onDeleteStarterItems={handleDeleteStarterItems}
            onClearAllStarterItems={handleClearAllStarterItems}
            onRestoreStarterItems={handleRestoreStarterItems}
            onNotify={showToast}
          />
        </Suspense>

        {toastMessage && (
          <div
            role="status"
            className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-md z-[60] inline-flex items-center gap-2.5 rounded-2xl bg-[#4CAF50] px-4 py-3 text-xs sm:text-sm font-extrabold text-white shadow-2xl border border-white/20"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="leading-snug">{toastMessage}</span>
          </div>
        )}
      </>
    );
  }

  /* ---------------- Maintenance Mode Gate (Regular Visitors Blocked; Admins & Moderators Bypass) ---------------- */
  if (siteSettings.maintenanceMode && !canAccessAdmin) {
    if (authLoading) {
      return (
        <RunningRabbitLoader
          variant="fullscreen"
          label="جاري التحقق من الجلسة..."
          delayMs={100}
        />
      );
    }
    return (
      <div
        data-rtv-scope="site"
        data-site-theme={siteThemeId}
        data-site-light={siteThemeDef.isLight ? 'true' : undefined}
        style={siteThemeVars}
        className="rtv-site-root min-h-screen bg-[#0f0f0f] text-white"
      >
        <MaintenanceScreen
          siteName={effectiveBrandName}
          tagline={siteSettings.tagline}
          message={siteSettings.maintenanceMessage}
          branding={siteSettings.branding}
          onOpenAdminLogin={() => openOverlay('login')}
        />
        <LoginModal
          isOpen={loginOpen}
          onClose={() => closeTopOverlay()}
          firebaseUser={firebaseUser}
          isGuest={isGuest}
          isAdmin={canAccessAdmin}
          adminRole={effectiveAdminRole}
          onLogout={handleLogout}
          onContinueAsGuest={handleContinueAsGuest}
          onExitGuest={handleExitGuest}
          onOpenAdmin={() => openAdminPage()}
          onNotify={showToast}
        />
      </div>
    );
  }

  return (
    <div
      data-rtv-scope="site"
      data-site-theme={siteThemeId}
      data-site-light={siteThemeDef.isLight ? 'true' : undefined}
      style={siteThemeVars}
      className="rtv-site-root min-h-screen flex flex-col bg-[#0f0f0f] text-white overflow-x-clip"
    >
      {!clientCapabilities.baselineSupported && !compatBannerDismissed && (
        <div
          role="status"
          className="bg-[#1a242e] text-white border-b border-[#f9c400]/35 px-4 py-2 text-xs flex items-center justify-between gap-3 z-50"
        >
          <span className="inline-flex items-center gap-2 font-bold text-[#f9c400]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {clientCapabilities.baselineNotes[0] ||
                'إصدار المتصفح قديم نسبياً — يوصى بتحديثه للحصول على أفضل أداء وتشغيل فيديو.'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setCompatBannerDismissed(true)}
            aria-label="إغلاق تنبيه التوافق"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {siteSettings.maintenanceMode && canAccessAdmin && (
        <div className="bg-[#f9c400] text-[#0f0f0f] px-4 py-2 text-xs font-black flex flex-wrap items-center justify-center gap-3 z-50">
          <span className="inline-flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" />
            <span>
              {isOwnerAdmin
                ? 'وضع الصيانة مُفعّل حاليًا للزوار — الموقع متاح لك بصلاحية المسؤول'
                : 'وضع الصيانة مُفعّل حاليًا للزوار — الموقع متاح لك بصلاحية المشرف'}
            </span>
          </span>
          {isOwnerAdmin && (
            <button
              type="button"
              onClick={() => openAdminPage('settings')}
              className="rounded-lg bg-[#0f0f0f] text-white px-3 py-1 text-[11px] font-extrabold hover:bg-[#E50914] transition-colors cursor-pointer"
            >
              إدارة الإعدادات
            </button>
          )}
        </div>
      )}
      <Header
        catalog={activeCatalog}
        onNavigateHome={navigateHome}
        onSelectCategory={(category) => handleApplyFilter({ category })}
        onOpenSearch={() => openOverlay('search')}
        onOpenWatchlist={() => openOverlay('watchlist')}
        onOpenWatchHistory={() => openOverlay('watch_history')}
        onOpenContact={() => openOverlay('footer_topic', () => setFooterTopic('requests'))}
        onOpenLogin={() => openOverlay('login')}
        onOpenAdmin={() => openAdminPage()}
        onSelectMedia={handleSelectMedia}
        watchlistCount={watchlistItems.length}
        username={
          firebaseUser
            ? firebaseUser.displayName || firebaseUser.email || 'عضو'
            : isGuest
              ? 'ضيف'
              : null
        }
        userPhoto={firebaseUser?.photoURL || null}
        isGuest={isGuest}
        isAdmin={canAccessAdmin}
        activeCategory={filters.category}
        currentView={view}
        branding={siteSettings.branding}
        siteName={effectiveBrandName}
        mobileMenuOpen={mobileMenuOpen}
        onOpenMobileMenu={() => openOverlay('mobile_menu')}
        onCloseMobileMenu={() => closeTopOverlay()}
        iosGuideOpen={iosGuideOpen}
        onOpenIOSGuide={() => openOverlay('ios_guide')}
        onCloseIOSGuide={() => closeTopOverlay()}
      />

      <main className="flex-1">
        {view === 'home' && (
          <HomeView
            catalog={activeCatalog}
            siteSettings={siteSettings}
            isAdmin={isOwnerAdmin}
            loading={!initialMediaLoaded && activeCatalog.length === 0}
            loadError={
              initialMediaLoaded && activeCatalog.length === 0 ? dbConnectionError : null
            }
            onRetryLoad={() => setDbReconnectNonce((n) => n + 1)}
            onSelectMedia={handleSelectMedia}
            onApplyFilter={handleApplyFilter}
            onPlayNow={(item) =>
              openOverlay('player', () => setPlayerState({ item, episode: 1 }))
            }
            onOpenContact={() =>
              openOverlay('footer_topic', () => setFooterTopic('requests'))
            }
            onOpenHomeBuilder={() => openAdminPage('home_builder')}
            watchlistIds={watchlistIds}
            onToggleWatchlist={handleToggleWatchlist}
            recentlyWatchedSection={
              <RecentlyWatchedSection
                items={recentlyWatchedItems}
                catalog={activeCatalog}
                isSignedIn={Boolean(firebaseUser)}
                hideCompleted={effectiveHideCompleted}
                uiConfig={effectiveRecentlyWatchedUiConfig}
                onToggleHideCompleted={(next) => {
                  handleUpdateRecentlyWatchedPrefs({ hideCompleted: next });
                  if (!next && effectiveRecentlyWatchedUiConfig.hideCompleted) {
                    const updatedUi = normalizeRecentlyWatchedUiConfig({
                      ...effectiveRecentlyWatchedUiConfig,
                      hideCompleted: false,
                    });
                    if (rwPreviewOverride) {
                      setRecentlyWatchedPreviewOverride(updatedUi);
                    } else {
                      setRecentlyWatchedUiConfig(saveStoredRecentlyWatchedUiConfig(updatedUi));
                    }
                  }
                }}
                onResumeItem={handleResumeRecentlyWatched}
                onOpenDetails={handleOpenRecentlyWatchedDetails}
                onRemoveItem={(rec) => void handleRemoveRecentlyWatched(rec)}
                onOpenManager={() => openOverlay('watch_history')}
              />
            }
          />
        )}

        {view === 'archive' && (
          !initialMediaLoaded && activeCatalog.length === 0 ? (
            <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 pb-16">
              <RunningRabbitLoader
                variant="section"
                size="lg"
                label="جاري تحميل المكتبة..."
                delayMs={120}
              />
            </div>
          ) : (
            <CatalogArchiveView
              catalog={activeCatalog}
              filters={filters}
              currentPage={archivePage}
              pageSize={archivePageSize}
              sortOverride={archiveSort}
              cardStyle={siteSettings.homeConfig?.cardStyle || 'clean'}
              onUpdateFilters={(next) => handleUpdateArchiveFilters(next)}
              onSearchQueryChange={(q) =>
                handleUpdateArchiveFilters({ ...filters, query: q }, { replace: true })
              }
              onChangePage={handleChangeArchivePage}
              onChangePageSize={handleChangeArchivePageSize}
              onChangeSort={handleChangeArchiveSort}
              onResetFilters={handleResetArchiveFilters}
              onNavigateBack={navigateBackFromUI}
              onSelectMedia={handleSelectMedia}
              watchlistIds={watchlistIds}
              onToggleWatchlist={handleToggleWatchlist}
            />
          )
        )}

        {view === 'single' && (
          requestedWatchKey && !matchedSingleMedia ? (
            !initialMediaLoaded ? (
              <RunningRabbitLoader
                variant="fullscreen"
                label="جاري فتح العمل المطلوب..."
                delayMs={120}
              />
            ) : (
              <div className="mx-auto max-w-xl px-4 pt-32 pb-20 text-center space-y-5">
                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E50914]/15 border border-[#E50914]/40 text-[#ff8a88]">
                  <Compass className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
                    العمل المطلوب غير موجود
                  </h1>
                  <p className="text-sm text-[#b7c9ef] leading-relaxed">
                    قد يكون هذا العمل أُزيل من المكتبة أو أن الرابط غير مكتمل. يمكنك العودة للرئيسية أو تصفح الأقسام.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={navigateHome}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-5 py-2.5 text-xs font-extrabold text-white cursor-pointer"
                  >
                    <Home className="w-4 h-4" />
                    <span>العودة للرئيسية</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyFilter({})}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#181818] hover:bg-[#242424] border border-white/15 px-5 py-2.5 text-xs font-bold text-white cursor-pointer"
                  >
                    <span>تصفح جميع الأقسام</span>
                  </button>
                </div>
              </div>
            )
          ) : matchedSingleMedia ? (
            <SingleDetailView
              key={matchedSingleMedia.id}
              catalog={activeCatalog}
              item={matchedSingleMedia}
              initialEpisode={routeEpisode}
              initialOpenDownloads={openDownloadsOnSingle}
              cardStyle={siteSettings.homeConfig?.cardStyle || 'clean'}
              currentUser={firebaseUser}
              isGuest={isGuest}
              onOpenLogin={() => openOverlay('login')}
              onSelectMedia={handleSelectMedia}
              onSelectActor={handleSelectActor}
              onApplyFilter={handleApplyFilter}
              onNavigateHome={navigateHome}
              onNavigateBack={navigateBackFromUI}
              onSelectEpisode={handleSingleEpisodeChange}
              onOpenTrailer={(item) =>
                openOverlay('trailer', () => setTrailerItem(item))
              }
              onOpenPlayer={(item, ep = 1, srvIdx = 0) =>
                openOverlay('player', () =>
                  setPlayerState({ item, episode: ep, serverIndex: srvIdx })
                )
              }
              isInWatchlist={watchlistIds.includes(matchedSingleMedia.id)}
              onToggleWatchlist={handleToggleWatchlist}
              onNotify={showToast}
              watchlistIds={watchlistIds}
            />
          ) : null
        )}

        {view === 'actor' && (
          <ActorProfileView
            actorName={actorName}
            catalog={activeCatalog}
            cardStyle={siteSettings.homeConfig?.cardStyle || 'clean'}
            watchlistIds={watchlistIds}
            onToggleWatchlist={handleToggleWatchlist}
            onSelectMedia={handleSelectMedia}
            onNavigateBack={navigateBackFromUI}
            onNavigateHome={navigateHome}
          />
        )}

        {view === 'not_found' && (
          <div className="mx-auto max-w-xl px-4 pt-32 pb-20 text-center space-y-5">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f9c400]/15 border border-[#f9c400]/40 text-[#f9c400]">
              <Compass className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <p className="font-latin text-xs font-black tracking-widest text-[#f9c400]">404</p>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
                الصفحة غير موجودة
              </h1>
              <p className="text-sm text-[#b7c9ef] leading-relaxed">
                المسار المطلوب{notFoundPath ? ` (${notFoundPath})` : ''} غير متاح في الموقع.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={navigateHome}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#E50914] hover:bg-[#f40612] px-5 py-2.5 text-xs font-extrabold text-white cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>العودة للرئيسية</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplyFilter({})}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#181818] hover:bg-[#242424] border border-white/15 px-5 py-2.5 text-xs font-bold text-white cursor-pointer"
              >
                <span>تصفح الأقسام</span>
              </button>
            </div>
          </div>
        )}
      </main>

      <Footer
        tagline={siteSettings.tagline}
        branding={siteSettings.branding}
        siteName={effectiveBrandName}
        onOpenTopic={(topic) =>
          openOverlay('footer_topic', () => setFooterTopic(topic))
        }
        onNavigateHome={navigateHome}
      />

      {/* Overlays & Modals */}
      <SearchDrawer
        catalog={activeCatalog}
        isOpen={searchOpen}
        onClose={() => closeTopOverlay()}
        onSelectMedia={handleSelectMedia}
        onViewAllResults={(queryText, category) =>
          handleApplyFilter({ query: queryText, category })
        }
      />

      <WatchlistModal
        isOpen={watchlistOpen}
        onClose={() => closeTopOverlay()}
        items={watchlistItems}
        onSelectMedia={handleSelectMedia}
        onRemove={handleToggleWatchlist}
        onOpenWatchHistory={() => openOverlay('watch_history')}
      />

      <WatchHistoryManagerModal
        isOpen={watchHistoryOpen}
        onClose={() => closeTopOverlay()}
        items={recentlyWatchedAllItems}
        catalog={activeCatalog}
        isSignedIn={Boolean(firebaseUser)}
        prefs={recentlyWatchedPrefs}
        onUpdatePrefs={handleUpdateRecentlyWatchedPrefs}
        onResumeItem={handleResumeRecentlyWatched}
        onOpenDetails={handleOpenRecentlyWatchedDetails}
        onRemoveItem={handleRemoveRecentlyWatched}
        onClearAll={handleClearAllRecentlyWatched}
        onOpenLogin={() => openOverlay('login')}
      />

      <TrailerModal
        item={trailerItem}
        playerTheme={siteSettings.playerTheme}
        popupShieldConfig={siteSettings.popupShield}
        onClose={() => closeTopOverlay()}
        onWatchFull={(item) =>
          openOverlay('player', () => setPlayerState({ item, episode: 1 }))
        }
      />

      {playerState && (
        <PlayerModal
          item={playerState.item}
          initialEpisode={playerState.episode || 1}
          initialServerIndex={playerState.serverIndex || 0}
          playerTheme={siteSettings.playerTheme}
          popupShieldConfig={siteSettings.popupShield}
          onUpdateHostRule={handleUpdateHostRule}
          isInWatchlist={watchlistIds.includes(playerState.item.id)}
          onToggleWatchlist={handleToggleWatchlist}
          userId={activeWatchUserId}
          isSignedIn={Boolean(firebaseUser)}
          onRecentlyWatchedUpdated={() => setRecentlyWatchedTick((t) => t + 1)}
          onReportBrokenServers={handleReportBrokenServers}
          onNotify={showToast}
          onClose={() => closeTopOverlay()}
        />
      )}

      <LoginModal
        isOpen={loginOpen}
        onClose={() => closeTopOverlay()}
        firebaseUser={firebaseUser}
        isGuest={isGuest}
        isAdmin={canAccessAdmin}
        adminRole={effectiveAdminRole}
        onLogout={handleLogout}
        onContinueAsGuest={handleContinueAsGuest}
        onExitGuest={handleExitGuest}
        onOpenWatchHistory={() => openOverlay('watch_history')}
        onOpenAdmin={() => openAdminPage()}
        onNotify={showToast}
      />

      <FooterInfoModal
        topic={footerTopic}
        onClose={() => closeTopOverlay()}
        firebaseUser={firebaseUser}
        isGuest={isGuest}
        onOpenLogin={() => openOverlay('login')}
        requests={visitorRequests}
        onAddRequest={handleAddRequest}
      />

      {/* Green Bottom-Right Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 inset-x-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-md z-50 inline-flex items-center gap-2.5 rounded-2xl bg-[#4CAF50] px-4 py-3 text-xs sm:text-sm font-extrabold text-white shadow-2xl border border-white/20"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="leading-snug">{toastMessage}</span>
        </div>
      )}
      {/* Full-Screen Snappy Cinema Entry Transition */}
      {entryTransition && (
        <div
          key={entryTransition.key}
          aria-hidden="true"
          className="rtv-cinema-entry-overlay fixed inset-0 z-[95] pointer-events-none flex items-center justify-center overflow-hidden"
        >
          <div className="rtv-cinema-entry-curtain absolute inset-0 bg-[#0f0f0f]" />
          <div
            className="rtv-cinema-entry-backdrop absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110"
            style={{ backgroundImage: `url("${entryTransition.poster}")` }}
          />
          <div className="rtv-cinema-entry-beam absolute inset-0" />
          <div className="rtv-cinema-entry-stage relative z-10 flex flex-col items-center gap-3 px-6 text-center">
            <div className="rtv-cinema-entry-ring relative w-32 sm:w-40 aspect-[2/3] overflow-hidden rounded-2xl border-2 border-[#E50914] bg-[#181818] shadow-[0_24px_64px_rgba(229,9,20,0.45)]">
              <img
                src={entryTransition.poster}
                alt=""
                draggable={false}
                className="h-full w-full object-cover object-top pointer-events-none select-none"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
            </div>
            <div className="space-y-1 max-w-xs">
              <div className="flex items-center justify-center gap-2 text-[11px] font-black">
                <span className="font-latin rounded bg-[#E50914] px-2 py-0.5 text-white">
                  {entryTransition.quality}
                </span>
                <span className="font-latin text-[#a3a3a3]">{entryTransition.year}</span>
              </div>
              <p className="font-display text-base sm:text-lg font-black text-white line-clamp-1 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                {entryTransition.title}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Offline Connectivity Indicator */}
      <OfflineIndicator />
    </div>
  );
}
