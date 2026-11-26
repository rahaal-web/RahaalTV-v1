import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearCachedCatalogSnapshot,
  compactMediaItemForCache,
  loadCachedCatalogSnapshot,
  mergeProgressiveMediaItems,
  normalizeFirestoreMediaRecord,
  saveCachedCatalogSnapshot,
  sortMediaCatalog,
} from '../src/lib/catalogCache';
import {
  buildDefaultBuiltInProfile,
  getFirestoreInstanceForProfile,
} from '../src/lib/dbConnectionManager';
import type { MediaItem } from '../src/types/media';

test('normalizeFirestoreMediaRecord normalizes Firestore timestamps and defaults cleanly', () => {
  const item = normalizeFirestoreMediaRecord('doc-123', {
    title: 'فيلم تجريبي',
    englishTitle: 'Sample Movie',
    kind: 'movie',
    categories: ['افلام اجنبية'],
    genres: ['أكشن'],
    year: '2026',
    imdb: '7.8',
    createdAt: { toMillis: () => 1700000000000 },
    updatedAt: { toMillis: () => 1700000500000 },
    poster: 'https://cdn.example.com/p.jpg',
    backdrop: 'https://cdn.example.com/b.jpg',
  });

  assert.equal(item.id, 'doc-123');
  assert.equal(item.slug, 'doc-123');
  assert.equal(item.imdb, 7.8);
  assert.equal(item.createdAtMs, 1700000000000);
  assert.equal(item.updatedAtMs, 1700000500000);
  assert.equal(item.poster_url, 'https://cdn.example.com/p.jpg');
  assert.equal(item.backdrop_url, 'https://cdn.example.com/b.jpg');
});

test('mergeProgressiveMediaItems prefers primary docs, keeps extra secondary docs, and sorts newest first', () => {
  const cachedOld = normalizeFirestoreMediaRecord('m1', {
    title: 'Old Cached Title',
    updatedAtMs: 1000,
    createdAtMs: 1000,
  });
  const cachedExtra = normalizeFirestoreMediaRecord('m2', {
    title: 'Extra Older Item',
    updatedAtMs: 500,
    createdAtMs: 500,
  });
  const freshM1 = normalizeFirestoreMediaRecord('m1', {
    title: 'Fresh Updated Title',
    updatedAtMs: 2000,
    createdAtMs: 1000,
  });
  const freshM3 = normalizeFirestoreMediaRecord('m3', {
    title: 'Brand New Item',
    updatedAtMs: 3000,
    createdAtMs: 3000,
  });

  const merged = mergeProgressiveMediaItems([freshM1, freshM3], [cachedOld, cachedExtra]);
  assert.deepEqual(
    merged.map((i) => i.id),
    ['m3', 'm1', 'm2']
  );
  assert.equal(merged[1].title, 'Fresh Updated Title');
});

test('saveCachedCatalogSnapshot & loadCachedCatalogSnapshot prioritize hero IDs and trim heavy payloads', () => {
  const store = new Map<string, string>();
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    const heavySeasons = [
      {
        seasonNumber: 1,
        episodes: Array.from({ length: 40 }, (_, i) => ({
          episodeNumber: i + 1,
          title: `الحلقة ${i + 1}`,
          servers: Array.from({ length: 8 }, (__, s) => ({
            name: `Server ${s}`,
            url: `https://video.example.com/ep-${i}/srv-${s}`,
            quality: '1080p',
          })),
        })),
      },
    ];

    const items: MediaItem[] = Array.from({ length: 80 }, (_, idx) =>
      normalizeFirestoreMediaRecord(`item-${idx}`, {
        title: `عمل ${idx}`,
        englishTitle: `Work ${idx}`,
        kind: idx === 75 ? 'series' : 'movie',
        seasons: idx === 75 ? heavySeasons : [],
        updatedAtMs: 10_000 + idx,
        createdAtMs: 10_000 + idx,
      })
    );

    const key = 'test_catalog_cache_scope';
    saveCachedCatalogSnapshot(items, {
      storageKey: key,
      priorityIds: ['item-0', 'item-75'],
    });

    const loaded = loadCachedCatalogSnapshot(key);
    assert.ok(loaded.length > 0 && loaded.length <= 60);
    // Priority hero IDs are preserved even when older
    assert.ok(loaded.some((i) => i.id === 'item-0'));
    const cachedSeries = loaded.find((i) => i.id === 'item-75');
    assert.ok(cachedSeries);
    // Oversized seasons list was stripped in compact localStorage snapshot
    assert.equal(cachedSeries.seasons?.length ?? 0, 0);
    // Sorted newest first
    assert.deepEqual(loaded.map((i) => i.id), sortMediaCatalog(loaded).map((i) => i.id));

    clearCachedCatalogSnapshot(key);
    assert.deepEqual(loadCachedCatalogSnapshot(key), []);
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  }
});

test('compactMediaItemForCache retains compact series seasons and truncates huge story text', () => {
  const longStory = 'أ'.repeat(900);
  const compact = compactMediaItemForCache(
    normalizeFirestoreMediaRecord('series-small', {
      title: 'مسلسل قصير',
      kind: 'series',
      story: longStory,
      seasons: [
        {
          seasonNumber: 1,
          episodes: [
            {
              episodeNumber: 1,
              title: 'الحلقة 1',
              servers: [{ name: 'S1', url: 'https://cdn.example.com/1', quality: 'HD' }],
            },
          ],
        },
      ],
    })
  );
  assert.equal(compact.story.length, 420);
  assert.equal(compact.seasons?.length ?? 0, 1);
});

test('getFirestoreInstanceForProfile works safely in Node without IndexedDB', () => {
  const builtIn = buildDefaultBuiltInProfile();
  const fsInst = getFirestoreInstanceForProfile(builtIn);
  assert.ok(fsInst);
});
