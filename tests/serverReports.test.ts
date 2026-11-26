import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  buildAutoBrokenServerReportPayload,
  clearStoredServerReportsForTests,
  hasRecentlyReportedServerIssue,
  isBrokenServerRequest,
  loadPendingGuestServerReports,
  mapMediaKindToRequestType,
  markPendingServerReportsSynced,
  markServerIssueReportedLocally,
} from '../src/lib/serverReports';

test('buildAutoBrokenServerReportPayload builds bounded auto-written payloads for movies, series, and wrestling', () => {
  assert.equal(mapMediaKindToRequestType('movie'), 'فيلم');
  assert.equal(mapMediaKindToRequestType('series'), 'مسلسل');
  assert.equal(mapMediaKindToRequestType('tv'), 'مسلسل');
  assert.equal(mapMediaKindToRequestType('wrestling'), 'عرض مصارعة');

  const moviePayload = buildAutoBrokenServerReportPayload({
    item: { id: 'm-101', title: 'Running Man ' + 'X'.repeat(250), kind: 'movie' },
    activeServerLabel: 'Abyssplayer',
    totalServers: 4,
  });
  assert.equal(moviePayload.type, 'فيلم');
  assert.equal(moviePayload.title.length <= 200, true);
  assert.equal(moviePayload.notes.length <= 500, true);
  assert.equal(moviePayload.notes.includes('لا يوجد سيرفر شغال'), true);
  assert.equal(moviePayload.dedupeKey, 'm-101::s0::e0');

  const epPayload = buildAutoBrokenServerReportPayload({
    item: { id: 's-202', title: 'Dead City', kind: 'series' },
    seasonNumber: 2,
    episodeNumber: 5,
    activeServerLabel: 'سيرفر 1',
    totalServers: 2,
  });
  assert.equal(epPayload.type, 'مسلسل');
  assert.equal(epPayload.title.includes('الحلقة 05'), true);
  assert.equal(epPayload.dedupeKey, 's-202::s2::e5');
  assert.equal(isBrokenServerRequest({ title: epPayload.title, notes: epPayload.notes }), true);
  assert.equal(isBrokenServerRequest({ title: 'طلب فيلم جديد', notes: '1080p' }), false);
});

test('serverReports handles local cooldown deduplication and pending guest queue flush tracking', () => {
  clearStoredServerReportsForTests();
  const payload = buildAutoBrokenServerReportPayload({
    item: { id: 'm-9', title: 'Test Movie', kind: 'movie' },
    activeServerLabel: 'Ok',
    totalServers: 3,
  });

  const t0 = 1_700_000_000_000;
  assert.equal(hasRecentlyReportedServerIssue(payload.dedupeKey, t0), false);
  markServerIssueReportedLocally(payload.dedupeKey, payload, false, t0);

  assert.equal(hasRecentlyReportedServerIssue(payload.dedupeKey, t0 + 60_000), true);
  assert.equal(hasRecentlyReportedServerIssue(payload.dedupeKey, t0 + 15 * 60_000), false);

  const pending = loadPendingGuestServerReports();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].dedupeKey, payload.dedupeKey);

  markPendingServerReportsSynced([payload.dedupeKey]);
  assert.equal(loadPendingGuestServerReports().length, 0);
  clearStoredServerReportsForTests();
});

test('PlayerModal and App.tsx wire broken-server reporting and centered تم الإبلاغ confirmation overlay', () => {
  const modalsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/Modals.tsx'), 'utf8');
  assert.equal(modalsSrc.includes('handleReportBrokenServers'), true);
  assert.equal(modalsSrc.includes('renderCenterReportOverlay'), true);
  assert.equal(modalsSrc.includes('تم الإبلاغ'), true);
  assert.equal(modalsSrc.includes('إبلاغ: لا يوجد سيرفر شغال'), true);

  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.equal(appSrc.includes('onReportBrokenServers={handleReportBrokenServers}'), true);
  assert.equal(appSrc.includes('loadPendingGuestServerReports'), true);
});
