import type { User } from 'firebase/auth';
import {
  bulkSaveMediaToFirestore,
  bulkUpdateMediaInFirestore,
  saveMediaToFirestore,
} from './firebase';
import {
  registerSourceIndexEntriesApi,
  updateJobItemsStatusApi,
} from './advancedImporterTransport';
import type { CastMember, MediaItem } from '../types/media';
import type {
  AdvancedImportedMovie,
  DuplicateMatchInfo,
  ImporterJobItemStatus,
  SourceIndexEntry,
} from '../types/advancedImporter';

export {
  _setStaticBackendDetectedForTest,
  controlImporterJobApi,
  deleteImporterJobApi,
  downloadJobExportApi,
  extractSingleMovieApi,
  fetchSourceIndexApi,
  getImporterJobApi,
  getPaginatedJobItemsApi,
  getSavedActiveImporterJobId,
  listImporterJobsApi,
  parseJsonResponseSafe,
  registerSourceIndexEntriesApi,
  setSavedActiveImporterJobId,
  shouldUseBrowserImporter,
  startBulkImporterJobApi,
  StaticBackendUnavailableError,
  updateJobItemsStatusApi,
} from './advancedImporterTransport';

// =========================================================================
// Duplicate Detection Engine (Source URL, Movie ID, Title + Year)
// =========================================================================
export function normalizeDedupUrl(raw: string): string {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  try {
    const u = new URL(clean);
    u.hash = '';
    return u.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return clean.replace(/\/+$/, '').toLowerCase();
  }
}

export function normalizeTitleForDedup(rawTitle: string): string {
  return String(rawTitle || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // Arabic diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\b(فيلم|مسلسل|مشاهدة|تحميل|مترجم|مدبلج|كامل|اون\s*لاين|أون\s*لاين|watch|download)\b/gi, ' ')
    .replace(/\b(19\d\d|20[0-3]\d)\b/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CatalogLookupMaps {
  byId: Map<string, MediaItem>;
  bySlug: Map<string, MediaItem>;
  byTitleYear: Map<string, MediaItem>;
  bySourceUrl: Map<string, SourceIndexEntry>;
  byImdbId: Map<string, string>;
}

export function buildCatalogLookupMaps(
  catalog: MediaItem[],
  sourceIndex: Record<string, SourceIndexEntry>
): CatalogLookupMaps {
  const byId = new Map<string, MediaItem>();
  const bySlug = new Map<string, MediaItem>();
  const byTitleYear = new Map<string, MediaItem>();
  const bySourceUrl = new Map<string, SourceIndexEntry>();
  const byImdbId = new Map<string, string>();

  for (const item of catalog) {
    byId.set(item.id.toLowerCase(), item);
    if (item.slug) bySlug.set(item.slug.toLowerCase(), item);
    const yr = String(item.year || '').trim();
    const arKey = `${normalizeTitleForDedup(item.title)}::${yr}`;
    if (arKey.length > 4 && !byTitleYear.has(arKey)) {
      byTitleYear.set(arKey, item);
    }
    const enKey = `${normalizeTitleForDedup(item.englishTitle)}::${yr}`;
    if (enKey.length > 4 && !byTitleYear.has(enKey)) {
      byTitleYear.set(enKey, item);
    }
  }

  for (const entry of Object.values(sourceIndex)) {
    const canon = normalizeDedupUrl(entry.canonicalUrl || entry.sourceUrl);
    if (canon) bySourceUrl.set(canon, entry);
    if (entry.imdbId && entry.mediaId) {
      byImdbId.set(entry.imdbId.toLowerCase(), entry.mediaId);
    }
  }

  return { byId, bySlug, byTitleYear, bySourceUrl, byImdbId };
}

export function detectMovieDuplicate(
  movie: AdvancedImportedMovie,
  maps: CatalogLookupMaps
): DuplicateMatchInfo | null {
  const normUrl = normalizeDedupUrl(movie.sourceUrl);
  if (normUrl) {
    const srcMatch = maps.bySourceUrl.get(normUrl);
    if (srcMatch && maps.byId.has(srcMatch.mediaId.toLowerCase())) {
      const cat = maps.byId.get(srcMatch.mediaId.toLowerCase())!;
      return {
        matchedCatalogId: cat.id,
        matchedTitle: cat.title,
        matchedYear: cat.year,
        reason: 'source_url',
        reasonLabel: 'تطابق عبر الرابط الأصلي (Source URL)',
      };
    }
  }

  const byIdMatch =
    maps.byId.get(movie.id.toLowerCase()) ||
    maps.bySlug.get(movie.slug.toLowerCase()) ||
    (movie.externalId ? maps.byId.get(movie.externalId.toLowerCase()) : undefined);
  if (byIdMatch) {
    return {
      matchedCatalogId: byIdMatch.id,
      matchedTitle: byIdMatch.title,
      matchedYear: byIdMatch.year,
      reason: 'movie_id',
      reasonLabel: 'تطابق عبر معرّف الفيلم / Slug',
    };
  }

  if (movie.imdbId) {
    const mappedMediaId = maps.byImdbId.get(movie.imdbId.toLowerCase());
    if (mappedMediaId && maps.byId.has(mappedMediaId.toLowerCase())) {
      const cat = maps.byId.get(mappedMediaId.toLowerCase())!;
      return {
        matchedCatalogId: cat.id,
        matchedTitle: cat.title,
        matchedYear: cat.year,
        reason: 'imdb_id',
        reasonLabel: `تطابق عبر معرّف IMDb (${movie.imdbId})`,
      };
    }
  }

  const yr = String(movie.year || '').trim();
  const arKey = `${normalizeTitleForDedup(movie.title)}::${yr}`;
  const enKey = `${normalizeTitleForDedup(movie.englishTitle)}::${yr}`;
  const titleMatch =
    (arKey.length > 4 ? maps.byTitleYear.get(arKey) : undefined) ||
    (enKey.length > 4 ? maps.byTitleYear.get(enKey) : undefined);

  if (titleMatch) {
    return {
      matchedCatalogId: titleMatch.id,
      matchedTitle: titleMatch.title,
      matchedYear: titleMatch.year,
      reason: 'title_year',
      reasonLabel: `تطابق الاسم وسنة الإنتاج (${titleMatch.year})`,
    };
  }

  return null;
}

// =========================================================================
// Strict Firestore Media Mapper & Chunked Batch Saving
// =========================================================================
export function mapImportedMovieToMediaItem(
  movie: AdvancedImportedMovie,
  options?: {
    existingId?: string;
    existingItem?: MediaItem;
    targetCategory?: string;
  }
): MediaItem {
  const targetCat = String(options?.targetCategory || '').trim();
  const categories = Array.from(
    new Set(
      [
        ...(targetCat ? [targetCat] : []),
        ...(movie.categories || []),
      ]
        .map((c) => c.trim())
        .filter(Boolean)
    )
  ).slice(0, 10);
  if (categories.length === 0) categories.push('افلام');

  const genres = Array.from(
    new Set(
      [...(movie.genres || []), ...(movie.tags || [])]
        .map((g) => g.trim())
        .filter((g) => g && !categories.includes(g))
    )
  ).slice(0, 10);
  if (genres.length === 0) genres.push('دراما');

  const castList: CastMember[] = [...(movie.cast || [])];
  for (const dir of movie.directors || []) {
    const cleanDir = dir.trim();
    if (!cleanDir) continue;
    if (!castList.some((c) => c.name.toLowerCase() === cleanDir.toLowerCase() && /مخرج|director/i.test(c.role))) {
      const parts = cleanDir.split(/\s+/).filter(Boolean);
      const initials =
        parts.length >= 2
          ? `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
          : cleanDir.slice(0, 2).toUpperCase();
      castList.unshift({ name: cleanDir, role: 'مخرج', initials });
    }
  }

  const finalId = options?.existingId || movie.id || `imp-${Date.now()}`;
  const cleanPoster = (movie.poster_url || movie.poster || '').trim();
  const cleanBackdrop = (movie.backdrop_url || movie.backdrop || cleanPoster).trim();

  return {
    id: finalId,
    slug: options?.existingItem?.slug || movie.slug || finalId,
    title: movie.title.trim() || 'فيلم مستورد',
    englishTitle: movie.englishTitle.trim() || movie.title.trim() || 'Imported Movie',
    kind: movie.kind || 'movie',
    categories,
    genres,
    year: String(movie.year || '2026').slice(0, 10),
    country: movie.country || 'غير محدد',
    language: movie.language || 'مترجم للعربية',
    quality: movie.quality || 'WEB-DL',
    duration: movie.duration || '120 دقيقة',
    imdb: Number.isFinite(Number(movie.imdb)) ? Number(movie.imdb) : 7.5,
    votes: movie.votes || '10,000',
    views: options?.existingItem?.views ?? 0,
    likes: options?.existingItem?.likes ?? 0,
    pinned: options?.existingItem?.pinned ?? false,
    isNew: options?.existingItem?.isNew ?? true,
    comingSoon: options?.existingItem?.comingSoon ?? false,
    poster: cleanPoster,
    backdrop: cleanBackdrop,
    poster_url: cleanPoster,
    backdrop_url: cleanBackdrop,
    poster_width: movie.poster_width || 0,
    poster_height: movie.poster_height || 0,
    backdrop_width: movie.backdrop_width || 0,
    backdrop_height: movie.backdrop_height || 0,
    image_source: movie.image_source || (cleanPoster ? 'scraped' : 'none'),
    image_quality_status: movie.image_quality_status || (cleanBackdrop ? 'unknown' : 'missing_backdrop'),
    tagline:
      (movie.tagline || (movie.releaseDate && movie.releaseDate !== movie.year ? `تاريخ الإصدار: ${movie.releaseDate}` : movie.story))
        .slice(0, 380),
    story: (movie.story || movie.title).slice(0, 2900),
    shortUrl: options?.existingItem?.shortUrl || '',
    trailerUrl: movie.trailerUrl || '',
    trailerLabel: movie.title || 'الإعلان الرسمي',
    trailerDuration: '02:00',
    cast: castList.slice(0, 25),
    seasons: movie.seasons || [],
    franchiseIds: options?.existingItem?.franchiseIds || [],
    servers: (movie.servers || []).slice(0, 15),
    downloads: (movie.downloads || []).slice(0, 15),
  };
}

export async function saveSingleImportedMovieToCatalog(params: {
  movie: AdvancedImportedMovie;
  uid: string;
  user: User | null;
  targetCategory?: string;
  existingItem?: MediaItem;
  customApiUrl?: string;
}): Promise<MediaItem> {
  const isUpdate = Boolean(params.existingItem);
  const mediaItem = mapImportedMovieToMediaItem(params.movie, {
    existingId: params.existingItem?.id,
    existingItem: params.existingItem,
    targetCategory: params.targetCategory,
  });

  await saveMediaToFirestore(mediaItem, params.uid, !isUpdate);

  if (params.user && params.movie.sourceUrl) {
    await registerSourceIndexEntriesApi(
      params.user,
      [
        {
          mediaId: mediaItem.id,
          sourceUrl: params.movie.sourceUrl,
          canonicalUrl: params.movie.sourceUrl,
          externalId: params.movie.externalId,
          imdbId: params.movie.imdbId,
          title: mediaItem.title,
          englishTitle: mediaItem.englishTitle,
          year: mediaItem.year,
          updatedAt: Date.now(),
        },
      ],
      params.customApiUrl
    ).catch(() => undefined);
  }

  return mediaItem;
}

export async function saveImportedBatchToCatalog(params: {
  records: Array<{
    seq: number;
    movie: AdvancedImportedMovie;
    duplicateMatch?: DuplicateMatchInfo | null;
  }>;
  duplicateMode: 'skip' | 'update';
  targetCategory?: string;
  catalogMap: Map<string, MediaItem>;
  uid: string;
  user: User | null;
  jobId?: string;
  batchSize?: number;
  customApiUrl?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ created: number; updated: number; skipped: number }> {
  const createQueue: Array<{ seq: number; media: MediaItem; src: AdvancedImportedMovie }> = [];
  const updateQueue: Array<{ seq: number; media: MediaItem; src: AdvancedImportedMovie }> = [];
  const statusUpdates: Array<{ seq: number; status: ImporterJobItemStatus; savedMediaId?: string }> = [];
  const sourceEntries: SourceIndexEntry[] = [];
  let skipped = 0;

  for (const row of params.records) {
    if (row.duplicateMatch) {
      if (params.duplicateMode === 'skip') {
        skipped++;
        statusUpdates.push({
          seq: row.seq,
          status: 'duplicate',
          savedMediaId: row.duplicateMatch.matchedCatalogId,
        });
        continue;
      }
      const existing = params.catalogMap.get(row.duplicateMatch.matchedCatalogId.toLowerCase());
      const media = mapImportedMovieToMediaItem(row.movie, {
        existingId: row.duplicateMatch.matchedCatalogId,
        existingItem: existing,
        targetCategory: params.targetCategory,
      });
      updateQueue.push({ seq: row.seq, media, src: row.movie });
    } else {
      const media = mapImportedMovieToMediaItem(row.movie, {
        targetCategory: params.targetCategory,
      });
      createQueue.push({ seq: row.seq, media, src: row.movie });
    }
  }

  const chunkLimit = Math.min(35, Math.max(5, params.batchSize || 25));
  const totalWork = createQueue.length + updateQueue.length;
  let completedWork = 0;

  for (let i = 0; i < createQueue.length; i += chunkLimit) {
    const slice = createQueue.slice(i, i + chunkLimit);
    await bulkSaveMediaToFirestore(
      slice.map((x) => x.media),
      params.uid
    );
    for (const x of slice) {
      statusUpdates.push({ seq: x.seq, status: 'saved', savedMediaId: x.media.id });
      if (x.src.sourceUrl) {
        sourceEntries.push({
          mediaId: x.media.id,
          sourceUrl: x.src.sourceUrl,
          canonicalUrl: x.src.sourceUrl,
          externalId: x.src.externalId,
          imdbId: x.src.imdbId,
          title: x.media.title,
          englishTitle: x.media.englishTitle,
          year: x.media.year,
          updatedAt: Date.now(),
        });
      }
    }
    completedWork += slice.length;
    params.onProgress?.(completedWork, totalWork);
  }

  for (let i = 0; i < updateQueue.length; i += chunkLimit) {
    const slice = updateQueue.slice(i, i + chunkLimit);
    await bulkUpdateMediaInFirestore(
      slice.map((x) => x.media),
      params.uid
    );
    for (const x of slice) {
      statusUpdates.push({ seq: x.seq, status: 'saved', savedMediaId: x.media.id });
      if (x.src.sourceUrl) {
        sourceEntries.push({
          mediaId: x.media.id,
          sourceUrl: x.src.sourceUrl,
          canonicalUrl: x.src.sourceUrl,
          externalId: x.src.externalId,
          imdbId: x.src.imdbId,
          title: x.media.title,
          englishTitle: x.media.englishTitle,
          year: x.media.year,
          updatedAt: Date.now(),
        });
      }
    }
    completedWork += slice.length;
    params.onProgress?.(completedWork, totalWork);
  }

  if (params.user) {
    if (sourceEntries.length > 0) {
      await registerSourceIndexEntriesApi(params.user, sourceEntries, params.customApiUrl).catch(
        () => undefined
      );
    }
    if (params.jobId && statusUpdates.length > 0) {
      await updateJobItemsStatusApi(
        params.user,
        params.jobId,
        statusUpdates,
        params.customApiUrl
      ).catch(() => undefined);
    }
  }

  return {
    created: createQueue.length,
    updated: updateQueue.length,
    skipped,
  };
}
