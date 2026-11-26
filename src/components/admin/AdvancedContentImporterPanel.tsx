import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Code2,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  FileSpreadsheet,
  Film,
  FolderOpen,
  Globe,
  HardDrive,
  History,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  Search,
  Sliders,
  Square,
  StopCircle,
  Trash2,
  X,
} from 'lucide-react';
import {
  buildCatalogLookupMaps,
  controlImporterJobApi,
  deleteImporterJobApi,
  detectMovieDuplicate,
  downloadJobExportApi,
  extractSingleMovieApi,
  fetchSourceIndexApi,
  getImporterJobApi,
  getPaginatedJobItemsApi,
  getSavedActiveImporterJobId,
  listImporterJobsApi,
  saveImportedBatchToCatalog,
  saveSingleImportedMovieToCatalog,
  setSavedActiveImporterJobId,
  startBulkImporterJobApi,
  updateJobItemsStatusApi,
} from '../../lib/advancedImporterClient';
import { formatFirestoreWriteError } from '../../lib/firebase';
import type { MediaItem, MediaKind } from '../../types/media';
import type {
  AdvancedImportedMovie,
  DuplicateMatchInfo,
  ImporterDiscoveryMode,
  ImporterDuplicateMode,
  ImporterJobConfig,
  ImporterJobItemStatus,
  ImporterJobResultRecord,
  ImporterJobSummary,
  ImporterPaginatedItemsResponse,
  SourceIndexEntry,
} from '../../types/advancedImporter';
import { AdvancedImporterPreviewModal } from './AdvancedImporterPreviewModal';

interface AdvancedContentImporterPanelProps {
  user: User | null;
  catalog: MediaItem[];
  customApiUrl?: string;
  onNotify: (message: string) => void;
}

type ImporterMainMode = 'single' | 'bulk';

const PRESET_CATEGORIES = [
  'افلام',
  'افلام اجنبية',
  'افلام عربية',
  'افلام هندية',
  'افلام تركية',
  'افلام كرتون',
  'مسلسلات',
  'مسلسلات عربية',
  'مسلسلات اجنبية',
  'مسلسلات تركية',
  'رمضان 2026',
  'مصارعة حرة',
  'عروض تلفزيونية',
];

function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--';
  if (seconds <= 0) return '0 ث';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}س ${mins}د`;
  if (mins > 0) return `${mins}د ${secs}ث`;
  return `${secs}ث`;
}

function getStatusLabel(status: ImporterJobSummary['status']): { text: string; color: string } {
  switch (status) {
    case 'discovering':
      return { text: 'جاري الاكتشاف والمسح...', color: 'text-sky-300' };
    case 'running':
      return { text: 'جاري الجلب المتوازي...', color: 'text-[#4CAF50]' };
    case 'paused':
      return { text: 'متوقف مؤقتاً (قابل للاستئناف)', color: 'text-[#f9c400]' };
    case 'completed':
      return { text: 'مكتمل بنجاح', color: 'text-[#4CAF50]' };
    case 'cancelled':
      return { text: 'تم الإلغاء', color: 'text-red-300' };
    case 'error':
      return { text: 'توقف بسبب خطأ', color: 'text-red-300' };
  }
}

export function AdvancedContentImporterPanel({
  user,
  catalog,
  customApiUrl,
  onNotify,
}: AdvancedContentImporterPanelProps) {
  const [mode, setMode] = useState<ImporterMainMode>('single');

  // Dynamic category pool combining presets + live catalog categories
  const availableCategories = useMemo(() => {
    const set = new Set<string>(PRESET_CATEGORIES);
    for (const item of catalog) {
      for (const c of item.categories || []) {
        if (c.trim()) set.add(c.trim());
      }
    }
    return Array.from(set);
  }, [catalog]);

  // Source index cache from server for URL deduplication
  const [sourceIndex, setSourceIndex] = useState<Record<string, SourceIndexEntry>>({});
  const refreshSourceIndex = useCallback(async () => {
    if (!user) return;
    try {
      const idx = await fetchSourceIndexApi(user, customApiUrl);
      setSourceIndex(idx);
    } catch {
      // Non-fatal
    }
  }, [user, customApiUrl]);

  useEffect(() => {
    void refreshSourceIndex();
  }, [refreshSourceIndex]);

  const catalogLookupMaps = useMemo(
    () => buildCatalogLookupMaps(catalog, sourceIndex),
    [catalog, sourceIndex]
  );

  // =========================================================================
  // MODE 1: SINGLE MOVIE IMPORT STATE
  // =========================================================================
  const [singleUrl, setSingleUrl] = useState('');
  const [singleUseHtml, setSingleUseHtml] = useState(false);
  const [singleRawHtml, setSingleRawHtml] = useState('');
  const [singleUseAdapters, setSingleUseAdapters] = useState(true);
  const [singleEnrichMetadata, setSingleEnrichMetadata] = useState(true);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleStrategy, setSingleStrategy] = useState('');
  const [singleMovie, setSingleMovie] = useState<AdvancedImportedMovie | null>(null);
  const [singleTargetCategory, setSingleTargetCategory] = useState('');
  const [singleSaving, setSingleSaving] = useState(false);
  const [singleNewTag, setSingleNewTag] = useState('');
  const [singleNewDirector, setSingleNewDirector] = useState('');
  const [singleNewActor, setSingleNewActor] = useState('');

  const singleDuplicateInfo = useMemo<DuplicateMatchInfo | null>(() => {
    if (!singleMovie) return null;
    return detectMovieDuplicate(singleMovie, catalogLookupMaps);
  }, [singleMovie, catalogLookupMaps]);

  const handleExtractSingleMovie = async () => {
    if (!user) {
      onNotify('يرجى تسجيل الدخول أولاً.');
      return;
    }
    if (!singleUseHtml && !singleUrl.trim()) {
      onNotify('يرجى إدخال رابط صفحة الفيلم.');
      return;
    }
    if (singleUseHtml && singleRawHtml.trim().length < 30) {
      onNotify('يرجى لصق كود HTML صالح لصفحة الفيلم.');
      return;
    }
    setSingleLoading(true);
    setSingleMovie(null);
    setSingleStrategy('');
    try {
      const res = await extractSingleMovieApi({
        user,
        customApiUrl,
        url: singleUrl.trim() || undefined,
        rawHtml: singleUseHtml ? singleRawHtml : undefined,
        useAdapters: singleUseAdapters,
        enrichExternalMetadata: singleEnrichMetadata,
      });
      setSingleMovie(res.movie);
      setSingleStrategy(res.strategy);
      onNotify(`تم استخراج بيانات "${res.movie.title}" بنجاح — راجع البيانات قبل الحفظ.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر استخراج بيانات الفيلم.');
    } finally {
      setSingleLoading(false);
    }
  };

  const handleSaveSingleMovie = async (saveAction: 'create' | 'update') => {
    if (!user || !singleMovie) return;
    setSingleSaving(true);
    try {
      const existingItem =
        saveAction === 'update' && singleDuplicateInfo
          ? catalogLookupMaps.byId.get(singleDuplicateInfo.matchedCatalogId.toLowerCase())
          : undefined;
      const saved = await saveSingleImportedMovieToCatalog({
        movie: singleMovie,
        uid: user.uid,
        user,
        targetCategory: singleTargetCategory,
        existingItem,
        customApiUrl,
      });
      await refreshSourceIndex();
      onNotify(
        saveAction === 'update'
          ? `تم تحديث الفيلم الموجود "${saved.title}" دون إنشاء نسخة مكررة.`
          : `تم حفظ "${saved.title}" في الكتالوج بنجاح.`
      );
    } catch (err) {
      onNotify(formatFirestoreWriteError(err, 'تعذر حفظ الفيلم في قاعدة البيانات'));
    } finally {
      setSingleSaving(false);
    }
  };

  const handleExportSingleMovie = (format: 'json' | 'csv') => {
    if (!singleMovie) return;
    const filename = `rahaltv-single-${singleMovie.slug || singleMovie.id}.${format}`;
    let content = '';
    let mime = 'application/json;charset=utf-8';
    if (format === 'json') {
      content = JSON.stringify(singleMovie, null, 2);
    } else {
      mime = 'text/csv;charset=utf-8';
      const esc = (v: unknown) => {
        const s = String(v ?? '');
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const actors = singleMovie.cast
        .filter((c) => !/مخرج|director/i.test(c.role))
        .map((c) => c.name)
        .join(' | ');
      const header = [
        'sourceUrl',
        'externalId',
        'imdbId',
        'title',
        'englishTitle',
        'year',
        'releaseDate',
        'kind',
        'categories',
        'genres',
        'tags',
        'duration',
        'imdb',
        'quality',
        'poster',
        'backdrop',
        'trailerUrl',
        'directors',
        'actors',
        'story',
      ].join(',');
      const row = [
        singleMovie.sourceUrl,
        singleMovie.externalId,
        singleMovie.imdbId,
        singleMovie.title,
        singleMovie.englishTitle,
        singleMovie.year,
        singleMovie.releaseDate,
        singleMovie.kind,
        singleMovie.categories.join(' | '),
        singleMovie.genres.join(' | '),
        singleMovie.tags.join(' | '),
        singleMovie.duration,
        singleMovie.imdb,
        singleMovie.quality,
        singleMovie.poster,
        singleMovie.backdrop,
        singleMovie.trailerUrl,
        singleMovie.directors.join(' | '),
        actors,
        singleMovie.story,
      ]
        .map(esc)
        .join(',');
      content = `\uFEFF${header}\n${row}\n`;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  // =========================================================================
  // MODE 2: FULL-SITE BULK IMPORT STATE (UP TO 50,000 MOVIES)
  // =========================================================================
  const [bulkSourceUrl, setBulkSourceUrl] = useState('');
  const [bulkSectionUrlsText, setBulkSectionUrlsText] = useState('');
  const [bulkDiscoveryMode, setBulkDiscoveryMode] = useState<ImporterDiscoveryMode>('auto');
  const [bulkMaxItems, setBulkMaxItems] = useState(500);
  const [bulkConcurrency, setBulkConcurrency] = useState(4);
  const [bulkDelayMs, setBulkDelayMs] = useState(120);
  const [bulkBatchSize, setBulkBatchSize] = useState(25);
  const [bulkDuplicateMode, setBulkDuplicateMode] = useState<ImporterDuplicateMode>('skip');
  const [bulkTargetCategory, setBulkTargetCategory] = useState('');
  const [bulkUseAdapters, setBulkUseAdapters] = useState(true);
  const [bulkEnrichExternal, setBulkEnrichExternal] = useState(false);

  const [savedJobs, setSavedJobs] = useState<ImporterJobSummary[]>([]);
  const [activeJob, setActiveJob] = useState<ImporterJobSummary | null>(null);
  const [startingBulk, setStartingBulk] = useState(false);
  const [controllingJob, setControllingJob] = useState(false);

  // Paginated Results Viewer State
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState(25);
  const [resultsStatusFilter, setResultsStatusFilter] = useState<'all' | ImporterJobItemStatus>('all');
  const [resultsSearch, setResultsSearch] = useState('');
  const [paginatedData, setPaginatedData] = useState<ImporterPaginatedItemsResponse | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // Selection & Batch Save State
  const [selectedSeqs, setSelectedSeqs] = useState<Set<number>>(new Set());
  const [saveTargetCategoryOverride, setSaveTargetCategoryOverride] = useState('');
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchSaveProgress, setBatchSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewRecord, setPreviewRecord] = useState<ImporterJobResultRecord | null>(null);

  const activeJobIdRef = useRef<string>('');
  activeJobIdRef.current = activeJob?.id || '';

  const loadJobsList = useCallback(async () => {
    if (!user) return [];
    try {
      const list = await listImporterJobsApi(user, customApiUrl);
      setSavedJobs(list);
      return list;
    } catch {
      return [];
    }
  }, [user, customApiUrl]);

  const loadResultsPage = useCallback(
    async (jobId: string, page = resultsPage, size = resultsPageSize, status = resultsStatusFilter, search = resultsSearch) => {
      if (!user || !jobId) return;
      setLoadingResults(true);
      try {
        const res = await getPaginatedJobItemsApi({
          user,
          jobId,
          page,
          pageSize: size,
          status,
          search,
          customApiUrl,
        });
        setPaginatedData(res);
      } catch {
        // ignore transient polling failure
      } finally {
        setLoadingResults(false);
      }
    },
    [user, resultsPage, resultsPageSize, resultsStatusFilter, resultsSearch, customApiUrl]
  );

  // Auto-recover active or interrupted job on mount / reload
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const jobs = await loadJobsList();
      if (!mounted || jobs.length === 0) return;
      const savedId = getSavedActiveImporterJobId();
      const target =
        jobs.find((j) => j.id === savedId) ||
        jobs.find((j) => j.status === 'running' || j.status === 'discovering' || j.status === 'paused') ||
        jobs[0];
      if (target) {
        setActiveJob(target);
        setSavedActiveImporterJobId(target.id);
        setMode((prev) =>
          target.status === 'running' || target.status === 'discovering' ? 'bulk' : prev
        );
        void loadResultsPage(target.id, 1, resultsPageSize, 'all', '');
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Poll active job progress + current page while running or discovering
  useEffect(() => {
    if (!user || !activeJob?.id) return;
    const isLive = activeJob.status === 'discovering' || activeJob.status === 'running';
    if (!isLive) return;

    const timer = setInterval(async () => {
      try {
        const latest = await getImporterJobApi(user, activeJob.id, customApiUrl);
        setActiveJob(latest);
        void loadResultsPage(latest.id, resultsPage, resultsPageSize, resultsStatusFilter, resultsSearch);
        if (latest.status !== 'discovering' && latest.status !== 'running') {
          void loadJobsList();
        }
      } catch {
        // ignore transient poll error
      }
    }, 1800);

    return () => clearInterval(timer);
  }, [
    user,
    activeJob?.id,
    activeJob?.status,
    customApiUrl,
    resultsPage,
    resultsPageSize,
    resultsStatusFilter,
    resultsSearch,
    loadResultsPage,
    loadJobsList,
  ]);

  // Refresh results table when filter/page changes
  useEffect(() => {
    if (!user || !activeJob?.id) return;
    void loadResultsPage(activeJob.id, resultsPage, resultsPageSize, resultsStatusFilter, resultsSearch);
  }, [user, activeJob?.id, resultsPage, resultsPageSize, resultsStatusFilter, resultsSearch, loadResultsPage]);

  const handleStartBulkJob = async () => {
    if (!user) {
      onNotify('يرجى تسجيل الدخول بحساب مسؤول أولاً.');
      return;
    }
    if (!bulkSourceUrl.trim()) {
      onNotify('يرجى إدخال رابط الموقع المصدر.');
      return;
    }
    setStartingBulk(true);
    try {
      const sectionUrls = bulkSectionUrlsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const cfg: ImporterJobConfig = {
        sourceUrl: bulkSourceUrl.trim(),
        sectionUrls,
        discoveryMode: bulkDiscoveryMode,
        maxItems: Math.min(50000, Math.max(1, Number(bulkMaxItems) || 100)),
        concurrency: Math.min(12, Math.max(1, Number(bulkConcurrency) || 4)),
        delayMs: Math.min(5000, Math.max(0, Number(bulkDelayMs) || 0)),
        batchSize: Math.min(100, Math.max(5, Number(bulkBatchSize) || 25)),
        duplicateMode: bulkDuplicateMode,
        targetCategory: bulkTargetCategory.trim(),
        useAdapters: bulkUseAdapters,
        enrichExternalMetadata: bulkEnrichExternal,
      };
      const job = await startBulkImporterJobApi(user, cfg, customApiUrl);
      setActiveJob(job);
      setSavedActiveImporterJobId(job.id);
      setSelectedSeqs(new Set());
      setResultsPage(1);
      setResultsStatusFilter('all');
      await loadJobsList();
      onNotify(`تم بدء مهمة الاستيراد المتقدم (${job.id}) بنجاح.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر بدء مهمة الاستيراد.');
    } finally {
      setStartingBulk(false);
    }
  };

  const handleControlJob = async (
    action: 'pause' | 'resume' | 'cancel' | 'retry-failed',
    extraBody?: Record<string, unknown>
  ) => {
    if (!user || !activeJob) return;
    setControllingJob(true);
    try {
      const updated = await controlImporterJobApi(user, activeJob.id, action, extraBody, customApiUrl);
      setActiveJob(updated);
      await loadJobsList();
      await loadResultsPage(updated.id, resultsPage, resultsPageSize, resultsStatusFilter, resultsSearch);
      const labels = {
        pause: 'تم إيقاف المهمة مؤقتاً.',
        resume: 'تم استئناف المهمة من نقطة التوقف.',
        cancel: 'تم إلغاء المهمة.',
        'retry-failed': 'تمت إعادة جدولة العناصر الفاشلة للمحاولة مرة أخرى.',
      };
      onNotify(labels[action]);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'فشل تنفيذ الإجراء.');
    } finally {
      setControllingJob(false);
    }
  };

  const handleSwitchJob = async (jobId: string) => {
    if (!user || !jobId) return;
    try {
      const job = await getImporterJobApi(user, jobId, customApiUrl);
      setActiveJob(job);
      setSavedActiveImporterJobId(job.id);
      setSelectedSeqs(new Set());
      setResultsPage(1);
      await loadResultsPage(job.id, 1, resultsPageSize, 'all', '');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'تعذر فتح المهمة.');
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!user) return;
    try {
      await deleteImporterJobApi(user, jobId, customApiUrl);
      if (activeJob?.id === jobId) {
        setActiveJob(null);
        setPaginatedData(null);
        setSavedActiveImporterJobId('');
      }
      await loadJobsList();
      onNotify('تم حذف سجل المهمة من القرص.');
    } catch {
      onNotify('تعذر حذف المهمة.');
    }
  };

  // Compute live duplicate matches for visible page rows
  const currentPageDuplicates = useMemo(() => {
    const map = new Map<number, DuplicateMatchInfo>();
    for (const rec of paginatedData?.items || []) {
      if (!rec.movie) continue;
      const dup = detectMovieDuplicate(rec.movie, catalogLookupMaps);
      if (dup) map.set(rec.seq, dup);
    }
    return map;
  }, [paginatedData?.items, catalogLookupMaps]);

  const toggleSelectSeq = (seq: number) => {
    setSelectedSeqs((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  };

  const handleSelectAllOnPage = () => {
    const rows = (paginatedData?.items || []).filter(
      (r) => r.movie && r.status !== 'failed' && r.status !== 'excluded'
    );
    setSelectedSeqs((prev) => {
      const next = new Set(prev);
      const allSelected = rows.length > 0 && rows.every((r) => next.has(r.seq));
      if (allSelected) {
        for (const r of rows) next.delete(r.seq);
      } else {
        for (const r of rows) next.add(r.seq);
      }
      return next;
    });
  };

  const handleExcludeSelected = async () => {
    if (!user || !activeJob || selectedSeqs.size === 0) return;
    const updates = Array.from(selectedSeqs).map((seq) => ({ seq, status: 'excluded' as const }));
    await updateJobItemsStatusApi(user, activeJob.id, updates, customApiUrl);
    setSelectedSeqs(new Set());
    const freshJob = await getImporterJobApi(user, activeJob.id, customApiUrl);
    setActiveJob(freshJob);
    await loadResultsPage(activeJob.id, resultsPage, resultsPageSize, resultsStatusFilter, resultsSearch);
    onNotify(`تم استبعاد ${updates.length} عنصر.`);
  };

  const handleSaveSelectedToCatalog = async () => {
    if (!user || !activeJob || !paginatedData) return;
    const targetRecords = paginatedData.items.filter(
      (r) => selectedSeqs.has(r.seq) && r.movie && r.status !== 'failed' && r.status !== 'excluded'
    );
    if (targetRecords.length === 0) {
      onNotify('يرجى تحديد أفلام صالحة للحفظ أولاً.');
      return;
    }

    setBatchSaving(true);
    setBatchSaveProgress({ done: 0, total: targetRecords.length });
    try {
      const res = await saveImportedBatchToCatalog({
        records: targetRecords.map((r) => ({
          seq: r.seq,
          movie: r.movie!,
          duplicateMatch: currentPageDuplicates.get(r.seq) || null,
        })),
        duplicateMode: bulkDuplicateMode,
        targetCategory: saveTargetCategoryOverride || activeJob.config.targetCategory,
        catalogMap: catalogLookupMaps.byId,
        uid: user.uid,
        user,
        jobId: activeJob.id,
        batchSize: activeJob.config.batchSize,
        customApiUrl,
        onProgress: (done, total) => setBatchSaveProgress({ done, total }),
      });
      setSelectedSeqs(new Set());
      await refreshSourceIndex();
      const freshJob = await getImporterJobApi(user, activeJob.id, customApiUrl);
      setActiveJob(freshJob);
      await loadResultsPage(activeJob.id, resultsPage, resultsPageSize, resultsStatusFilter, resultsSearch);
      onNotify(`تم حفظ ${res.created} جديد، تحديث ${res.updated}، وتخطي ${res.skipped} مكرر.`);
    } catch (err) {
      onNotify(formatFirestoreWriteError(err, 'فشل الحفظ المجمع للدفعة'));
    } finally {
      setBatchSaving(false);
      setBatchSaveProgress(null);
    }
  };

  // Stream ALL 'ready' items across backend pages in safe batches without loading 50k into RAM
  const handleSaveAllReadyInBatches = async () => {
    if (!user || !activeJob) return;
    const readyCount = paginatedData?.counts.ready ?? 0;
    if (readyCount === 0) {
      onNotify('لا توجد أفلام بحالة "جاهز للحفظ" في هذه المهمة.');
      return;
    }
    setBatchSaving(true);
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const totalExpected = readyCount;
    let processedSoFar = 0;
    setBatchSaveProgress({ done: 0, total: totalExpected });

    try {
      let guardLoop = 0;
      const liveCatalogMap = new Map(catalogLookupMaps.byId);
      while (guardLoop < 600) {
        guardLoop++;
        const pageRes = await getPaginatedJobItemsApi({
          user,
          jobId: activeJob.id,
          page: 1,
          pageSize: 100,
          status: 'ready',
          search: '',
          customApiUrl,
        });
        const readyRows = pageRes.items.filter((r) => r.movie);
        if (readyRows.length === 0) break;

        const batchRes = await saveImportedBatchToCatalog({
          records: readyRows.map((r) => ({
            seq: r.seq,
            movie: r.movie!,
            duplicateMatch: detectMovieDuplicate(r.movie!, catalogLookupMaps),
          })),
          duplicateMode: bulkDuplicateMode,
          targetCategory: saveTargetCategoryOverride || activeJob.config.targetCategory,
          catalogMap: liveCatalogMap,
          uid: user.uid,
          user,
          jobId: activeJob.id,
          batchSize: Math.min(30, activeJob.config.batchSize || 25),
          customApiUrl,
        });

        totalCreated += batchRes.created;
        totalUpdated += batchRes.updated;
        totalSkipped += batchRes.skipped;
        processedSoFar += readyRows.length;
        setBatchSaveProgress({ done: Math.min(totalExpected, processedSoFar), total: totalExpected });

        if (batchRes.created + batchRes.updated + batchRes.skipped === 0) break;
      }

      await refreshSourceIndex();
      const freshJob = await getImporterJobApi(user, activeJob.id, customApiUrl);
      setActiveJob(freshJob);
      await loadResultsPage(activeJob.id, 1, resultsPageSize, resultsStatusFilter, resultsSearch);
      onNotify(
        `اكتمل الحفظ الدفعي: ${totalCreated} فيلم جديد، ${totalUpdated} محدّث، ${totalSkipped} مكرر تم تخطيه.`
      );
    } catch (err) {
      onNotify(formatFirestoreWriteError(err, 'توقف الحفظ الدفعي أثناء المعالجة'));
    } finally {
      setBatchSaving(false);
      setBatchSaveProgress(null);
    }
  };

  const handleSaveFromPreview = async (record: ImporterJobResultRecord, action: 'create' | 'update') => {
    if (!user || !record.movie || !activeJob) return;
    setBatchSaving(true);
    try {
      const dup = currentPageDuplicates.get(record.seq) || detectMovieDuplicate(record.movie, catalogLookupMaps);
      const existingItem =
        action === 'update' && dup
          ? catalogLookupMaps.byId.get(dup.matchedCatalogId.toLowerCase())
          : undefined;
      const saved = await saveSingleImportedMovieToCatalog({
        movie: record.movie,
        uid: user.uid,
        user,
        targetCategory: saveTargetCategoryOverride || activeJob.config.targetCategory,
        existingItem,
        customApiUrl,
      });
      await updateJobItemsStatusApi(
        user,
        activeJob.id,
        [{ seq: record.seq, status: 'saved', savedMediaId: saved.id }],
        customApiUrl
      );
      setPreviewRecord(null);
      await refreshSourceIndex();
      const freshJob = await getImporterJobApi(user, activeJob.id, customApiUrl);
      setActiveJob(freshJob);
      await loadResultsPage(activeJob.id, resultsPage, resultsPageSize, resultsStatusFilter, resultsSearch);
      onNotify(`تم ${action === 'update' ? 'تحديث' : 'حفظ'} "${saved.title}" بنجاح.`);
    } catch (err) {
      onNotify(formatFirestoreWriteError(err, 'تعذر حفظ الفيلم'));
    } finally {
      setBatchSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#D92321]/15 border border-[#D92321]/35 flex items-center justify-center shrink-0">
              <Rocket className="w-5 h-5 text-[#D92321]" />
            </div>
            <div>
              <h2 className="font-display text-lg font-black tracking-tight text-white">
                ADVANCED CONTENT IMPORTER PRO
              </h2>
              <p className="text-xs text-[#b7c9ef]">
                محرك استيراد احترافي منفصل يدعم جلب فيلم واحد أو مواقع كاملة حتى 50,000 فيلم مع طابور مستمر ومنع التكرار.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap rounded-2xl bg-[#1a242e] p-1 border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold cursor-pointer whitespace-nowrap transition-colors ${
              mode === 'single'
                ? 'bg-[#D92321] text-white shadow'
                : 'text-[#b7c9ef] hover:text-white'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>جلب فيلم واحد</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('bulk')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold cursor-pointer whitespace-nowrap transition-colors ${
              mode === 'bulk'
                ? 'bg-[#D92321] text-white shadow'
                : 'text-[#b7c9ef] hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>جلب موقع بالكامل (حتى 50,000)</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODE 1: SINGLE MOVIE IMPORT                                         */}
      {/* =================================================================== */}
      {mode === 'single' && (
        <div className="space-y-6">
          <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-extrabold text-white flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[#4CAF50]" />
                <span>الوضع الأول: استخراج ومراجعة فيلم واحد</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#b7c9ef]">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={singleUseAdapters}
                    onChange={(e) => setSingleUseAdapters(e.target.checked)}
                    className="accent-[#4CAF50]"
                  />
                  <span>استخدام محولات المواقع (Adapters)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={singleEnrichMetadata}
                    onChange={(e) => setSingleEnrichMetadata(e.target.checked)}
                    className="accent-[#4CAF50]"
                  />
                  <span>إثراء التقييم والبوستر والتريلر تلقائياً</span>
                </label>
                <button
                  type="button"
                  onClick={() => setSingleUseHtml((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a242e] border border-white/10 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/10 cursor-pointer whitespace-nowrap"
                >
                  <Code2 className="w-3.5 h-3.5 text-[#f9c400]" />
                  <span>{singleUseHtml ? 'العودة للرابط المباشر' : 'لصق HTML بديل'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                placeholder="https://example.com/movies/movie-page"
                dir="ltr"
                className="flex-1 rounded-xl bg-[#1a242e] border border-white/10 px-4 py-3 text-sm font-latin text-white placeholder:text-[#b7c9ef]/50 focus:outline-none focus:border-white/30"
              />
              <button
                type="button"
                disabled={singleLoading}
                onClick={handleExtractSingleMovie}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D92321] hover:bg-[#b81c1a] disabled:opacity-60 px-6 py-3 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                {singleLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )}
                <span>{singleLoading ? 'جاري الاستخراج...' : 'استخراج بيانات الفيلم'}</span>
              </button>
            </div>

            {singleUseHtml && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#b7c9ef]">
                  كود HTML لصفحة الفيلم (اختياري عند حماية الموقع المصدر)
                </label>
                <textarea
                  value={singleRawHtml}
                  onChange={(e) => setSingleRawHtml(e.target.value)}
                  rows={5}
                  dir="ltr"
                  placeholder="<html>...</html>"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 p-3 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                />
              </div>
            )}
          </div>

          {singleMovie && (
            <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 sm:p-6 space-y-6">
              {/* Review Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-white">مراجعة وتحرير بيانات الفيلم قبل الحفظ</h3>
                  <p className="text-xs text-[#b7c9ef] mt-0.5">
                    الاستراتيجية: {singleStrategy} · المعرّف: <span className="font-latin">{singleMovie.id}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportSingleMovie('json')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    <FileJson className="w-3.5 h-3.5 text-sky-400" />
                    <span>JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSingleMovie('csv')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3 py-2 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#4CAF50]" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Duplicate Alert Banner */}
              {singleDuplicateInfo && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-400/35 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-200 font-bold">
                    <AlertTriangle className="w-4 h-4 text-[#f9c400] shrink-0" />
                    <span>
                      تنبيه منع التكرار: {singleDuplicateInfo.reasonLabel} — يوجد فيلم مطابق في الكتالوج بعنوان &ldquo;
                      {singleDuplicateInfo.matchedTitle}&rdquo; ({singleDuplicateInfo.matchedYear}).
                    </span>
                  </div>
                  <span className="font-latin text-[11px] text-amber-300 tabular-nums">
                    ID: {singleDuplicateInfo.matchedCatalogId}
                  </span>
                </div>
              )}

              {/* Visual Poster & Backdrop + Core Inputs */}
              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] font-bold text-[#b7c9ef] mb-1.5">صورة البوستر</div>
                    <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-[#1a242e] border border-white/10">
                      {singleMovie.poster ? (
                        <img
                          src={singleMovie.poster}
                          alt={singleMovie.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#b7c9ef]/40">
                          <Film className="w-10 h-10" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-[#b7c9ef] mb-1.5">صورة الخلفية</div>
                    <div className="aspect-video rounded-xl overflow-hidden bg-[#1a242e] border border-white/10">
                      {singleMovie.backdrop ? (
                        <img
                          src={singleMovie.backdrop}
                          alt={`${singleMovie.title} backdrop`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[11px] text-[#b7c9ef]/50">
                          ستُستخدم صورة البوستر تلقائياً إذا كانت فارغة
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                  <label className="space-y-1 sm:col-span-2 lg:col-span-1">
                    <span className="text-[#b7c9ef] font-bold">الاسم العربي</span>
                    <input
                      value={singleMovie.title}
                      onChange={(e) => setSingleMovie({ ...singleMovie, title: e.target.value })}
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-2 lg:col-span-1">
                    <span className="text-[#b7c9ef] font-bold">الاسم الإنجليزي</span>
                    <input
                      value={singleMovie.englishTitle}
                      onChange={(e) => setSingleMovie({ ...singleMovie, englishTitle: e.target.value })}
                      dir="ltr"
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 font-latin text-white focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#b7c9ef] font-bold">القسم المستهدف للحفظ</span>
                    <select
                      value={singleTargetCategory}
                      onChange={(e) => setSingleTargetCategory(e.target.value)}
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white focus:outline-none"
                    >
                      <option value="">تلقائي حسب التصنيف المستخرج</option>
                      {availableCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[#b7c9ef] font-bold">سنة الإنتاج</span>
                    <input
                      value={singleMovie.year}
                      onChange={(e) => setSingleMovie({ ...singleMovie, year: e.target.value })}
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white tabular-nums focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#b7c9ef] font-bold">تاريخ الإصدار</span>
                    <input
                      value={singleMovie.releaseDate}
                      onChange={(e) => setSingleMovie({ ...singleMovie, releaseDate: e.target.value })}
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white tabular-nums focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#b7c9ef] font-bold">المدة</span>
                    <input
                      value={singleMovie.duration}
                      onChange={(e) => setSingleMovie({ ...singleMovie, duration: e.target.value })}
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white focus:outline-none"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[#b7c9ef] font-bold">التقييم (IMDb)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={singleMovie.imdb}
                      onChange={(e) =>
                        setSingleMovie({ ...singleMovie, imdb: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white tabular-nums focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#b7c9ef] font-bold">النوع (Kind)</span>
                    <select
                      value={singleMovie.kind}
                      onChange={(e) =>
                        setSingleMovie({ ...singleMovie, kind: e.target.value as MediaKind })
                      }
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white focus:outline-none"
                    >
                      <option value="movie">فيلم (Movie)</option>
                      <option value="series">مسلسل (Series)</option>
                      <option value="tv">برنامج / مسرحية (TV)</option>
                      <option value="wrestling">مصارعة (Wrestling)</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#b7c9ef] font-bold">الجودة</span>
                    <input
                      value={singleMovie.quality}
                      onChange={(e) => setSingleMovie({ ...singleMovie, quality: e.target.value })}
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white focus:outline-none"
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <span className="text-[#b7c9ef] font-bold">رابط البوستر</span>
                    <input
                      value={singleMovie.poster}
                      onChange={(e) =>
                        setSingleMovie({
                          ...singleMovie,
                          poster: e.target.value,
                          poster_url: e.target.value,
                        })
                      }
                      dir="ltr"
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 font-latin text-white focus:outline-none"
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <span className="text-[#b7c9ef] font-bold">رابط الخلفية (Backdrop)</span>
                    <input
                      value={singleMovie.backdrop}
                      onChange={(e) =>
                        setSingleMovie({
                          ...singleMovie,
                          backdrop: e.target.value,
                          backdrop_url: e.target.value,
                        })
                      }
                      dir="ltr"
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 font-latin text-white focus:outline-none"
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2 lg:col-span-2">
                    <span className="text-[#b7c9ef] font-bold">رابط التريلر (Trailer URL)</span>
                    <input
                      value={singleMovie.trailerUrl}
                      onChange={(e) => setSingleMovie({ ...singleMovie, trailerUrl: e.target.value })}
                      dir="ltr"
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 font-latin text-white focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[#b7c9ef] font-bold">معرّف IMDb</span>
                    <input
                      value={singleMovie.imdbId}
                      onChange={(e) => setSingleMovie({ ...singleMovie, imdbId: e.target.value })}
                      dir="ltr"
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2 font-latin text-white focus:outline-none"
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <span className="text-[#b7c9ef] font-bold">القصة والوصف</span>
                    <textarea
                      rows={3}
                      value={singleMovie.story}
                      onChange={(e) => setSingleMovie({ ...singleMovie, story: e.target.value })}
                      className="w-full rounded-xl bg-[#1a242e] border border-white/10 p-3 text-white focus:outline-none"
                    />
                  </label>
                </div>
              </div>

              {/* Directors, Actors, Tags, Categories */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Directors */}
                <div className="rounded-2xl bg-[#1a242e]/60 border border-white/[0.06] p-4 space-y-2.5">
                  <div className="font-extrabold text-white">المخرجون ({singleMovie.directors.length})</div>
                  <div className="flex gap-2">
                    <input
                      value={singleNewDirector}
                      onChange={(e) => setSingleNewDirector(e.target.value)}
                      placeholder="أضف مخرجاً..."
                      className="flex-1 rounded-lg bg-[#0c1821] border border-white/10 px-2.5 py-1.5 text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nm = singleNewDirector.trim();
                        if (!nm) return;
                        setSingleMovie({
                          ...singleMovie,
                          directors: Array.from(new Set([...singleMovie.directors, nm])),
                        });
                        setSingleNewDirector('');
                      }}
                      className="rounded-lg bg-[#4CAF50]/20 hover:bg-[#4CAF50]/30 border border-[#4CAF50]/40 px-2.5 text-[#4CAF50] cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {singleMovie.directors.map((dir) => (
                      <span
                        key={dir}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1 text-white"
                      >
                        <span>{dir}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSingleMovie({
                              ...singleMovie,
                              directors: singleMovie.directors.filter((d) => d !== dir),
                            })
                          }
                          className="text-red-300 hover:text-red-200 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actors */}
                <div className="rounded-2xl bg-[#1a242e]/60 border border-white/[0.06] p-4 space-y-2.5">
                  <div className="font-extrabold text-white">
                    الممثلون ({singleMovie.cast.filter((c) => !/مخرج|director/i.test(c.role)).length})
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={singleNewActor}
                      onChange={(e) => setSingleNewActor(e.target.value)}
                      placeholder="أضف ممثلاً..."
                      className="flex-1 rounded-lg bg-[#0c1821] border border-white/10 px-2.5 py-1.5 text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nm = singleNewActor.trim();
                        if (!nm) return;
                        setSingleMovie({
                          ...singleMovie,
                          cast: [
                            ...singleMovie.cast,
                            { name: nm, role: 'ممثل', initials: nm.slice(0, 2).toUpperCase() },
                          ],
                        });
                        setSingleNewActor('');
                      }}
                      className="rounded-lg bg-[#4CAF50]/20 hover:bg-[#4CAF50]/30 border border-[#4CAF50]/40 px-2.5 text-[#4CAF50] cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {singleMovie.cast
                      .filter((c) => !/مخرج|director/i.test(c.role))
                      .map((act) => (
                        <span
                          key={act.name}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1 text-white"
                        >
                          <span>{act.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setSingleMovie({
                                ...singleMovie,
                                cast: singleMovie.cast.filter((c) => c.name !== act.name),
                              })
                            }
                            className="text-red-300 hover:text-red-200 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                  </div>
                </div>

                {/* Tags & Categories */}
                <div className="rounded-2xl bg-[#1a242e]/60 border border-white/[0.06] p-4 space-y-2.5">
                  <div className="font-extrabold text-white">
                    التصنيفات والوسوم ({singleMovie.tags.length})
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={singleNewTag}
                      onChange={(e) => setSingleNewTag(e.target.value)}
                      placeholder="أضف وسماً أو تصنيفاً..."
                      className="flex-1 rounded-lg bg-[#0c1821] border border-white/10 px-2.5 py-1.5 text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const t = singleNewTag.trim();
                        if (!t) return;
                        setSingleMovie({
                          ...singleMovie,
                          tags: Array.from(new Set([...singleMovie.tags, t])),
                        });
                        setSingleNewTag('');
                      }}
                      className="rounded-lg bg-[#4CAF50]/20 hover:bg-[#4CAF50]/30 border border-[#4CAF50]/40 px-2.5 text-[#4CAF50] cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {singleMovie.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1 text-[#b7c9ef]"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSingleMovie({
                              ...singleMovie,
                              tags: singleMovie.tags.filter((x) => x !== tag),
                            })
                          }
                          className="text-red-300 hover:text-red-200 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Watch Servers & Downloads Review */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="rounded-2xl bg-[#1a242e]/60 border border-white/[0.06] p-4 space-y-2">
                  <div className="flex items-center justify-between font-extrabold text-white">
                    <span>روابط المشاهدة ({singleMovie.servers.length})</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSingleMovie({
                          ...singleMovie,
                          servers: [
                            ...singleMovie.servers,
                            {
                              id: `srv-manual-${Date.now()}`,
                              name: `سيرفر ${singleMovie.servers.length + 1}`,
                              mode: 'embed',
                              url: '',
                              embedCode: '',
                              quality: singleMovie.quality || 'HD',
                              speed: 'سريع',
                              tag: 'HD',
                            },
                          ],
                        })
                      }
                      className="text-[11px] text-[#4CAF50] hover:underline cursor-pointer"
                    >
                      + إضافة رابط
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {singleMovie.servers.map((srv, idx) => (
                      <div key={srv.id} className="flex items-center gap-2">
                        <input
                          value={srv.name}
                          onChange={(e) => {
                            const next = [...singleMovie.servers];
                            next[idx] = { ...srv, name: e.target.value };
                            setSingleMovie({ ...singleMovie, servers: next });
                          }}
                          className="w-28 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1.5 text-white"
                        />
                        <input
                          value={srv.url || ''}
                          onChange={(e) => {
                            const next = [...singleMovie.servers];
                            next[idx] = { ...srv, url: e.target.value };
                            setSingleMovie({ ...singleMovie, servers: next });
                          }}
                          dir="ltr"
                          placeholder="https://..."
                          className="flex-1 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1.5 font-latin text-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSingleMovie({
                              ...singleMovie,
                              servers: singleMovie.servers.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#1a242e]/60 border border-white/[0.06] p-4 space-y-2">
                  <div className="flex items-center justify-between font-extrabold text-white">
                    <span>روابط التحميل ({singleMovie.downloads.length})</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSingleMovie({
                          ...singleMovie,
                          downloads: [
                            ...singleMovie.downloads,
                            {
                              id: `dl-manual-${Date.now()}`,
                              host: `تحميل ${singleMovie.downloads.length + 1}`,
                              quality: singleMovie.quality || 'HD',
                              size: 'حسب السيرفر',
                              format: 'MP4',
                              url: '',
                            },
                          ],
                        })
                      }
                      className="text-[11px] text-[#4CAF50] hover:underline cursor-pointer"
                    >
                      + إضافة رابط
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {singleMovie.downloads.map((dl, idx) => (
                      <div key={dl.id} className="flex items-center gap-2">
                        <input
                          value={dl.host}
                          onChange={(e) => {
                            const next = [...singleMovie.downloads];
                            next[idx] = { ...dl, host: e.target.value };
                            setSingleMovie({ ...singleMovie, downloads: next });
                          }}
                          className="w-28 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1.5 text-white"
                        />
                        <input
                          value={dl.url || ''}
                          onChange={(e) => {
                            const next = [...singleMovie.downloads];
                            next[idx] = { ...dl, url: e.target.value };
                            setSingleMovie({ ...singleMovie, downloads: next });
                          }}
                          dir="ltr"
                          placeholder="https://..."
                          className="flex-1 rounded-lg bg-[#0c1821] border border-white/10 px-2 py-1.5 font-latin text-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSingleMovie({
                              ...singleMovie,
                              downloads: singleMovie.downloads.filter((_, i) => i !== idx),
                            })
                          }
                          className="text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save Action Footer */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-white/10">
                {singleDuplicateInfo && (
                  <button
                    type="button"
                    disabled={singleSaving}
                    onClick={() => handleSaveSingleMovie('update')}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#f9c400] hover:bg-[#dfb20b] disabled:opacity-60 px-5 py-2.5 text-xs font-black text-[#06131c] cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>تحديث الفيلم الموجود في الكتالوج</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={singleSaving}
                  onClick={() => handleSaveSingleMovie('create')}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-60 px-6 py-2.5 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
                >
                  {singleSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{singleDuplicateInfo ? 'حفظ كنسخة جديدة' : 'حفظ الفيلم في Firebase'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODE 2: FULL-SITE BULK IMPORT (UP TO 50,000 MOVIES)                 */}
      {/* =================================================================== */}
      {mode === 'bulk' && (
        <div className="space-y-6">
          {/* Configuration & Queue Builder */}
          <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-white">
                <Sliders className="w-4 h-4 text-[#f9c400]" />
                <span>الوضع الثاني: إعداد طابور جلب الموقع الكامل (حتى 50,000 فيلم)</span>
              </div>

              {/* Job History Recovery Selector */}
              {savedJobs.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <History className="w-3.5 h-3.5 text-[#b7c9ef]" />
                  <select
                    value={activeJob?.id || ''}
                    onChange={(e) => {
                      if (e.target.value) void handleSwitchJob(e.target.value);
                    }}
                    className="rounded-xl bg-[#1a242e] border border-white/10 px-3 py-1.5 text-xs text-white max-w-[260px]"
                  >
                    <option value="">اختر مهمة محفوظة لاستئنافها...</option>
                    {savedJobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.siteTitle} ({j.stats.fetched}/{j.stats.discovered || j.config.maxItems}) — {j.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <label className="space-y-1.5 md:col-span-2">
                <span className="font-bold text-[#b7c9ef]">رابط الموقع المصدر الرئيسي</span>
                <input
                  type="url"
                  value={bulkSourceUrl}
                  onChange={(e) => setBulkSourceUrl(e.target.value)}
                  placeholder="https://example.com"
                  dir="ltr"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3.5 py-2.5 font-latin text-white placeholder:text-[#b7c9ef]/50 focus:outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-[#b7c9ef]">طريقة اكتشاف الروابط</span>
                <select
                  value={bulkDiscoveryMode}
                  onChange={(e) => setBulkDiscoveryMode(e.target.value as ImporterDiscoveryMode)}
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white focus:outline-none"
                >
                  <option value="auto">تلقائي ذكي (Sitemap + API + Pagination)</option>
                  <option value="sitemap">خريطة الموقع فقط (Sitemap XML)</option>
                  <option value="api">واجهة API (WordPress / Blogger)</option>
                  <option value="html">زحف الصفحات والترقيم التلقائي (HTML)</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-[#b7c9ef]">الحد الأقصى للأفلام (1 – 50,000)</span>
                <input
                  type="number"
                  min={1}
                  max={50000}
                  value={bulkMaxItems}
                  onChange={(e) =>
                    setBulkMaxItems(Math.min(50000, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white tabular-nums focus:outline-none"
                />
              </label>

              <label className="space-y-1.5 md:col-span-2">
                <span className="font-bold text-[#b7c9ef]">
                  روابط أقسام معينة فقط (اختياري — رابط واحد في كل سطر)
                </span>
                <textarea
                  rows={2}
                  value={bulkSectionUrlsText}
                  onChange={(e) => setBulkSectionUrlsText(e.target.value)}
                  dir="ltr"
                  placeholder="https://example.com/category/action&#10;https://example.com/movies-2026"
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 p-2.5 font-latin text-white placeholder:text-[#b7c9ef]/40 focus:outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-[#b7c9ef]">عدد الاتصالات المتوازية ({bulkConcurrency})</span>
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={bulkConcurrency}
                  onChange={(e) => setBulkConcurrency(Number(e.target.value))}
                  className="w-full accent-[#D92321] mt-2"
                />
                <div className="text-[11px] text-[#b7c9ef]/80 tabular-nums">1 آمن ← 12 أقصى سرعة</div>
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-[#b7c9ef]">تحديد السرعة / الفاصل (ms)</span>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={50}
                  value={bulkDelayMs}
                  onChange={(e) => setBulkDelayMs(Math.min(5000, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white tabular-nums focus:outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-[#b7c9ef]">حجم دفعة الحفظ (Batch Size)</span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={bulkBatchSize}
                  onChange={(e) => setBulkBatchSize(Math.min(100, Math.max(5, Number(e.target.value) || 25)))}
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white tabular-nums focus:outline-none"
                />
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-[#b7c9ef]">سياسة منع التكرار</span>
                <select
                  value={bulkDuplicateMode}
                  onChange={(e) => setBulkDuplicateMode(e.target.value as ImporterDuplicateMode)}
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white focus:outline-none"
                >
                  <option value="skip">تخطي الأفلام المكررة</option>
                  <option value="update">تحديث بيانات الفيلم الموجود</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="font-bold text-[#b7c9ef]">القسم الافتراضي للحفظ</span>
                <select
                  value={bulkTargetCategory}
                  onChange={(e) => setBulkTargetCategory(e.target.value)}
                  className="w-full rounded-xl bg-[#1a242e] border border-white/10 px-3 py-2.5 text-white focus:outline-none"
                >
                  <option value="">تلقائي حسب تصنيف الفيلم</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col justify-center gap-2 text-[11px] text-[#b7c9ef]">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkUseAdapters}
                    onChange={(e) => setBulkUseAdapters(e.target.checked)}
                    className="accent-[#4CAF50]"
                  />
                  <span>دعم محولات المواقع (Adapters)</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkEnrichExternal}
                    onChange={(e) => setBulkEnrichExternal(e.target.checked)}
                    className="accent-[#4CAF50]"
                  />
                  <span>إثراء خارجي لكل فيلم (أبطأ للكميات الكبيرة)</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-[#b7c9ef]">حدود سريعة:</span>
                {[50, 250, 1000, 10000, 50000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBulkMaxItems(preset)}
                    className={`rounded-lg px-2.5 py-1 font-bold tabular-nums cursor-pointer ${
                      bulkMaxItems === preset
                        ? 'bg-[#D92321] text-white'
                        : 'bg-[#1a242e] text-[#b7c9ef] hover:text-white'
                    }`}
                  >
                    {preset.toLocaleString('en-US')}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={startingBulk}
                onClick={handleStartBulkJob}
                className="inline-flex items-center gap-2 rounded-xl bg-[#D92321] hover:bg-[#b81c1a] disabled:opacity-60 px-6 py-2.5 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
              >
                {startingBulk ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>{startingBulk ? 'جاري إنشاء الطابور...' : 'بدء الاستيراد الجماعي'}</span>
              </button>
            </div>
          </div>

          {/* =============================================================== */}
          {/* LIVE MONITORING DASHBOARD                                       */}
          {/* =============================================================== */}
          {activeJob && (
            <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 sm:p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Activity className="w-4 h-4 text-[#4CAF50] shrink-0" />
                    <h3 className="text-sm font-extrabold text-white truncate">
                      لوحة المتابعة الحية — {activeJob.siteTitle}
                    </h3>
                    <span className={`text-xs font-bold ${getStatusLabel(activeJob.status).color}`}>
                      · {getStatusLabel(activeJob.status).text}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#b7c9ef] font-latin truncate">
                    {activeJob.id} · {activeJob.discoveryStrategy} · {activeJob.sourceUrl}
                  </div>
                </div>

                {/* Live Queue Controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {(activeJob.status === 'running' || activeJob.status === 'discovering') && (
                    <button
                      type="button"
                      disabled={controllingJob}
                      onClick={() => handleControlJob('pause')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 px-3.5 py-2 text-xs font-extrabold text-amber-200 cursor-pointer whitespace-nowrap"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>إيقاف مؤقت</span>
                    </button>
                  )}

                  {(activeJob.status === 'paused' || activeJob.status === 'error') && (
                    <button
                      type="button"
                      disabled={controllingJob}
                      onClick={() => handleControlJob('resume')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>استئناف المهمة</span>
                    </button>
                  )}

                  {activeJob.status !== 'completed' && activeJob.status !== 'cancelled' && (
                    <button
                      type="button"
                      disabled={controllingJob}
                      onClick={() => handleControlJob('cancel')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-400/35 px-3.5 py-2 text-xs font-extrabold text-red-200 cursor-pointer whitespace-nowrap"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span>إلغاء</span>
                    </button>
                  )}

                  {activeJob.stats.failed > 0 && (
                    <button
                      type="button"
                      disabled={controllingJob}
                      onClick={() => handleControlJob('retry-failed')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 px-3.5 py-2 text-xs font-extrabold text-sky-200 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إعادة الفاشلة ({activeJob.stats.failed})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteJob(activeJob.id)}
                    title="حذف المهمة من السجل"
                    className="inline-flex items-center justify-center rounded-xl bg-[#1a242e] hover:bg-red-500/20 border border-white/10 p-2 text-[#b7c9ef] hover:text-red-300 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                  <span className="text-[#b7c9ef] font-bold">نسبة الإنجاز الإجمالية</span>
                  <div className="flex items-center gap-3">
                    {(activeJob.stats.removedNoServers ?? 0) > 0 && (
                      <span className="text-[11px] font-bold text-amber-300 tabular-nums">
                        محذوفة (بدون سيرفرات): {(activeJob.stats.removedNoServers ?? 0).toLocaleString('en-US')}
                      </span>
                    )}
                    <span className="font-black text-white tabular-nums">
                      {activeJob.stats.progressPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-3 rounded-full bg-[#1a242e] overflow-hidden border border-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      activeJob.status === 'running' || activeJob.status === 'discovering'
                        ? 'bg-gradient-to-r from-[#D92321] via-[#f9c400] to-[#4CAF50] animate-pulse'
                        : activeJob.status === 'completed'
                          ? 'bg-[#4CAF50]'
                          : 'bg-[#f9c400]'
                    }`}
                    style={{ width: `${Math.max(2, activeJob.stats.progressPercent)}%` }}
                  />
                </div>
              </div>

              {/* 8 Live KPI Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                <div className="rounded-2xl bg-[#1a242e] border border-white/[0.06] p-3">
                  <div className="text-[10px] text-[#b7c9ef]">المكتشفة</div>
                  <div className="text-lg font-black text-white tabular-nums mt-0.5">
                    {activeJob.stats.discovered.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#1a242e] border border-white/[0.06] p-3">
                  <div className="text-[10px] text-[#b7c9ef]">تم جلبها</div>
                  <div className="text-lg font-black text-sky-300 tabular-nums mt-0.5">
                    {activeJob.stats.fetched.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#1a242e] border border-white/[0.06] p-3">
                  <div className="text-[10px] text-[#b7c9ef]">المحفوظة</div>
                  <div className="text-lg font-black text-[#4CAF50] tabular-nums mt-0.5">
                    {activeJob.stats.saved.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#1a242e] border border-white/[0.06] p-3">
                  <div className="text-[10px] text-[#b7c9ef]">الفاشلة</div>
                  <div className="text-lg font-black text-red-400 tabular-nums mt-0.5">
                    {activeJob.stats.failed.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#1a242e] border border-white/[0.06] p-3">
                  <div className="text-[10px] text-[#b7c9ef]">المتكررة</div>
                  <div className="text-lg font-black text-[#f9c400] tabular-nums mt-0.5">
                    {activeJob.stats.duplicates.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#1a242e] border border-white/[0.06] p-3">
                  <div className="text-[10px] text-[#b7c9ef]">في الطابور</div>
                  <div className="text-lg font-black text-white tabular-nums mt-0.5">
                    {activeJob.stats.queued.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#1a242e] border border-white/[0.06] p-3">
                  <div className="text-[10px] text-[#b7c9ef]">السرعة</div>
                  <div className="text-sm font-black text-white tabular-nums mt-1">
                    {activeJob.stats.itemsPerMinute} <span className="text-[10px] font-normal text-[#b7c9ef]">/د</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#1a242e] border border-white/[0.06] p-3">
                  <div className="text-[10px] text-[#b7c9ef]">المتبقي التقريبي</div>
                  <div className="text-sm font-black text-white tabular-nums mt-1">
                    {formatEta(activeJob.stats.etaSeconds)}
                  </div>
                </div>
              </div>

              {/* Live Operations & Error Log Stream */}
              <div className="rounded-2xl bg-[#070f16] border border-white/[0.08] p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#b7c9ef]">
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                    <span>السجل المباشر للعمليات والأخطاء (محفوظ على القرص)</span>
                  </span>
                  <span className="tabular-nums text-[11px]">{activeJob.logs.length} سجل حديث</span>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] font-mono">
                  {activeJob.logs.length === 0 ? (
                    <div className="text-white/40 py-2">بانتظار بدء العمليات...</div>
                  ) : (
                    activeJob.logs.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-white/40 shrink-0 tabular-nums">
                          {new Date(log.ts).toLocaleTimeString('en-GB', { hour12: false })}
                        </span>
                        <span
                          className={
                            log.level === 'error'
                              ? 'text-red-300'
                              : log.level === 'warn'
                                ? 'text-amber-300'
                                : log.level === 'success'
                                  ? 'text-[#4CAF50]'
                                  : 'text-[#b7c9ef]'
                          }
                        >
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* PAGINATED RESULTS MANAGEMENT                                    */}
          {/* =============================================================== */}
          {activeJob && (
            <div className="rounded-3xl bg-[#0c1821] border border-white/[0.08] p-5 sm:p-6 space-y-5">
              {/* Filter Tabs & Search & Export */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: 'all', label: 'الكل', count: paginatedData?.counts.all ?? activeJob.stats.processed },
                      { key: 'ready', label: 'جاهز للحفظ', count: paginatedData?.counts.ready ?? 0 },
                      { key: 'duplicate', label: 'مكرر', count: paginatedData?.counts.duplicate ?? activeJob.stats.duplicates },
                      { key: 'failed', label: 'فاشل', count: paginatedData?.counts.failed ?? activeJob.stats.failed },
                      { key: 'saved', label: 'محفوظ', count: paginatedData?.counts.saved ?? activeJob.stats.saved },
                      { key: 'excluded', label: 'مستبعد', count: paginatedData?.counts.excluded ?? activeJob.stats.excluded },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setResultsStatusFilter(tab.key);
                        setResultsPage(1);
                      }}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold tabular-nums cursor-pointer whitespace-nowrap ${
                        resultsStatusFilter === tab.key
                          ? 'bg-[#D92321] text-white'
                          : 'bg-[#1a242e] text-[#b7c9ef] hover:text-white'
                      }`}
                    >
                      {tab.label} ({tab.count.toLocaleString('en-US')})
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#b7c9ef] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={resultsSearch}
                      onChange={(e) => {
                        setResultsSearch(e.target.value);
                        setResultsPage(1);
                      }}
                      placeholder="بحث بالعنوان أو الرابط..."
                      className="rounded-xl bg-[#1a242e] border border-white/10 pr-8 pl-3 py-1.5 text-xs text-white placeholder:text-[#b7c9ef]/50 focus:outline-none w-52"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      user &&
                      downloadJobExportApi({
                        user,
                        jobId: activeJob.id,
                        format: 'json',
                        statusFilter: resultsStatusFilter,
                        customApiUrl,
                      }).catch((e) => onNotify(e.message))
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    <FileJson className="w-3.5 h-3.5 text-sky-400" />
                    <span>تصدير JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      user &&
                      downloadJobExportApi({
                        user,
                        jobId: activeJob.id,
                        format: 'csv',
                        statusFilter: resultsStatusFilter,
                        customApiUrl,
                      }).catch((e) => onNotify(e.message))
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1a242e] hover:bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#4CAF50]" />
                    <span>تصدير CSV</span>
                  </button>
                </div>
              </div>

              {/* Bulk Save & Selection Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#1a242e]/80 border border-white/[0.06] p-3.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllOnPage}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0c1821] hover:bg-white/10 border border-white/10 px-3 py-1.5 font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-[#4CAF50]" />
                    <span>تحديد الكل في الصفحة</span>
                  </button>

                  {selectedSeqs.size > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedSeqs(new Set())}
                        className="rounded-xl bg-[#0c1821] hover:bg-white/10 border border-white/10 px-3 py-1.5 font-bold text-[#b7c9ef] cursor-pointer whitespace-nowrap"
                      >
                        إلغاء التحديد ({selectedSeqs.size})
                      </button>
                      <button
                        type="button"
                        onClick={handleExcludeSelected}
                        className="rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-400/30 px-3 py-1.5 font-bold text-red-200 cursor-pointer whitespace-nowrap"
                      >
                        استبعاد المحدد
                      </button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-[#f9c400]" />
                    <select
                      value={saveTargetCategoryOverride}
                      onChange={(e) => setSaveTargetCategoryOverride(e.target.value)}
                      className="rounded-xl bg-[#0c1821] border border-white/10 px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="">القسم: {activeJob.config.targetCategory || 'تلقائي'}</option>
                      {availableCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSeqs.size > 0 && (
                    <button
                      type="button"
                      disabled={batchSaving}
                      onClick={handleSaveSelectedToCatalog}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#4CAF50] hover:bg-[#43a047] disabled:opacity-60 px-4 py-1.5 font-extrabold text-white cursor-pointer whitespace-nowrap"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>حفظ المحدد ({selectedSeqs.size})</span>
                    </button>
                  )}

                  {(paginatedData?.counts.ready ?? 0) > 0 && (
                    <button
                      type="button"
                      disabled={batchSaving}
                      onClick={handleSaveAllReadyInBatches}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#D92321] hover:bg-[#b81c1a] disabled:opacity-60 px-4 py-1.5 font-extrabold text-white cursor-pointer whitespace-nowrap"
                    >
                      {batchSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>
                        حفظ كل الجاهز على دفعات ({(paginatedData?.counts.ready ?? 0).toLocaleString('en-US')})
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {batchSaveProgress && (
                <div className="rounded-xl bg-[#4CAF50]/10 border border-[#4CAF50]/30 px-4 py-2.5 flex items-center justify-between text-xs text-white">
                  <span className="font-bold">جاري الكتابة الدفعية إلى Firebase Firestore...</span>
                  <span className="font-black tabular-nums">
                    {batchSaveProgress.done.toLocaleString('en-US')} / {batchSaveProgress.total.toLocaleString('en-US')}
                  </span>
                </div>
              )}

              {/* Results Table */}
              <div className="overflow-x-auto rounded-2xl border border-white/[0.08]">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#09121a] text-[#b7c9ef] border-b border-white/10">
                    <tr>
                      <th className="p-3 w-10">تحديد</th>
                      <th className="p-3">العمل المستورد</th>
                      <th className="p-3">التصنيف والبيانات</th>
                      <th className="p-3">الوسائط والروابط</th>
                      <th className="p-3">الحالة والتكرار</th>
                      <th className="p-3 text-left">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {loadingResults && (!paginatedData || paginatedData.items.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[#b7c9ef]">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                          <span>جاري قراءة صفحة النتائج من القرص...</span>
                        </td>
                      </tr>
                    ) : !paginatedData || paginatedData.items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-[#b7c9ef]">
                          لا توجد نتائج مطابقة للفلتر الحالي.
                        </td>
                      </tr>
                    ) : (
                      paginatedData.items.map((rec) => {
                        const m = rec.movie;
                        const isSelected = selectedSeqs.has(rec.seq);
                        const dup = currentPageDuplicates.get(rec.seq);
                        return (
                          <tr key={rec.seq} className="hover:bg-white/[0.02]">
                            <td className="p-3 align-top">
                              <button
                                type="button"
                                disabled={!m || rec.status === 'failed' || rec.status === 'excluded'}
                                onClick={() => toggleSelectSeq(rec.seq)}
                                className="text-[#b7c9ef] hover:text-white disabled:opacity-30 cursor-pointer"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-[#4CAF50]" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td className="p-3 align-top">
                              <div className="flex items-start gap-3">
                                <div className="w-11 h-16 rounded-lg overflow-hidden bg-[#1a242e] shrink-0 border border-white/10">
                                  {m?.poster ? (
                                    <img
                                      src={m.poster}
                                      alt={m.title}
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white/30">
                                      <Film className="w-4 h-4" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 space-y-0.5">
                                  <div className="font-extrabold text-white line-clamp-1">
                                    {m?.title || 'تعذر قراءة العنوان'}
                                  </div>
                                  {m?.englishTitle && (
                                    <div className="text-[11px] text-[#b7c9ef] font-latin line-clamp-1">
                                      {m.englishTitle}
                                    </div>
                                  )}
                                  <div className="text-[10px] text-white/50 font-latin truncate max-w-[240px]">
                                    {rec.sourceUrl}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 align-top text-[#b7c9ef]">
                              {m ? (
                                <div className="space-y-0.5 tabular-nums">
                                  <div className="text-white font-bold">
                                    {m.year} · {m.duration} · ★ {m.imdb}
                                  </div>
                                  <div className="text-[11px] line-clamp-1">
                                    {[...m.categories, ...m.genres].slice(0, 3).join(' · ')}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-red-300 text-[11px]">{rec.error || 'فشل الاستخراج'}</span>
                              )}
                            </td>
                            <td className="p-3 align-top text-[11px] text-[#b7c9ef] tabular-nums">
                              {m ? (
                                <div className="space-y-0.5">
                                  <div>
                                    سيرفرات: <span className="text-white font-bold">{m.servers.length}</span> · تحميل:{' '}
                                    <span className="text-white font-bold">{m.downloads.length}</span>
                                  </div>
                                  <div>
                                    طاقم: <span className="text-white font-bold">{m.cast.length}</span> · تريلر:{' '}
                                    <span className="text-white font-bold">{m.trailerUrl ? 'نعم' : 'لا'}</span>
                                  </div>
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="p-3 align-top">
                              <div className="space-y-1">
                                <div
                                  className={`font-extrabold ${
                                    rec.status === 'saved'
                                      ? 'text-[#4CAF50]'
                                      : rec.status === 'failed'
                                        ? 'text-red-400'
                                        : rec.status === 'duplicate' || dup
                                          ? 'text-[#f9c400]'
                                          : rec.status === 'excluded'
                                            ? 'text-white/40'
                                            : 'text-sky-300'
                                  }`}
                                >
                                  {rec.status === 'saved'
                                    ? 'محفوظ في الكتالوج'
                                    : rec.status === 'failed'
                                      ? 'فشل الجلب'
                                      : rec.status === 'duplicate'
                                        ? 'مكرر'
                                        : rec.status === 'excluded'
                                          ? 'مستبعد'
                                          : dup
                                            ? 'مطابق لفيلم موجود'
                                            : 'جاهز للحفظ'}
                                </div>
                                {dup && (
                                  <div className="text-[10px] text-amber-300/90 line-clamp-1">
                                    {dup.reasonLabel}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-3 align-top text-left">
                              <div className="flex items-center justify-end gap-1.5">
                                {m && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewRecord(rec)}
                                    title="معاينة البيانات قبل الحفظ"
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#1a242e] hover:bg-white/15 border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white cursor-pointer whitespace-nowrap"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-sky-400" />
                                    <span>معاينة</span>
                                  </button>
                                )}
                                {rec.status === 'failed' && (
                                  <button
                                    type="button"
                                    onClick={() => handleControlJob('retry-failed', { seqs: [rec.seq] })}
                                    className="inline-flex items-center gap-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 px-2.5 py-1.5 text-[11px] font-bold text-sky-200 cursor-pointer whitespace-nowrap"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>إعادة</span>
                                  </button>
                                )}
                                {rec.sourceUrl && (
                                  <a
                                    href={rec.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center rounded-lg bg-[#1a242e] hover:bg-white/15 border border-white/10 p-1.5 text-[#b7c9ef] hover:text-white"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {paginatedData && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#b7c9ef]">
                  <div className="tabular-nums">
                    صفحة <span className="text-white font-bold">{paginatedData.page}</span> من{' '}
                    <span className="text-white font-bold">{paginatedData.totalPages}</span> · إجمالي مطابق:{' '}
                    <span className="text-white font-bold">
                      {paginatedData.totalFiltered.toLocaleString('en-US')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={resultsPageSize}
                      onChange={(e) => {
                        setResultsPageSize(Number(e.target.value));
                        setResultsPage(1);
                      }}
                      className="rounded-xl bg-[#1a242e] border border-white/10 px-2.5 py-1.5 text-white tabular-nums"
                    >
                      <option value={25}>25 / صفحة</option>
                      <option value={50}>50 / صفحة</option>
                      <option value={100}>100 / صفحة</option>
                    </select>

                    <button
                      type="button"
                      disabled={paginatedData.page <= 1}
                      onClick={() => setResultsPage((p) => Math.max(1, p - 1))}
                      className="rounded-xl bg-[#1a242e] hover:bg-white/10 disabled:opacity-40 border border-white/10 px-3 py-1.5 font-bold text-white cursor-pointer"
                    >
                      السابق
                    </button>
                    <button
                      type="button"
                      disabled={paginatedData.page >= paginatedData.totalPages}
                      onClick={() => setResultsPage((p) => Math.min(paginatedData.totalPages, p + 1))}
                      className="rounded-xl bg-[#1a242e] hover:bg-white/10 disabled:opacity-40 border border-white/10 px-3 py-1.5 font-bold text-white cursor-pointer"
                    >
                      التالي
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      <AdvancedImporterPreviewModal
        record={previewRecord}
        duplicateInfo={
          previewRecord?.movie
            ? currentPageDuplicates.get(previewRecord.seq) ||
              detectMovieDuplicate(previewRecord.movie, catalogLookupMaps)
            : null
        }
        onClose={() => setPreviewRecord(null)}
        onSaveSingle={handleSaveFromPreview}
        saving={batchSaving}
      />
    </div>
  );
}
