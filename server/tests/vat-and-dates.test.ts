import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toPaisa,
  fromPaisa,
  calculateVat,
  formatNpr,
} from '../src/utils/money.js';

import {
  adToBs,
  bsToAd,
  getFiscalYearFromBs,
  getNowNpt,
  resolveDatePreset,
} from '../src/utils/nepaliDate.js';

test('toPaisa converts numbers and strings to exact integer paisa with rounding', () => {
  assert.strictEqual(toPaisa(100), 10000);
  assert.strictEqual(toPaisa(100.5), 10050);
  assert.strictEqual(toPaisa(100.55), 10055);
  assert.strictEqual(toPaisa(100.555), 10056);
  assert.strictEqual(toPaisa('100'), 10000);
  assert.strictEqual(toPaisa('100.50'), 10050);
  assert.strictEqual(toPaisa(' 100.55 '), 10055);
  assert.strictEqual(toPaisa(0), 0);
  assert.strictEqual(toPaisa('0'), 0);
  assert.strictEqual(toPaisa(-50.25), -5025);
  assert.throws(() => toPaisa('invalid-amount'), /Invalid monetary amount/);
  assert.throws(() => toPaisa(NaN), /Invalid monetary amount/);
});

test('fromPaisa formats integer paisa to 2-decimal string', () => {
  assert.strictEqual(fromPaisa(10000), '100.00');
  assert.strictEqual(fromPaisa(10000000), '100000.00');
  assert.strictEqual(fromPaisa(1150), '11.50');
  assert.strictEqual(fromPaisa(0), '0.00');
  assert.strictEqual(fromPaisa(-5025), '-50.25');
  assert.strictEqual(fromPaisa(5), '0.05');
});

test('calculateVat handles standard 13% EXCLUSIVE mode correctly', () => {
  const res = calculateVat({
    enteredAmount: 100000,
    taxType: 'VAT_13',
    mode: 'EXCLUSIVE',
  });

  assert.strictEqual(res.enteredPaisa, 10000000);
  assert.strictEqual(res.basePaisa, 10000000);
  assert.strictEqual(res.vatPaisa, 1300000);
  assert.strictEqual(res.totalPaisa, 11300000);
  assert.strictEqual(res.baseAmount, '100000.00');
  assert.strictEqual(res.vatAmount, '13000.00');
  assert.strictEqual(res.totalAmount, '113000.00');
});

test('calculateVat handles standard 13% INCLUSIVE mode correctly', () => {
  const res = calculateVat({
    enteredAmount: 113000,
    taxType: 'VAT_13',
    mode: 'INCLUSIVE',
  });

  assert.strictEqual(res.enteredPaisa, 11300000);
  assert.strictEqual(res.basePaisa, 10000000);
  assert.strictEqual(res.vatPaisa, 1300000);
  assert.strictEqual(res.totalPaisa, 11300000);
  assert.strictEqual(res.baseAmount, '100000.00');
  assert.strictEqual(res.vatAmount, '13000.00');
  assert.strictEqual(res.totalAmount, '113000.00');
});

test('REVIEW FOCUS: calculateVat 13% INCLUSIVE boundary for Rs. 100.00', () => {
  // Inclusive 100.00: vatPaisa = Math.round(10000 * 13 / 113) = 1150
  // basePaisa = totalPaisa - vatPaisa = 8850
  // basePaisa + vatPaisa must identically equal totalPaisa (10000)
  const res = calculateVat({
    enteredAmount: 100,
    taxType: 'VAT_13',
    mode: 'INCLUSIVE',
  });

  assert.strictEqual(res.enteredPaisa, 10000);
  assert.strictEqual(res.vatPaisa, 1150);
  assert.strictEqual(res.basePaisa, 8850);
  assert.strictEqual(res.totalPaisa, 10000);
  assert.strictEqual(res.basePaisa + res.vatPaisa, res.totalPaisa);
  assert.strictEqual(res.baseAmount, '88.50');
  assert.strictEqual(res.vatAmount, '11.50');
  assert.strictEqual(res.totalAmount, '100.00');
});

test('calculateVat handles NON_VAT mode correctly in both EXCLUSIVE and INCLUSIVE', () => {
  const resExclusive = calculateVat({
    enteredAmount: 5000,
    taxType: 'NON_VAT',
    mode: 'EXCLUSIVE',
  });
  assert.strictEqual(resExclusive.enteredPaisa, 500000);
  assert.strictEqual(resExclusive.basePaisa, 500000);
  assert.strictEqual(resExclusive.vatPaisa, 0);
  assert.strictEqual(resExclusive.totalPaisa, 500000);
  assert.strictEqual(resExclusive.baseAmount, '5000.00');
  assert.strictEqual(resExclusive.vatAmount, '0.00');
  assert.strictEqual(resExclusive.totalAmount, '5000.00');

  const resInclusive = calculateVat({
    enteredAmount: '5000.00',
    taxType: 'NON_VAT',
    mode: 'INCLUSIVE',
  });
  assert.strictEqual(resInclusive.enteredPaisa, 500000);
  assert.strictEqual(resInclusive.basePaisa, 500000);
  assert.strictEqual(resInclusive.vatPaisa, 0);
  assert.strictEqual(resInclusive.totalPaisa, 500000);
  assert.strictEqual(resInclusive.baseAmount, '5000.00');
  assert.strictEqual(resInclusive.vatAmount, '0.00');
  assert.strictEqual(resInclusive.totalAmount, '5000.00');
});

test('formatNpr formats currency using standard South Asian grouping and Rs. prefix', () => {
  assert.strictEqual(formatNpr(113000), 'Rs. 1,13,000.00');
  assert.strictEqual(formatNpr(10000000), 'Rs. 1,00,00,000.00');
  assert.strictEqual(formatNpr(100), 'Rs. 100.00');
  assert.strictEqual(formatNpr(0), 'Rs. 0.00');
  assert.strictEqual(formatNpr('5000.5'), 'Rs. 5,000.50');
  assert.strictEqual(formatNpr(-5000), '-Rs. 5,000.00');
  assert.strictEqual(formatNpr('invalid'), 'Rs. 0.00');
});

test('BS↔AD calendar round-trip conversion for verified anchor dates', () => {
  const datesToTest = [
    { ad: '2026-11-13', bs: '2083-07-27', fy: '2083/84' },
    { ad: '2026-07-17', bs: '2083-04-01', fy: '2083/84' },
    { ad: '2026-07-16', bs: '2083-03-32', fy: '2082/83' },
    { ad: '2026-11-05', bs: '2083-07-19', fy: '2083/84' },
    { ad: '2026-11-01', bs: '2083-07-15', fy: '2083/84' },
    { ad: '1943-04-14', bs: '2000-01-01', fy: '1999/00' },
    { ad: '2034-04-13', bs: '2090-12-30', fy: '2090/91' },
  ];

  for (const item of datesToTest) {
    const convertedBs = adToBs(item.ad);
    assert.strictEqual(convertedBs, item.bs, `adToBs(${item.ad}) failed`);

    const convertedAd = bsToAd(item.bs);
    assert.strictEqual(convertedAd, item.ad, `bsToAd(${item.bs}) failed`);

    const fy = getFiscalYearFromBs(item.bs);
    assert.strictEqual(fy, item.fy, `getFiscalYearFromBs(${item.bs}) failed`);
  }
});

test('REVIEW FOCUS: bsToAd validates BS month days and rejects rollover', () => {
  // In 2083, Jestha (month 2) has exactly 31 days. Day 32 and 33 must throw!
  assert.throws(() => bsToAd('2083-02-33'), /Invalid BS day 33/);
  assert.throws(() => bsToAd('2083-02-32'), /Invalid BS day 32/);

  // Month 13 is invalid
  assert.throws(() => bsToAd('2083-13-01'), /Invalid BS month/);
  assert.throws(() => bsToAd('2083-00-10'), /Invalid BS month/);

  // Years out of supported 2000..2090 range
  assert.throws(() => bsToAd('1999-12-30'), /BS year 1999 out of supported range/);
  assert.throws(() => bsToAd('2091-01-01'), /BS year 2091 out of supported range/);

  // Malformed date strings
  assert.throws(() => bsToAd('2083/02/10'), /Invalid BS date format/);
  assert.throws(() => bsToAd('not-a-date'), /Invalid BS date format/);
});

test('adToBs validates AD date boundaries and rejects malformed inputs', () => {
  assert.throws(() => adToBs('1943-04-13'), /AD date earlier than supported BS range/);
  assert.throws(() => adToBs('2035-01-01'), /exceeds supported BS range/);
  assert.throws(() => adToBs('2026-02-31'), /Invalid AD date/);
  assert.throws(() => adToBs('invalid'), /Invalid AD date format/);
});

test('getFiscalYearFromBs handles Shrawan (month 4) boundary transition', () => {
  // Month 4..12 belongs to YYYY/(YY+1)
  assert.strictEqual(getFiscalYearFromBs('2083-04-01'), '2083/84');
  assert.strictEqual(getFiscalYearFromBs('2083-07-27'), '2083/84');
  assert.strictEqual(getFiscalYearFromBs('2083-12-30'), '2083/84');

  // Month 1..3 belongs to (YYYY-1)/YY
  assert.strictEqual(getFiscalYearFromBs('2083-01-01'), '2082/83');
  assert.strictEqual(getFiscalYearFromBs('2083-03-32'), '2082/83');
  assert.strictEqual(getFiscalYearFromBs('2080-02-15'), '2079/80');
});

test('getNowNpt returns exact NPT (UTC+5:45) date, time, BS date and fiscal year', () => {
  const sampleUtc = new Date('2026-11-13T12:30:00.000Z');
  const npt = getNowNpt(sampleUtc);

  assert.strictEqual(npt.isoUtc, '2026-11-13T12:30:00.000Z');
  assert.strictEqual(npt.dateAd, '2026-11-13');
  assert.strictEqual(npt.timeNpt, '18:15:00');
  assert.strictEqual(npt.dateBs, '2083-07-27');
  assert.strictEqual(npt.fiscalYear, '2083/84');

  // Time just across midnight in NPT: 18:30 UTC on Nov 12 is 00:15 NPT on Nov 13
  const midnightTransition = new Date('2026-11-12T18:30:00.000Z');
  const nptMidnight = getNowNpt(midnightTransition);
  assert.strictEqual(nptMidnight.dateAd, '2026-11-13');
  assert.strictEqual(nptMidnight.timeNpt, '00:15:00');
  assert.strictEqual(nptMidnight.dateBs, '2083-07-27');
});

test('resolveDatePreset resolves standard date presets for NPT reference date', () => {
  const sampleRef = new Date('2026-11-13T12:30:00.000Z'); // Friday, 2026-11-13 AD / 2083-07-27 BS

  // Today
  const today = resolveDatePreset('today', sampleRef);
  assert.deepStrictEqual(today, { fromAd: '2026-11-13', toAd: '2026-11-13' });

  // Yesterday
  const yesterday = resolveDatePreset('yesterday', sampleRef);
  assert.deepStrictEqual(yesterday, { fromAd: '2026-11-12', toAd: '2026-11-12' });

  // This Week (Sunday to Saturday in Nepal/NPT: Nov 8 to Nov 14, 2026)
  const thisWeek = resolveDatePreset('this_week', sampleRef);
  assert.deepStrictEqual(thisWeek, { fromAd: '2026-11-08', toAd: '2026-11-14' });

  // This Month (Bikram Sambat Kartik 2083: 2083-07-01 to 2083-07-30 => 2026-10-18 to 2026-11-16)
  const thisMonth = resolveDatePreset('this_month', sampleRef);
  assert.deepStrictEqual(thisMonth, { fromAd: '2026-10-18', toAd: '2026-11-16' });

  // Fiscal Year (2083/84: 2083-04-01 to 2084-03-31 => 2026-07-17 to 2027-07-16)
  const fiscalYear = resolveDatePreset('fiscal_year', sampleRef);
  assert.strictEqual(fiscalYear.fromAd, '2026-07-17');
  assert.strictEqual(fiscalYear.toAd, '2027-07-16');

  // Verify Fiscal Year when reference date is in month 1..3 (Ashadh 32, 2083-03-32 => fiscal year 2082/83)
  const ashadhRef = new Date('2026-07-16T12:00:00.000Z');
  const prevFy = resolveDatePreset('fiscal_year', ashadhRef);
  assert.strictEqual(prevFy.fromAd, '2025-07-17'); // 2082-04-01 BS
  assert.strictEqual(prevFy.toAd, '2026-07-16'); // 2083-03-32 BS
});
