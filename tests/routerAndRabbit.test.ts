import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildRouteHash,
  createNavKey,
  normalizeArchiveFilters,
  parseRouteFromLocationParts,
  readRouterHistoryState,
  sanitizeInternalRouteUrl,
  ScrollPositionStore,
} from '../src/lib/router';
import { RunningRabbitLoader } from '../src/components/RunningRabbitLoader';

test('Hash Router: parses and builds home, archive, single, admin, and not_found cleanly', () => {
  const home = parseRouteFromLocationParts({ pathname: '/', search: '', hash: '#/' });
  assert.equal(home.route.view, 'home');
  assert.equal(home.needsCanonicalReplace, false);
  assert.equal(buildRouteHash(home.route), '#/');

  const archiveHash = buildRouteHash({
    view: 'archive',
    filters: normalizeArchiveFilters({
      query: 'الرحال',
      category: 'مسلسلات عربية',
      minImdb: 7.5,
      preset: 'rating',
    }),
    sort: 'rating',
    page: 2,
    pageSize: 48,
  });
  assert.ok(archiveHash.startsWith('#/browse?'));
  const parsedArchive = parseRouteFromLocationParts({
    pathname: '/',
    search: '',
    hash: archiveHash,
  });
  assert.equal(parsedArchive.route.view, 'archive');
  if (parsedArchive.route.view === 'archive') {
    assert.equal(parsedArchive.route.filters.query, 'الرحال');
    assert.equal(parsedArchive.route.filters.category, 'مسلسلات عربية');
    assert.equal(parsedArchive.route.filters.minImdb, 7.5);
    assert.equal(parsedArchive.route.sort, 'rating');
    assert.equal(parsedArchive.route.page, 2);
    assert.equal(parsedArchive.route.pageSize, 48);
  }

  const singleHash = buildRouteHash({
    view: 'single',
    watchKey: 'running-man-2026',
    episode: 3,
    openDownloads: true,
  });
  assert.equal(singleHash, '#/watch/running-man-2026?ep=3&dl=1');
  const parsedSingle = parseRouteFromLocationParts({
    pathname: '/',
    search: '',
    hash: singleHash,
  });
  assert.deepEqual(parsedSingle.route, {
    view: 'single',
    watchKey: 'running-man-2026',
    episode: 3,
    openDownloads: true,
  });

  const adminHash = buildRouteHash({ view: 'admin', adminTab: 'notifications' });
  assert.equal(adminHash, '#/admin/notifications');
  const parsedAdmin = parseRouteFromLocationParts({
    pathname: '/',
    search: '',
    hash: adminHash,
  });
  assert.deepEqual(parsedAdmin.route, { view: 'admin', adminTab: 'notifications' });

  const notFoundHash = parseRouteFromLocationParts({
    pathname: '/',
    search: '',
    hash: '#/nonexistent/screen',
  });
  assert.equal(notFoundHash.route.view, 'not_found');
  assert.equal(buildRouteHash(notFoundHash.route), '#/not-found');
});

test('Hash Router: normalizes legacy query/path URLs onto canonical hash routes', () => {
  const legacyQuery = parseRouteFromLocationParts({
    pathname: '/',
    search: '?watch=foo-bar&ep=4&dl=1',
    hash: '',
  });
  assert.equal(legacyQuery.needsCanonicalReplace, true);
  assert.deepEqual(legacyQuery.route, {
    view: 'single',
    watchKey: 'foo-bar',
    episode: 4,
    openDownloads: true,
  });

  const legacyAdmin = parseRouteFromLocationParts({
    pathname: '/admin',
    search: '',
    hash: '',
  });
  assert.equal(legacyAdmin.needsCanonicalReplace, true);
  assert.deepEqual(legacyAdmin.route, { view: 'admin' });

  const unknownPath = parseRouteFromLocationParts({
    pathname: '/does-not-exist',
    search: '',
    hash: '',
  });
  assert.equal(unknownPath.needsCanonicalReplace, true);
  assert.equal(unknownPath.route.view, 'not_found');
});

test('sanitizeInternalRouteUrl: allows internal routes only and blocks external/unsafe URLs', () => {
  assert.equal(sanitizeInternalRouteUrl('#/'), '#/');
  assert.equal(sanitizeInternalRouteUrl('#/browse?cat=movies'), '#/browse?cat=movies');
  assert.equal(sanitizeInternalRouteUrl('/browse'), '#/browse');
  assert.equal(sanitizeInternalRouteUrl('/admin/notifications'), '#/admin/notifications');

  const blocked = [
    'https://evil.com/phish',
    'http://evil.com',
    '//evil.com/path',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    '#/watch/foo\nLocation: https://evil.com',
    '#/watch/foo\\bar',
    'relative-without-slash',
    '/unknown-external-path',
  ];
  for (const candidate of blocked) {
    assert.equal(sanitizeInternalRouteUrl(candidate), null, `Expected null for ${candidate}`);
  }
});

test('ScrollPositionStore & HistoryState: saves, restores, and bounds to 50 entries', () => {
  const store = new ScrollPositionStore();
  const keys: string[] = [];
  for (let i = 0; i < 55; i += 1) {
    const key = `${createNavKey()}_${i}`;
    keys.push(key);
    store.save(key, i * 100);
  }
  assert.equal(store.get(keys[0]), undefined);
  assert.equal(store.get(keys[4]), undefined);
  assert.equal(store.get(keys[5]), 500);
  assert.equal(store.get(keys[54]), 5400);

  const validState = readRouterHistoryState({
    __rtv: true,
    navKey: 'rtv_1',
    routeHash: '#/browse',
    internalDepth: 2,
    overlay: 'search',
  });
  assert.deepEqual(validState, {
    __rtv: true,
    navKey: 'rtv_1',
    routeHash: '#/browse',
    internalDepth: 2,
    overlay: 'search',
  });
  assert.equal(readRouterHistoryState({ foo: 'bar' }), null);
});

test('RunningRabbitLoader: renders clean accessible spinner without rabbit animation, hides on error with retry, and supports reduced motion', () => {
  const loadingHtml = renderToStaticMarkup(
    React.createElement(RunningRabbitLoader, {
      variant: 'section',
      label: 'جاري تحميل الكتالوج...',
      delayMs: 120,
    })
  );
  assert.ok(loadingHtml.includes('role="status"'));
  assert.ok(loadingHtml.includes('جاري التحميل'));
  assert.ok(loadingHtml.includes('data-rtv-loader="spinner"'));
  assert.ok(!loadingHtml.includes('rtv-rabbit-body'));
  assert.ok(!loadingHtml.includes('<svg'));
  assert.ok(loadingHtml.includes('--rtv-loader-delay:120ms'));

  const errorHtml = renderToStaticMarkup(
    React.createElement(RunningRabbitLoader, {
      variant: 'section',
      error: 'تعذر الاتصال بالخادم',
      onRetry: () => undefined,
    })
  );
  assert.ok(!errorHtml.includes('rtv-rabbit-body'));
  assert.ok(!errorHtml.includes('rtv-rabbit-ear'));
  assert.ok(errorHtml.includes('role="alert"'));
  assert.ok(errorHtml.includes('تعذر الاتصال بالخادم'));
  assert.ok(errorHtml.includes('إعادة المحاولة'));

  const indexCss = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
  assert.ok(indexCss.includes('prefers-reduced-motion: reduce'));
  assert.ok(indexCss.includes('.rtv-loader-delayed'));
});
