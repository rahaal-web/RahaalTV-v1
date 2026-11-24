import { useEffect, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  Clapperboard,
  Film,
  History,
  Home,
  LayoutDashboard,
  LayoutGrid,
  Mail,
  Menu,
  Search,
  Tv,
  User as UserIcon,
  X,
} from 'lucide-react';
import { NAV_ITEMS } from '../data/catalog';
import { matchesCategoryFilter, normalizeArabicText } from '../lib/mediaFilters';
import { MediaItem, WebsiteBrandingConfig } from '../types/media';
import { Logo } from './Logo';
import { PWAInstallButton } from './PWAControls';

interface HeaderProps {
  catalog: MediaItem[];
  onNavigateHome: () => void;
  onSelectCategory: (category: string) => void;
  onOpenSearch: () => void;
  onOpenWatchlist: () => void;
  onOpenWatchHistory?: () => void;
  onOpenContact: () => void;
  onOpenLogin: () => void;
  onOpenAdmin: () => void;
  onSelectMedia: (item: MediaItem) => void;
  watchlistCount: number;
  username: string | null;
  userPhoto: string | null;
  isGuest?: boolean;
  isAdmin: boolean;
  activeCategory: string;
  currentView: 'home' | 'archive' | 'single' | 'admin' | 'not_found';
  branding?: WebsiteBrandingConfig;
  siteName?: string;
  mobileMenuOpen?: boolean;
  onOpenMobileMenu?: () => void;
  onCloseMobileMenu?: () => void;
  iosGuideOpen?: boolean;
  onOpenIOSGuide?: () => void;
  onCloseIOSGuide?: () => void;
}

export function Header({
  catalog,
  onNavigateHome,
  onSelectCategory,
  onOpenSearch,
  onOpenWatchlist,
  onOpenWatchHistory,
  onOpenContact,
  onOpenLogin,
  onOpenAdmin,
  watchlistCount,
  username,
  userPhoto,
  isGuest = false,
  isAdmin,
  activeCategory,
  currentView,
  branding,
  siteName,
  mobileMenuOpen: controlledMobileMenuOpen,
  onOpenMobileMenu,
  onCloseMobileMenu,
  iosGuideOpen,
  onOpenIOSGuide,
  onCloseIOSGuide,
}: HeaderProps) {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [internalMobileMenuOpen, setInternalMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const isControlledMenu = typeof controlledMobileMenuOpen === 'boolean';
  const mobileMenuOpen = isControlledMenu
    ? Boolean(controlledMobileMenuOpen)
    : internalMobileMenuOpen;

  const openMobileMenu = () => {
    if (onOpenMobileMenu) {
      onOpenMobileMenu();
    } else {
      setInternalMobileMenuOpen(true);
    }
  };

  const closeMobileMenu = () => {
    if (onCloseMobileMenu) {
      onCloseMobileMenu();
    } else {
      setInternalMobileMenuOpen(false);
    }
  };

  const dismissUncontrolledMenu = () => {
    if (!isControlledMenu) {
      setInternalMobileMenuOpen(false);
    }
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (onCloseMobileMenu) onCloseMobileMenu();
        else setInternalMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen, onCloseMobileMenu]);

  const activeNorm = normalizeArabicText(activeCategory);
  const isMoviesActive =
    currentView === 'archive' && activeNorm.includes(normalizeArabicText('افلام'));
  const isSeriesActive =
    currentView === 'archive' && activeNorm.includes(normalizeArabicText('مسلسلات'));

  const categoryMenuItems = NAV_ITEMS.filter((item) => item.id !== 'home');
  const countCategory = (category?: string) =>
    category ? catalog.filter((item) => matchesCategoryFilter(item, category)).length : catalog.length;

  const isLogoHidden = branding?.logoMode === 'hidden';
  const isCenterBrand = branding?.headerAlign === 'center' && !isLogoHidden;
  const resolvedBrandName = branding?.siteName || siteName || 'RahaL TV';

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 h-16 sm:h-[70px] transition-all duration-200 ${
          scrolled
            ? 'bg-[#0f0f0f]/95 backdrop-blur-md border-b border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.65)]'
            : 'bg-gradient-to-b from-[#0f0f0f]/95 via-[#0f0f0f]/75 to-transparent border-b border-white/[0.04]'
        }`}
      >
        <div
          className={`mx-auto flex h-full max-w-[1440px] items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6 lg:px-8 ${
            isCenterBrand ? 'lg:grid lg:grid-cols-[1fr_auto_1fr]' : ''
          }`}
        >
          {/* Zone 1: Brand Wordmark */}
          {!isLogoHidden && (
            <button
              type="button"
              onClick={onNavigateHome}
              className={`focus:outline-none cursor-pointer shrink-0 min-w-0 max-w-[44vw] sm:max-w-none overflow-hidden ${
                isCenterBrand ? 'lg:order-2 lg:justify-self-center' : ''
              }`}
              aria-label={`العودة إلى الرئيسية - ${resolvedBrandName}`}
            >
              <Logo size="md" branding={branding} fallbackSiteName={resolvedBrandName} />
            </button>
          )}

          {/* Zone 2: Clean Single-Line Navigation Links */}
          <nav
            className={`hidden lg:flex items-center gap-6 ${
              isCenterBrand ? 'lg:order-1 lg:justify-self-start' : ''
            }`}
            aria-label="التنقل الرئيسي"
          >
            <button
              type="button"
              onClick={onNavigateHome}
              className={`relative py-2 text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                currentView === 'home' ? 'text-white' : 'text-[#a3a3a3] hover:text-white'
              }`}
            >
              <span>الرئيسية</span>
              {currentView === 'home' && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#E50914]" />
              )}
            </button>

            <div
              className="relative"
              onMouseEnter={() => setSectionsOpen(true)}
              onMouseLeave={() => setSectionsOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('');
                  setSectionsOpen(false);
                }}
                className={`inline-flex items-center gap-1 py-2 text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  currentView === 'archive' && !activeCategory
                    ? 'text-white'
                    : 'text-[#a3a3a3] hover:text-white'
                }`}
              >
                <span>الأقسام</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    sectionsOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {sectionsOpen && (
                <div className="absolute right-0 top-full pt-2 w-[460px] z-50">
                  <div className="rounded-2xl bg-[#181818] border border-white/10 p-4 shadow-2xl grid grid-cols-2 gap-3">
                    {categoryMenuItems.map((group) => (
                      <div key={group.id} className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (group.category) onSelectCategory(group.category);
                            setSectionsOpen(false);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-white hover:bg-[#E50914] transition-colors cursor-pointer"
                        >
                          <span>{group.label}</span>
                          {group.category && (
                            <span className="font-latin text-[10px] opacity-75 tabular-nums">
                              {countCategory(group.category)}
                            </span>
                          )}
                        </button>
                        {group.subItems && (
                          <div className="space-y-0.5 pr-1">
                            {group.subItems.map((sub) => (
                              <button
                                key={sub.category}
                                type="button"
                                onClick={() => {
                                  onSelectCategory(sub.category);
                                  setSectionsOpen(false);
                                }}
                                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-right text-xs font-medium text-[#a3a3a3] hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                              >
                                <span>{sub.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSelectCategory('افلام')}
              className={`relative py-2 text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isMoviesActive ? 'text-white' : 'text-[#a3a3a3] hover:text-white'
              }`}
            >
              <span>الأفلام</span>
              {isMoviesActive && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#E50914]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectCategory('مسلسلات')}
              className={`relative py-2 text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isSeriesActive ? 'text-white' : 'text-[#a3a3a3] hover:text-white'
              }`}
            >
              <span>المسلسلات</span>
              {isSeriesActive && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#E50914]" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenContact}
              className="py-2 text-sm font-bold text-[#a3a3a3] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              اتصل بنا
            </button>
          </nav>

          {/* Zone 3: Quick Search + Primary Controls */}
          <div
            className={`flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              isCenterBrand ? 'lg:order-3 lg:justify-self-end' : ''
            }`}
          >
            <div className="hidden sm:inline-flex">
              <PWAInstallButton
                variant="header"
                guideOpen={iosGuideOpen}
                onOpenGuide={onOpenIOSGuide}
                onCloseGuide={onCloseIOSGuide}
              />
            </div>
            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="بحث سريع"
              className="inline-flex h-10 sm:h-10 w-10 sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#181818] border border-white/10 sm:px-3.5 text-xs sm:text-sm font-semibold text-[#e5e5e5] hover:border-[#E50914]/70 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Search className="w-4 h-4 text-[#E50914] shrink-0" />
              <span className="hidden md:inline">بحث سريع</span>
            </button>

            <button
              type="button"
              onClick={onOpenWatchlist}
              aria-label="قائمتي"
              className="relative inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#181818] border border-white/10 px-2.5 sm:px-3 text-xs sm:text-sm font-semibold text-[#e5e5e5] hover:border-white/25 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Bookmark className="w-4 h-4 text-[#f9c400] shrink-0" />
              <span className="hidden xl:inline">قائمتي</span>
              {watchlistCount > 0 && (
                <span className="font-latin inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-[#E50914] px-1 text-[10px] font-black text-white tabular-nums">
                  {watchlistCount}
                </span>
              )}
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                aria-label="لوحة التحكم"
                className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  currentView === 'admin'
                    ? 'bg-[#f9c400] border-[#f9c400] text-[#0f0f0f]'
                    : 'bg-[#f9c400]/15 border-[#f9c400]/40 text-[#f9c400] hover:bg-[#f9c400] hover:text-[#0f0f0f]'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">الإدارة</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenLogin}
              aria-label={isGuest ? 'حساب الضيف' : 'حسابي'}
              className={`inline-flex h-10 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2.5 sm:px-3.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                isGuest
                  ? 'bg-[#202020] hover:bg-[#2a2a2a] border border-white/15 text-white'
                  : 'bg-[#E50914] hover:bg-[#f40612] text-white'
              }`}
            >
              {userPhoto ? (
                <img
                  src={userPhoto}
                  alt={username || 'حسابي'}
                  loading="eager"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-5 w-5 rounded-full object-cover border border-white/40 shrink-0"
                />
              ) : (
                <UserIcon className={`w-4 h-4 shrink-0 ${isGuest ? 'text-[#f9c400]' : ''}`} />
              )}
              <span className={`${isGuest ? 'hidden sm:inline' : 'hidden md:inline'} max-w-[100px] truncate`}>
                {username || 'دخول'}
              </span>
            </button>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={openMobileMenu}
              aria-label="فتح القائمة الجانبية"
              className="inline-flex lg:hidden h-10 w-10 items-center justify-center rounded-xl bg-[#181818] border border-white/10 text-white hover:border-white/30 cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Hamburger Drawer (One-Handed Friendly RTL) */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="القائمة الجانبية"
          data-rtv-focus-trap="true"
          className="fixed inset-0 z-50 flex lg:hidden"
        >
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={closeMobileMenu}
          />
          <div className="relative z-10 flex h-full w-80 max-w-[88vw] flex-col bg-[#141414] border-l border-white/10 p-4 sm:p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
              {!isLogoHidden ? (
                <Logo size="sm" showSubtitle branding={branding} fallbackSiteName={resolvedBrandName} />
              ) : (
                <span className="font-display text-sm font-extrabold text-white">{resolvedBrandName}</span>
              )}
              <button
                type="button"
                onClick={closeMobileMenu}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#202020] text-white hover:bg-[#E50914] transition-colors cursor-pointer"
                aria-label="إغلاق القائمة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Account / Guest Status Strip */}
            <button
              type="button"
              onClick={() => {
                dismissUncontrolledMenu();
                onOpenLogin();
              }}
              className="mb-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-[#1c1c1c] border border-white/10 px-3.5 py-2 text-xs font-bold text-white hover:border-[#E50914]/60 cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 truncate">
                <UserIcon className={`w-4 h-4 shrink-0 ${isGuest ? 'text-[#f9c400]' : 'text-[#E50914]'}`} />
                <span className="truncate">
                  {isGuest ? 'الحالة: ضيف' : username ? `مرحباً، ${username}` : 'تسجيل الدخول أو المتابعة كضيف'}
                </span>
              </span>
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-[#f9c400] shrink-0">
                {isGuest ? 'إدارة' : username ? 'حسابي' : 'دخول'}
              </span>
            </button>

            {/* Quick Mobile Search Trigger */}
            <button
              type="button"
              onClick={() => {
                dismissUncontrolledMenu();
                onOpenSearch();
              }}
              className="mb-4 flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-[#202020] border border-white/10 px-4 text-sm font-bold text-[#a3a3a3] hover:text-white cursor-pointer"
            >
              <Search className="w-4 h-4 text-[#E50914]" />
              <span>ابحث عن فيلم أو مسلسل...</span>
            </button>

            {/* Primary Mobile Links */}
            <div className="space-y-1.5 mb-5">
              <button
                type="button"
                onClick={() => {
                  dismissUncontrolledMenu();
                  onNavigateHome();
                }}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-bold transition-colors cursor-pointer ${
                  currentView === 'home'
                    ? 'bg-[#E50914] text-white'
                    : 'bg-[#1c1c1c] text-white hover:bg-[#262626]'
                }`}
              >
                <Home className="w-4 h-4" />
                <span>الرئيسية</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  dismissUncontrolledMenu();
                  onSelectCategory('افلام');
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-[#1c1c1c] px-3.5 text-sm font-bold text-white hover:bg-[#262626] transition-colors cursor-pointer"
              >
                <Film className="w-4 h-4 text-[#E50914]" />
                <span>الأفلام</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  dismissUncontrolledMenu();
                  onSelectCategory('مسلسلات');
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-[#1c1c1c] px-3.5 text-sm font-bold text-white hover:bg-[#262626] transition-colors cursor-pointer"
              >
                <Tv className="w-4 h-4 text-[#E50914]" />
                <span>المسلسلات</span>
              </button>

              {onOpenWatchHistory && (
                <button
                  type="button"
                  onClick={() => {
                    dismissUncontrolledMenu();
                    onOpenWatchHistory();
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-[#1c1c1c] px-3.5 text-sm font-bold text-white hover:bg-[#262626] transition-colors cursor-pointer"
                >
                  <History className="w-4 h-4 text-[#f9c400]" />
                  <span>شاهدته مؤخراً (سجل المشاهدة)</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  dismissUncontrolledMenu();
                  onOpenContact();
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-[#1c1c1c] px-3.5 text-sm font-bold text-white hover:bg-[#262626] transition-colors cursor-pointer"
              >
                <Mail className="w-4 h-4 text-[#4CAF50]" />
                <span>اتصل بنا / اطلب عملاً</span>
              </button>
            </div>

            {/* Categories Sub-grid */}
            <div className="space-y-3 mb-5">
              <p className="text-xs font-bold text-[#a3a3a3] px-1">جميع الأقسام</p>
              {categoryMenuItems.map((item) => (
                <div key={item.id} className="rounded-xl bg-[#1a1a1a] border border-white/[0.06] p-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      dismissUncontrolledMenu();
                      if (item.category) onSelectCategory(item.category);
                    }}
                    className="flex min-h-10 w-full items-center justify-between px-2 text-sm font-bold text-white cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Clapperboard className="w-3.5 h-3.5 text-[#E50914]" />
                      {item.label}
                    </span>
                  </button>
                  {item.subItems && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {item.subItems.map((sub) => (
                        <button
                          key={sub.category}
                          type="button"
                          onClick={() => {
                            dismissUncontrolledMenu();
                            onSelectCategory(sub.category);
                          }}
                          className="min-h-11 rounded-lg bg-[#242424] px-2.5 py-2 text-right text-xs font-medium text-[#d4d4d4] hover:bg-[#E50914] hover:text-white transition-colors cursor-pointer truncate"
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <PWAInstallButton
              variant="drawer"
              guideOpen={iosGuideOpen}
              onOpenGuide={onOpenIOSGuide}
              onCloseGuide={onCloseIOSGuide}
              onAfterClick={dismissUncontrolledMenu}
            />

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  dismissUncontrolledMenu();
                  onOpenAdmin();
                }}
                className="mt-auto flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#f9c400] text-xs font-black text-[#0f0f0f] cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>لوحة التحكم</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compact Mobile Bottom Nav Bar (<= 10% viewport height, safe-area aware) */}
      <nav
        aria-label="تنقل الجوال السريع"
        className="fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 min-h-[58px] pb-[env(safe-area-inset-bottom,0px)] bg-[#0f0f0f]/95 backdrop-blur-md border-t border-white/10 sm:hidden"
      >
        <button
          type="button"
          onClick={onNavigateHome}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold cursor-pointer ${
            currentView === 'home' ? 'text-white' : 'text-[#a3a3a3]'
          }`}
        >
          <Home className={`w-4 h-4 ${currentView === 'home' ? 'text-[#E50914]' : ''}`} />
          <span>الرئيسية</span>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold text-[#a3a3a3] cursor-pointer"
        >
          <Search className="w-4 h-4" />
          <span>البحث</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectCategory('')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold cursor-pointer ${
            currentView === 'archive' ? 'text-white' : 'text-[#a3a3a3]'
          }`}
        >
          <LayoutGrid className={`w-4 h-4 ${currentView === 'archive' ? 'text-[#E50914]' : ''}`} />
          <span>الأقسام</span>
        </button>
        <button
          type="button"
          onClick={onOpenWatchlist}
          className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold text-[#a3a3a3] cursor-pointer"
        >
          <span className="relative inline-flex">
            <Bookmark className="w-4 h-4 text-[#f9c400]" />
            {watchlistCount > 0 && (
              <span className="font-latin absolute -top-1.5 -left-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E50914] px-1 text-[9px] font-black text-white tabular-nums">
                {watchlistCount}
              </span>
            )}
          </span>
          <span>قائمتي</span>
        </button>
        <button
          type="button"
          onClick={openMobileMenu}
          className="flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-bold text-[#a3a3a3] cursor-pointer"
        >
          <Menu className="w-4 h-4" />
          <span>القائمة</span>
        </button>
      </nav>
    </>
  );
}
