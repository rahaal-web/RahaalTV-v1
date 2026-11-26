import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  isKnownVideoEmbedUrlServer,
  parseHtmlToMediaWithHints,
  scrapeFullItemWithSubpages,
} from '../server';
import {
  createAndStartImporterJob,
  deleteImporterJob,
  extractSingleMovieAdvanced,
  getImporterJobSummary,
  getPaginatedJobItems,
  hasExtractedWatchServers,
  isSpecificSectionOrCategoryUrl,
  type ImporterEngineDeps,
} from '../server/advancedImporterEngine';
import { executeAdapterScrape } from '../server/scraperAdapterEngine';
import { executeAdapterScrapeInBrowser } from '../src/lib/clientAdapterEngine';
import {
  isKnownVideoEmbedUrlBrowser,
  parseHtmlToMediaWithHintsBrowser,
} from '../src/lib/clientScraper';
import { extractSingleMovieBrowser } from '../src/lib/browserAdvancedImporter';
import { createDefaultScraperAdapter } from '../src/lib/scraperAdapterUtils';
import type { ScraperAdapter } from '../src/types/scraperAdapter';

function buildTestImporterDeps(adapterOverride: ScraperAdapter | null = null): ImporterEngineDeps {
  return {
    parseHtmlToMediaWithHints,
    scrapeFullItemWithSubpages,
    extractListingWithOptionalAdapter: (html, pageUrl) => {
      const links: Array<{ url: string; title: string; poster: string }> = [];
      const nextUrls: string[] = [];
      const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(html)) !== null) {
        try {
          const abs = new URL(m[1], pageUrl).toString();
          const txt = m[2].replace(/<[^>]+>/g, '').trim();
          if (/watch\.php\?vid=|\/movie\//i.test(abs)) {
            links.push({ url: abs, title: txt || 'Film', poster: '' });
          } else if (/page=\d+/i.test(abs)) {
            nextUrls.push(abs);
          }
        } catch {
          // ignore
        }
      }
      return { siteTitle: 'TestSite', cards: links, nextUrls };
    },
    resolveActiveAdapterForUrl: () => adapterOverride,
    executeAdapterScrape,
    enrichScrapedMediaFromAdapter: async (media) => media,
    ajaxEmbedResolverFn: async () => [],
    isBlockedHost: (host) => /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(host),
    isBlockedHostEnhanced: (host) => /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(host),
    isLikelyContentUrl: (u) => /watch\.php\?vid=|\/movie\//i.test(u),
    upgradeKnownImageUrlServer: (u) => String(u || ''),
  };
}

function wrapCheerioEl($: cheerio.CheerioAPI, rawNode: unknown): unknown {
  if (!rawNode) return null;
  const $el = $(rawNode as never);
  const elNode = $el.get(0) as {
    tagName?: string;
    name?: string;
    attribs?: Record<string, string>;
  } | undefined;
  const tag = String(elNode?.tagName || elNode?.name || 'div').toUpperCase();
  const attribs = elNode?.attribs || {};
  const attrsArr = Object.entries(attribs).map(([name, value]) => ({ name, value }));

  const wrapper: Record<string, unknown> = {
    tagName: tag,
    nodeName: tag,
    id: attribs.id || '',
    className: attribs.class || '',
    classList: {
      contains: (cls: string) => $el.hasClass(cls),
    },
    value: attribs.value ?? $el.val() ?? '',
    attributes: attrsArr,
    get textContent() {
      return $el.text();
    },
    get innerHTML() {
      return $el.html() || '';
    },
    get outerHTML() {
      return $.html($el) || '';
    },
    get parentElement() {
      const p = $el.parent().get(0);
      return p ? wrapCheerioEl($, p) : null;
    },
    get nextElementSibling() {
      const n = $el.next().get(0);
      return n ? wrapCheerioEl($, n) : null;
    },
    get children() {
      return $el.children().toArray().map((c) => wrapCheerioEl($, c));
    },
    getAttribute: (name: string) => {
      const val = $el.attr(name);
      return val === undefined ? null : val;
    },
    hasAttribute: (name: string) => $el.attr(name) !== undefined,
    closest: (sel: string) => {
      try {
        const c = $el.closest(sel).get(0);
        return c ? wrapCheerioEl($, c) : null;
      } catch {
        return null;
      }
    },
    matches: (sel: string) => {
      try {
        return $el.is(sel);
      } catch {
        return false;
      }
    },
    querySelector: (sel: string) => {
      try {
        const q = $el.find(sel).first().get(0);
        return q ? wrapCheerioEl($, q) : null;
      } catch {
        return null;
      }
    },
    querySelectorAll: (sel: string) => {
      try {
        return $el.find(sel).toArray().map((n) => wrapCheerioEl($, n));
      } catch {
        return [];
      }
    },
  };
  return wrapper;
}

async function withCheerioDomParser<T>(fn: () => T | Promise<T>): Promise<T> {
  const prev = (globalThis as { DOMParser?: unknown }).DOMParser;
  class CheerioDOMParser {
    parseFromString(html: string) {
      const $ = cheerio.load(html || '');
      return {
        get title() {
          return $('title').first().text() || '';
        },
        get body() {
          const b = $('body').get(0) || $.root().get(0);
          return wrapCheerioEl($, b);
        },
        get documentElement() {
          const d = $('html').get(0) || $.root().get(0);
          return wrapCheerioEl($, d);
        },
        querySelector: (sel: string) => {
          try {
            const first = $(sel).first().get(0);
            return first ? wrapCheerioEl($, first) : null;
          } catch {
            return null;
          }
        },
        querySelectorAll: (sel: string) => {
          try {
            return $(sel).toArray().map((n) => wrapCheerioEl($, n));
          } catch {
            return [];
          }
        },
      };
    }
  }
  (globalThis as { DOMParser?: unknown }).DOMParser = CheerioDOMParser;
  try {
    return await fn();
  } finally {
    if (prev !== undefined) (globalThis as { DOMParser?: unknown }).DOMParser = prev;
    else delete (globalThis as { DOMParser?: unknown }).DOMParser;
  }
}

test('server & browser parsers extract watch servers from all advanced DOM, attribute, and script vectors', async () => {
  const twoLayerUrl = 'https://doodstream.com/e/twolayer99';
  const twoLayerB64 = Buffer.from(Buffer.from(twoLayerUrl).toString('base64')).toString('base64');
  const onclickUrl = 'https://mixdrop.ag/e/click77';
  const onclickB64 = Buffer.from(onclickUrl).toString('base64');

  const html = `
    <!doctype html>
    <html lang="ar">
      <head>
        <title>Test Action Movie 2026</title>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": "Test Action Movie",
            "embedUrl": "https://streamtape.com/e/jsonld01"
          }
        </script>
      </head>
      <body>
        <h1>Test Action Movie 2026</h1>
        <div data-href="https://filemoon.sx/e/attrhref02">سيرفر data-href</div>
        <button data-player="https://uqload.cx/embed-uql03.html">سيرفر uqload</button>
        <button data-qu="https://voe.sx/e/voequ04">سيرفر voe</button>
        <button onclick="openPlayer(atob('${onclickB64}'))">سيرفر onclick</button>
        <select class="servers-select">
          <option value="https://vidhidepro.com/e/sel05">VidHide</option>
        </select>
        <embed src="https://wishfast.top/e/emb06" />
        <object data="https://luluvdo.com/e/obj07"></object>
        <noscript><iframe src="https://vidmoly.to/embed-noscr08.html"></iframe></noscript>
        <form action="/play.php" method="post" class="watch-form">
          <input type="hidden" name="vid" value="4455" />
          <button type="submit">مشاهدة الان</button>
        </form>
        <li data-post="9988" data-nume="1" data-type="movie">Server WP</li>
        <a class="watch" href="/watch.php?vid=4455">مشاهدة الفيلم</a>
        <script>
          var AjaxtURL = "https://filmbox.test/Single/TWatch.php";
          var servers = ["\\x3ciframe src=\\"https://ok.ru/videoembed/991122\\"\\x3e\\x3c/iframe\\x3e"];
          var encodedFrame = "%3Ciframe%20src%3D%22https%3A%2F%2Fsendvid.com%2Fembed%2Furlenc09%22%3E%3C%2Fiframe%3E";
          var deep = atob(atob("${twoLayerB64}"));
          var cfg = { file: "https://cdn.example.net/master.m3u8" };
          var bare = "https://streamwish.to/e/bare10";
        </script>
      </body>
    </html>
  `;

  const serverParsed = parseHtmlToMediaWithHints(html, 'https://filmbox.test/movie/test-action');
  const browserParsed = await withCheerioDomParser(() =>
    parseHtmlToMediaWithHintsBrowser(html, 'https://filmbox.test/movie/test-action')
  );

  for (const [label, res] of [
    ['server', serverParsed],
    ['browser', browserParsed],
  ] as const) {
    const urls = new Set(res.media.servers.map((s) => s.url));
    assert.ok(urls.has('https://streamtape.com/e/jsonld01'), `${label}: missing JSON-LD VideoObject`);
    assert.ok(urls.has('https://filemoon.sx/e/attrhref02'), `${label}: missing data-href`);
    assert.ok(urls.has('https://uqload.cx/embed-uql03.html'), `${label}: missing data-player`);
    assert.ok(urls.has('https://voe.sx/e/voequ04'), `${label}: missing data-qu`);
    assert.ok(urls.has('https://mixdrop.ag/e/click77'), `${label}: missing onclick atob`);
    assert.ok(urls.has('https://vidhidepro.com/e/sel05'), `${label}: missing select option`);
    assert.ok(urls.has('https://wishfast.top/e/emb06'), `${label}: missing embed src`);
    assert.ok(urls.has('https://luluvdo.com/e/obj07'), `${label}: missing object data`);
    assert.ok(urls.has('https://vidmoly.to/embed-noscr08.html'), `${label}: missing noscript iframe`);
    assert.ok(urls.has('https://ok.ru/videoembed/991122'), `${label}: missing \\x3c script iframe`);
    assert.ok(urls.has('https://sendvid.com/embed/urlenc09'), `${label}: missing URL-encoded script`);
    assert.ok(urls.has('https://doodstream.com/e/twolayer99'), `${label}: missing 2-layer base64`);
    assert.ok(urls.has('https://cdn.example.net/master.m3u8'), `${label}: missing JS file property`);
    assert.ok(urls.has('https://streamwish.to/e/bare10'), `${label}: missing bare known embed URL`);

    assert.equal(res.hints.watchForms?.length ?? 0, 1, `${label}: expected watchForm hint`);
    assert.equal((res.hints.wpAjaxPosts?.length ?? 0) >= 1, true, `${label}: expected wpAjaxPosts hint`);
    assert.ok(
      (res.hints.watchSubpageCandidates || []).some((u) => u.includes('/watch.php?vid=4455')),
      `${label}: expected watch subpage candidate`
    );
  }

  assert.equal(isKnownVideoEmbedUrlServer('https://playmogo.com/e/xyz123'), true);
  assert.equal(isKnownVideoEmbedUrlBrowser('https://playmogo.com/e/xyz123'), true);
});

test('scrapeFullItemWithSubpages follows multi-hop watch -> play -> form -> WP AJAX and keeps CF-challenged known embed while dropping 404/homepage', async () => {
  const origFetch = globalThis.fetch;
  const movieHtml = `
    <html><head><title>Action Film 2026</title></head><body>
      <h1>Action Film 2026</h1>
      <a class="watch" href="https://filmbox.test/film-watch//watch">شاهد الآن</a>
      <li data-post="501" data-nume="1" data-type="movie">Server WP</li>
      <script>var AjaxtURL = "https://filmbox.test/Single/TWatch.php";</script>
    </body></html>
  `;
  const watchPageHtml = `
    <html><body>
      <form action="/play.php" method="get">
        <input type="hidden" name="vid" value="77" />
      </form>
      <li data-watch="https://doodstream.com/e/cfprotect1">Dood</li>
      <li data-watch="https://vidara.to/e/deleted404">Deleted</li>
      <li data-watch="https://filmbox.test/embed-2/?post=501">RedirectHome</li>
    </body></html>
  `;
  const playFormHtml = `
    <html><body>
      <iframe src="https://streamwish.to/e/playformok2"></iframe>
    </body></html>
  `;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/film-watch//watch') || url.includes('/film-watch/watch')) {
      return new Response(watchPageHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (url.includes('/play.php?vid=77')) {
      return new Response(playFormHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (url.includes('TWatch.php') && init?.method === 'POST') {
      return new Response('<iframe src="https://voe.sx/e/wpajax3"></iframe>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url.includes('doodstream.com/e/cfprotect1')) {
      return new Response('<html><title>Just a moment...</title><div>Cloudflare</div></html>', {
        status: 403,
        headers: {
          'Content-Type': 'text/html',
          server: 'cloudflare',
          'x-frame-options': 'SAMEORIGIN',
        },
      });
    }
    if (url.includes('vidara.to/e/deleted404')) {
      return new Response('<html><body>404 Video not found</body></html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url.includes('embed-2/?post=501')) {
      return new Response('', {
        status: 302,
        headers: { location: 'https://filmbox.test/' },
      });
    }
    if (url.includes('streamwish.to/e/playformok2') || url.includes('voe.sx/e/wpajax3')) {
      return new Response('<html><body><video src="ok.mp4"></video></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response('<html><body>ok</body></html>', { status: 200 });
  }) as typeof fetch;

  try {
    const result = await scrapeFullItemWithSubpages('https://filmbox.test/movie/action-film', movieHtml, {
      skipExternalEnrichment: true,
    });
    const urls = new Set(result.servers.map((s) => s.url));
    assert.ok(urls.has('https://doodstream.com/e/cfprotect1'), 'CF-challenged known embed should be preserved');
    assert.ok(urls.has('https://streamwish.to/e/playformok2'), 'watch form submission server should be extracted');
    assert.ok(urls.has('https://voe.sx/e/wpajax3'), 'WP AJAX TWatch.php server should be extracted');
    assert.equal(urls.has('https://vidara.to/e/deleted404'), false, '404 server must be dropped');
    assert.equal(
      urls.has('https://filmbox.test/embed-2/?post=501'),
      false,
      'Server redirecting to homepage must be dropped'
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('adapter engines fall back to baseline & watch subpages when adapter selectors find 0 watch servers', async () => {
  const origFetch = globalThis.fetch;
  const movieHtml = `
    <html><head><title>Adapter Fallback Movie</title></head><body>
      <h1>Adapter Fallback Movie</h1>
      <a class="watch" href="https://filmbox.test/watch-fallback">Watch</a>
    </body></html>
  `;
  const watchHtml = `<html><body><iframe src="https://filemoon.sx/e/fallback123"></iframe></body></html>`;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('watch-fallback')) {
      return new Response(watchHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (url.includes('filemoon.sx/e/fallback123')) {
      return new Response('<html><body>player</body></html>', { status: 200 });
    }
    return new Response(movieHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
  }) as typeof fetch;

  const baseAdapter = createDefaultScraperAdapter('filmbox.test', 'https://filmbox.test');
  baseAdapter.siteSettings.requestDelayMs = 0;
  const emptyServerAdapter: ScraperAdapter = {
    ...baseAdapter,
    serverRules: {
      ...baseAdapter.serverRules,
      itemSelector: '.non-existent-server-selector',
      urlAttributes: ['data-watch'],
    },
    pageDetection: {
      ...baseAdapter.pageDetection,
      watchSubpageSelector: '.watch',
    },
  };

  try {
    const srvRes = await executeAdapterScrape({
      url: 'https://filmbox.test/movie/test',
      rawHtml: movieHtml,
      adapter: emptyServerAdapter,
      baselineParseFn: parseHtmlToMediaWithHints,
    });
    assert.equal(srvRes.ok, true);
    assert.ok(srvRes.media.servers.some((s) => s.url === 'https://filemoon.sx/e/fallback123'));

    const brwRes = await withCheerioDomParser(() =>
      executeAdapterScrapeInBrowser({
        url: 'https://filmbox.test/movie/test',
        rawHtml: movieHtml,
        adapter: emptyServerAdapter,
      })
    );
    assert.equal(brwRes.ok, true);
    assert.ok(brwRes.media?.servers.some((s) => s.url === 'https://filemoon.sx/e/fallback123'));

    // Also ensure browser adapter scraping extracts select & data-player servers directly
    const extraHtml = `
      <html><body>
        <h1>Extra Servers Movie</h1>
        <select class="srv"><option value="https://uqload.cx/embed-brw1.html">UQL</option></select>
        <div class="srv" data-player="https://voe.sx/e/brw2">VOE</div>
      </body></html>
    `;
    const srvAdapter: ScraperAdapter = {
      ...baseAdapter,
      serverRules: {
        ...baseAdapter.serverRules,
        itemSelector: '.srv',
      },
    };
    const extraRes = await withCheerioDomParser(() =>
      executeAdapterScrapeInBrowser({
        url: 'https://filmbox.test/movie/extra',
        rawHtml: extraHtml,
        adapter: srvAdapter,
      })
    );
    assert.equal(extraRes.ok, true);
    assert.ok(extraRes.media?.servers.some((s) => s.url === 'https://uqload.cx/embed-brw1.html'));
    assert.ok(extraRes.media?.servers.some((s) => s.url === 'https://voe.sx/e/brw2'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Mode 1 & Mode 2 automatically delete movies with 0 extracted watch servers and prioritize category crawling', async () => {
  assert.equal(isSpecificSectionOrCategoryUrl('https://a.qfilm.tv/category.php?cat=foreign-movies'), true);
  assert.equal(
    isSpecificSectionOrCategoryUrl('https://w.cimacub.com/category/%d8%a7%d9%81%d9%84%d8%a7%d9%85-%d8%a7%d8%ac%d9%86%d8%a8%d9%8a/'),
    true
  );
  assert.equal(isSpecificSectionOrCategoryUrl('https://filmbox.test/'), false);
  assert.equal(hasExtractedWatchServers({ servers: [], seasons: [] }), false);
  assert.equal(
    hasExtractedWatchServers({
      servers: [{ id: '1', name: 'S1', mode: 'url', url: 'https://voe.sx/e/abc', embedCode: '', quality: 'HD', speed: 'Fast', tag: 'HD' }],
      seasons: [],
    }),
    true
  );

  const deps = buildTestImporterDeps();
  const singleFail = await extractSingleMovieAdvanced(
    {
      url: 'https://filmbox.test/movie/no-servers',
      rawHtml: '<html><head><title>Broken Film 2026</title></head><body><h1>Broken Film</h1><p>No player here</p></body></html>',
      enrichExternalMetadata: false,
      useAdapters: false,
    },
    deps
  );
  assert.equal(singleFail.ok, false);
  if (!singleFail.ok) {
    assert.equal(singleFail.status, 422);
    assert.match(singleFail.error, /حذف/);
  }

  await assert.rejects(
    () =>
      withCheerioDomParser(() =>
        extractSingleMovieBrowser({
          url: 'https://filmbox.test/movie/no-servers',
          rawHtml: '<html><head><title>Broken Film 2026</title></head><body><h1>Broken Film</h1></body></html>',
          enrichExternalMetadata: false,
          useAdapters: false,
        })
      ),
    /حذف/
  );

  // Mode 2 bulk job pruning check: 2 movies in category page -> 1 has server, 1 has 0 servers
  const origFetch = globalThis.fetch;
  const catHtml = `
    <html><head><title>Foreign Movies</title></head><body>
      <a href="https://filmbox.test/watch.php?vid=101">Good Movie</a>
      <a href="https://filmbox.test/watch.php?vid=102">Dead Movie</a>
      <a href="https://filmbox.test/category.php?cat=arabic-movies">Unrelated Sidebar Category</a>
    </body></html>
  `;
  const goodMovieHtml = `
    <html><head><title>Good Movie 2026</title></head><body>
      <h1>Good Movie 2026</h1>
      <iframe src="https://voe.sx/e/good101"></iframe>
    </body></html>
  `;
  const deadMovieHtml = `
    <html><head><title>Dead Movie 2026</title></head><body>
      <h1>Dead Movie 2026</h1>
      <iframe src="https://vidara.to/e/dead404"></iframe>
    </body></html>
  `;
  let arabicCategoryFetched = false;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('cat=arabic-movies')) {
      arabicCategoryFetched = true;
      return new Response('<html><body></body></html>', { status: 200 });
    }
    if (url.includes('cat=foreign-movies')) {
      return new Response(catHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (url.includes('vid=101')) {
      return new Response(goodMovieHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (url.includes('vid=102')) {
      return new Response(deadMovieHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (url.includes('voe.sx/e/good101')) {
      return new Response('<html><body>ready</body></html>', { status: 200 });
    }
    if (url.includes('vidara.to/e/dead404')) {
      return new Response('<html><body>404 not found</body></html>', { status: 404 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  let createdJobId = '';
  try {
    const created = await createAndStartImporterJob(
      {
        sourceUrl: 'https://filmbox.test/category.php?cat=foreign-movies',
        discoveryMode: 'auto',
        maxItems: 20,
        concurrency: 2,
        delayMs: 10,
        useAdapters: false,
        enrichExternalMetadata: false,
      },
      deps
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;
    createdJobId = created.job.id;

    // Wait for background job pipeline to complete
    const deadline = Date.now() + 8000;
    let summary = getImporterJobSummary(createdJobId);
    while (summary && (summary.status === 'discovering' || summary.status === 'running') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 60));
      summary = getImporterJobSummary(createdJobId);
    }

    assert.ok(summary);
    assert.equal(summary!.status, 'completed');
    assert.equal(arabicCategoryFetched, false, 'Must not crawl unrelated sidebar category when sourceUrl is a category');
    assert.equal(summary!.stats.removedNoServers, 1, 'Dead movie with 0 servers must be pruned');
    assert.equal(summary!.stats.fetched, 1, 'Only Good Movie should remain in list');

    const page = getPaginatedJobItems({ jobId: createdJobId, page: 1, pageSize: 25, status: 'all' });
    assert.ok(page);
    assert.equal(page!.counts.all, 1);
    assert.equal(page!.items[0]?.movie?.title, 'Good Movie 2026');
  } finally {
    globalThis.fetch = origFetch;
    if (createdJobId) {
      deleteImporterJob(createdJobId);
      const jobDir = path.resolve(process.cwd(), 'data', 'advanced-importer', createdJobId);
      if (fs.existsSync(jobDir)) {
        fs.rmSync(jobDir, { recursive: true, force: true });
      }
    }
  }
});
