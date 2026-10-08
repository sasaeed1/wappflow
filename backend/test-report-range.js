'use strict';
// node test-report-range.js — the date range behind every Analytics figure.
const assert = require('assert');
const { reportRange } = require('./report-range');

const NOW = Date.parse('2026-10-08T21:30:00Z'); // 02:30 on the 9th in Pakistan (UTC+5)
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

t('period counts back from today, today included', () => {
  const r = reportRange({ period: '7' }, NOW);
  assert.deepStrictEqual(r.range, { start: '2026-10-02', end: '2026-10-08', days: 7 });
  assert.deepStrictEqual(r.prev, { start: '2026-09-25', end: '2026-10-01', days: 7 });
});
t("today is the viewer's today", () => {
  const r = reportRange({ period: '1', tz: '300' }, NOW);
  assert.strictEqual(r.range.end, '2026-10-09');
  assert.strictEqual(r.tzModifier, '+300 minutes');
  assert.strictEqual(reportRange({ period: '1', tz: '-240' }, NOW).tzModifier, '-240 minutes');
});
t('a custom range wins over the period, in either order', () => {
  const r = reportRange({ period: '7', start_date: '2026-09-30', end_date: '2026-09-01' }, NOW);
  assert.deepStrictEqual(r.range, { start: '2026-09-01', end: '2026-09-30', days: 30 });
  assert.deepStrictEqual(r.prev, { start: '2026-08-02', end: '2026-08-31', days: 30 });
});
t('a one-day custom range', () => {
  const r = reportRange({ start_date: '2026-10-05', end_date: '2026-10-05' }, NOW);
  assert.deepStrictEqual(r.range, { start: '2026-10-05', end: '2026-10-05', days: 1 });
  assert.strictEqual(r.prev.end, '2026-10-04');
});
t('bad input falls back to the last 30 days', () => {
  for (const q of [{}, { period: 'abc' }, { period: '-5' }, { start_date: '2026-02-30', end_date: '2026-03-01' },
    { start_date: "2026-01-01' OR 1=1 --", end_date: '2026-02-01' }, { start_date: '2026-01-01' }]) {
    assert.deepStrictEqual(reportRange(q, NOW).range, { start: '2026-09-09', end: '2026-10-08', days: 30 }, JSON.stringify(q));
  }
});
t('silly offsets and lengths are clamped', () => {
  assert.strictEqual(reportRange({ tz: '99999' }, NOW).tz, 0);
  assert.strictEqual(reportRange({ tz: '1; DROP TABLE leads' }, NOW).tzModifier, '+1 minutes');
  assert.strictEqual(reportRange({ period: '999999' }, NOW).range.days, 3660);
  assert.strictEqual(reportRange({ start_date: '1900-01-01', end_date: '2026-01-01' }, NOW).range.days, 3660);
});
console.log(`\n${pass}/6 passed`);
