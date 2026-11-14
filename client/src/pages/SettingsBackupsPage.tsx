import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings,
  Database,
  FileCode,
  FileJson,
  Download,
  RefreshCw,
  Save,
  History,
  Search,
  Eye,
  X,
  HardDrive,
  Building,
} from 'lucide-react';
import { api, BackupItem, ActivityLog } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { adToBs } from '../utils/nepaliDate';

type ActiveTab = 'profile' | 'backups' | 'audit';

const ENTITY_TYPES = [
  { value: '', label: 'All Entity Types' },
  { value: 'PURCHASE', label: 'Purchases' },
  { value: 'VAT_BILL', label: 'VAT Bills' },
  { value: 'PAYMENT', label: 'Payments' },
  { value: 'VENDOR', label: 'Vendors' },
  { value: 'PRODUCT', label: 'Products' },
  { value: 'INVENTORY', label: 'Inventory' },
  { value: 'USER', label: 'Users' },
  { value: 'SETTINGS', label: 'Settings' },
  { value: 'BACKUP', label: 'Backups' },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function SettingsBackupsPage() {
  const { settings, refreshSettings } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');

  // =========================================================
  // TAB 1: Company Profile & Fiscal Rules
  // =========================================================
  const [companyName, setCompanyName] = useState<string>('');
  const [companyPan, setCompanyPan] = useState<string>('');
  const [companyVat, setCompanyVat] = useState<string>('');
  const [companyAddress, setCompanyAddress] = useState<string>('');
  const [defaultVatMode, setDefaultVatMode] = useState<'EXCLUSIVE' | 'INCLUSIVE'>('EXCLUSIVE');
  const [allowStaffOverride, setAllowStaffOverride] = useState<boolean>(true);
  const [allowNegativeStockAdminOnly, setAllowNegativeStockAdminOnly] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Sync settings when context loads or tab opens
  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name || '');
      setCompanyPan(settings.company_pan || '');
      setCompanyVat(settings.company_vat || '');
      setCompanyAddress(settings.company_address || '');
      setDefaultVatMode(settings.default_vat_mode || 'EXCLUSIVE');
      setAllowStaffOverride(settings.allow_staff_vat_mode_override ?? true);
      setAllowNegativeStockAdminOnly(settings.allow_negative_stock_admin_only ?? true);
    }
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error('Company name is required');
      return;
    }

    setSavingSettings(true);
    try {
      await api.settings.update({
        company_name: companyName.trim(),
        company_pan: companyPan.trim() || null,
        company_vat: companyVat.trim() || null,
        company_address: companyAddress.trim() || null,
        default_vat_mode: defaultVatMode,
        allow_staff_vat_mode_override: allowStaffOverride,
        allow_negative_stock_admin_only: allowNegativeStockAdminOnly,
      });

      await refreshSettings();
      toast.success('Company settings & fiscal rules saved successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // =========================================================
  // TAB 2: Database Backups
  // =========================================================
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loadingBackups, setLoadingBackups] = useState<boolean>(false);
  const [creatingBackup, setCreatingBackup] = useState<'sql' | 'json' | null>(null);
  const [confirmingBackupFormat, setConfirmingBackupFormat] = useState<'sql' | 'json' | null>(null);
  const [downloadingFilename, setDownloadingFilename] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const res = await api.backups.list();
      setBackups(res.backups || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to retrieve backups list');
    } finally {
      setLoadingBackups(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeTab === 'backups') {
      fetchBackups();
    }
  }, [activeTab, fetchBackups]);

  const handleTriggerBackup = async (format: 'sql' | 'json') => {
    setConfirmingBackupFormat(null);
    setCreatingBackup(format);
    try {
      const res = await api.backups.create({ format });
      toast.success(
        res.message || `Created ${format.toUpperCase()} backup: ${res.backup?.filename}`
      );
      await fetchBackups();
    } catch (err: any) {
      toast.error(err.message || `Failed to create ${format.toUpperCase()} backup`);
    } finally {
      setCreatingBackup(null);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    setDownloadingFilename(filename);
    try {
      const url = api.backups.getDownloadUrl(filename);
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Download failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success(`Downloaded backup ${filename}`);
    } catch (err: any) {
      toast.error(err.message || `Failed to download ${filename}`);
    } finally {
      setDownloadingFilename(null);
    }
  };

  // =========================================================
  // TAB 3: Activity Audit Log
  // =========================================================
  const [auditLogs, setAuditLogs] = useState<ActivityLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [hasMoreLogs, setHasMoreLogs] = useState<boolean>(true);
  const [inspectingLog, setInspectingLog] = useState<ActivityLog | null>(null);

  const fetchAuditLogs = useCallback(
    async (limit = 50, append = false) => {
      setLoadingAudit(true);
      try {
        const offset = append ? auditLogs.length : 0;
        const res = await api.auditLogs.list({
          entity_type: entityFilter || undefined,
          limit,
          offset,
        });

        const newLogs = res.logs || [];
        if (append) {
          setAuditLogs((prev) => [...prev, ...newLogs]);
        } else {
          setAuditLogs(newLogs);
        }
        setHasMoreLogs(newLogs.length === limit);
      } catch (err: any) {
        toast.error(err.message || 'Failed to fetch audit logs');
      } finally {
        setLoadingAudit(false);
      }
    },
    [auditLogs.length, entityFilter, toast]
  );

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs(50, false);
    }
  }, [activeTab, entityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter audit logs by client-side search query
  const filteredAuditLogs = useMemo(() => {
    if (!auditSearchQuery.trim()) return auditLogs;
    const q = auditSearchQuery.toLowerCase().trim();
    return auditLogs.filter((log) => {
      const summaryMatch = (log.summary || '').toLowerCase().includes(q);
      const actorMatch = (log.performed_by_name || '').toLowerCase().includes(q);
      const actionMatch = (log.action || '').toLowerCase().includes(q);
      const entityIdMatch = log.entity_id ? String(log.entity_id).includes(q) : false;
      return summaryMatch || actorMatch || actionMatch || entityIdMatch;
    });
  }, [auditLogs, auditSearchQuery]);

  // Format action badge color
  const renderActionBadge = (action: string) => {
    const act = (action || '').toUpperCase();
    let colorClass = 'bg-slate-100 text-slate-700 border-slate-200';

    if (act.includes('CREATE') || act === 'INSERT') {
      colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (act.includes('UPDATE') || act.includes('MODIFY') || act.includes('EDIT')) {
      colorClass = 'bg-sky-50 text-sky-700 border-sky-200';
    } else if (act.includes('DELETE') || act.includes('DEACTIVATE') || act.includes('VOID')) {
      colorClass = 'bg-rose-50 text-rose-700 border-rose-200';
    } else if (act.includes('APPROVE') || act.includes('VERIFY')) {
      colorClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
    } else if (act.includes('REJECT')) {
      colorClass = 'bg-amber-50 text-amber-800 border-amber-200';
    } else if (act.includes('PAYMENT')) {
      colorClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }

    return (
      <span
        className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold border tracking-wide uppercase ${colorClass}`}
      >
        {action}
      </span>
    );
  };

  // Format date helper for audit timestamps
  const formatAuditTimestamp = (iso: string): { bsDate: string; adDate: string; time: string } => {
    if (!iso) return { bsDate: '-', adDate: '-', time: '' };
    try {
      const d = new Date(iso);
      const adDateStr = d.toISOString().split('T')[0];
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      let bsDate = '';
      try {
        bsDate = `${adToBs(adDateStr)} BS`;
      } catch {
        // ignore
      }
      return {
        bsDate,
        adDate: adDateStr,
        time: timeStr,
      };
    } catch {
      return { bsDate: '-', adDate: iso, time: '' };
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 text-white flex items-center justify-center">
              <Settings className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                System Settings & Backups
              </h1>
              <p className="text-xs md:text-sm text-slate-500">
                Company profile, default VAT calculation rules, PostgreSQL backups, and activity audit logs
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Selector Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'profile'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Company Profile & VAT Rules</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('backups')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'backups'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Database Backups</span>
          {backups.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-mono bg-slate-100 text-slate-600">
              {backups.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Activity Audit Log</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: Company Profile & Fiscal Rules                     */}
      {/* ========================================================= */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Company Details Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Legal Company Details</h2>
              <p className="text-xs text-slate-500">
                Printed on formal purchase vouchers, VAT register sheets, and PDF export banners.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Company Legal Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Himalayan Trading Suppliers Pvt. Ltd."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Company PAN Number (Permanent Account Number)
                </label>
                <input
                  type="text"
                  maxLength={9}
                  placeholder="e.g. 601234567"
                  value={companyPan}
                  onChange={(e) => setCompanyPan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Company VAT Registration Number
                </label>
                <input
                  type="text"
                  maxLength={9}
                  placeholder="e.g. 601234567"
                  value={companyVat}
                  onChange={(e) => setCompanyVat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Registered Office Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. Putalisadak, Kathmandu, Nepal"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Fiscal & Tax Rules Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Nepal Fiscal & Inventory Rules</h2>
              <p className="text-xs text-slate-500">
                Configure default 13% VAT calculation logic and permissions for Staff members.
              </p>
            </div>

            {/* Default VAT Mode */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Default VAT Calculation Mode
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl">
                <label
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    defaultVatMode === 'EXCLUSIVE'
                      ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="vat_mode"
                    value="EXCLUSIVE"
                    checked={defaultVatMode === 'EXCLUSIVE'}
                    onChange={() => setDefaultVatMode('EXCLUSIVE')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900">
                      EXCLUSIVE Mode (Default)
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      13% VAT is calculated on top of the entered taxable subtotal amount.
                      (Subtotal + 13% = Total Payable)
                    </span>
                  </div>
                </label>

                <label
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    defaultVatMode === 'INCLUSIVE'
                      ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="vat_mode"
                    value="INCLUSIVE"
                    checked={defaultVatMode === 'INCLUSIVE'}
                    onChange={() => setDefaultVatMode('INCLUSIVE')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="block text-xs font-bold text-slate-900">
                      INCLUSIVE Mode
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Entered amount is treated as gross inclusive total; 13% input VAT is back-calculated via <code>Total × 13/113</code>.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Toggle 1: Allow Staff VAT Mode Override */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Allow Staff to Override VAT Calculation Mode
                </p>
                <p className="text-[11px] text-slate-500 max-w-xl mt-0.5">
                  When enabled, Staff can switch between Exclusive and Inclusive calculation per purchase voucher entry. If disabled, entries strictly follow company default.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={allowStaffOverride}
                  onChange={(e) => setAllowStaffOverride(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Toggle 2: Restrict Negative Stock Override to Admin Only */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Strict Negative Stock Protection (Admin-Only Override)
                </p>
                <p className="text-[11px] text-slate-500 max-w-xl mt-0.5">
                  Staff cannot issue or adjust stock below 0 units. Only Administrators with explicit justification remarks can bypass negative balance restrictions.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={allowNegativeStockAdminOnly}
                  onChange={(e) => setAllowNegativeStockAdminOnly(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>

          {/* Save Action */}
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs md:text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
            >
              {savingSettings ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Save Company Rules</span>
            </button>
          </div>
        </form>
      )}

      {/* ========================================================= */}
      {/* TAB 2: Database Backups                                  */}
      {/* ========================================================= */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          {/* Backup Action Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Create Database Backup</h2>
                <p className="text-xs text-slate-500 max-w-xl mt-0.5">
                  Export snapshot files of all relational tables including purchases, 13% VAT audit records, vendor ledgers, payments, and immutable activity logs.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmingBackupFormat('sql')}
                  disabled={creatingBackup !== null}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {creatingBackup === 'sql' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileCode className="w-3.5 h-3.5 text-sky-400" />
                  )}
                  <span>Create SQL Dump (.sql)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmingBackupFormat('json')}
                  disabled={creatingBackup !== null}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {creatingBackup === 'json' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileJson className="w-3.5 h-3.5 text-white" />
                  )}
                  <span>Create JSON Snapshot (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={fetchBackups}
                  disabled={loadingBackups}
                  className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-xs"
                  title="Refresh backups list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingBackups ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Backups Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Available Backup Archives ({backups.length})
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">
                Stored securely in <code>uploads/backups</code>
              </span>
            </div>

            {loadingBackups ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                <p className="text-xs font-medium">Scanning backup directory...</p>
              </div>
            ) : backups.length === 0 ? (
              <div className="py-16 px-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Database className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">No backups available yet</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Click one of the buttons above to create your first SQL or JSON snapshot.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider text-[11px]">
                      <th className="py-3 px-4">Backup Filename</th>
                      <th className="py-3 px-4 text-center">Format</th>
                      <th className="py-3 px-4 text-right">File Size</th>
                      <th className="py-3 px-4">Generated Timestamp</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backups.map((b) => {
                      const isDownloading = downloadingFilename === b.filename;
                      const isSql = b.format === 'sql';
                      const createdStr = b.createdAt
                        ? new Date(b.createdAt).toLocaleString([], {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '-';

                      return (
                        <tr key={b.filename} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              {isSql ? (
                                <FileCode className="w-4 h-4 text-sky-600 shrink-0" />
                              ) : (
                                <FileJson className="w-4 h-4 text-emerald-600 shrink-0" />
                              )}
                              <span>{b.filename}</span>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase tracking-wider ${
                                isSql
                                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {b.format.toUpperCase()}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 font-medium">
                            {formatBytes(b.size)}
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                            {createdStr}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDownloadBackup(b.filename)}
                              disabled={isDownloading}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors shadow-2xs"
                            >
                              {isDownloading ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Download className="w-3 h-3 text-slate-600" />
                              )}
                              <span>Download</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Backup Confirmation Modal */}
          {confirmingBackupFormat && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Generate {confirmingBackupFormat.toUpperCase()} Backup?
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    {confirmingBackupFormat === 'sql'
                      ? 'This will run pg_dump to produce a complete schema and data dump file (.sql) of the active database.'
                      : 'This will compile all core relational tables into a JSON document snapshot (.json).'}
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingBackupFormat(null)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTriggerBackup(confirmingBackupFormat)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-xs"
                  >
                    <span>Proceed with Backup</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: Activity Audit Log                                 */}
      {/* ========================================================= */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Filter and Search Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search audit trail by summary, actor, or action..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs md:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-emerald-500"
              />
              {auditSearchQuery && (
                <button
                  type="button"
                  onClick={() => setAuditSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Entity Filter & Refresh */}
            <div className="flex items-center gap-2">
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-emerald-500"
              >
                {ENTITY_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>
                    {et.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => fetchAuditLogs(50, false)}
                disabled={loadingAudit}
                className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-xs"
                title="Refresh audit logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingAudit && auditLogs.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                <p className="text-xs font-medium">Loading audit events...</p>
              </div>
            ) : filteredAuditLogs.length === 0 ? (
              <div className="py-16 px-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <History className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">No audit events found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  No activity log entries match the selected filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider text-[11px]">
                      <th className="py-3 px-4">Timestamp (BS / NPT)</th>
                      <th className="py-3 px-4">Performed By</th>
                      <th className="py-3 px-4">Entity</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Summary Description</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAuditLogs.map((log: ActivityLog) => {
                      const ts = formatAuditTimestamp(log.performed_at);
                      const hasValues = Boolean(log.old_values || log.new_values);

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Timestamp */}
                          <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">
                            <span className="font-bold text-slate-800">{ts.bsDate}</span>
                            <div className="text-[10px] text-slate-500">
                              {ts.adDate} {ts.time}
                            </div>
                          </td>

                          {/* Performed By */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-bold text-slate-900">
                              {log.performed_by_name || `User #${log.performed_by}`}
                            </span>
                            <div className="text-[10px] text-slate-500 font-mono">
                              ID: {log.performed_by}
                            </div>
                          </td>

                          {/* Entity Type + ID */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono text-xs font-semibold text-slate-800">
                              {log.entity_type}
                            </span>
                            {log.entity_id !== null && log.entity_id !== undefined && (
                              <span className="ml-1 text-[11px] text-slate-500 font-mono">
                                #{log.entity_id}
                              </span>
                            )}
                          </td>

                          {/* Action Badge */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {renderActionBadge(log.action)}
                          </td>

                          {/* Summary */}
                          <td className="py-3 px-4 text-slate-800 font-medium">
                            {log.summary}
                          </td>

                          {/* Inspect Modal Trigger */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {hasValues ? (
                              <button
                                type="button"
                                onClick={() => setInspectingLog(log)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors shadow-2xs"
                              >
                                <Eye className="w-3 h-3 text-slate-500" />
                                <span>Inspect</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-mono">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Load More Pagination */}
            {hasMoreLogs && filteredAuditLogs.length >= 50 && (
              <div className="p-4 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => fetchAuditLogs(50, true)}
                  disabled={loadingAudit}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {loadingAudit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Load More Audit Events</span>
                </button>
              </div>
            )}
          </div>

          {/* Audit Values Inspector Modal */}
          {inspectingLog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-2xs">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-mono font-bold text-xs">
                      #{inspectingLog.id}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {inspectingLog.entity_type} {inspectingLog.action}
                      </h3>
                      <p className="text-xs text-slate-500">{inspectingLog.summary}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectingLog(null)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Old Values */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                        <span>Old Values (Before)</span>
                      </h4>
                      <pre className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 overflow-x-auto max-h-72">
                        {inspectingLog.old_values
                          ? JSON.stringify(inspectingLog.old_values, null, 2)
                          : '// No previous values recorded'}
                      </pre>
                    </div>

                    {/* New Values */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                        <span>New Values (After)</span>
                      </h4>
                      <pre className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 overflow-x-auto max-h-72">
                        {inspectingLog.new_values
                          ? JSON.stringify(inspectingLog.new_values, null, 2)
                          : '// No new values recorded'}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setInspectingLog(null)}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default SettingsBackupsPage;
