/**
 * Bikram Sambat (BS) <-> Gregorian (AD) Calendar and Nepal Time (NPT: UTC+5:45) utilities.
 * Anchored to 2000-01-01 BS === 1943-04-14 AD.
 * Covers Bikram Sambat 2000 BS through 2090 BS (1943 AD through 2034 AD).
 */

export const BS_MONTH_NAMES = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const;

export const BS_MONTH_DAYS: Record<number, readonly number[]> = {
  2000: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2001: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2002: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2003: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2004: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2005: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2006: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2007: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2008: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2009: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2010: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2011: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2012: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2013: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2014: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2015: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2016: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2017: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2018: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2019: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2020: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2021: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2022: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2023: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2024: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2025: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2026: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2027: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2028: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2029: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2030: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2031: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2032: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2033: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2034: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2035: [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2036: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2037: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2038: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2039: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2040: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2041: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2042: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2043: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2044: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2045: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2046: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2047: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2048: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2049: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2050: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2051: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2052: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2053: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2054: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2055: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2056: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2057: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2058: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2059: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2060: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2061: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2062: [30, 32, 31, 32, 31, 31, 29, 30, 29, 30, 29, 31],
  2063: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2064: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2065: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2066: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31],
  2067: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2068: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2069: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2070: [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  2071: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2072: [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2073: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2074: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2089: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2090: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ANCHOR_BS_YEAR = 2000;
const ANCHOR_AD_UTC = Date.UTC(1943, 3, 14); // 1943-04-14 00:00:00 UTC

export interface NowNpt {
  isoUtc: string;
  dateAd: string;
  timeNpt: string;
  dateBs: string;
  fiscalYear: string;
}

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'this_month_bs'
  | 'this_month_ad'
  | 'fiscal_year';

export interface DateRange {
  fromAd: string;
  toAd: string;
}

/**
 * Validates whether an AD date string (YYYY-MM-DD) is valid and within supported range.
 */
function parseAndValidateAd(adDateStr: string): { y: number; m: number; d: number; timeUtc: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(adDateStr)) {
    throw new Error(`Invalid AD date format: "${adDateStr}". Expected YYYY-MM-DD.`);
  }
  const [yStr, mStr, dStr] = adDateStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);

  if (m < 1 || m > 12) {
    throw new Error(`Invalid AD month: ${m}. Must be between 1 and 12.`);
  }

  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Invalid AD date: "${adDateStr}". Day out of range for month/year.`);
  }

  return { y, m, d, timeUtc: dt.getTime() };
}

/**
 * Converts a Gregorian (AD) date string (YYYY-MM-DD) to Bikram Sambat (BS) date string (YYYY-MM-DD).
 */
export function adToBs(adDateStr: string): string {
  const { timeUtc } = parseAndValidateAd(adDateStr);
  let diffDays = Math.round((timeUtc - ANCHOR_AD_UTC) / MS_PER_DAY);

  if (diffDays < 0) {
    throw new Error(`AD date earlier than supported BS range (2000-01-01 BS / 1943-04-14 AD): "${adDateStr}".`);
  }

  let bsYear = ANCHOR_BS_YEAR;
  while (bsYear <= 2090) {
    const monthDays = BS_MONTH_DAYS[bsYear];
    if (!monthDays) break;
    const yearDays = monthDays.reduce((a, b) => a + b, 0);
    if (diffDays < yearDays) {
      break;
    }
    diffDays -= yearDays;
    bsYear++;
  }

  if (bsYear > 2090) {
    throw new Error(`AD date "${adDateStr}" exceeds supported BS range (2090 BS / 2034-04-13 AD).`);
  }

  const monthDays = BS_MONTH_DAYS[bsYear];
  let bsMonth = 1;
  for (let i = 0; i < 12; i++) {
    if (diffDays < monthDays[i]) {
      break;
    }
    diffDays -= monthDays[i];
    bsMonth++;
  }
  const bsDay = diffDays + 1;

  return `${bsYear}-${String(bsMonth).padStart(2, '0')}-${String(bsDay).padStart(2, '0')}`;
}

/**
 * Converts a Bikram Sambat (BS) date string (YYYY-MM-DD) to Gregorian (AD) date string (YYYY-MM-DD).
 * Throws on invalid formats, out of bounds months/days, or years outside 2000..2090.
 */
export function bsToAd(bsDateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bsDateStr)) {
    throw new Error(`Invalid BS date format: "${bsDateStr}". Expected YYYY-MM-DD.`);
  }

  const [yStr, mStr, dStr] = bsDateStr.split('-');
  const bsYear = parseInt(yStr, 10);
  const bsMonth = parseInt(mStr, 10);
  const bsDay = parseInt(dStr, 10);

  if (bsYear < 2000 || bsYear > 2090) {
    throw new Error(`BS year ${bsYear} out of supported range (2000..2090).`);
  }
  if (bsMonth < 1 || bsMonth > 12) {
    throw new Error(`Invalid BS month ${bsMonth}. Must be between 1 and 12.`);
  }

  const monthDays = BS_MONTH_DAYS[bsYear];
  const maxDays = monthDays[bsMonth - 1];
  if (bsDay < 1 || bsDay > maxDays) {
    throw new Error(
      `Invalid BS day ${bsDay} for year ${bsYear}, month ${bsMonth}. Must be between 1 and ${maxDays}.`
    );
  }

  let totalDays = 0;
  for (let y = ANCHOR_BS_YEAR; y < bsYear; y++) {
    totalDays += BS_MONTH_DAYS[y].reduce((a, b) => a + b, 0);
  }
  for (let m = 0; m < bsMonth - 1; m++) {
    totalDays += monthDays[m];
  }
  totalDays += bsDay - 1;

  const targetDate = new Date(ANCHOR_AD_UTC + totalDays * MS_PER_DAY);
  const adYear = targetDate.getUTCFullYear();
  const adMonth = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const adDay = String(targetDate.getUTCDate()).padStart(2, '0');

  return `${adYear}-${adMonth}-${adDay}`;
}

/**
 * Returns the Nepali Fiscal Year for a given BS date.
 * Shrawan (month 4) through Chaitra (month 12) belong to YYYY/(YY+1).
 * Baisakh (month 1) through Ashadh (month 3) belong to (YYYY-1)/YY.
 * Example: "2083-04-01" -> "2083/84", "2083-03-32" -> "2082/83".
 */
export function getFiscalYearFromBs(bsDateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bsDateStr)) {
    throw new Error(`Invalid BS date format: "${bsDateStr}". Expected YYYY-MM-DD.`);
  }

  const [yStr, mStr] = bsDateStr.split('-');
  const bsYear = parseInt(yStr, 10);
  const bsMonth = parseInt(mStr, 10);

  if (bsMonth < 1 || bsMonth > 12) {
    throw new Error(`Invalid BS month: ${bsMonth}. Must be between 1 and 12.`);
  }

  let startYear = bsYear;
  if (bsMonth < 4) {
    startYear = bsYear - 1;
  }
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}/${endYearShort}`;
}

/**
 * Returns current timestamp details formatted in Nepal Standard Time (NPT: UTC+5:45).
 */
export function getNowNpt(now?: Date): NowNpt {
  const date = now || new Date();
  const isoUtc = date.toISOString();

  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateAd = dateFormatter.format(date);

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const timeNpt = timeFormatter.format(date);

  const dateBs = adToBs(dateAd);
  const fiscalYear = getFiscalYearFromBs(dateBs);

  return {
    isoUtc,
    dateAd,
    timeNpt,
    dateBs,
    fiscalYear,
  };
}

/**
 * Helper to add/subtract days from an AD YYYY-MM-DD date string.
 */
function addDaysToAd(adDateStr: string, days: number): string {
  const [y, m, d] = adDateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY);
  const yy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Resolves date presets (today, yesterday, this_week, this_month, fiscal_year)
 * relative to Nepal Standard Time (UTC+5:45) reference date into AD date ranges.
 */
export function resolveDatePreset(preset: DatePreset, refDate?: Date): DateRange {
  const npt = getNowNpt(refDate);
  const todayAd = npt.dateAd;
  const todayBs = npt.dateBs;

  switch (preset) {
    case 'today':
      return { fromAd: todayAd, toAd: todayAd };

    case 'yesterday': {
      const yesterdayAd = addDaysToAd(todayAd, -1);
      return { fromAd: yesterdayAd, toAd: yesterdayAd };
    }

    case 'this_week': {
      const [y, m, d] = todayAd.split('-').map(Number);
      const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
      const startOfWeek = addDaysToAd(todayAd, -dayOfWeek);
      const endOfWeek = addDaysToAd(startOfWeek, 6);
      return { fromAd: startOfWeek, toAd: endOfWeek };
    }

    case 'this_month':
    case 'this_month_bs': {
      // Current Bikram Sambat month
      const [bsY, bsM] = todayBs.split('-').map(Number);
      const daysInMonth = BS_MONTH_DAYS[bsY][bsM - 1];
      const startBs = `${bsY}-${String(bsM).padStart(2, '0')}-01`;
      const endBs = `${bsY}-${String(bsM).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      return { fromAd: bsToAd(startBs), toAd: bsToAd(endBs) };
    }

    case 'this_month_ad': {
      // Current Gregorian month
      const [adY, adM] = todayAd.split('-').map(Number);
      const startAd = `${adY}-${String(adM).padStart(2, '0')}-01`;
      const lastDay = new Date(Date.UTC(adY, adM, 0)).getUTCDate();
      const endAd = `${adY}-${String(adM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { fromAd: startAd, toAd: endAd };
    }

    case 'fiscal_year': {
      // Nepali Fiscal Year (Shrawan 1 to Ashadh 31/32)
      const [bsY, bsM] = todayBs.split('-').map(Number);
      let fyStartYear = bsY;
      if (bsM < 4) {
        fyStartYear = bsY - 1;
      }
      const fyEndYear = fyStartYear + 1;
      const startBs = `${fyStartYear}-04-01`;
      const safeEndYear = Math.min(2090, fyEndYear);
      const daysInAshadh = BS_MONTH_DAYS[safeEndYear]?.[2] || 31;
      const endBs = `${fyEndYear}-03-${String(daysInAshadh).padStart(2, '0')}`;
      return { fromAd: bsToAd(startBs), toAd: bsToAd(endBs) };
    }

    default:
      throw new Error(`Unknown date preset: "${preset}"`);
  }
}
