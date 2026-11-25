import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHeroSliderVariant } from '../src/lib/heroSliderMode';
import { sanitizeShowcaseSliderConfigForFirestore } from '../src/lib/showcaseSliderConfig';
import { sanitizeStreamV4SliderConfigForFirestore } from '../src/lib/streamV4SliderConfig';
import {
  DEFAULT_MODERATOR_SUB_PERMS,
  normalizeModeratorSubPermissions,
} from '../src/lib/adminPreferences';

test('normalizeHeroSliderVariant validates all 4 variants and falls back to original', () => {
  assert.equal(normalizeHeroSliderVariant('original'), 'original');
  assert.equal(normalizeHeroSliderVariant('cinematic'), 'cinematic');
  assert.equal(normalizeHeroSliderVariant('showcase'), 'showcase');
  assert.equal(normalizeHeroSliderVariant('stream_v4'), 'stream_v4');
  assert.equal(normalizeHeroSliderVariant('unknown_mode'), 'original');
  assert.equal(normalizeHeroSliderVariant(null), 'original');
  assert.equal(normalizeHeroSliderVariant(undefined), 'original');
  assert.equal(normalizeHeroSliderVariant(42), 'original');
});

test('sanitizeShowcaseSliderConfigForFirestore caps titleLogos count, item size, and total payload budget', () => {
  const oversizedLogos: Record<string, string> = {};
  // 70 valid entries -> must cap at 60
  for (let i = 0; i < 70; i++) {
    oversizedLogos[`movie-${i}`] = `https://cdn.example.com/logos/logo-${i}.png`;
  }
  const cappedCount = sanitizeShowcaseSliderConfigForFirestore({
    titleLogos: oversizedLogos,
    watchBtnText: '  شاهد الآن  ',
    storyLines: 4,
  });
  assert.equal(Object.keys(cappedCount.titleLogos).length, 60);
  assert.equal(cappedCount.watchBtnText, 'شاهد الآن');
  assert.equal(cappedCount.storyLines, 4);

  // Oversized single entry (>250,000 chars) is dropped, while total payload stops at 750,000 chars
  const tooBigSingle = 'data:image/png;base64,' + 'A'.repeat(260000);
  const mediumChunk = 'data:image/png;base64,' + 'B'.repeat(200000);
  const budgetRes = sanitizeShowcaseSliderConfigForFirestore({
    titleLogos: {
      'too-big': tooBigSingle,
      'm-1': mediumChunk,
      'm-2': mediumChunk,
      'm-3': mediumChunk,
      'm-4': mediumChunk, // would push total > 750,000
    },
  });
  assert.equal('too-big' in budgetRes.titleLogos, false);
  assert.equal('m-1' in budgetRes.titleLogos, true);
  assert.equal('m-2' in budgetRes.titleLogos, true);
  assert.equal('m-3' in budgetRes.titleLogos, true);
  assert.equal('m-4' in budgetRes.titleLogos, false);
});

test('sanitizeStreamV4SliderConfigForFirestore enforces caps on titleLogos and clamps slideDurations', () => {
  const manyLogos: Record<string, string> = {};
  const manyDurations: Record<string, number> = {};
  for (let i = 0; i < 75; i++) {
    manyLogos[`item-${i}`] = `https://cdn.example.com/v4/logo-${i}.png`;
    manyDurations[`item-${i}`] = i === 0 ? 1 : i === 1 ? 120 : 12;
  }
  // Explicit valid low/high clamp checks alongside normalizeStreamV4SliderConfig (>= 2 check)
  manyDurations['clamped-high'] = 999;
  manyDurations['too-short'] = 1;

  const sanitized = sanitizeStreamV4SliderConfigForFirestore({
    titleLogos: manyLogos,
    slideDurations: manyDurations,
    defaultSlideDurationSec: 95,
    colorMode: 'custom',
    customAccentColor: '#12AB34',
  });

  assert.equal(Object.keys(sanitized.titleLogos).length, 60);
  assert.equal(Object.keys(sanitized.slideDurations).length, 60);
  assert.equal(sanitized.defaultSlideDurationSec, 60);
  assert.equal(sanitized.colorMode, 'custom');
  assert.equal(sanitized.customAccentColor, '#12AB34');
  assert.equal('too-short' in sanitized.slideDurations, false);
  assert.equal(sanitized.slideDurations['item-1'], 60);

  const clampedHighCheck = sanitizeStreamV4SliderConfigForFirestore({
    slideDurations: {
      'fast': 2,
      'slow': 180,
    },
  });
  assert.equal(clampedHighCheck.slideDurations['fast'], 2);
  assert.equal(clampedHighCheck.slideDurations['slow'], 60);
});

test('normalizeModeratorSubPermissions enforces strict 7-key boolean normalization and defaults', () => {
  const defaults = normalizeModeratorSubPermissions(undefined);
  assert.deepEqual(defaults, DEFAULT_MODERATOR_SUB_PERMS);

  const normalized = normalizeModeratorSubPermissions({
    allowBulkEditor: false,
    allowContentAudit: 'invalid' as unknown as boolean,
    allowWatchServers: false,
    allowAnalyticsRead: 1 as unknown as boolean,
    allowCrawlOperations: false,
    allowSiteScraper: true,
    allowAdapters: false,
    extraUnknownKey: true,
  } as Record<string, unknown>);

  assert.deepEqual(normalized, {
    allowBulkEditor: false,
    allowContentAudit: true,
    allowWatchServers: false,
    allowAnalyticsRead: true,
    allowCrawlOperations: false,
    allowSiteScraper: true,
    allowAdapters: false,
  });
  assert.equal(Object.keys(normalized).length, 7);
  assert.equal('extraUnknownKey' in normalized, false);
});
