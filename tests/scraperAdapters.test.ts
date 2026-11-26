import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdapterIdFromDomain,
  createDefaultScraperAdapter,
  exportAdaptersBundleJson,
  matchAdapterForUrl,
  normalizeAdapterDomain,
  parseImportedAdaptersJson,
} from '../src/lib/scraperAdapterUtils';
import {
  analyzeSiteStructure,
  BaselineParseFn,
  detectProtectionChallenge,
  executeAdapterScrape,
  isBlockedHostEnhanced,
  testAdapterCandidate,
} from '../server/scraperAdapterEngine';
import {
  parseHtmlToMediaWithHints,
  scrapeFullItemWithSubpages,
} from '../server';

const makeMockBaselineParse: (overrides?: {
  baselineServers?: { id: string; name: string; url: string }[];
  baselineEpisodeCount?: number;
}) => BaselineParseFn =
  (overrides) =>
  (_html, sourceUrl) => {
    const epCount = overrides?.baselineEpisodeCount ?? 0;
    const episodes = Array.from({ length: epCount }, (_, i) => ({
      number: i + 1,
      title: `الحلقة ${i + 1}`,
      duration: '42 دقيقة',
      quality: 'HD',
      watchUrl: `${sourceUrl}`,
      servers: [],
    }));
    const srvs = (overrides?.baselineServers || []).map((s) => ({
      id: s.id,
      name: s.name,
      mode: 'url' as const,
      url: s.url,
      embedCode: '',
      quality: '1080p',
      speed: 'سريع',
      tag: 'HD',
    }));

    return {
      media: {
        title: 'مسلسل تجريبي متعدد المواسم',
        englishTitle: 'Multi Season Test Series',
        kind: epCount > 0 ? 'series' : 'movie',
        categories: ['مسلسلات'],
        genres: ['دراما', 'إثارة'],
        year: '2026',
        country: 'الولايات المتحدة',
        language: 'مترجم للعربية',
        quality: '1080p',
        duration: '45 دقيقة',
        imdb: 8.2,
        poster: 'https://cdn.example.com/poster.jpg',
        backdrop: '',
        story: 'قصة تجريبية لاختبار محرك تحليل المصادر واستخراج المواسم والحلقات.',
        sourceUrl,
        trailerUrl: '',
        cast: [],
        servers: srvs,
        downloads: [],
        seasons:
          episodes.length > 0
            ? [{ seasonNumber: 1, label: 'الموسم 1', year: '2026', episodes }]
            : [],
      },
      hints: {
        ajaxEmbedIds: [],
        candidateOrigins: [],
      },
    };
  };

const FFOSTA_STYLE_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <title>مشاهدة مسلسل الإمبراطورية - ffosta-tv.baby</title>
  <meta name="description" content="قصة المسلسل الكاملة" />
</head>
<body>
  <div class="pm-ads-banner">
    <a class="btnDowns" href="https://ffosta-tv.baby/watch.php?vid=70C19e669">تحميل مباشر إعلان</a>
  </div>

  <a class="xtgo" href="https://ffosta-tv.baby/play.php?vid=374905744">شاهد الآن</a>

  <ul class="WatchList">
    <li class="active" data-embed-url="https://1vid.examplecdn.net/embed-a111.html">1vid</li>
    <li data-embed-url="https://vk.com/video_ext.php?oid=1&id=2">Vk</li>
    <li data-embed-url="https://ok.ru/videoembed/987654321">Ok</li>
    <li data-embed-url="https://vidmoly.to/embed-z999.html">Vidmoly</li>
  </ul>

  <iframe src="https://1vid.examplecdn.net/embed-a111.html" allowfullscreen></iframe>

  <div class="SeasonsList">
    <button class="tablinks active" data-season="1">الموسم الأول</button>
    <button class="tablinks" data-season="2">الموسم الثاني</button>
    <button class="tablinks" data-season="3">الموسم الثالث</button>
  </div>

  <div id="Season1" class="tabcontent">
    ${Array.from({ length: 7 }, (_, i) => `<a href="https://ffosta-tv.baby/play.php?vid=10${i + 1}">${i + 1}حلقة</a>`).join('\n')}
  </div>
  <div id="Season2" class="tabcontent">
    ${Array.from({ length: 7 }, (_, i) => `<a href="https://ffosta-tv.baby/play.php?vid=20${i + 1}">${i + 1}حلقة</a>`).join('\n')}
  </div>
  <div id="Season3" class="tabcontent">
    ${Array.from({ length: 7 }, (_, i) => `<a href="https://ffosta-tv.baby/play.php?vid=30${i + 1}">${i + 1}حلقة</a>`).join('\n')}
  </div>
</body>
</html>`;

async function withMockedFetch<T>(
  mockFn: (url: string) => { ok?: boolean; status?: number; body: string },
  run: () => Promise<T>
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const targetUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const res = mockFn(targetUrl);
    return new Response(res.body, {
      status: res.status ?? (res.ok === false ? 500 : 200),
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }) as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('Domain normalization, ID generation, matching & JSON export/import roundtrip work accurately', () => {
  assert.equal(normalizeAdapterDomain('https://WWW.FFOSTA-TV.baby/play.php?vid=123'), 'ffosta-tv.baby');
  assert.equal(buildAdapterIdFromDomain('ffosta-tv.baby'), 'ffosta-tv-baby');

  const active = createDefaultScraperAdapter('ffosta-tv.baby', 'https://ffosta-tv.baby/play.php?vid=1');
  active.domainAliases = ['mirror.ffosta-tv.org'];
  active.status = 'supported';
  active.enabled = true;

  const disabled = createDefaultScraperAdapter('blocked.example.com');
  disabled.enabled = false;

  assert.equal(matchAdapterForUrl('https://sub.ffosta-tv.baby/watch.php?vid=9', [active, disabled])?.id, active.id);
  assert.equal(matchAdapterForUrl('https://mirror.ffosta-tv.org/play.php?vid=9', [active, disabled])?.id, active.id);
  assert.equal(matchAdapterForUrl('https://blocked.example.com/movie/1', [active, disabled]), null);
  assert.equal(
    matchAdapterForUrl('https://blocked.example.com/movie/1', [active, disabled], { includeDisabled: true })?.id,
    disabled.id
  );

  const json = exportAdaptersBundleJson([active, disabled]);
  const parsed = parseImportedAdaptersJson(json);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.adapters.length, 2);
  assert.equal(parsed.adapters[0].domain, 'ffosta-tv.baby');
  assert.deepEqual(parsed.adapters[0].domainAliases, ['mirror.ffosta-tv.org']);
});

test('SSRF guard and protection detector block private IPs and detect challenges without bypassing', () => {
  for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.25', '172.16.0.1', '::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isBlockedHostEnhanced(host), true, `Expected ${host} to be blocked`);
  }
  for (const host of ['ffosta-tv.baby', 'vidmoly.to', '1.1.1.1']) {
    assert.equal(isBlockedHostEnhanced(host), false, `Expected ${host} to be allowed`);
  }

  const cf = detectProtectionChallenge(403, '<html><title>Just a moment...</title><div class="cf-turnstile"></div></html>');
  assert.equal(cf.isProtected, true);

  const loginWall = detectProtectionChallenge(401, '<html><body><form>تسجيل الدخول <input type="password"/></form></body></html>');
  assert.equal(loginWall.isProtected, true);

  const drm = detectProtectionChallenge(200, '<script>navigator.requestMediaKeySystemAccess("com.widevine.alpha", [])</script>');
  assert.equal(drm.isProtected, true);

  const clean = detectProtectionChallenge(200, '<html><title>Movie</title><body><iframe src="https://vidmoly.to/e/1"></iframe></body></html>');
  assert.equal(clean.isProtected, false);
});

test('analyzeSiteStructure diagnoses multi-season PHP Melody HTML and discovers real server names', async () => {
  const report = await analyzeSiteStructure({
    url: 'https://ffosta-tv.baby/play.php?vid=374905744',
    rawHtml: FFOSTA_STYLE_HTML,
    contentTypeHint: 'series',
    baselineParseFn: makeMockBaselineParse({
      baselineServers: [{ id: 's1', name: 'سيرفر 1', url: 'https://1vid.examplecdn.net/embed-a111.html' }],
      baselineEpisodeCount: 7,
    }),
  });

  assert.equal(report.ok, true);
  assert.equal(report.domain, 'ffosta-tv.baby');
  assert.equal(report.signals.cmsFingerprint, 'PHP Melody Streaming');
  assert.equal(report.signals.hasTabsForServers, true);
  assert.equal(report.signals.hasSeasonTabs, true);
  assert.equal(report.signals.visibleServerCount, 4);
  assert.equal(report.signals.visibleEpisodeCount, 21);
  assert.deepEqual(report.signals.sampleServerNames, ['1vid', 'Vk', 'Ok', 'Vidmoly']);

  const codes = new Set(report.diagnostics.map((d) => d.code));
  assert.ok(codes.has('episode_count_mismatch_or_capped'));
  assert.ok(codes.has('missing_servers_per_episode'));
  assert.ok(codes.has('episodes_in_separate_pages_or_seasons'));
  assert.ok(codes.has('servers_inside_tabs'));
  assert.ok(codes.has('site_specific_server_pattern_or_names'));
});

test('executeAdapterScrape & testAdapterCandidate extract all 21 episodes across 3 seasons and preserve real server names', async () => {
  await withMockedFetch(
    () => ({ ok: true, status: 200, body: FFOSTA_STYLE_HTML }),
    async () => {
      const report = await analyzeSiteStructure({
        url: 'https://ffosta-tv.baby/play.php?vid=374905744',
        rawHtml: FFOSTA_STYLE_HTML,
        contentTypeHint: 'series',
        baselineParseFn: makeMockBaselineParse({
          baselineServers: [{ id: 's1', name: 'سيرفر 1', url: 'https://1vid.examplecdn.net/embed-a111.html' }],
          baselineEpisodeCount: 7,
        }),
      });

      const candidate = {
        ...report.proposedAdapter,
        siteSettings: {
          ...report.proposedAdapter.siteSettings,
          requestDelayMs: 0,
          verifyMode: 'none' as const,
        },
      };

      const testResult = await testAdapterCandidate({
        url: 'https://ffosta-tv.baby/play.php?vid=374905744',
        rawHtml: FFOSTA_STYLE_HTML,
        adapter: candidate,
        contentTypeHint: 'series',
        baselineParseFn: makeMockBaselineParse({
          baselineServers: [{ id: 's1', name: 'سيرفر 1', url: 'https://1vid.examplecdn.net/embed-a111.html' }],
          baselineEpisodeCount: 7,
        }),
      });

      assert.equal(testResult.ok, true);
      assert.equal(testResult.seasonsDiscovered, 3);
      assert.equal(testResult.episodesDiscovered, 21);
      assert.equal(testResult.rootServersCount, 4);
      assert.deepEqual(testResult.extractedServerNames, ['1vid', 'Vk', 'Ok', 'Vidmoly']);
      assert.equal(testResult.missingEpisodes.length, 0);
      assert.equal(
        testResult.extractedPreview?.servers.some((s) => s.url.includes('70C19e669')),
        false
      );
      assert.equal(testResult.visibleComparison.completenessVerdict, 'complete');
      assert.equal(testResult.recommendedStatus, 'supported');
    }
  );
});

test('Pre-save test honesty gate flags missing episode gaps and prevents supported status', async () => {
  const gappedHtml = `<!doctype html><html><head><title>Gapped Series</title></head><body>
    <ul class="WatchList">
      <li data-embed-url="https://ok.ru/videoembed/12345">Ok</li>
    </ul>
    <div class="episodes-list">
      <a href="/watch.php?vid=1">الحلقة 1</a>
      <a href="/watch.php?vid=2">الحلقة 2</a>
      <a href="/watch.php?vid=4">الحلقة 4</a>
      <a href="/watch.php?vid=5">الحلقة 5</a>
    </div>
  </body></html>`;

  await withMockedFetch(
    () => ({ ok: true, status: 200, body: gappedHtml }),
    async () => {
      const adapter = createDefaultScraperAdapter('gap-series.example.com', 'https://gap-series.example.com/s1');
      adapter.siteSettings.verifyMode = 'none';
      adapter.siteSettings.requestDelayMs = 0;
      adapter.serverRules.itemSelector = '.WatchList li';
      adapter.episodeRules.containerSelector = '.episodes-list';

      const result = await testAdapterCandidate({
        url: 'https://gap-series.example.com/s1',
        rawHtml: gappedHtml,
        adapter,
        contentTypeHint: 'series',
        baselineParseFn: makeMockBaselineParse(),
      });

      assert.equal(result.episodesDiscovered, 4);
      assert.equal(result.missingEpisodes.length, 1);
      assert.equal(result.missingEpisodes[0].episodeNumber, 3);
      assert.notEqual(result.recommendedStatus, 'supported');
      assert.equal(result.recommendedStatus, 'needs_fix');
    }
  );
});

test('Old vs New comparisonDiff measures improvements over an earlier incomplete adapter', async () => {
  await withMockedFetch(
    () => ({ ok: true, status: 200, body: FFOSTA_STYLE_HTML }),
    async () => {
      const prevV1 = createDefaultScraperAdapter('ffosta-tv.baby', 'https://ffosta-tv.baby/play.php?vid=374905744');
      prevV1.version = 1;
      prevV1.siteSettings.verifyMode = 'none';
      prevV1.siteSettings.requestDelayMs = 0;
      prevV1.episodeRules.maxEpisodes = 5;
      prevV1.episodeRules.containerSelector = '.non-existent-box';
      prevV1.serverRules.itemSelector = '.non-existent-servers';
      prevV1.lastTestSummary = {
        testedUrl: 'https://ffosta-tv.baby/play.php?vid=374905744',
        contentTypeTested: 'series',
        testedAt: '2026-11-18T00:00:00.000Z',
        episodesDiscovered: 5,
        totalServersExtracted: 1,
        avgServersPerEpisode: 1,
        minServersPerEpisode: 1,
        maxServersPerEpisode: 1,
        missingEpisodesCount: 16,
        failedServersCount: 0,
        visibleEpisodesHint: 21,
        visibleServersHint: 4,
        recommendedStatus: 'needs_fix',
        summaryText: 'v1 partial',
      };

      const candidateV2 = createDefaultScraperAdapter('ffosta-tv.baby', 'https://ffosta-tv.baby/play.php?vid=374905744');
      candidateV2.version = 2;
      candidateV2.siteSettings.verifyMode = 'none';
      candidateV2.siteSettings.requestDelayMs = 0;
      candidateV2.episodeRules.containerSelector = '.tabcontent';
      candidateV2.episodeRules.seasonTabSelector = '.tablinks';
      candidateV2.episodeRules.seasonPanelSelector = '.tabcontent';
      candidateV2.episodeRules.preserveMultiSeason = true;
      candidateV2.serverRules.itemSelector = '.WatchList li';

      const execCheck = await executeAdapterScrape({
        url: 'https://ffosta-tv.baby/play.php?vid=374905744',
        rawHtml: FFOSTA_STYLE_HTML,
        adapter: candidateV2,
        baselineParseFn: makeMockBaselineParse(),
        contentTypeHint: 'series',
        deepEpisodeCrawl: false,
      });
      assert.equal(execCheck.media.seasons.length, 3);

      const testResult = await testAdapterCandidate({
        url: 'https://ffosta-tv.baby/play.php?vid=374905744',
        rawHtml: FFOSTA_STYLE_HTML,
        adapter: candidateV2,
        previousAdapter: prevV1,
        contentTypeHint: 'series',
        baselineParseFn: makeMockBaselineParse(),
      });

      assert.ok(testResult.comparisonDiff);
      assert.equal(testResult.comparisonDiff.previousVersion, 1);
      assert.equal(testResult.comparisonDiff.candidateVersion, 2);
      assert.equal(testResult.comparisonDiff.episodesDelta, 16);
      assert.ok(testResult.comparisonDiff.serversDelta > 0);
    }
  );
});

// =========================================================================
// Mandatory 3-Season Independent Per-Episode Server Binding Test Fixtures
// =========================================================================

function buildEpisodeWatchPageHtml(vid: string, seasonNum: number, epNum: number): string {
  // Intentionally includes Season 1 list BEFORE the episode's own xtgo play.php link to ensure
  // the scraper never hijacks watchSubpageUrl with Season 1 Ep 1!
  return `<!doctype html>
  <html lang="ar" dir="rtl">
  <head>
    <title>مشاهدة مسلسل الملحمة الموسم ${seasonNum} الحلقة ${epNum}</title>
  </head>
  <body>
    <div class="pm-ads-banner">
      <a href="https://tri-series.example.com/play.php?vid=99999">إعلان مزيف</a>
    </div>
    <div class="SeasonsList">
      <button class="tablinks" data-season="1">الموسم الأول</button>
      <button class="tablinks" data-season="2">الموسم الثاني</button>
      <button class="tablinks" data-season="3">الموسم الثالث</button>
    </div>
    <div id="Season1" class="tabcontent">
      <a href="https://tri-series.example.com/watch.php?vid=101">الحلقة 1</a>
      <a href="https://tri-series.example.com/watch.php?vid=102">الحلقة 2</a>
    </div>
    <a class="xtgo" href="https://tri-series.example.com/play.php?vid=${vid}">شاهد الحلقة ${epNum} الآن</a>
  </body>
  </html>`;
}

function buildEpisodePlayPageHtml(vid: string, seasonNum: number, epNum: number): string {
  return `<!doctype html>
  <html lang="ar" dir="rtl">
  <head>
    <title>سيرفرات مشاهدة الموسم ${seasonNum} الحلقة ${epNum} (vid=${vid})</title>
  </head>
  <body>
    <div class="pm-ads-banner">
      <a href="https://tri-series.example.com/watch.php?vid=88888">إعلان</a>
    </div>
    <ul class="WatchList">
      <li class="active" data-embed-url="https://vidmoly.examplecdn.net/embed-s${seasonNum}e${epNum}-1080p.html">Vidmoly 1080p</li>
      <li data-embed-url="https://okru.examplecdn.net/videoembed/s${seasonNum}e${epNum}-720p">Ok.ru 720p</li>
      <li data-embed-url="https://uqload.examplecdn.net/embed-s${seasonNum}e${epNum}-4k.mp4">Uqload 4K</li>
    </ul>
    <iframe src="https://vidmoly.examplecdn.net/embed-s${seasonNum}e${epNum}-1080p.html" allowfullscreen></iframe>
  </body>
  </html>`;
}

const THREE_SEASON_TABBED_SERIES_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <title>مسلسل الملحمة - جميع المواسم</title>
  <meta name="description" content="مسلسل تجريبي من 3 مواسم للتحقق من استقلالية سيرفرات كل حلقة." />
</head>
<body>
  <div class="trailer">
    <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">التريلر</a>
  </div>
  <!-- Decoy root server on the series landing page that MUST NOT be cloned onto Season 2/3 episodes -->
  <ul class="WatchList">
    <li data-embed-url="https://root-teaser.examplecdn.net/teaser-only.html">Teaser 720p</li>
  </ul>
  <div class="SeasonsList">
    <button class="tablinks active" data-season="1">الموسم الأول</button>
    <button class="tablinks" data-season="2">الموسم الثاني</button>
    <button class="tablinks" data-season="3">الموسم الثالث</button>
  </div>
  <div id="Season1" class="tabcontent">
    <a href="https://tri-series.example.com/watch.php?vid=101">الحلقة 1</a>
    <a href="https://tri-series.example.com/watch.php?vid=102">الحلقة 2</a>
    <a href="https://tri-series.example.com/watch.php?vid=103">الحلقة 3</a>
  </div>
  <div id="Season2" class="tabcontent">
    <a href="https://tri-series.example.com/watch.php?vid=201">الحلقة 1</a>
    <a href="https://tri-series.example.com/watch.php?vid=202">الحلقة 2</a>
    <a href="https://tri-series.example.com/watch.php?vid=203">الحلقة 3</a>
  </div>
  <div id="Season3" class="tabcontent">
    <a href="https://tri-series.example.com/watch.php?vid=301">الحلقة 1</a>
    <a href="https://tri-series.example.com/watch.php?vid=302">الحلقة 2</a>
    <a href="https://tri-series.example.com/watch.php?vid=303">الحلقة 3</a>
  </div>
</body>
</html>`;

function mockThreeSeasonRouter(url: string): { ok: boolean; status: number; body: string } {
  if (url === 'https://tri-series.example.com/series/epic') {
    return { ok: true, status: 200, body: THREE_SEASON_TABBED_SERIES_HTML };
  }
  if (url === 'https://tri-series.example.com/series/epic/season-2') {
    return {
      ok: true,
      status: 200,
      body: `<!doctype html><html><head><title>الموسم الثاني</title></head><body>
        <div class="episodes-list">
          <a href="https://tri-series.example.com/watch.php?vid=201">الحلقة 1</a>
          <a href="https://tri-series.example.com/watch.php?vid=202">الحلقة 2</a>
          <a href="https://tri-series.example.com/watch.php?vid=203">الحلقة 3</a>
        </div>
      </body></html>`,
    };
  }
  if (url === 'https://tri-series.example.com/series/epic/season-3') {
    return {
      ok: true,
      status: 200,
      body: `<!doctype html><html><head><title>الموسم الثالث</title></head><body>
        <div class="episodes-list">
          <a href="https://tri-series.example.com/watch.php?vid=301">الحلقة 1</a>
          <a href="https://tri-series.example.com/watch.php?vid=302">الحلقة 2</a>
          <a href="https://tri-series.example.com/watch.php?vid=303">الحلقة 3</a>
        </div>
      </body></html>`,
    };
  }
  const watchMatch = url.match(/watch\.php\?vid=(\d)(\d\d)/);
  if (watchMatch) {
    const sNum = Number(watchMatch[1]);
    const eNum = Number(watchMatch[2]);
    return { ok: true, status: 200, body: buildEpisodeWatchPageHtml(`${sNum}${watchMatch[2]}`, sNum, eNum) };
  }
  const playMatch = url.match(/play\.php\?vid=(\d)(\d\d)/);
  if (playMatch) {
    const sNum = Number(playMatch[1]);
    const eNum = Number(playMatch[2]);
    return { ok: true, status: 200, body: buildEpisodePlayPageHtml(`${sNum}${playMatch[2]}`, sNum, eNum) };
  }
  if (/examplecdn\.net/i.test(url)) {
    return { ok: true, status: 200, body: '<video src="https://cdn.examplecdn.net/stream.mp4"></video>' };
  }
  return { ok: false, status: 404, body: '<html><title>404 Not Found</title></html>' };
}

test('Mandatory 3-season test (Adapter Engine): each season & episode fetches independent servers via watch.php -> play.php without cross-season cloning', async () => {
  await withMockedFetch(mockThreeSeasonRouter, async () => {
    const adapter = createDefaultScraperAdapter('tri-series.example.com', 'https://tri-series.example.com/series/epic');
    adapter.siteSettings.verifyMode = 'none';
    adapter.siteSettings.requestDelayMs = 0;
    adapter.episodeRules.seasonTabSelector = '.SeasonsList .tablinks';
    adapter.episodeRules.seasonPanelSelector = '.tabcontent';
    adapter.episodeRules.containerSelector = '.tabcontent';
    adapter.episodeRules.preserveMultiSeason = true;
    adapter.serverRules.itemSelector = '.WatchList li';
    adapter.serverRules.preserveServerNames = true;
    adapter.navigationRules.followWatchSubpage = true;

    const result = await executeAdapterScrape({
      url: 'https://tri-series.example.com/series/epic',
      adapter,
      baselineParseFn: parseHtmlToMediaWithHints,
      contentTypeHint: 'series',
      deepEpisodeCrawl: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.media.seasons.length, 3);
    assert.ok(result.validationSummary);
    assert.equal(result.validationSummary.validEpisodes, 9);
    assert.equal(result.validationSummary.invalidEpisodes, 0);
    assert.equal(result.validationSummary.crossEpisodeContaminationDetected, false);

    for (const sNum of [1, 2, 3]) {
      const season = result.media.seasons.find((s) => s.seasonNumber === sNum);
      if (!season) throw new Error(`Season ${sNum} should exist`);
      assert.equal(season.episodes.length, 3);

      for (const eNum of [1, 2, 3]) {
        const ep: (typeof season.episodes)[number] | undefined = season.episodes.find(
          (e) => e.number === eNum
        );
        if (!ep) throw new Error(`S${sNum}E${eNum} should exist`);
        const expectedVid = `${sNum}0${eNum}`;
        assert.equal(ep.sourceUrl, `https://tri-series.example.com/watch.php?vid=${expectedVid}`);
        assert.equal(ep.watchSubpageUrl, `https://tri-series.example.com/play.php?vid=${expectedVid}`);
        const epServers: { id: string; name: string; mode: 'url' | 'embed'; url: string; quality: string }[] =
          ep.servers || [];
        assert.equal(epServers.length, 3, `S${sNum}E${eNum} should have 3 servers`);

        // Verify zero teaser/cross-episode leaks and exact per-episode server URLs, names, order & qualities
        assert.equal(epServers.some((srv) => srv.url.includes('teaser-only')), false);
        assert.deepEqual(
          epServers.map((srv) => srv.name),
          ['Vidmoly', 'Ok.ru', 'Uqload']
        );
        assert.deepEqual(
          epServers.map((srv) => srv.quality),
          ['1080p', '720p', '4K']
        );
        assert.deepEqual(
          epServers.map((srv) => srv.id),
          [`ep-s${sNum}-e${eNum}-srv-1`, `ep-s${sNum}-e${eNum}-srv-2`, `ep-s${sNum}-e${eNum}-srv-3`]
        );
        assert.ok(epServers[0].url.includes(`s${sNum}e${eNum}-1080p`));
        assert.ok(epServers[1].url.includes(`s${sNum}e${eNum}-720p`));
        assert.ok(epServers[2].url.includes(`s${sNum}e${eNum}-4k.mp4`));
        assert.equal(epServers[2].mode, 'url');
      }
    }
  });
});

test('Mandatory 3-season test (Adapter Engine): supports distributed separate season pages (/season-2, /season-3)', async () => {
  const distributedRootHtml = `<!doctype html>
  <html lang="ar" dir="rtl">
  <head><title>مسلسل الملحمة - المواسم المنفصلة</title></head>
  <body>
    <div class="SeasonsList">
      <a class="active" data-season="1" href="https://tri-series.example.com/series/epic-distributed">الموسم الأول</a>
      <a data-season="2" href="https://tri-series.example.com/series/epic/season-2">الموسم الثاني</a>
      <a data-season="3" href="https://tri-series.example.com/series/epic/season-3">الموسم الثالث</a>
    </div>
    <div class="episodes-list">
      <a href="https://tri-series.example.com/watch.php?vid=101">الحلقة 1</a>
      <a href="https://tri-series.example.com/watch.php?vid=102">الحلقة 2</a>
      <a href="https://tri-series.example.com/watch.php?vid=103">الحلقة 3</a>
    </div>
  </body></html>`;

  await withMockedFetch(
    (url) =>
      url === 'https://tri-series.example.com/series/epic-distributed'
        ? { ok: true, status: 200, body: distributedRootHtml }
        : mockThreeSeasonRouter(url),
    async () => {
      const adapter = createDefaultScraperAdapter(
        'tri-series.example.com',
        'https://tri-series.example.com/series/epic-distributed'
      );
      adapter.siteSettings.verifyMode = 'none';
      adapter.siteSettings.requestDelayMs = 0;
      adapter.episodeRules.containerSelector = '.episodes-list';
      adapter.episodeRules.preserveMultiSeason = true;
      adapter.serverRules.itemSelector = '.WatchList li';
      adapter.navigationRules.followWatchSubpage = true;

      const testResult = await testAdapterCandidate({
        url: 'https://tri-series.example.com/series/epic-distributed',
        adapter,
        contentTypeHint: 'series',
        baselineParseFn: parseHtmlToMediaWithHints,
      });

      assert.equal(testResult.ok, true);
      assert.equal(testResult.seasonsDiscovered, 3);
      assert.equal(testResult.episodesDiscovered, 9);
      assert.equal(testResult.validationSummary?.validEpisodes, 9);
      assert.equal(testResult.validationSummary?.invalidEpisodes, 0);
      assert.equal(testResult.recommendedStatus, 'supported');

      const s2Ep2 = testResult.extractedPreview?.seasons
        .find((s) => s.seasonNumber === 2)
        ?.episodes.find((e) => e.number === 2);
      const s3Ep3 = testResult.extractedPreview?.seasons
        .find((s) => s.seasonNumber === 3)
        ?.episodes.find((e) => e.number === 3);

      assert.ok(s2Ep2?.servers?.[0]?.url.includes('s2e2-1080p'));
      assert.ok(s3Ep3?.servers?.[0]?.url.includes('s3e3-1080p'));
      assert.equal(s2Ep2?.sourceUrl, 'https://tri-series.example.com/watch.php?vid=202');
      assert.equal(s3Ep3?.sourceUrl, 'https://tri-series.example.com/watch.php?vid=303');
    }
  );
});

test('Anti-contamination validation prevents copying root series servers when episodes share the root URL', async () => {
  const sharedRootHtml = `<!doctype html><html><head><title>مسلسل مشترك الرابط</title></head><body>
    <ul class="WatchList">
      <li data-embed-url="https://root-only.examplecdn.net/embed-root.html">RootSrv</li>
    </ul>
    <div class="episodes-list">
      <a href="https://shared.example.com/series/alpha">الحلقة 1</a>
      <a href="https://shared.example.com/series/alpha">الحلقة 2</a>
    </div>
  </body></html>`;

  await withMockedFetch(
    () => ({ ok: true, status: 200, body: sharedRootHtml }),
    async () => {
      const adapter = createDefaultScraperAdapter('shared.example.com', 'https://shared.example.com/series/alpha');
      adapter.siteSettings.verifyMode = 'none';
      adapter.siteSettings.requestDelayMs = 0;
      adapter.episodeRules.containerSelector = '.episodes-list';
      adapter.serverRules.itemSelector = '.WatchList li';

      const testResult = await testAdapterCandidate({
        url: 'https://shared.example.com/series/alpha',
        rawHtml: sharedRootHtml,
        adapter,
        contentTypeHint: 'series',
        baselineParseFn: parseHtmlToMediaWithHints,
      });

      assert.equal(testResult.ok, true);
      assert.equal(testResult.validationSummary?.crossEpisodeContaminationDetected, true);
      assert.equal(testResult.validationSummary?.invalidEpisodes, 2);
      assert.equal(testResult.recommendedStatus, 'needs_fix');
      for (const ep of testResult.extractedPreview?.seasons[0]?.episodes || []) {
        assert.equal(ep.servers?.length || 0, 0);
      }
    }
  );
});

test('Mandatory 3-season test (Baseline Server Scraper in server.ts): scrapes 3 seasons independently & preserves server names/qualities', async () => {
  await withMockedFetch(mockThreeSeasonRouter, async () => {
    const media = await scrapeFullItemWithSubpages(
      'https://tri-series.example.com/series/epic',
      THREE_SEASON_TABBED_SERIES_HTML
    );

    assert.equal(media.kind, 'series');
    assert.equal(media.seasons.length, 3);

    for (const sNum of [1, 2, 3]) {
      const season = media.seasons.find((s) => s.seasonNumber === sNum);
      if (!season) throw new Error(`Baseline Season ${sNum} should exist`);
      assert.equal(season.episodes.length, 3);

      for (const eNum of [1, 2, 3]) {
        const ep: (typeof season.episodes)[number] | undefined = season.episodes.find(
          (e) => e.number === eNum
        );
        if (!ep) throw new Error(`Baseline S${sNum}E${eNum} should exist`);
        const expectedVid = `${sNum}0${eNum}`;
        assert.equal(ep.sourceUrl, `https://tri-series.example.com/watch.php?vid=${expectedVid}`);
        assert.equal(ep.watchSubpageUrl, `https://tri-series.example.com/play.php?vid=${expectedVid}`);
        const epServers: { id: string; name: string; mode: 'url' | 'embed'; url: string; quality: string }[] =
          ep.servers || [];
        assert.equal(epServers.length, 3, `Baseline S${sNum}E${eNum} should have 3 servers`);
        assert.equal(epServers.some((srv) => srv.url.includes('teaser-only')), false);
        assert.deepEqual(
          epServers.map((srv) => srv.name),
          ['Vidmoly 1080p', 'Ok.ru 720p', 'Uqload 4K']
        );
        assert.deepEqual(
          epServers.map((srv) => srv.quality),
          ['1080P', '720P', '4K']
        );
        assert.ok(epServers[0].url.includes(`s${sNum}e${eNum}-1080p`));
        assert.ok(epServers[1].url.includes(`s${sNum}e${eNum}-720p`));
        assert.ok(epServers[2].url.includes(`s${sNum}e${eNum}-4k.mp4`));
      }
    }
  });
});

test('Mandatory 3-season test (Baseline Server Scraper in server.ts): supports distributed separate season pages (/season-2, /season-3)', async () => {
  const distributedRootHtml = `<!doctype html>
  <html lang="ar" dir="rtl">
  <head><title>مسلسل الملحمة - المواسم المنفصلة</title></head>
  <body>
    <div class="trailer">
      <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">التريلر</a>
    </div>
    <div class="SeasonsList">
      <a class="active" data-season="1" href="https://tri-series.example.com/series/epic-distributed">الموسم الأول</a>
      <a data-season="2" href="https://tri-series.example.com/series/epic/season-2">الموسم الثاني</a>
      <a data-season="3" href="https://tri-series.example.com/series/epic/season-3">الموسم الثالث</a>
    </div>
    <div class="episodes-list">
      <a href="https://tri-series.example.com/watch.php?vid=101">الحلقة 1</a>
      <a href="https://tri-series.example.com/watch.php?vid=102">الحلقة 2</a>
      <a href="https://tri-series.example.com/watch.php?vid=103">الحلقة 3</a>
    </div>
  </body></html>`;

  await withMockedFetch(
    (url) =>
      url === 'https://tri-series.example.com/series/epic-distributed'
        ? { ok: true, status: 200, body: distributedRootHtml }
        : mockThreeSeasonRouter(url),
    async () => {
      const media = await scrapeFullItemWithSubpages(
        'https://tri-series.example.com/series/epic-distributed',
        distributedRootHtml
      );

      assert.equal(media.kind, 'series');
      assert.equal(media.seasons.length, 3);

      const s1e1 = media.seasons.find((s) => s.seasonNumber === 1)?.episodes.find((e) => e.number === 1);
      const s2e3 = media.seasons.find((s) => s.seasonNumber === 2)?.episodes.find((e) => e.number === 3);
      const s3e2 = media.seasons.find((s) => s.seasonNumber === 3)?.episodes.find((e) => e.number === 2);

      assert.ok(s1e1?.servers?.[0]?.url.includes('s1e1-1080p'));
      assert.ok(s2e3?.servers?.[0]?.url.includes('s2e3-1080p'));
      assert.ok(s3e2?.servers?.[0]?.url.includes('s3e2-1080p'));
      assert.equal(s1e1?.sourceUrl, 'https://tri-series.example.com/watch.php?vid=101');
      assert.equal(s2e3?.sourceUrl, 'https://tri-series.example.com/watch.php?vid=203');
      assert.equal(s3e2?.sourceUrl, 'https://tri-series.example.com/watch.php?vid=302');
    }
  );
});

test('CimaCub pattern: follows <a class="watch" href="...//watch">, strips <noscript>, preserves 15 servers & Cloudflare 403 embeds', async () => {
  const mainUrl = 'https://w.cimacub.com/film-test-2026/';
  const watchUrl = 'https://w.cimacub.com/film-test-2026//watch';

  const mainHtml = `<!doctype html>
  <html lang="ar" dir="rtl">
  <head><title>فيلم تجريبي 2026 مترجم - سيما كلوب</title></head>
  <body>
    <h1>فيلم تجريبي 2026 مترجم</h1>
    <div class="BTNSDownWatch">
      <a class="watch" href="${watchUrl}"><span>مشاهدة وتحميل الأن</span></a>
    </div>
  </body></html>`;

  const watchItems = [
    ...Array.from({ length: 8 }, (_, i) =>
      `<li data-watch="https://doodstream.com/e/doodtest000${i + 1}"><span><i class="fa fa-play"></i></span>doodstream <noscript><iframe src="" allowfullscreen></iframe></noscript></li>`
    ),
    ...Array.from({ length: 8 }, (_, i) =>
      `<li data-watch="https://mixdrop.ps/e/mixdropt00${i + 1}"><span><i class="fa fa-play"></i></span>mixdrop <noscript><iframe src="" allowfullscreen></iframe></noscript></li>`
    ),
  ].join('\n');

  const watchHtml = `<!doctype html>
  <html lang="ar" dir="rtl">
  <head><title>مشاهدة فيلم تجريبي 2026 مترجم</title></head>
  <body>
    <div class="ServersList" id="WatchList">
      <ul id="watch">
        ${watchItems}
      </ul>
    </div>
    <div class="ServersList Download">
      <ul>
        <li><a href="https://doodstream.com/d/doodtest0001"><em>doodstream</em></a></li>
        <li><a href="https://mixdrop.ps/f/mixdropt001"><em>mixdrop</em></a></li>
      </ul>
    </div>
  </body></html>`;

  await withMockedFetch(
    (url) => {
      if (url === watchUrl) {
        return { ok: true, status: 200, body: watchHtml };
      }
      if (url.includes('doodstream.com/e/')) {
        return {
          ok: false,
          status: 403,
          headers: { 'Content-Type': 'text/html', 'cf-mitigated': 'challenge' },
          body: '<html><head><title>Just a moment...</title></head><body>cf-turnstile</body></html>',
        };
      }
      if (url.includes('mixdrop.ps/e/')) {
        return {
          ok: true,
          status: 200,
          headers: { 'Content-Type': 'text/html' },
          body: '<html><body><div id="player"><video src="https://cdn.mixdrop.ps/v/test.mp4"></video></div></body></html>',
        };
      }
      return { ok: false, status: 404, body: '' };
    },
    async () => {
      const parsed = parseHtmlToMediaWithHints(mainHtml, mainUrl);
      assert.equal(parsed.hints.watchSubpageUrl, watchUrl);

      const item = await scrapeFullItemWithSubpages(mainUrl, mainHtml, {
        skipEpisodeCrawl: true,
        skipExternalEnrichment: false,
      });

      assert.equal(item.servers.length, 15, 'Should keep 15 servers across doodstream and mixdrop');
      assert.equal(item.servers[0].name, 'doodstream');
      assert.equal(item.servers[8].name, 'mixdrop');
      assert.ok(item.downloads.length >= 2, 'Should extract download mirrors from //watch');

      const adapter = createDefaultScraperAdapter('w.cimacub.com', mainUrl);
      adapter.siteSettings.requestDelayMs = 0;
      const adapterResult = await executeAdapterScrape({
        url: mainUrl,
        rawHtml: mainHtml,
        adapter,
        baselineParseFn: parseHtmlToMediaWithHints,
      });

      assert.equal(adapterResult.media.servers.length, 15);
      assert.equal(adapterResult.media.servers[0].name, 'doodstream');
      assert.equal(adapterResult.media.servers[8].name, 'mixdrop');
    }
  );
});



