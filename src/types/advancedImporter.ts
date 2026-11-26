import type {
  CastMember,
  DownloadMirror,
  ImageQualityStatus,
  MediaKind,
  SeasonItem,
  StreamServer,
} from './media';

export type ImporterDiscoveryMode = 'auto' | 'sitemap' | 'api' | 'html';
export type ImporterDuplicateMode = 'skip' | 'update';
export type ImporterJobStatus =
  | 'discovering'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error';

export type ImporterJobItemStatus =
  | 'ready'
  | 'failed'
  | 'duplicate'
  | 'saved'
  | 'excluded';

export interface AdvancedImportedMovie {
  id: string;
  externalId: string;
  slug: string;
  imdbId: string;
  sourceUrl: string;
  sourceDomain: string;
  title: string;
  englishTitle: string;
  story: string;
  tagline: string;
  year: string;
  releaseDate: string;
  kind: MediaKind;
  categories: string[];
  genres: string[];
  tags: string[];
  duration: string;
  imdb: number;
  votes: string;
  country: string;
  language: string;
  quality: string;
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
  trailerUrl: string;
  directors: string[];
  cast: CastMember[];
  servers: StreamServer[];
  downloads: DownloadMirror[];
  seasons?: SeasonItem[];
}

export interface ImporterJobConfig {
  sourceUrl: string;
  sectionUrls: string[];
  discoveryMode: ImporterDiscoveryMode;
  maxItems: number;
  concurrency: number;
  delayMs: number;
  batchSize: number;
  duplicateMode: ImporterDuplicateMode;
  targetCategory: string;
  useAdapters: boolean;
  enrichExternalMetadata: boolean;
}

export interface ImporterJobLog {
  id: string;
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  url?: string;
}

export interface ImporterJobStats {
  discovered: number;
  queued: number;
  processed: number;
  fetched: number;
  saved: number;
  failed: number;
  duplicates: number;
  excluded: number;
  activeElapsedMs: number;
  itemsPerMinute: number;
  etaSeconds: number | null;
  progressPercent: number;
}

export interface ImporterJobSummary {
  id: string;
  siteTitle: string;
  sourceUrl: string;
  discoveryStrategy: string;
  status: ImporterJobStatus;
  discoveryPhase: 'pending' | 'scanning' | 'done';
  config: ImporterJobConfig;
  stats: ImporterJobStats;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  error?: string;
  logs: ImporterJobLog[];
}

export interface ImporterJobResultRecord {
  seq: number;
  itemKey: string;
  sourceUrl: string;
  status: ImporterJobItemStatus;
  error?: string;
  duplicateMatchId?: string;
  duplicateReason?: string;
  savedMediaId?: string;
  fetchedAt: number;
  movie?: AdvancedImportedMovie;
}

export interface ImporterPaginatedItemsResponse {
  ok: boolean;
  jobId: string;
  page: number;
  pageSize: number;
  totalFiltered: number;
  totalPages: number;
  counts: {
    all: number;
    ready: number;
    duplicate: number;
    failed: number;
    saved: number;
    excluded: number;
  };
  items: ImporterJobResultRecord[];
}

export interface DuplicateMatchInfo {
  matchedCatalogId: string;
  matchedTitle: string;
  matchedYear: string;
  reason: 'source_url' | 'movie_id' | 'imdb_id' | 'title_year';
  reasonLabel: string;
}

export interface SourceIndexEntry {
  mediaId: string;
  sourceUrl: string;
  canonicalUrl: string;
  externalId?: string;
  imdbId?: string;
  title: string;
  englishTitle?: string;
  year: string;
  updatedAt: number;
}
