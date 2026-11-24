import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  buildDynamicFilterOptions,
  filterAndSortCatalog,
  matchesCategoryFilter,
  normalizeArabicText,
} from '../lib/mediaFilters';
import type { ArchiveSortOption } from '../lib/router';
import { CatalogFilterState, MediaItem } from '../types/media';
import { MovieCard } from './MovieCard';

interface CatalogArchiveViewProps {
  catalog: MediaItem[];
  filters: CatalogFilterState;
  currentPage?: number;
  pageSize?: number;
  sortOverride?: ArchiveSortOption;
  onUpdateFilters: (next: CatalogFilterState) => void;
  onSearchQueryChange?: (query: string) => void;
  onChangePage?: (page: number) => void;
  onChangePageSize?: (pageSize: number) => void;
  onChangeSort?: (sort: ArchiveSortOption) => void;
  onResetFilters: () => void;
  onNavigateBack?: () => void;
  onSelectMedia: (item: MediaItem, openDownloads?: boolean) => void;
  watchlistIds: string[];
  onToggleWatchlist: (item: MediaItem) => void;
}

const SECTION_TABS = [
  { label: 'كل الأقسام', category: '' },
  { label: 'الأفلام', category: 'افلام' },
  { label: 'أفلام أجنبية', category: 'افلام اجنبية' },
  { label: 'أفلام عربية', category: 'افلام عربية' },
  { label: 'أفلام كرتون', category: 'افلام كرتون' },
  { label: 'المسلسلات', category: 'مسلسلات' },
  { label: 'مسلسلات أجنبية', category: 'مسلسلات اجنبية' },
  { label: 'مسلسلات عربية', category: 'مسلسلات عربية' },
  { label: 'رمضان 2026', category: 'رمضان 2026' },
  { label: 'عروض تلفزيونية', category: 'عروض تلفزيونية' },
  { label: 'مصارعة حرة', category: 'مصارعة حرة' },
];

function getPaginationNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('ellipsis');
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

export function CatalogArchiveView({
  catalog,
  filters,
  currentPage: controlledPage,
  pageSize: controlledPageSize,
  sortOverride: controlledSortOverride,
  onUpdateFilters,
  onSearchQueryChange,
  onChangePage,
  onChangePageSize,
  onChangeSort,
  onResetFilters,
  onNavigateBack,
  onSelectMedia,
  watchlistIds,
  onToggleWatchlist,
}: CatalogArchiveViewProps) {
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState<number>(24);
  const [internalSortOverride, setInternalSortOverride] = useState<ArchiveSortOption>(
    filters.preset || 'latest'
  );

  const isControlledPage = typeof controlledPage === 'number';
  const currentPage = isControlledPage ? Math.max(1, controlledPage) : internalPage;
  const pageSize = typeof controlledPageSize === 'number' ? controlledPageSize : internalPageSize;
  const sortOverride = controlledSortOverride ?? internalSortOverride;

  useEffect(() => {
    if (!controlledSortOverride) {
      setInternalSortOverride(filters.preset || 'latest');
    }
  }, [filters.preset, controlledSortOverride]);

  // Reset to page 1 only in uncontrolled mode (controlled mode tracks page in router history)
  useEffect(() => {
    if (!isControlledPage) {
      setInternalPage(1);
    }
  }, [
    isControlledPage,
    filters.query,
    filters.category,
    filters.genre,
    filters.year,
    filters.country,
    filters.language,
    filters.quality,
    filters.minImdb,
    filters.preset,
    sortOverride,
    pageSize,
    catalog.length,
  ]);

  const dynamicOptions = useMemo(() => buildDynamicFilterOptions(catalog), [catalog]);

  const filtered = useMemo(
    () => filterAndSortCatalog(catalog, filters, sortOverride),
    [catalog, filters, sortOverride]
  );

  const sectionCounts = useMemo(
    () =>
      SECTION_TABS.map((tab) => ({
        ...tab,
        count: tab.category
          ? catalog.filter((item) => matchesCategoryFilter(item, tab.category)).length
          : catalog.length,
      })),
    [catalog]
  );

  const effectivePageSize = pageSize === 0 ? Math.max(filtered.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * effectivePageSize;
  const paginatedItems = filtered.slice(startIdx, startIdx + effectivePageSize);

  const goToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page));
    if (onChangePage) {
      onChangePage(clamped);
    } else {
      setInternalPage(clamped);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageSizeChange = (nextSize: number) => {
    if (onChangePageSize) {
      onChangePageSize(nextSize);
    } else {
      setInternalPageSize(nextSize);
    }
  };

  const handleSortChange = (val: ArchiveSortOption) => {
    if (onChangeSort) {
      onChangeSort(val);
      return;
    }
    setInternalSortOverride(val);
    if (val === 'year') {
      onUpdateFilters({ ...filters, preset: '' });
    } else {
      onUpdateFilters({
        ...filters,
        preset: val as CatalogFilterState['preset'],
      });
    }
  };

  const activeHeading =
    filters.category ||
    (filters.genre ? `نوع: ${filters.genre}` : '') ||
    (filters.minImdb > 0 ? `أفلام ومسلسلات بتقييم +${filters.minImdb}` : '') ||
    (filters.query ? `نتائج البحث عن: "${filters.query}"` : 'تصفح مكتبة RahaL TV الكاملة');

  const activeCatNorm = normalizeArabicText(filters.category);
  const pageNumbers = getPaginationNumbers(safePage, totalPages);

  return (
    <div className="mx-auto max-w-[1440px] px-3.5 sm:px-6 lg:px-8 pt-20 sm:pt-24 md:pt-28 pb-12 space-y-4 sm:space-y-6">
      {/* Header & Active Filter Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl sm:rounded-3xl bg-[#1a242e] border border-white/[0.08] p-4 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            {onNavigateBack && (
              <button
                type="button"
                onClick={onNavigateBack}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0c1821] hover:bg-[#D92321] border border-white/10 px-3 py-1.5 text-xs font-extrabold text-white transition-colors cursor-pointer shrink-0"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>رجوع</span>
              </button>
            )}
            <div className="inline-flex items-center gap-2 text-xs font-extrabold text-[#D92321]">
              <SlidersHorizontal className="w-4 h-4 shrink-0" />
              <span>محرك التصفية المتقدم (RahaL TV Filter)</span>
            </div>
          </div>
          <h1 className="font-display text-xl sm:text-3xl font-extrabold text-white leading-snug">
            {activeHeading}
          </h1>
          <p className="text-xs text-[#b7c9ef] mt-1">
            إجمالي النتائج المطابقة:{' '}
            <span className="font-latin font-bold text-white">{filtered.length}</span> عمل
            {filtered.length > 0 && totalPages > 1 && (
              <>
                {' '}
                • عرض{' '}
                <span className="font-latin font-bold text-white">
                  {startIdx + 1}–{Math.min(startIdx + effectivePageSize, filtered.length)}
                </span>{' '}
                (صفحة <span className="font-latin font-bold text-[#f9c400]">{safePage}</span> من{' '}
                <span className="font-latin font-bold text-white">{totalPages}</span>)
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 w-full sm:w-auto sm:self-center">
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            aria-label="عدد العناصر في الصفحة"
            className="min-h-[44px] rounded-xl bg-[#0c1821] border border-white/10 px-3 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none cursor-pointer"
          >
            <option value={24}>24 في الصفحة</option>
            <option value={48}>48 في الصفحة</option>
            <option value={0}>عرض الكل ({filtered.length})</option>
          </select>

          <button
            type="button"
            onClick={() => {
              if (!onChangeSort) setInternalSortOverride('latest');
              onResetFilters();
            }}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0c1821] hover:bg-[#D92321] border border-white/10 px-3.5 sm:px-4 py-2.5 text-xs font-extrabold text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>إعادة الضبط</span>
          </button>
        </div>
      </div>

      {/* Quick Section Switcher Strip with Live Counts */}
      <div className="rounded-2xl bg-[#0c1821] border border-white/[0.08] p-3.5 sm:p-4">
        <div className="flex items-center gap-2 mb-2.5 px-0.5 text-xs font-extrabold text-[#b7c9ef]">
          <Layers className="w-4 h-4 text-[#D92321]" />
          <span>الأقسام السريعة:</span>
        </div>
        <div className="flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap gap-2 pb-1 sm:pb-0">
          {sectionCounts.map((tab) => {
            const isActive =
              tab.category === ''
                ? !activeCatNorm
                : activeCatNorm === normalizeArabicText(tab.category);
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => onUpdateFilters({ ...filters, category: tab.category })}
                className={`inline-flex min-h-[40px] sm:min-h-0 shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer border ${
                  isActive
                    ? 'bg-[#D92321] border-[#D92321] text-white shadow-md'
                    : 'bg-[#1a242e] border-white/[0.07] text-[#b7c9ef] hover:text-white hover:border-[#D92321]/60'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-latin rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                    isActive ? 'bg-black/25 text-white' : 'bg-[#0c1821] text-white/80'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Multi-Dropdown Filter Controls (dynamically enriched from live catalog) */}
      <div className="rounded-2xl sm:rounded-3xl bg-[#0c1821] border border-white/[0.08] p-3.5 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5 sm:gap-3">
          {/* Text Search */}
          <div className="relative col-span-2 xl:col-span-2">
            <Search className="w-4 h-4 text-[#D92321] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => {
                if (onSearchQueryChange) onSearchQueryChange(e.target.value);
                else onUpdateFilters({ ...filters, query: e.target.value });
              }}
              placeholder="بحث بالكلمة..."
              className="w-full min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 pr-10 pl-3 py-2.5 text-xs font-bold text-white placeholder:text-[#b7c9ef]/50 focus:border-[#D92321] focus:outline-none"
            />
          </div>

          <select
            value={filters.category}
            onChange={(e) => onUpdateFilters({ ...filters, category: e.target.value })}
            aria-label="التصنيف"
            className="min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
          >
            <option value="">كل التصنيفات</option>
            {dynamicOptions.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={filters.genre}
            onChange={(e) => onUpdateFilters({ ...filters, genre: e.target.value })}
            aria-label="النوع"
            className="min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
          >
            <option value="">كل الأنواع</option>
            {dynamicOptions.genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>

          <select
            value={filters.year}
            onChange={(e) => onUpdateFilters({ ...filters, year: e.target.value })}
            aria-label="السنة"
            className="min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
          >
            <option value="">كل السنوات</option>
            {dynamicOptions.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            value={filters.country}
            onChange={(e) => onUpdateFilters({ ...filters, country: e.target.value })}
            aria-label="البلد"
            className="min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
          >
            <option value="">كل الدول</option>
            {dynamicOptions.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={filters.quality}
            onChange={(e) => onUpdateFilters({ ...filters, quality: e.target.value })}
            aria-label="الجودة"
            className="min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
          >
            <option value="">كل الجودات</option>
            {dynamicOptions.qualities.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>

          <select
            value={sortOverride}
            onChange={(e) => handleSortChange(e.target.value as ArchiveSortOption)}
            aria-label="الترتيب"
            className="min-h-[44px] rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-xs font-bold text-white focus:border-[#D92321] focus:outline-none"
          >
            <option value="latest">الترتيب: الأحدث إضافة</option>
            <option value="year">الأحدث سنة إنتاج</option>
            <option value="rating">الأعلى تقييمًا (تقييم المشاهدين)</option>
            <option value="views">الأكثر مشاهدة</option>
            <option value="likes">الأكثر إعجابًا</option>
            <option value="pinned">العروض المثبتة فقط</option>
          </select>
        </div>
      </div>

      {/* Results Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-[#0c1821] py-16 sm:py-20 text-center px-6">
          <Filter className="w-12 h-12 text-[#b7c9ef]/30 mb-3" />
          <p className="text-lg font-extrabold text-white mb-1">لم يتم العثور على أعمال مطابقة</p>
          <p className="text-xs text-[#b7c9ef] mb-5">جرّب تخفيف شروط الفلترة أو إعادة الضبط.</p>
          <button
            type="button"
            onClick={() => {
              if (!onChangeSort) setInternalSortOverride('latest');
              onResetFilters();
            }}
            className="min-h-[44px] rounded-xl bg-[#D92321] px-5 py-2.5 text-xs font-extrabold text-white cursor-pointer"
          >
            عرض كل المكتبة ({catalog.length})
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {paginatedItems.map((item, idx) => (
              <MovieCard
                key={`${item.id}::${item.poster_url || item.poster || ''}`}
                item={item}
                onSelect={onSelectMedia}
                isInWatchlist={watchlistIds.includes(item.id)}
                onToggleWatchlist={onToggleWatchlist}
                priority={idx < 6}
              />
            ))}
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <nav
              aria-label="التنقل بين صفحات المكتبة"
              className="flex flex-col sm:flex-row items-center justify-between gap-3.5 sm:gap-4 rounded-2xl bg-[#0c1821] border border-white/[0.08] px-4 sm:px-5 py-4"
            >
              <p className="text-xs font-bold text-[#b7c9ef]">
                صفحة <span className="font-latin text-white">{safePage}</span> من{' '}
                <span className="font-latin text-white">{totalPages}</span> • عرض{' '}
                <span className="font-latin text-white">
                  {startIdx + 1}–{Math.min(startIdx + effectivePageSize, filtered.length)}
                </span>{' '}
                من <span className="font-latin text-[#f9c400]">{filtered.length}</span> عمل
              </p>

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => goToPage(safePage - 1)}
                  className="inline-flex h-10 sm:h-9 items-center gap-1 rounded-xl bg-[#1a242e] border border-white/10 px-3 text-xs font-bold text-white disabled:opacity-40 hover:bg-[#D92321] hover:border-[#D92321] transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>السابق</span>
                </button>

                {pageNumbers.map((page, idx) =>
                  page === 'ellipsis' ? (
                    <span key={`el-${idx}`} className="px-1.5 text-xs font-bold text-[#b7c9ef]">
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      type="button"
                      onClick={() => goToPage(page)}
                      className={`font-latin inline-flex h-10 min-w-10 sm:h-9 sm:min-w-9 items-center justify-center rounded-xl border px-2.5 text-xs font-black transition-colors cursor-pointer ${
                        page === safePage
                          ? 'bg-[#D92321] border-[#D92321] text-white shadow-md'
                          : 'bg-[#1a242e] border-white/10 text-[#b7c9ef] hover:text-white hover:border-white/30'
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => goToPage(safePage + 1)}
                  className="inline-flex h-10 sm:h-9 items-center gap-1 rounded-xl bg-[#1a242e] border border-white/10 px-3 text-xs font-bold text-white disabled:opacity-40 hover:bg-[#D92321] hover:border-[#D92321] transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
