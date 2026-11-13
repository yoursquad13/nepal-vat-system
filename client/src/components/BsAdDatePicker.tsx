import { useState, useEffect, useMemo } from 'react';
import { Calendar, RefreshCw, AlertCircle } from 'lucide-react';
import {
  adToBs,
  bsToAd,
  getFiscalYearFromBs,
  getNowNpt,
  BS_MONTH_DAYS,
} from '../utils/nepaliDate';

export const BS_MONTH_NAMES_EN = [
  'Baisakh (01)',
  'Jestha (02)',
  'Ashadh (03)',
  'Shrawan (04)',
  'Bhadra (05)',
  'Ashwin (06)',
  'Kartik (07)',
  'Mangsir (08)',
  'Poush (09)',
  'Magh (10)',
  'Falgun (11)',
  'Chaitra (12)',
];

export interface BsAdDateValue {
  bs: string; // YYYY-MM-DD
  ad: string; // YYYY-MM-DD
  fiscalYear: string; // e.g. "2083/84"
}

export interface BsAdDatePickerProps {
  label?: string;
  valueBs?: string;
  valueAd?: string;
  onChange: (value: BsAdDateValue) => void;
  required?: boolean;
  disabled?: boolean;
  allowAdInput?: boolean;
  className?: string;
  helperText?: string;
}

export function BsAdDatePicker({
  label = 'Date (Bikram Sambat)',
  valueBs,
  valueAd,
  onChange,
  required = false,
  disabled = false,
  allowAdInput = true,
  className = '',
  helperText,
}: BsAdDatePickerProps) {
  // Input mode: 'BS' (Bikram Sambat) or 'AD' (Gregorian)
  const [mode, setMode] = useState<'BS' | 'AD'>('BS');

  // Today fallback
  const todayNpt = useMemo(() => getNowNpt(), []);

  // Internal state tracking
  const [currentBs, setCurrentBs] = useState<string>(() => {
    if (valueBs && /^\d{4}-\d{2}-\d{2}$/.test(valueBs)) return valueBs;
    if (valueAd && /^\d{4}-\d{2}-\d{2}$/.test(valueAd)) {
      try {
        return adToBs(valueAd);
      } catch {
        return todayNpt.dateBs;
      }
    }
    return todayNpt.dateBs;
  });

  const [currentAd, setCurrentAd] = useState<string>(() => {
    if (valueAd && /^\d{4}-\d{2}-\d{2}$/.test(valueAd)) return valueAd;
    if (valueBs && /^\d{4}-\d{2}-\d{2}$/.test(valueBs)) {
      try {
        return bsToAd(valueBs);
      } catch {
        return todayNpt.dateAd;
      }
    }
    return todayNpt.dateAd;
  });

  const [error, setError] = useState<string | null>(null);

  // Sync when incoming props change
  useEffect(() => {
    if (valueBs && /^\d{4}-\d{2}-\d{2}$/.test(valueBs) && valueBs !== currentBs) {
      try {
        const ad = bsToAd(valueBs);
        setCurrentBs(valueBs);
        setCurrentAd(ad);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Invalid BS Date');
      }
    } else if (valueAd && /^\d{4}-\d{2}-\d{2}$/.test(valueAd) && valueAd !== currentAd) {
      try {
        const bs = adToBs(valueAd);
        setCurrentBs(bs);
        setCurrentAd(valueAd);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Invalid AD Date');
      }
    }
  }, [valueBs, valueAd]);

  // Derived BS Parts
  const { bsYear, bsMonth, bsDay, maxDaysInMonth } = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(currentBs)) {
      return { bsYear: 2083, bsMonth: 7, bsDay: 1, maxDaysInMonth: 30 };
    }
    const [y, m, d] = currentBs.split('-').map(Number);
    const monthDays = BS_MONTH_DAYS[y] || BS_MONTH_DAYS[2083];
    const maxDays = monthDays[m - 1] || 30;
    return {
      bsYear: y,
      bsMonth: m,
      bsDay: Math.min(d, maxDays),
      maxDaysInMonth: maxDays,
    };
  }, [currentBs]);

  // Fiscal Year
  const fiscalYear = useMemo(() => {
    try {
      return getFiscalYearFromBs(currentBs);
    } catch {
      return '2083/84';
    }
  }, [currentBs]);

  // Handle change from BS selects or text
  const handleBsChange = (newYear: number, newMonth: number, newDay: number) => {
    try {
      const monthDays = BS_MONTH_DAYS[newYear];
      if (!monthDays) {
        throw new Error(`Year ${newYear} outside supported range (2000-2090).`);
      }
      const maxDays = monthDays[newMonth - 1];
      const validDay = Math.min(newDay, maxDays);
      const bsStr = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`;
      const adStr = bsToAd(bsStr);
      const fy = getFiscalYearFromBs(bsStr);

      setCurrentBs(bsStr);
      setCurrentAd(adStr);
      setError(null);
      onChange({ bs: bsStr, ad: adStr, fiscalYear: fy });
    } catch (err: any) {
      setError(err.message || 'Invalid Bikram Sambat date');
    }
  };

  // Handle AD input change
  const handleAdChange = (adStr: string) => {
    setCurrentAd(adStr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(adStr)) {
      setError('Please enter a valid Gregorian date (YYYY-MM-DD)');
      return;
    }
    try {
      const bsStr = adToBs(adStr);
      const fy = getFiscalYearFromBs(bsStr);
      setCurrentBs(bsStr);
      setError(null);
      onChange({ bs: bsStr, ad: adStr, fiscalYear: fy });
    } catch (err: any) {
      setError(err.message || 'AD date conversion failed');
    }
  };

  // Set to today
  const handleSetToday = () => {
    const today = getNowNpt();
    setCurrentBs(today.dateBs);
    setCurrentAd(today.dateAd);
    setError(null);
    onChange({ bs: today.dateBs, ad: today.dateAd, fiscalYear: today.fiscalYear });
  };

  // Year options: Bikram Sambat 2075 through 2090
  const bsYears = useMemo(() => {
    const years: number[] = [];
    for (let y = 2075; y <= 2090; y++) {
      years.push(y);
    }
    return years;
  }, []);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {/* Header with Mode Toggle & Quick Today button */}
      <div className="flex items-center justify-between text-xs">
        <label className="font-semibold text-slate-700 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-emerald-600" />
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={handleSetToday}
            className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
          >
            Today
          </button>

          {allowAdInput && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setMode((m) => (m === 'BS' ? 'AD' : 'BS'))}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1 transition-colors"
              title="Toggle Bikram Sambat / Gregorian Date Input Mode"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              <span>{mode === 'BS' ? 'Switch to AD' : 'Switch to BS'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Input Form Fields */}
      {mode === 'BS' ? (
        <div className="grid grid-cols-3 gap-2">
          {/* BS Year */}
          <div>
            <select
              aria-label="Bikram Sambat Year"
              disabled={disabled}
              value={bsYear}
              onChange={(e) => handleBsChange(Number(e.target.value), bsMonth, bsDay)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 tabular-nums shadow-xs"
            >
              {bsYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr} BS
                </option>
              ))}
            </select>
          </div>

          {/* BS Month */}
          <div>
            <select
              aria-label="Bikram Sambat Month"
              disabled={disabled}
              value={bsMonth}
              onChange={(e) => handleBsChange(bsYear, Number(e.target.value), bsDay)}
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs truncate"
            >
              {BS_MONTH_NAMES_EN.map((mName, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {mName}
                </option>
              ))}
            </select>
          </div>

          {/* BS Day */}
          <div>
            <select
              aria-label="Bikram Sambat Day"
              disabled={disabled}
              value={bsDay}
              onChange={(e) => handleBsChange(bsYear, bsMonth, Number(e.target.value))}
              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 tabular-nums shadow-xs"
            >
              {Array.from({ length: maxDaysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Day {String(d).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        /* AD Date Picker */
        <div>
          <input
            type="date"
            disabled={disabled}
            value={currentAd}
            onChange={(e) => handleAdChange(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 tabular-nums shadow-xs"
          />
        </div>
      )}

      {/* Dual Preview Bar with Fiscal Year */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200/80 rounded-md text-[11px] text-slate-600">
        <div className="flex items-center gap-3 tabular-nums">
          <span>
            <strong className="text-slate-800 font-semibold">BS:</strong> {currentBs}
          </span>
          <span className="text-slate-300">|</span>
          <span>
            <strong className="text-slate-800 font-semibold">AD:</strong> {currentAd}
          </span>
        </div>

        <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono font-medium bg-emerald-100/70 text-emerald-800 text-[10px]">
          FY {fiscalYear}
        </span>
      </div>

      {/* Error / Validation Message */}
      {error && (
        <div className="flex items-center gap-1 text-xs text-rose-600 mt-0.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {helperText && !error && (
        <p className="text-[11px] text-slate-500">{helperText}</p>
      )}
    </div>
  );
}
