import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  clearAllSensitiveCaches,
  clearSensitiveCachesForUser,
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
} from '../src/lib/sensitiveDataCache';
import type { RecentlyWatchedRecord, VisitorRequest } from '../src/types/media';

test('sensitiveDataCache isolates watchlist, recently watched, and requests strictly per UID and DB scope', () => {
  clearAllSensitiveCaches();
  const t0 = 1_700_000_000_000;

  saveCachedUserWatchlist('user_a', ['m1', 'm2', 'm1'], t0, 'proj1__db1');
  saveCachedUserWatchlist('user_b', ['m9'], t0, 'proj1__db1');

  assert.deepEqual(loadCachedUserWatchlist('user_a', t0 + 1000, 'proj1__db1'), ['m1', 'm2']);
  assert.deepEqual(loadCachedUserWatchlist('user_b', t0 + 1000, 'proj1__db1'), ['m9']);
  assert.equal(loadCachedUserWatchlist('user_a', t0 + 1000, 'proj2__db1'), null);
  assert.equal(loadCachedUserWatchlist('guest', t0 + 1000, 'proj1__db1'), null);

  const rwA: RecentlyWatchedRecord = {
    id: 'user_a__m1',
    userId: 'user_a',
    mediaId: 'm1',
    title: 'Film A',
    kind: 'movie',
    poster: 'p.jpg',
    backdrop: 'b.jpg',
    year: '2026',
    quality: '1080p',
    slug: 'film-a',
    englishTitle: 'Film A',
    positionSec: 120,
    durationSec: 600,
    progressPct: 20,
    completed: false,
    lastWatchedAtMs: t0,
    createdAtMs: t0,
  };
  const rwForeign: RecentlyWatchedRecord = { ...rwA, id: 'user_b__m2', userId: 'user_b', mediaId: 'm2' };

  saveCachedUserRecentlyWatched('user_a', [rwA, rwForeign], t0, 'proj1__db1');
  const loadedRw = loadCachedUserRecentlyWatched('user_a', t0 + 5000, 'proj1__db1');
  assert.equal(loadedRw?.length, 1);
  assert.equal(loadedRw?.[0].mediaId, 'm1');

  const reqs: VisitorRequest[] = [
    {
      id: 'r1',
      userId: 'user_a',
      requesterName: 'A',
      title: 'Movie A',
      type: 'فيلم',
      notes: '',
      status: 'pending',
      adminNote: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'r2',
      userId: 'user_b',
      requesterName: 'B',
      title: 'Movie B',
      type: 'فيلم',
      notes: '',
      status: 'approved',
      adminNote: '',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ];
  saveCachedUserRequests('user_a', false, reqs, t0, 'proj1__db1');
  const userScoped = loadCachedUserRequests('user_a', false, t0 + 1000, 'proj1__db1');
  assert.equal(userScoped?.length, 1);
  assert.equal(userScoped?.[0].id, 'r1');

  saveCachedUserRequests('user_a', true, reqs, t0, 'proj1__db1');
  const ownerScoped = loadCachedUserRequests('user_a', true, t0 + 1000, 'proj1__db1');
  assert.equal(ownerScoped?.length, 2);

  // Switching to user_b purges user_a sensitive entries
  purgeSensitiveCachesExcept('user_b', 'proj1__db1');
  assert.equal(loadCachedUserWatchlist('user_a', t0 + 1000, 'proj1__db1'), null);
  assert.equal(loadCachedUserRecentlyWatched('user_a', t0 + 1000, 'proj1__db1'), null);
  assert.deepEqual(loadCachedUserWatchlist('user_b', t0 + 1000, 'proj1__db1'), ['m9']);

  clearSensitiveCachesForUser('user_b', 'proj1__db1');
  assert.equal(loadCachedUserWatchlist('user_b', t0 + 1000, 'proj1__db1'), null);
});

test('sensitiveDataCache expires TTL entries and throttles unchanged deferred profile writes', () => {
  clearAllSensitiveCaches();
  const t0 = 1_700_000_000_000;

  saveCachedUserWatchlist('u1', ['m1'], t0, 'scope1');
  assert.deepEqual(loadCachedUserWatchlist('u1', t0 + 60_000, 'scope1'), ['m1']);
  // After 7 hours (> 6h TTL), expired cache returns null
  assert.equal(loadCachedUserWatchlist('u1', t0 + 7 * 60 * 60 * 1000, 'scope1'), null);

  const fp1 = computeUserProfileSyncFingerprint({
    uid: 'u1',
    displayName: 'User One',
    photoURL: 'https://example.com/a.jpg',
    email: 'u1@example.com',
    isAdminUser: false,
  });
  const fp2 = computeUserProfileSyncFingerprint({
    uid: 'u1',
    displayName: 'User One Updated',
    photoURL: 'https://example.com/a.jpg',
    email: 'u1@example.com',
    isAdminUser: false,
  });

  assert.equal(shouldRunDeferredProfileSync('u1', fp1, t0, 'scope1'), true);
  markProfileSynced('u1', fp1, t0, 'scope1');
  assert.equal(shouldRunDeferredProfileSync('u1', fp1, t0 + 5 * 60 * 1000, 'scope1'), false);
  // Changed fingerprint triggers sync immediately
  assert.equal(shouldRunDeferredProfileSync('u1', fp2, t0 + 5 * 60 * 1000, 'scope1'), true);
  // Same fingerprint after 35 minutes (> 30m TTL) triggers refresh
  assert.equal(shouldRunDeferredProfileSync('u1', fp1, t0 + 35 * 60 * 1000, 'scope1'), true);

  clearAllSensitiveCaches();
});

test('normalizeFirestoreRequestRecord parses timestamps safely and App.tsx/RecentlyWatchedSection implement multistage sensitive hydration & arrow removal', () => {
  const normalized = normalizeFirestoreRequestRecord('req_1', {
    userId: 'u9',
    requesterName: 'Ahmed',
    title: 'Inception',
    type: 'movie',
    notes: '4K',
    status: 'approved',
    createdAt: {
      toMillis: () => 1700000005000,
      toDate: () => new Date(1700000005000),
    },
  });
  assert.equal(normalized.createdMs, 1700000005000);
  assert.equal(normalized.item.id, 'req_1');
  assert.equal(normalized.item.status, 'approved');

  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.equal(appSrc.includes('getUserAdminRoleFromCache'), true);
  assert.equal(appSrc.includes('hydrateUserWatchlistCacheFirst'), true);
  assert.equal(appSrc.includes("if (authLoading || !firebaseUser || !isOwnerAdmin || view !== 'admin') return;"), true);
  assert.equal(appSrc.includes("if (view !== 'admin' && footerTopic !== 'requests') return;"), true);

  const rwSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/RecentlyWatchedSection.tsx'), 'utf8');
  assert.equal(rwSrc.includes('السابق في شاهدته مؤخراً'), false);
  assert.equal(rwSrc.includes('التالي في شاهدته مؤخراً'), false);
});
