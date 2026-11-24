import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_NAV_GROUPS,
  getAllAdminNavItems,
  isTabAccessible,
} from '../src/components/admin/adminNavigation';
import { DEFAULT_MODERATOR_SUB_PERMS } from '../src/lib/adminPreferences';
import { runCatalogContentAudit } from '../src/lib/contentAudit';
import { createSiteBackupPayload, validateBackupJson } from '../src/lib/backupRestore';
import { createTimeoutSignal, detectClientCapabilities } from '../src/lib/browserCompat';
import { isLikelyNonVideoWebsiteUrl } from '../src/lib/clientScraper';
import {
  DEFAULT_WEBSITE_BRANDING,
  normalizeWebsiteBranding,
  sanitizeBrandingForFirestore,
} from '../src/lib/websiteBranding';
import {
  DEFAULT_HOME_CONFIG,
  extractHomeBaseFromRecord,
  extractSliderStyleFromRecord,
  HOME_CONFIG_AUTOPLAY_KEYS,
  HOME_CONFIG_CORE_KEYS,
  HOME_CONFIG_SLIDER_STYLE_KEYS,
  homeConfigHasAllSliderStyleKeys,
  normalizeHomeConfig,
  pickLegacyAutoplayHomeConfig,
  pickLegacyCoreHomeConfig,
  pickSliderStyleHomeConfig,
} from '../src/lib/homeConfig';
import { DEFAULT_TYPOGRAPHY_CONFIG, normalizeTypographyConfig } from '../src/lib/typographyConfig';
import { DEFAULT_POPUP_SHIELD_CONFIG, normalizePopupShieldConfig } from '../src/lib/popupShield';
import { DEFAULT_PLAYER_THEME, normalizePlayerTheme } from '../src/lib/playerTheme';
import {
  applyEyeComfortPresetToConfig,
  buildAdminAppearanceCssVars,
  DEFAULT_ADMIN_APPEARANCE,
  normalizeAdminAppearance,
} from '../src/lib/adminAppearance';
import {
  buildDefaultAdminNavLayout,
  normalizeAdminNavLayout,
  reorderPinnedTabsInLayout,
  togglePinnedTabInLayout,
} from '../src/lib/adminNavLayout';
import type { MediaItem, SiteSettings } from '../src/types/media';

function makeSampleItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'item-1',
    slug: 'sample-movie',
    title: 'فيلم تجريبي',
    englishTitle: 'Sample Movie',
    kind: 'movie',
    categories: ['افلام'],
    genres: ['اكشن'],
    year: '2026',
    country: 'مصر',
    language: 'العربية',
    quality: '1080p',
    duration: '120 دقيقة',
    imdb: 8.2,
    votes: '1,200',
    views: 500,
    likes: 40,
    pinned: false,
    isNew: true,
    comingSoon: false,
    poster: 'https://cdn.example.com/poster.jpg',
    poster_url: 'https://cdn.example.com/poster.jpg',
    backdrop: 'https://cdn.example.com/backdrop.jpg',
    backdrop_url: 'https://cdn.example.com/backdrop.jpg',
    tagline: 'وصف مختصر',
    story: 'قصة تفصيلية واضحة تتجاوز عشرين حرفاً للاختبار.',
    shortUrl: 'https://rahal.tv/watch/item-1',
    trailerUrl: '',
    trailerLabel: 'التريلر',
    trailerDuration: '02:00',
    cast: [],
    seasons: [],
    franchiseIds: [],
    servers: [
      {
        id: 'srv-1',
        name: 'سيرفر 1',
        mode: 'url',
        url: 'https://cdn.example.com/embed/video-12345',
        quality: '1080p',
        speed: 'سريع',
        tag: 'HD',
      },
    ],
    downloads: [],
    ...overrides,
  };
}

const SAMPLE_SETTINGS: SiteSettings = {
  siteName: 'RahaL TV',
  tagline: 'منصة بث سينمائي',
  announcementText: '',
  tickerEnabled: false,
  maintenanceMode: false,
  maintenanceMessage: '',
  featuredLimit: 5,
};

describe('RahaL TV Admin Navigation & RBAC', () => {
  it('defines exactly 9 navigation groups and 31 unique admin tabs', () => {
    assert.equal(ADMIN_NAV_GROUPS.length, 9);
    const items = getAllAdminNavItems();
    assert.equal(items.length, 31);
    const uniqueIds = new Set(items.map((item) => item.id));
    assert.equal(uniqueIds.size, 31);
    assert.ok(ADMIN_NAV_GROUPS.every((g) => Boolean(g.accentColor) && Boolean(g.iconName)));
    assert.ok(items.every((i) => Boolean(i.iconName)));
  });

  it('enforces ownerOnly restrictions and granular moderator permissions', () => {
    assert.equal(isTabAccessible('overview', true, DEFAULT_MODERATOR_SUB_PERMS), true);
    assert.equal(isTabAccessible('overview', false, DEFAULT_MODERATOR_SUB_PERMS), false);
    assert.equal(isTabAccessible('website_branding', true, DEFAULT_MODERATOR_SUB_PERMS), true);
    assert.equal(isTabAccessible('website_branding', false, DEFAULT_MODERATOR_SUB_PERMS), false);
    assert.equal(isTabAccessible('slider_customization', true, DEFAULT_MODERATOR_SUB_PERMS), true);
    assert.equal(isTabAccessible('slider_customization', false, DEFAULT_MODERATOR_SUB_PERMS), false);
    assert.equal(isTabAccessible('admin_appearance', true, DEFAULT_MODERATOR_SUB_PERMS), true);
    assert.equal(isTabAccessible('admin_appearance', false, DEFAULT_MODERATOR_SUB_PERMS), false);
    assert.equal(isTabAccessible('admin_nav_order', true, DEFAULT_MODERATOR_SUB_PERMS), true);
    assert.equal(isTabAccessible('admin_nav_order', false, DEFAULT_MODERATOR_SUB_PERMS), false);
    assert.equal(isTabAccessible('database_manager', true, DEFAULT_MODERATOR_SUB_PERMS), true);
    assert.equal(isTabAccessible('database_manager', false, DEFAULT_MODERATOR_SUB_PERMS), false);
    assert.equal(isTabAccessible('settings', false, DEFAULT_MODERATOR_SUB_PERMS), false);
    assert.equal(isTabAccessible('security_rules', false, DEFAULT_MODERATOR_SUB_PERMS), false);
    assert.equal(isTabAccessible('users', false, DEFAULT_MODERATOR_SUB_PERMS), false);

    assert.equal(isTabAccessible('catalog', false, DEFAULT_MODERATOR_SUB_PERMS), true);
    assert.equal(isTabAccessible('bulk_editor', false, DEFAULT_MODERATOR_SUB_PERMS), true);

    const restricted = {
      ...DEFAULT_MODERATOR_SUB_PERMS,
      allowBulkEditor: false,
      allowWatchServers: false,
      allowSiteScraper: false,
    };
    assert.equal(isTabAccessible('bulk_editor', false, restricted), false);
    assert.equal(isTabAccessible('categories', false, restricted), false);
    assert.equal(isTabAccessible('watch_servers', false, restricted), false);
    assert.equal(isTabAccessible('site_scraper', false, restricted), false);
    assert.equal(isTabAccessible('scraper', false, restricted), true);
  });
});

describe('Catalog Content Audit Engine', () => {
  it('detects duplicates, zero servers, suspicious URLs, incomplete episodes, and missing assets', () => {
    const items: MediaItem[] = [
      makeSampleItem({ id: 'm1', title: 'ماتريكس', englishTitle: 'Matrix', year: '1999' }),
      makeSampleItem({ id: 'm2', title: 'ماتريكس', englishTitle: 'Matrix', year: '1999' }),
      makeSampleItem({
        id: 'm3',
        title: 'بدون سيرفر',
        servers: [],
        poster: '',
        poster_url: '',
        backdrop: '',
        backdrop_url: '',
        story: '',
      }),
      makeSampleItem({
        id: 'm4',
        title: 'رابط مشبوه',
        servers: [
          {
            id: 's1',
            name: 'سيرفر',
            mode: 'url',
            url: 'https://example.com/',
            quality: '720p',
            speed: 'سريع',
            tag: 'HD',
          },
        ],
      }),
      makeSampleItem({
        id: 's1',
        title: 'مسلسل ناقص',
        kind: 'series',
        servers: [],
        seasons: [
          {
            seasonNumber: 1,
            label: 'الموسم الأول',
            year: '2026',
            episodes: [
              { number: 1, title: 'الحلقة 1', duration: '40د', quality: 'HD', servers: [] },
              { number: 3, title: 'الحلقة 3', duration: '40د', quality: 'HD', servers: [] },
            ],
          },
        ],
      }),
    ];

    const report = runCatalogContentAudit(items);
    assert.equal(report.scannedCount, 5);
    assert.ok(report.countsByCategory.duplicate >= 2);
    assert.ok(report.countsByCategory.zero_servers >= 1);
    assert.ok(report.countsByCategory.suspicious_server_url >= 1);
    assert.ok(report.countsByCategory.incomplete_episodes >= 1);
    assert.ok(report.countsByCategory.missing_media_assets >= 1);
  });
});

describe('Backup Payload & Integrity Validation', () => {
  it('creates signed backup JSON, warns on tampered checksums, and rejects malformed payloads', () => {
    const media = [makeSampleItem()];
    const payload = createSiteBackupPayload({
      settings: SAMPLE_SETTINGS,
      media,
      adapters: [],
      requests: [],
    });

    const json = JSON.stringify(payload);
    const validResult = validateBackupJson(json, []);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.errors.length, 0);
    assert.equal(validResult.diff?.newItemsCount, 1);

    const tampered = { ...payload, checksum: 'fnv1a_deadbeef' };
    const tamperedResult = validateBackupJson(JSON.stringify(tampered), media);
    assert.equal(tamperedResult.valid, true);
    assert.ok(tamperedResult.warnings.length > 0);
    assert.equal(tamperedResult.diff?.updatedItemsCount, 1);

    const brokenResult = validateBackupJson('{"schemaVersion":2,"data":{}}', media);
    assert.equal(brokenResult.valid, false);
    assert.ok(brokenResult.errors.length > 0);
  });
});

describe('Browser Compatibility & URL Sanitization Helpers', () => {
  it('detects client capabilities safely in non-DOM runtimes and creates AbortSignals', () => {
    const caps = detectClientCapabilities();
    assert.equal(typeof caps.baselineSupported, 'boolean');
    assert.equal(typeof caps.browserName, 'string');

    const { signal, cleanup } = createTimeoutSignal(500);
    assert.equal(signal.aborted, false);
    cleanup();
  });

  it('flags portal/website root URLs while allowing genuine embed/stream URLs', () => {
    assert.equal(isLikelyNonVideoWebsiteUrl('https://example.com/'), true);
    assert.equal(isLikelyNonVideoWebsiteUrl('https://vidstream.example.com/embed-abc123.html'), false);
    assert.equal(isLikelyNonVideoWebsiteUrl('https://cdn.example.com/hls/master.m3u8'), false);
  });
});

describe('Website Branding Normalization & Sanitation', () => {
  it('supports Arabic/English site names, hidden logo mode, none favicon mode, and clamps dimensions', () => {
    const branding = normalizeWebsiteBranding({
      logoMode: 'hidden',
      logoUrl: '/uploads/branding/logo-1.png',
      logoWidthPx: 999,
      logoHeightPx: 5,
      logoPlacement: 'above_text',
      headerAlign: 'center',
      logoTextGapPx: 20,
      siteName: 'رحال تي في - RahaL TV',
      siteNameColor: '#E8EDF5',
      siteNameFont: 'Tajawal',
      siteNameSizePx: 28,
      siteNameWeight: 800,
      siteNameLetterSpacingPx: 1.5,
      faviconMode: 'none',
      faviconUrl: '/uploads/branding/fav.png',
    });

    assert.equal(branding.logoMode, 'hidden');
    assert.equal(branding.logoWidthPx, 260);
    assert.equal(branding.logoHeightPx, 20);
    assert.equal(branding.logoPlacement, 'above_text');
    assert.equal(branding.headerAlign, 'center');
    assert.equal(branding.siteName, 'رحال تي في - RahaL TV');
    assert.equal(branding.siteNameColor, '#e8edf5');
    assert.equal(branding.siteNameFont, 'Tajawal');
    assert.equal(branding.faviconMode, 'none');
    assert.equal(branding.faviconUrl, '');
  });

  it('strips local-asset:// URLs before Firestore persistence', () => {
    const sanitized = sanitizeBrandingForFirestore({
      logoMode: 'image_and_text',
      logoUrl: 'local-asset://logo-123',
      faviconMode: 'custom',
      faviconUrl: 'local-asset://fav-456',
    });
    assert.equal(sanitized.logoUrl, '');
    assert.equal(sanitized.faviconUrl, '');
    assert.equal(sanitized.faviconMode, 'default');
  });
});

describe('Hero Slider Customization Normalization', () => {
  it('defaults heroImageFit to cover for full-bleed hero display and clamps blur/dim backdrop settings', () => {
    const defaults = normalizeHomeConfig({});
    assert.equal(defaults.heroImageFit, 'cover');
    assert.equal(defaults.heroBackdropBlurPx, 24);
    assert.equal(defaults.heroBackdropDimPct, 45);

    const ambientBlur = normalizeHomeConfig({
      heroImageFit: 'contain_blur',
      heroBackdropBlurPx: 99,
      heroBackdropDimPct: 120,
    });
    assert.equal(ambientBlur.heroImageFit, 'contain_blur');
    assert.equal(ambientBlur.heroBackdropBlurPx, 48);
    assert.equal(ambientBlur.heroBackdropDimPct, 85);

    const containCfg = normalizeHomeConfig({
      heroImageFit: 'contain',
      heroBackdropBlurPx: -10,
      heroBackdropDimPct: -5,
    });
    assert.equal(containCfg.heroImageFit, 'contain');
    assert.equal(containCfg.heroBackdropBlurPx, 0);
    assert.equal(containCfg.heroBackdropDimPct, 0);
  });

  it('preserves heroShowDescription=false, typography bounds, positions, and element visibility flags', () => {
    const cfg = normalizeHomeConfig({
      heroShowDescription: false,
      heroTitleSizePx: 38,
      heroDescriptionSizePx: 15,
      heroDescriptionLines: 3,
      heroTextAlign: 'center',
      heroInfoPosition: 'middle-center',
      heroTextMaxWidthPx: 640,
      heroShowBadge: false,
      heroShowRating: true,
      heroShowYear: false,
      heroShowDuration: true,
      heroShowGenres: true,
      heroShowQuality: false,
      heroShowWatchBtn: true,
      heroShowDetailsBtn: false,
      heroShowWatchlistBtn: false,
    });

    assert.equal(cfg.heroShowDescription, false);
    assert.equal(cfg.heroTitleSizePx, 38);
    assert.equal(cfg.heroDescriptionSizePx, 15);
    assert.equal(cfg.heroDescriptionLines, 3);
    assert.equal(cfg.heroTextAlign, 'center');
    assert.equal(cfg.heroInfoPosition, 'middle-center');
    assert.equal(cfg.heroTextMaxWidthPx, 640);
    assert.equal(cfg.heroShowBadge, false);
    assert.equal(cfg.heroShowYear, false);
    assert.equal(cfg.heroShowGenres, true);
    assert.equal(cfg.heroShowDetailsBtn, false);
  });

  it('preserves clean, classic, and showcase cardStyle values and falls back to clean', () => {
    assert.equal(normalizeHomeConfig({ cardStyle: 'clean' }).cardStyle, 'clean');
    assert.equal(normalizeHomeConfig({ cardStyle: 'classic' }).cardStyle, 'classic');
    assert.equal(normalizeHomeConfig({ cardStyle: 'showcase' }).cardStyle, 'showcase');
    assert.equal(normalizeHomeConfig({ cardStyle: 'unknown' as never }).cardStyle, 'clean');
  });
});

describe('Admin Eye Comfort Appearance & Sidebar Pinning/Reordering', () => {
  it('applies all 4 Eye Comfort presets and generates isolated admin CSS variables', () => {
    const softGray = applyEyeComfortPresetToConfig(DEFAULT_ADMIN_APPEARANCE, 'soft_gray');
    assert.equal(softGray.colorMode, 'soft_gray');
    assert.equal(softGray.pageBgColor, '#262b33');

    const comfortEye = applyEyeComfortPresetToConfig(DEFAULT_ADMIN_APPEARANCE, 'comfortable_eye');
    assert.equal(comfortEye.colorMode, 'comfortable_eye');

    const normalized = normalizeAdminAppearance({
      ...comfortEye,
      contrastLevel: 112,
      brightnessLevel: 94,
    });
    const cssVars = buildAdminAppearanceCssVars(normalized);
    assert.equal(cssVars['--rtv-admin-bg'], comfortEye.pageBgColor);
    assert.equal(cssVars['--rtv-admin-surface'], comfortEye.cardBgColor);
    assert.equal(cssVars['--rtv-admin-sidebar-bg'], comfortEye.sidebarBgColor);
    assert.equal(cssVars['--rtv-admin-contrast'], '112%');
    assert.equal(cssVars['--rtv-admin-brightness'], '94%');
  });

  it('pins/unpins tabs, reorders pinned tabs, and reconciles all 31 canonical tabs', () => {
    let layout = buildDefaultAdminNavLayout();
    layout = togglePinnedTabInLayout(layout, 'website_branding');
    layout = togglePinnedTabInLayout(layout, 'slider_customization');
    assert.deepEqual(layout.pinnedTabs, ['slider_customization', 'website_branding']);

    layout = reorderPinnedTabsInLayout(layout, 1, 0);
    assert.deepEqual(layout.pinnedTabs, ['website_branding', 'slider_customization']);

    const reconciled = normalizeAdminNavLayout({
      version: 1,
      groups: [{ id: 'dashboard', label: 'قيادة', items: [{ id: 'overview' }] }],
      pinnedTabs: ['slider_customization'],
    });
    const reconciledTabs = reconciled.groups.flatMap((g) => g.items.map((i) => i.id));
    assert.equal(reconciledTabs.length, 31);
    assert.deepEqual(reconciled.pinnedTabs, ['slider_customization']);
  });
});

describe('Firestore Rules Schema Parity for SiteSettings', () => {
  it('ensures normalized settings sub-objects match firestore.rules hasAll/hasOnly key lists', () => {
    const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');

    const extractKeys = (fnName: string, check: 'hasAll' | 'hasOnly'): string[] => {
      const idx = rulesText.indexOf(`function ${fnName}(`);
      assert.ok(idx !== -1, `Missing function ${fnName} in firestore.rules`);
      const slice = rulesText.slice(idx, idx + 2500);
      const regex =
        check === 'hasAll'
          ? /\.keys\(\)\.hasAll\(\[([\s\S]*?)\]\)/
          : /\.keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/;
      const m = slice.match(regex);
      assert.ok(m, `Missing ${check} in ${fnName}`);
      return Array.from(m[1].matchAll(/'([^']+)'/g)).map((x) => x[1]);
    };

    const verifyParity = (fnName: string, obj: Record<string, unknown>) => {
      const objKeys = Object.keys(obj).sort();
      const hasAllKeys = extractKeys(fnName, 'hasAll');
      const hasOnlyKeys = extractKeys(fnName, 'hasOnly').sort();
      for (const reqKey of hasAllKeys) {
        assert.ok(objKeys.includes(reqKey), `${fnName}: missing required key "${reqKey}"`);
      }
      assert.deepEqual(objKeys, hasOnlyKeys, `${fnName}: normalized keys drifted from hasOnly`);
    };

    verifyParity('isValidPlayerTheme', normalizePlayerTheme(DEFAULT_PLAYER_THEME) as unknown as Record<string, unknown>);
    verifyParity('isValidHomeConfig', normalizeHomeConfig(DEFAULT_HOME_CONFIG) as unknown as Record<string, unknown>);
    verifyParity('isValidTypographyConfig', normalizeTypographyConfig(DEFAULT_TYPOGRAPHY_CONFIG) as unknown as Record<string, unknown>);
    verifyParity('isValidPopupShieldConfig', normalizePopupShieldConfig(DEFAULT_POPUP_SHIELD_CONFIG) as unknown as Record<string, unknown>);
    verifyParity(
      'isValidWebsiteBranding',
      sanitizeBrandingForFirestore(DEFAULT_WEBSITE_BRANDING, 'RahaL TV') as unknown as Record<string, unknown>
    );
    verifyParity('isValidHomeLayoutDoc', {
      ...pickLegacyAutoplayHomeConfig(DEFAULT_HOME_CONFIG),
      updatedBy: 'uid-admin',
      updatedAt: 'ts',
    });
    verifyParity('isValidSliderStyleDoc', {
      ...pickSliderStyleHomeConfig(DEFAULT_HOME_CONFIG),
      updatedBy: 'uid-admin',
      updatedAt: 'ts',
    });
    verifyParity('isValidWebsiteBrandingDoc', {
      ...(sanitizeBrandingForFirestore(DEFAULT_WEBSITE_BRANDING, 'RahaL TV') as unknown as Record<string, unknown>),
      updatedBy: 'uid-admin',
      updatedAt: 'ts',
    });
  });

  it('coerces non-boolean values strictly to booleans in homeConfig and playerTheme', () => {
    const home = normalizeHomeConfig({
      showHero: 1 as unknown as boolean,
      heroAutoPlay: 0 as unknown as boolean,
    });
    assert.strictEqual(home.showHero, true);
    assert.strictEqual(home.heroAutoPlay, false);

    const theme = normalizePlayerTheme({
      showHeaderBar: 1 as unknown as boolean,
      showFooterBar: 0 as unknown as boolean,
    });
    assert.strictEqual(theme.showHeaderBar, true);
    assert.strictEqual(theme.showFooterBar, false);
  });

  it('builds exact 15-key core, 23-key autoplay, and 19-key slider-style homeConfig subsets and round-trips split docs', () => {
    const coreSubset = pickLegacyCoreHomeConfig(DEFAULT_HOME_CONFIG);
    const autoplaySubset = pickLegacyAutoplayHomeConfig(DEFAULT_HOME_CONFIG);
    const customConfig = normalizeHomeConfig({
      ...DEFAULT_HOME_CONFIG,
      cardsPerRow: 6,
      heroAutoPlay: false,
      heroImageFit: 'contain_blur',
      heroBackdropBlurPx: 32,
      heroTitleSizePx: 36,
      heroShowWatchlistBtn: false,
    });
    const layoutDoc = pickLegacyAutoplayHomeConfig(customConfig);
    const sliderDoc = pickSliderStyleHomeConfig(customConfig);

    assert.equal(HOME_CONFIG_CORE_KEYS.length, 15);
    assert.equal(HOME_CONFIG_AUTOPLAY_KEYS.length, 8);
    assert.equal(HOME_CONFIG_SLIDER_STYLE_KEYS.length, 19);
    assert.equal(Object.keys(coreSubset).length, 15);
    assert.equal(Object.keys(autoplaySubset).length, 23);
    assert.equal(Object.keys(sliderDoc).length, 19);
    assert.equal('heroAutoPlay' in coreSubset, false);
    assert.equal('heroAutoPlay' in autoplaySubset, true);
    assert.equal('heroImageFit' in autoplaySubset, false);
    assert.equal(homeConfigHasAllSliderStyleKeys(autoplaySubset), false);
    assert.equal(homeConfigHasAllSliderStyleKeys(sliderDoc), true);

    const merged = normalizeHomeConfig({
      ...extractHomeBaseFromRecord(layoutDoc),
      ...extractSliderStyleFromRecord(sliderDoc),
    });
    assert.deepEqual(merged, customConfig);

    const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const idx = rulesText.indexOf('function isValidHomeConfig(');
    const slice = rulesText.slice(idx, idx + 2500);
    const hasOnlyMatch = slice.match(/\.keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
    assert.ok(hasOnlyMatch);
    const allowedKeys = new Set(Array.from(hasOnlyMatch[1].matchAll(/'([^']+)'/g)).map((x) => x[1]));
    const combined = new Set([
      ...HOME_CONFIG_CORE_KEYS,
      ...HOME_CONFIG_AUTOPLAY_KEYS,
      ...HOME_CONFIG_SLIDER_STYLE_KEYS,
    ]);
    assert.equal(combined.size, 42);
    assert.equal(allowedKeys.size, 42);
    for (const k of combined) {
      assert.ok(allowedKeys.has(k), `Combined homeConfig key "${k}" missing from isValidHomeConfig.hasOnly`);
    }
  });
});



