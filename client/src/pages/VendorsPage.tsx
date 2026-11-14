import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Search,
  PlusCircle,
  PhoneCall,
  MapPin,
  Landmark,
  Edit,
  Trash2,
  RefreshCw,
  X,
  UserCheck,
  Eye,
} from 'lucide-react';
import { api, Vendor } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';

export function VendorsPage() {
  const { isAdmin } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [showInactive, setShowInactive] = useState<boolean>(false);

  // Modal State (Add / Edit)
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 14 Vendor Form Fields
  const [companyName, setCompanyName] = useState<string>('');
  const [panNumber, setPanNumber] = useState<string>('');
  const [vatNumber, setVatNumber] = useState<string>('');
  const [contactPerson, setContactPerson] = useState<string>('');
  const [contactNumber, setContactNumber] = useState<string>('');
  const [altContactNumber, setAltContactNumber] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');
  const [bankBranch, setBankBranch] = useState<string>('');
  const [bankAccountHolder, setBankAccountHolder] = useState<string>('');
  const [bankAccountNumber, setBankAccountNumber] = useState<string>('');
  const [accountType, setAccountType] = useState<string>('Current');
  const [email, setEmail] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  // Delete / Deactivate Confirmation
  const [deletingVendor, setDeletingVendor] = useState<Vendor | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Vendors
  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.vendors.list({
        q: debouncedSearch.trim() || undefined,
        is_active: showInactive ? undefined : true,
      });
      setVendors(res.vendors || []);
    } catch (err: any) {
      toastError(err.message || 'Failed to load vendors', 'Error Loading Vendors');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, showInactive, toastError]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // Aggregate Counters
  const summary = useMemo(() => {
    let totalPurchases = 0;
    let totalSpend = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;

    vendors.forEach((v) => {
      totalPurchases += v.total_purchases_count || 0;
      totalSpend += v.total_amount || 0;
      totalPaid += v.total_paid_amount || 0;
      totalUnpaid += v.total_unpaid_amount || 0;
    });

    return {
      count: vendors.length,
      totalPurchases,
      totalSpend,
      totalPaid,
      totalUnpaid,
    };
  }, [vendors]);

  // Open Modal for Add
  const handleOpenAdd = () => {
    setEditingVendor(null);
    setCompanyName('');
    setPanNumber('');
    setVatNumber('');
    setContactPerson('');
    setContactNumber('');
    setAltContactNumber('');
    setAddress('');
    setBankName('');
    setBankBranch('');
    setBankAccountHolder('');
    setBankAccountNumber('');
    setAccountType('Current');
    setEmail('');
    setNotes('');
    setIsActive(true);
    setModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (v: Vendor) => {
    setEditingVendor(v);
    setCompanyName(v.company_name || '');
    setPanNumber(v.pan_number || '');
    setVatNumber(v.vat_number || '');
    setContactPerson(v.contact_person || '');
    setContactNumber(v.contact_number || '');
    setAltContactNumber(v.alt_contact_number || '');
    setAddress(v.address || '');
    setBankName(v.bank_name || '');
    setBankBranch(v.bank_branch || '');
    setBankAccountHolder(v.bank_account_holder || '');
    setBankAccountNumber(v.bank_account_number || '');
    setAccountType(v.account_type || 'Current');
    setEmail(v.email || '');
    setNotes(v.notes || '');
    setIsActive(v.is_active ?? true);
    setModalOpen(true);
  };

  // Submit Add / Edit
  const handleSubmitVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toastError('Company name is required', 'Validation Error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<Vendor> = {
        company_name: companyName.trim(),
        pan_number: panNumber.trim() || null,
        vat_number: vatNumber.trim() || null,
        contact_person: contactPerson.trim() || null,
        contact_number: contactNumber.trim() || null,
        alt_contact_number: altContactNumber.trim() || null,
        address: address.trim() || null,
        bank_name: bankName.trim() || null,
        bank_branch: bankBranch.trim() || null,
        bank_account_holder: bankAccountHolder.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
        account_type: accountType.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        is_active: isActive,
      };

      if (editingVendor) {
        await api.vendors.update(editingVendor.id, payload);
        toastSuccess(`Vendor ${payload.company_name} updated successfully.`, 'Vendor Saved');
      } else {
        await api.vendors.create(payload);
        toastSuccess(`Vendor ${payload.company_name} registered successfully.`, 'Vendor Added');
      }

      setModalOpen(false);
      fetchVendors();
    } catch (err: any) {
      toastError(err.message || 'Failed to save vendor details', 'Save Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Deactivate
  const handleDeleteConfirm = async () => {
    if (!deletingVendor) return;
    setIsDeleting(true);
    try {
      await api.vendors.delete(deletingVendor.id);
      toastInfo(`Vendor ${deletingVendor.company_name} deactivated.`, 'Vendor Deactivated');
      setDeletingVendor(null);
      fetchVendors();
    } catch (err: any) {
      toastError(err.message || 'Failed to deactivate vendor', 'Deactivation Failed');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Vendors & Suppliers Directory
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralized registry of authorized vendors, PAN/VAT credentials, bank disbursement accounts, and direct phone contact.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchVendors()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add New Vendor</span>
            </button>
          </div>
        </div>

        {/* Summary Metric Strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block font-medium">Registered Vendors</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {summary.count}
            </span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block font-medium">Cumulative Purchases</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {formatNPR(summary.totalSpend)}
            </span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block font-medium">Total Paid Out</span>
            <span className="text-base font-bold text-emerald-700 tabular-nums">
              {formatNPR(summary.totalPaid)}
            </span>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block font-medium">Outstanding Payables</span>
            <span className="text-base font-bold text-amber-700 tabular-nums">
              {formatNPR(summary.totalUnpaid)}
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by vendor name, PAN, contact person, or phone..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-emerald-600"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <span>Show Deactivated / Inactive Vendors</span>
            </label>
          </div>
        </div>
      </div>

      {/* Vendor Cards Grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
          <span>Loading vendors directory...</span>
        </div>
      ) : vendors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
          <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-700">No vendors found</h3>
          <p className="text-xs text-slate-400 mt-1">
            Try adjusting your search criteria or register a new vendor.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((v) => {
            const hasPhone = Boolean(v.contact_number);
            const unpaid = v.total_unpaid_amount ?? 0;

            return (
              <div
                key={v.id}
                className={`bg-white rounded-2xl border transition-shadow hover:shadow-md flex flex-col justify-between overflow-hidden ${
                  !v.is_active ? 'border-slate-200 bg-slate-50/60 opacity-80' : 'border-slate-200'
                }`}
              >
                {/* Card Top */}
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/vendors/${v.id}`}
                        className="font-bold text-sm text-slate-900 hover:text-emerald-700 hover:underline block truncate"
                        title={v.company_name}
                      >
                        {v.company_name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                        {v.pan_number && (
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                            PAN: {v.pan_number}
                          </span>
                        )}
                        {!v.is_active && (
                          <span className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Prominent CALL Button */}
                    {hasPhone ? (
                      <a
                        href={`tel:${v.contact_number}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-xs transition-colors shrink-0 cursor-pointer"
                        title={`Call ${v.contact_number}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>CALL</span>
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-300 italic shrink-0">No phone</span>
                    )}
                  </div>

                  {/* Contact Person & Address */}
                  <div className="text-xs text-slate-600 space-y-1 pt-1">
                    {v.contact_person && (
                      <div className="flex items-center gap-2 truncate">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{v.contact_person}</span>
                      </div>
                    )}
                    {v.contact_number && (
                      <div className="flex items-center gap-2 font-mono text-[11px] text-slate-700">
                        <PhoneCall className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{v.contact_number}</span>
                        {v.alt_contact_number && (
                          <span className="text-slate-400">/ {v.alt_contact_number}</span>
                        )}
                      </div>
                    )}
                    {v.address && (
                      <div className="flex items-center gap-2 truncate text-slate-500 text-[11px]">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{v.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Bank Account Details Card */}
                  {v.bank_name ? (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-700 space-y-0.5">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <Landmark className="w-3.5 h-3.5 text-slate-500" />
                        <span>{v.bank_name}</span>
                        {v.bank_branch && <span className="text-slate-400 font-normal">({v.bank_branch})</span>}
                      </div>
                      <div className="font-mono text-slate-900 font-bold pl-5">
                        {v.bank_account_number || 'A/C not entered'}
                      </div>
                      {v.bank_account_holder && (
                        <div className="text-slate-500 text-[10px] pl-5 truncate">
                          Holder: {v.bank_account_holder}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-2 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl text-[11px] text-slate-400 text-center italic">
                      No bank details registered
                    </div>
                  )}

                  {/* Payables Mini-Summary */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-400 text-[11px] block">Total Purchased</span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {formatNPR(v.total_amount || 0)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 text-[11px] block">Unpaid Balance</span>
                      <span
                        className={`font-bold tabular-nums ${
                          unpaid > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatNPR(unpaid)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                  <Link
                    to={`/vendors/${v.id}`}
                    className="font-bold text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Profile</span>
                  </Link>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(v)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      title="Edit Vendor"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && v.is_active && (
                      <button
                        type="button"
                        onClick={() => setDeletingVendor(v)}
                        className="p-1.5 rounded-lg border border-slate-200 text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors"
                        title="Deactivate Vendor"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================== */}
      {/* Add / Edit Vendor Modal with all 14 fields                      */}
      {/* ============================================================== */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {editingVendor ? `Edit Vendor: ${editingVendor.company_name}` : 'Register New Vendor'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitVendor} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Section 1: Business Identity */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Company Identity & Tax Registration
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Company / Supplier Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Acme Hardware & Industrial Suppliers"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        PAN Number (9 Digits)
                      </label>
                      <input
                        type="text"
                        value={panNumber}
                        onChange={(e) => setPanNumber(e.target.value)}
                        placeholder="e.g. 601234567"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        VAT Number (Optional if distinct)
                      </label>
                      <input
                        type="text"
                        value={vatNumber}
                        onChange={(e) => setVatNumber(e.target.value)}
                        placeholder="e.g. 601234567"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Contact Particulars */}
              <div className="pt-2 border-t border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Contact Details & Address
                </h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Contact Person
                      </label>
                      <input
                        type="text"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        placeholder="e.g. Ramesh Shrestha"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Primary Phone (CALL button)
                      </label>
                      <input
                        type="tel"
                        value={contactNumber}
                        onChange={(e) => setContactNumber(e.target.value)}
                        placeholder="e.g. 9851000000"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Alt. Phone
                      </label>
                      <input
                        type="tel"
                        value={altContactNumber}
                        onChange={(e) => setAltContactNumber(e.target.value)}
                        placeholder="e.g. 01-4400000"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. billing@acme.com"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Address / Location
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g. New Road, Kathmandu"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Bank Account for Disbursements */}
              <div className="pt-2 border-t border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Bank Account (For Payment Transfers)
                </h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="e.g. Nabil Bank Ltd."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Bank Branch
                      </label>
                      <input
                        type="text"
                        value={bankBranch}
                        onChange={(e) => setBankBranch(e.target.value)}
                        placeholder="e.g. New Road Branch"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Account Holder Name
                      </label>
                      <input
                        type="text"
                        value={bankAccountHolder}
                        onChange={(e) => setBankAccountHolder(e.target.value)}
                        placeholder="e.g. Acme Hardware Pvt. Ltd."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Bank Account Number
                      </label>
                      <input
                        type="text"
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                        placeholder="e.g. 01201017500012"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-emerald-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Account Type
                      </label>
                      <input
                        type="text"
                        value={accountType}
                        onChange={(e) => setAccountType(e.target.value)}
                        placeholder="e.g. Current / Savings"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Notes & Status */}
              <div className="pt-2 border-t border-slate-200">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Notes / Remarks
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Credit period 30 days; delivers on Tuesdays."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                    />
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                    />
                    <span className="font-semibold">Active Vendor (Available for new purchase entries)</span>
                  </label>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !companyName.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  {isSubmitting ? 'Saving...' : editingVendor ? 'Update Vendor' : 'Register Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Deactivate Vendor Confirmation Modal                           */}
      {/* ============================================================== */}
      {deletingVendor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeletingVendor(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <span>Deactivate Vendor</span>
              </h3>
              <button
                type="button"
                onClick={() => setDeletingVendor(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700">
                Are you sure you want to deactivate{' '}
                <strong className="text-slate-900">{deletingVendor.company_name}</strong>?
              </p>
              <p className="text-xs text-slate-500">
                This will hide the vendor from purchase entry dropdowns. Historical transactions and payment records will be safely preserved.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDeletingVendor(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  {isDeleting ? 'Deactivating...' : 'Confirm Deactivation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
