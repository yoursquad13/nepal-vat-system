import { useState, useEffect, useRef, DragEvent, ClipboardEvent } from 'react';
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { BillExtractionResponse } from '../api/client';
import { formatNpr } from '../utils/money';

const ACCEPTED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const MAX_BILL_SIZE_BYTES = 10 * 1024 * 1024;

export interface BillScannerCardProps {
  file: File | null;
  isScanning: boolean;
  scanError: string | null;
  scanResult: BillExtractionResponse | null;
  isEdit: boolean;
  calculatedTotalAmount: number;
  isExactPrintedApplied?: boolean;
  isFinanciallyLocked: boolean;
  onFileSelected: (file: File) => void;
  onClearFile: () => void;
  onRescan: () => void;
  onUsePrintedTotal?: () => void;
  onResetExactPrinted?: () => void;
  onInvalidFile: (message: string) => void;
}

/**
 * Normalizes dropped, uploaded, or clipboard-pasted Files so pasted screenshots receive a valid image extension.
 */
export function normalizeBillFileInput(rawFile: File): { file?: File; error?: string } {
  if (rawFile.size > MAX_BILL_SIZE_BYTES) {
    return { error: 'File is larger than 10MB maximum limit.' };
  }

  const mime = (rawFile.type || '').toLowerCase();
  const extFromMime = ACCEPTED_MIME_TYPES[mime];
  const lowerName = (rawFile.name || '').toLowerCase();
  const hasValidExt = /\.(jpe?g|png|webp|pdf)$/.test(lowerName);

  if (!extFromMime && !hasValidExt) {
    return { error: 'Unsupported file type. Use JPG, PNG, WEBP, or PDF.' };
  }

  const normalizedMime = mime === 'image/jpg' ? 'image/jpeg' : mime || (hasValidExt && lowerName.endsWith('.pdf') ? 'application/pdf' : 'image/png');
  if (!hasValidExt && extFromMime) {
    const safeName = `pasted-bill-${Date.now()}.${extFromMime}`;
    return {
      file: new File([rawFile], safeName, { type: normalizedMime }),
    };
  }

  return { file: rawFile };
}

/**
 * Extracts a File from a clipboard paste event if an image or PDF was copied.
 */
export function extractFileFromClipboard(clipboardData: DataTransfer | null | undefined): File | null {
  if (!clipboardData) return null;

  if (clipboardData.files && clipboardData.files.length > 0) {
    const f = clipboardData.files[0];
    if (f.type.startsWith('image/') || f.type === 'application/pdf') {
      return f;
    }
  }

  if (clipboardData.items) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === 'file' && (item.type.startsWith('image/') || item.type === 'application/pdf')) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
  }

  return null;
}

export function BillScannerCard({
  file,
  isScanning,
  scanError,
  scanResult,
  isEdit,
  calculatedTotalAmount,
  isExactPrintedApplied,
  isFinanciallyLocked,
  onFileSelected,
  onClearFile,
  onRescan,
  onUsePrintedTotal,
  onResetExactPrinted,
  onInvalidFile,
}: BillScannerCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const handleIncomingRawFile = (raw: File) => {
    const { file: normalized, error } = normalizeBillFileInput(raw);
    if (error || !normalized) {
      onInvalidFile(error || 'Invalid bill file');
      return;
    }
    onFileSelected(normalized);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) {
      handleIncomingRawFile(dropped);
    }
  };

  const handleZonePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const pasted = extractFileFromClipboard(e.clipboardData);
    if (pasted) {
      e.preventDefault();
      e.stopPropagation();
      handleIncomingRawFile(pasted);
    }
  };

  const printedTotal = scanResult?.extracted?.total_amount;
  const hasRoundingDiff =
    Boolean(
      scanResult &&
        !isExactPrintedApplied &&
        printedTotal !== null &&
        printedTotal !== undefined &&
        Math.abs(calculatedTotalAmount - printedTotal) > 0.005
    );

  const docTypeLabel =
    scanResult?.extracted?.document_type === 'ABBREVIATED_TAX_INVOICE'
      ? 'Abbreviated VAT Bill (Inclusive)'
      : scanResult?.extracted?.document_type === 'TAX_INVOICE'
      ? 'Tax Invoice (13% VAT Exclusive)'
      : scanResult?.extracted?.document_type === 'NON_VAT_BILL'
      ? 'Non-VAT Bill'
      : 'Scanned Bill';

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Upload className="w-4 h-4 text-emerald-600" />
          <span>Attach Physical VAT Bill / Tax Invoice</span>
        </div>
      </div>

      <div
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handleZonePaste}
        className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all outline-none focus:ring-2 focus:ring-emerald-500/40 ${
          isDragging
            ? 'border-emerald-600 bg-emerald-50 scale-[1.005]'
            : file
            ? 'border-emerald-400 bg-emerald-50/30'
            : 'border-slate-300 hover:border-emerald-500 bg-slate-50/50'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="hidden"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = '';
            if (chosen) {
              handleIncomingRawFile(chosen);
            }
          }}
        />

        {file ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
            <div className="flex items-center gap-3.5 min-w-0">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Attached VAT bill preview"
                  className="w-16 h-16 object-cover rounded-lg border border-slate-200 bg-white shrink-0 shadow-xs"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center shrink-0">
                  <FileText className="w-8 h-8 text-emerald-600" />
                </div>
              )}

              <div className="min-w-0">
                <p className="font-bold text-xs text-slate-900 truncate max-w-md">{file.name}</p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  {(file.size / 1024).toFixed(1)} KB • Click or drop/paste anywhere to replace
                </p>
                {isScanning && (
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 mt-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Reading bill details & Nepali/English text with Gemini AI...</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                disabled={isScanning}
                onClick={onRescan}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isEdit ? 'Scan & Auto-Fill' : 'Re-scan with AI'}</span>
              </button>

              <button
                type="button"
                disabled={isScanning}
                onClick={onClearFile}
                title="Remove attached bill"
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="py-2">
            <div className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-2.5">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-xs font-bold text-slate-800">
              {isDragging
                ? 'Drop bill image or PDF here to read & auto-fill!'
                : 'Click to upload, drag & drop, or paste bill image (JPG, PNG, WEBP, PDF)'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {isEdit
                ? 'Attach a replacement VAT bill (up to 10MB). You can also scan it to update fields.'
                : 'Automatically reads English & Nepali bills (rotated or handwritten) and fills the purchase form.'}
            </p>
          </div>
        )}
      </div>

      {/* Scan Error */}
      {scanError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">AI Bill Scan Failed:</span> {scanError}
            <span className="block text-[11px] text-rose-700 mt-0.5">
              Your bill file is still attached—you can fill or adjust fields manually or click Re-scan.
            </span>
          </div>
        </div>
      )}

      {/* Successful Scan Summary */}
      {scanResult && !isScanning && (
        <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Bill Read Successfully — Form Auto-Filled</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-emerald-200 text-emerald-800">
                {docTypeLabel}
              </span>
              {scanResult.matched_vendor ? (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-emerald-200 text-emerald-800">
                  Vendor Matched: {scanResult.matched_vendor.company_name}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-800">
                  New Vendor Detected
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-slate-700 font-mono">
            {scanResult.extracted.subtotal_before_discount !== null && (
              <span>
                Printed Subtotal: <strong>{formatNpr(scanResult.extracted.subtotal_before_discount)}</strong>
              </span>
            )}
            {scanResult.extracted.discount_amount > 0 && (
              <span className="text-amber-700">
                Discount: <strong>- {formatNpr(scanResult.extracted.discount_amount)}</strong>
              </span>
            )}
            {scanResult.extracted.taxable_amount !== null && (
              <span>
                Printed Taxable: <strong>{formatNpr(scanResult.extracted.taxable_amount)}</strong>
              </span>
            )}
            {scanResult.extracted.vat_amount !== null && (
              <span>
                Printed VAT: <strong>{formatNpr(scanResult.extracted.vat_amount)}</strong>
              </span>
            )}
            {scanResult.extracted.total_amount !== null && (
              <span>
                Printed Total: <strong className="text-slate-900">{formatNpr(scanResult.extracted.total_amount)}</strong>
              </span>
            )}
          </div>

          {hasRoundingDiff && !isFinanciallyLocked && onUsePrintedTotal && printedTotal !== null && printedTotal !== undefined && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Calculated line-items total (<strong>{formatNpr(calculatedTotalAmount)}</strong>) differs slightly from the printed bill total (<strong>{formatNpr(printedTotal)}</strong>) due to seller rate rounding.
                </span>
              </div>
              <button
                type="button"
                onClick={onUsePrintedTotal}
                className="px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
              >
                Use Exact Printed Total
              </button>
            </div>
          )}

          {isExactPrintedApplied && !isFinanciallyLocked && (
            <div className="p-2.5 bg-emerald-100/70 border border-emerald-300 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-950">
              <span>
                Exact printed bill totals applied while keeping line items &amp; discount intact.
              </span>
              {onResetExactPrinted && (
                <button
                  type="button"
                  onClick={onResetExactPrinted}
                  className="px-2.5 py-1 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-900 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Revert to Formula
                </button>
              )}
            </div>
          )}

          {scanResult.warnings.length > 0 && (
            <div className="text-[11px] text-amber-800 space-y-0.5">
              {scanResult.warnings.map((w, i) => (
                <p key={i} className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {!file && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>No bill attached?</strong> Purchase status will automatically be set to{' '}
            <strong className="font-semibold">VAT BILL PENDING</strong>. You can upload the bill later from the detail view or pending queue!
          </span>
        </div>
      )}
    </div>
  );
}
