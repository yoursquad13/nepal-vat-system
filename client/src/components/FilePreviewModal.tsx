import { useState, useEffect, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  ExternalLink,
  FileText,
  AlertCircle,
} from 'lucide-react';

export interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName?: string;
  title?: string;
  mimeType?: string;
}

export function FilePreviewModal({
  isOpen,
  onClose,
  fileUrl,
  fileName = 'document',
  title = 'Document Preview',
  mimeType = '',
}: FilePreviewModalProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [loadError, setLoadError] = useState<boolean>(false);

  const isPdf =
    mimeType.toLowerCase().includes('pdf') ||
    fileName.toLowerCase().endsWith('.pdf') ||
    fileUrl.toLowerCase().includes('.pdf');

  // Handle ESC key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      setZoom(100);
      setLoadError(false);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const zoomIn = () => setZoom((prev) => Math.min(prev + 25, 300));
  const zoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const zoomReset = () => setZoom(100);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 border-b border-slate-800 text-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="preview-modal-title"
                className="text-sm font-semibold truncate text-slate-100"
              >
                {title}
              </h3>
              <p className="text-xs text-slate-400 truncate">{fileName}</p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Zoom Controls for Images */}
            {!isPdf && (
              <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-lg p-0.5 text-xs text-slate-300">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= 50}
                  className="p-1.5 hover:text-white disabled:opacity-40 rounded hover:bg-slate-700 transition-colors"
                  title="Zoom Out (-25%)"
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-[11px] tabular-nums min-w-[42px] text-center">
                  {zoom}%
                </span>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoom >= 300}
                  className="p-1.5 hover:text-white disabled:opacity-40 rounded hover:bg-slate-700 transition-colors"
                  title="Zoom In (+25%)"
                  aria-label="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={zoomReset}
                  className="p-1.5 hover:text-white rounded hover:bg-slate-700 transition-colors ml-0.5"
                  title="Reset Zoom to 100%"
                  aria-label="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Open in new tab */}
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors inline-flex items-center gap-1.5 text-xs font-medium"
              title="Open raw file in new tab"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Open</span>
            </a>

            {/* Direct Download */}
            <a
              href={fileUrl}
              download={fileName}
              className="p-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg border border-emerald-500/30 transition-colors inline-flex items-center gap-1.5 text-xs font-medium"
              title="Download File"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </a>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors"
              aria-label="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="flex-1 bg-slate-950 overflow-auto flex items-center justify-center p-4 relative">
          {loadError ? (
            <div className="text-center p-8 max-w-sm">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-200 mb-1">
                Unable to load preview
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                The file could not be rendered directly in the viewer.
              </p>
              <a
                href={fileUrl}
                download={fileName}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download File Directly
              </a>
            </div>
          ) : isPdf ? (
            <iframe
              src={fileUrl}
              title={fileName}
              className="w-full h-full rounded-lg border-0 bg-white"
              onError={() => setLoadError(true)}
            />
          ) : (
            <div className="overflow-auto max-w-full max-h-full flex items-center justify-center p-2">
              <img
                src={fileUrl}
                alt={fileName}
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-w-full max-h-[75vh] object-contain rounded shadow-lg select-none"
                onError={() => setLoadError(true)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
