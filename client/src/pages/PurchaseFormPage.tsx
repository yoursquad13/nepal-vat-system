import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Receipt,
  Building2,
  Calendar,
  Clock,
  Plus,
  Trash2,
  CheckCircle2,
  Calculator,
  Lock,
  ArrowLeft,
  Search,
  X,
  PlusCircle,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  api,
  Vendor,
  Product,
  TaxType,
  VatCalcMode,
  AppSettings,
  BillExtractionResponse,
  ExtractedBillVendor,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { calculateVat, formatNpr } from '../utils/money';
import { getNowNpt } from '../utils/nepaliDate';
import { BsAdDatePicker, BsAdDateValue } from '../components/BsAdDatePicker';
import {
  BillScannerCard,
  extractFileFromClipboard,
  normalizeBillFileInput,
} from '../components/BillScannerCard';

interface FormLineItem {
  id?: number;
  product_id?: number | null;
  product_name: string;
  category?: string;
  sku?: string;
  quantity: number;
  unit_of_measurement: string;
  unit_price: number;
  line_subtotal: number;
  line_vat_amount: number;
  line_total: number;
}

export function PurchaseFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const purchaseId = id ? Number(id) : null;

  const navigate = useNavigate();
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const todayNpt = useMemo(() => getNowNpt(), []);

  // Form State
  const [loading, setLoading] = useState<boolean>(isEdit);
  const [saving, setSaving] = useState<boolean>(false);
  const [idempotencyKey] = useState<string>(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `idem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // App Settings
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Vendor selection & quick add modal
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | ''>('');
  const [vendorSearch, setVendorSearch] = useState<string>('');
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState<boolean>(false);
  const [quickAddVendorOpen, setQuickAddVendorOpen] = useState<boolean>(false);
  const [quickVendorForm, setQuickVendorForm] = useState({
    company_name: '',
    pan_number: '',
    vat_number: '',
    contact_person: '',
    contact_number: '',
    address: '',
  });

  // Catalog Products (for line item selector)
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);

  // Core Fields
  const [billNumber, setBillNumber] = useState<string>('');
  const [productSummary, setProductSummary] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Dates
  const [purchaseDateBs, setPurchaseDateBs] = useState<string>(todayNpt.dateBs);
  const [purchaseDateAd, setPurchaseDateAd] = useState<string>(todayNpt.dateAd);
  const [fiscalYear, setFiscalYear] = useState<string>(todayNpt.fiscalYear);

  // VAT Bill file, AI scanner state & Date
  const [vatBillFile, setVatBillFile] = useState<File | null>(null);
  const [vatBillDateBs, setVatBillDateBs] = useState<string>(todayNpt.dateBs);
  const [vatBillDateAd, setVatBillDateAd] = useState<string>(todayNpt.dateAd);
  const [isScanningBill, setIsScanningBill] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<BillExtractionResponse | null>(null);
  const [unmatchedVendor, setUnmatchedVendor] = useState<ExtractedBillVendor | null>(null);
  const [creatingExtractedVendor, setCreatingExtractedVendor] = useState<boolean>(false);
  const scanRequestIdRef = useRef<number>(0);

  // Tax & VAT mode
  const [taxType, setTaxType] = useState<TaxType>('VAT_13');
  const [vatCalcMode, setVatCalcMode] = useState<VatCalcMode>('EXCLUSIVE');

  // Entered amount (for quick entry without line items)
  const [enteredAmount, setEnteredAmount] = useState<string>('');

  // Line items
  const [useLineItems, setUseLineItems] = useState<boolean>(false);
  const [lineItems, setLineItems] = useState<FormLineItem[]>([]);

  // Financial Lock state (when editing approved/paid purchase)
  const [isFinanciallyLocked, setIsFinanciallyLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string>('');

  // Load Settings and Vendors
  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.settings.get().catch(() => ({ settings: null })),
      api.vendors.list({ is_active: true }).catch(() => ({ vendors: [] })),
      api.products.list({ is_active: true }).catch(() => ({ products: [] })),
    ]).then(([settingsRes, vendorsRes, productsRes]) => {
      if (!mounted) return;
      if (settingsRes?.settings) {
        setSettings(settingsRes.settings);
        if (!isEdit) {
          setVatCalcMode(settingsRes.settings.default_vat_mode || 'EXCLUSIVE');
        }
      }
      if (vendorsRes?.vendors) {
        setVendors(vendorsRes.vendors);
      }
      if (productsRes?.products) {
        setCatalogProducts(productsRes.products);
      }
    });

    return () => {
      mounted = false;
    };
  }, [isEdit]);

  // Load existing purchase if in edit mode
  useEffect(() => {
    if (!isEdit || !purchaseId) return;

    setLoading(true);
    api.purchases
      .get(purchaseId)
      .then((res) => {
        const pur = res.purchase;
        setSelectedVendorId(pur.vendor_id);
        setBillNumber(pur.bill_number || '');
        setProductSummary(pur.product_summary || '');
        setDescription(pur.description || '');
        setRemarks(pur.remarks || '');
        setPurchaseDateBs(pur.purchase_date_bs);
        setPurchaseDateAd(pur.purchase_date_ad);
        setFiscalYear(pur.fiscal_year);
        setTaxType(pur.tax_type);
        setVatCalcMode(pur.vat_calc_mode);

        if (pur.vat_bill_date_bs && pur.vat_bill_date_ad) {
          setVatBillDateBs(pur.vat_bill_date_bs);
          setVatBillDateAd(pur.vat_bill_date_ad);
        }

        const items = res.items || [];
        if (items.length > 0) {
          setUseLineItems(true);
          setLineItems(
            items.map((it) => ({
              id: it.id,
              product_id: it.product_id,
              product_name: it.product_name,
              category: it.category || '',
              sku: it.sku || '',
              quantity: it.quantity,
              unit_of_measurement: it.unit_of_measurement,
              unit_price: it.unit_price,
              line_subtotal: it.line_subtotal,
              line_vat_amount: it.line_vat_amount,
              line_total: it.line_total,
            }))
          );
        } else {
          setEnteredAmount(String(pur.entered_amount || pur.total_amount));
        }

        // Check financial lock
        const isApproved = pur.review_status === 'APPROVED';
        const hasPaid = pur.paid_amount > 0;
        const hasStock = items.some((it) => it.stock_received);

        if (isApproved || hasPaid || hasStock) {
          setIsFinanciallyLocked(true);
          const reasons = [];
          if (isApproved) reasons.push('Approved by Admin');
          if (hasPaid) reasons.push(`Payments recorded (${formatNpr(pur.paid_amount)})`);
          if (hasStock) reasons.push('Stock received into inventory');
          setLockReason(reasons.join(', '));
        }
      })
      .catch((err: any) => {
        toastError(err.message || 'Error fetching purchase record', 'Failed to load purchase');
        navigate('/purchases');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isEdit, purchaseId, toastError, navigate]);

  const computeLineItemTotals = useCallback(
    (item: FormLineItem, activeTaxType: TaxType, activeVatMode: VatCalcMode): FormLineItem => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const calc = calculateVat({
        enteredAmount: qty * price,
        taxType: activeTaxType,
        mode: activeVatMode,
      });
      return {
        ...item,
        line_subtotal: Number(calc.baseAmount),
        line_vat_amount: Number(calc.vatAmount),
        line_total: Number(calc.totalAmount),
      };
    },
    []
  );

  const handleTaxTypeChange = (nextTaxType: TaxType) => {
    setTaxType(nextTaxType);
    setLineItems((prev) => prev.map((it) => computeLineItemTotals(it, nextTaxType, vatCalcMode)));
  };

  const handleVatModeChange = (nextVatMode: VatCalcMode) => {
    setVatCalcMode(nextVatMode);
    setLineItems((prev) => prev.map((it) => computeLineItemTotals(it, taxType, nextVatMode)));
  };

  const applyExtractedBill = useCallback(
    (result: BillExtractionResponse) => {
      const { extracted, matched_vendor } = result;

      // 1. Vendor Selection / Pre-fill Quick Add Vendor
      if (!isFinanciallyLocked) {
        if (matched_vendor) {
          setSelectedVendorId(matched_vendor.id);
          setUnmatchedVendor(null);
        } else {
          setSelectedVendorId('');
          setUnmatchedVendor(extracted.vendor);
          const displayName = extracted.vendor.name_english || extracted.vendor.name || '';
          const panOrVat = extracted.vendor.pan_number || extracted.vendor.vat_number || '';
          setQuickVendorForm({
            company_name: displayName,
            pan_number: panOrVat,
            vat_number: extracted.vendor.vat_number || panOrVat,
            contact_person: '',
            contact_number: extracted.vendor.phone || '',
            address: extracted.vendor.address || '',
          });
        }
      }

      // 2. Invoice Reference, Summary & Notes
      if (extracted.bill_number) setBillNumber(extracted.bill_number);
      if (extracted.product_summary) setProductSummary(extracted.product_summary);
      if (extracted.description) setDescription(extracted.description);
      if (extracted.remarks) setRemarks(extracted.remarks);

      // 3. Dates (BS + AD + Fiscal Year)
      if (extracted.purchase_date_bs && extracted.purchase_date_ad) {
        setPurchaseDateBs(extracted.purchase_date_bs);
        setPurchaseDateAd(extracted.purchase_date_ad);
        if (extracted.fiscal_year) {
          setFiscalYear(extracted.fiscal_year);
        }
      }
      if (extracted.vat_bill_issue_date_bs && extracted.vat_bill_issue_date_ad) {
        setVatBillDateBs(extracted.vat_bill_issue_date_bs);
        setVatBillDateAd(extracted.vat_bill_issue_date_ad);
      } else if (extracted.purchase_date_bs && extracted.purchase_date_ad) {
        setVatBillDateBs(extracted.purchase_date_bs);
        setVatBillDateAd(extracted.purchase_date_ad);
      }

      // 4. Tax Mode, Amount & Line Items (only when financially editable)
      if (!isFinanciallyLocked) {
        const nextTaxType = extracted.tax_type;
        const staffVatLocked =
          user?.role === 'STAFF' && settings?.allow_staff_vat_mode_override === false;
        const nextVatMode = staffVatLocked ? vatCalcMode : extracted.vat_calc_mode;

        setTaxType(nextTaxType);
        if (!staffVatLocked) {
          setVatCalcMode(nextVatMode);
        } else if (nextTaxType === 'VAT_13' && extracted.vat_calc_mode !== vatCalcMode) {
          toastInfo(
            `Company policy locks staff VAT mode to ${vatCalcMode}, while the bill appears to be ${extracted.vat_calc_mode}. Please verify amounts.`,
            'VAT Mode Locked'
          );
        }

        if (extracted.entered_amount && extracted.entered_amount > 0) {
          setEnteredAmount(String(extracted.entered_amount));
        }

        if (extracted.line_items && extracted.line_items.length > 0) {
          const mappedRows: FormLineItem[] = extracted.line_items.map((item) => {
            const lowerItemName = item.name.toLowerCase();
            const matchedProd = catalogProducts.find(
              (p) =>
                p.name.toLowerCase() === lowerItemName ||
                (p.sku && lowerItemName.includes(p.sku.toLowerCase()))
            );
            return computeLineItemTotals(
              {
                product_id: matchedProd ? matchedProd.id : null,
                product_name: item.name,
                category: matchedProd?.category || '',
                sku: matchedProd?.sku || '',
                quantity: item.quantity > 0 ? item.quantity : 1,
                unit_of_measurement: item.unit || matchedProd?.unit_of_measurement || 'pcs',
                unit_price: item.unit_price >= 0 ? item.unit_price : 0,
                line_subtotal: 0,
                line_vat_amount: 0,
                line_total: 0,
              },
              nextTaxType,
              nextVatMode
            );
          });
          setLineItems(mappedRows);
          setUseLineItems(true);
        } else if (extracted.entered_amount && extracted.entered_amount > 0) {
          setUseLineItems(false);
        }
      }
    },
    [
      isFinanciallyLocked,
      user?.role,
      settings?.allow_staff_vat_mode_override,
      vatCalcMode,
      catalogProducts,
      computeLineItemTotals,
      toastInfo,
    ]
  );

  const runBillScan = useCallback(
    async (targetFile: File) => {
      const reqId = ++scanRequestIdRef.current;
      setIsScanningBill(true);
      setScanError(null);
      try {
        const result = await api.purchases.extractBill(targetFile);
        if (scanRequestIdRef.current !== reqId) return;
        setScanResult(result);
        applyExtractedBill(result);
        toastSuccess(
          result.matched_vendor
            ? `Auto-filled bill details & matched vendor "${result.matched_vendor.company_name}".`
            : 'Bill details extracted and auto-filled. Verify vendor selection before saving.',
          'Bill Read Successfully'
        );
      } catch (err: any) {
        if (scanRequestIdRef.current !== reqId) return;
        const msg = err?.message || 'Unable to extract details from this bill.';
        setScanError(msg);
        toastError(msg, 'AI Bill Scan Failed');
      } finally {
        if (scanRequestIdRef.current === reqId) {
          setIsScanningBill(false);
        }
      }
    },
    [applyExtractedBill, toastSuccess, toastError]
  );

  const handleBillFileSelected = useCallback(
    (selectedFile: File) => {
      setVatBillFile(selectedFile);
      setScanError(null);
      setScanResult(null);
      if (!isEdit) {
        void runBillScan(selectedFile);
      }
    },
    [isEdit, runBillScan]
  );

  const handleClearBillFile = () => {
    scanRequestIdRef.current += 1;
    setIsScanningBill(false);
    setVatBillFile(null);
    setScanError(null);
    setScanResult(null);
    setUnmatchedVendor(null);
  };

  // Global paste listener so Ctrl+V / Cmd+V anywhere on this page attaches and reads bill images
  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      const pasted = extractFileFromClipboard(e.clipboardData);
      if (!pasted) return;
      const { file: normalized, error } = normalizeBillFileInput(pasted);
      if (error || !normalized) {
        toastError(error || 'Unsupported pasted file type.', 'Paste Error');
        return;
      }
      e.preventDefault();
      handleBillFileSelected(normalized);
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [handleBillFileSelected, toastError]);

  const handleCreateExtractedVendorDirect = async () => {
    if (!unmatchedVendor) return;
    const companyName = (unmatchedVendor.name_english || unmatchedVendor.name || '').trim();
    if (!companyName) return;

    const panOrVat = unmatchedVendor.pan_number || unmatchedVendor.vat_number || null;
    const extraNotes =
      unmatchedVendor.name_english && unmatchedVendor.name !== unmatchedVendor.name_english
        ? `Bill Name: ${unmatchedVendor.name}`
        : null;

    setCreatingExtractedVendor(true);
    try {
      const res = await api.vendors.create({
        company_name: companyName,
        pan_number: panOrVat,
        vat_number: unmatchedVendor.vat_number || panOrVat,
        contact_number: unmatchedVendor.phone || null,
        address: unmatchedVendor.address || null,
        notes: extraNotes,
      });
      const created = res.vendor;
      setVendors((prev) => [created, ...prev]);
      setSelectedVendorId(created.id);
      setUnmatchedVendor(null);
      toastSuccess(`${created.company_name} created and selected!`, 'Vendor Added');
    } catch (err: any) {
      toastError(err?.message || 'Could not create vendor automatically.', 'Vendor Creation Failed');
    } finally {
      setCreatingExtractedVendor(false);
    }
  };

  // Recalculate line item row VAT amounts
  const updateLineItem = (index: number, field: keyof FormLineItem, value: any) => {
    setLineItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'quantity' || field === 'unit_price') {
        updated[index] = computeLineItemTotals(item, taxType, vatCalcMode);
      } else {
        updated[index] = item;
      }

      return updated;
    });
  };

  const addLineItemRow = () => {
    setLineItems((prev) => [
      ...prev,
      {
        product_id: null,
        product_name: '',
        category: '',
        sku: '',
        quantity: 1,
        unit_of_measurement: 'pcs',
        unit_price: 0,
        line_subtotal: 0,
        line_vat_amount: 0,
        line_total: 0,
      },
    ]);
  };

  const removeLineItemRow = (index: number) => {
    setLineItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSelectCatalogProduct = (index: number, productId: number) => {
    const prod = catalogProducts.find((p) => p.id === productId);
    if (!prod) return;

    setLineItems((prev) => {
      const updated = [...prev];
      const existing = updated[index];
      const unitPrice = prod.latest_purchase_price || prod.avg_purchase_price || existing.unit_price || 0;

      updated[index] = computeLineItemTotals(
        {
          ...existing,
          product_id: prod.id,
          product_name: prod.name,
          category: prod.category || '',
          sku: prod.sku || '',
          unit_of_measurement: prod.unit_of_measurement || 'pcs',
          unit_price: unitPrice,
        },
        taxType,
        vatCalcMode
      );
      return updated;
    });
  };

  // Live Summary Calculation
  const calculationSummary = useMemo(() => {
    if (useLineItems && lineItems.length > 0) {
      const totalBase = lineItems.reduce((acc, it) => acc + (it.line_subtotal || 0), 0);
      const totalVat = lineItems.reduce((acc, it) => acc + (it.line_vat_amount || 0), 0);
      const grandTotal = lineItems.reduce((acc, it) => acc + (it.line_total || 0), 0);

      return {
        enteredAmount: vatCalcMode === 'INCLUSIVE' ? grandTotal : totalBase,
        baseAmount: totalBase,
        vatAmount: totalVat,
        totalAmount: grandTotal,
      };
    } else {
      const num = Number(enteredAmount) || 0;
      const calc = calculateVat({
        enteredAmount: num,
        taxType,
        mode: vatCalcMode,
      });

      return {
        enteredAmount: num,
        baseAmount: Number(calc.baseAmount),
        vatAmount: Number(calc.vatAmount),
        totalAmount: Number(calc.totalAmount),
      };
    }
  }, [useLineItems, lineItems, enteredAmount, taxType, vatCalcMode]);

  // Selected Vendor object
  const currentVendor = useMemo(() => {
    return vendors.find((v) => v.id === selectedVendorId) || null;
  }, [vendors, selectedVendorId]);

  // Filtered vendors for searchable dropdown
  const filteredVendors = useMemo(() => {
    if (!vendorSearch.trim()) return vendors;
    const q = vendorSearch.toLowerCase();
    return vendors.filter(
      (v) =>
        v.company_name.toLowerCase().includes(q) ||
        (v.pan_number && v.pan_number.includes(q)) ||
        (v.contact_person && v.contact_person.toLowerCase().includes(q))
    );
  }, [vendors, vendorSearch]);

  // Quick Add Vendor Submission
  const handleQuickAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickVendorForm.company_name.trim()) {
      toastInfo('Please enter vendor name.', 'Company Name Required');
      return;
    }

    try {
      const res = await api.vendors.create(quickVendorForm);
      const newVendor = res.vendor;
      setVendors((prev) => [newVendor, ...prev]);
      setSelectedVendorId(newVendor.id);
      setUnmatchedVendor(null);
      setQuickAddVendorOpen(false);
      setQuickVendorForm({
        company_name: '',
        pan_number: '',
        vat_number: '',
        contact_person: '',
        contact_number: '',
        address: '',
      });
      toastSuccess(`${newVendor.company_name} was created and selected!`, 'Vendor Created');
    } catch (err: any) {
      toastError(err.message || 'Unable to create vendor record.', 'Vendor Creation Failed');
    }
  };

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedVendorId) {
      toastInfo('Please select a vendor supplier.', 'Vendor Required');
      return;
    }

    if (!productSummary.trim()) {
      toastInfo('Please enter a product description or title.', 'Product Summary Required');
      return;
    }

    if (!useLineItems && (!enteredAmount || Number(enteredAmount) <= 0)) {
      toastInfo('Please enter a valid purchase amount.', 'Amount Required');
      return;
    }

    if (useLineItems && lineItems.length === 0) {
      toastInfo('Please add at least one line item or switch to quick entry.', 'Line Items Required');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && purchaseId) {
        // Edit mode (PATCH)
        const patchData: Record<string, any> = {
          bill_number: billNumber.trim() || null,
          product_summary: productSummary.trim(),
          description: description.trim() || null,
          remarks: remarks.trim() || null,
          purchase_date_ad: purchaseDateAd,
          purchase_date_bs: purchaseDateBs,
          fiscal_year: fiscalYear,
          vat_bill_date_ad: vatBillDateAd || null,
          vat_bill_date_bs: vatBillDateBs || null,
        };

        if (!isFinanciallyLocked) {
          patchData.vendor_id = selectedVendorId;
          patchData.tax_type = taxType;
          patchData.vat_calc_mode = vatCalcMode;

          if (useLineItems) {
            patchData.items = lineItems.map((it) => ({
              product_id: it.product_id || null,
              product_name: it.product_name,
              category: it.category || null,
              sku: it.sku || null,
              quantity: it.quantity,
              unit_of_measurement: it.unit_of_measurement,
              unit_price: it.unit_price,
            }));
          } else {
            patchData.entered_amount = Number(enteredAmount);
          }
        }

        await api.purchases.update(purchaseId, patchData);

        // Upload VAT bill file if new file selected during edit
        if (vatBillFile) {
          const fd = new FormData();
          fd.append('file', vatBillFile);
          if (vatBillDateAd) {
            fd.append('bill_date_ad', vatBillDateAd);
            fd.append('vat_bill_date_ad', vatBillDateAd);
          }
          if (vatBillDateBs) {
            fd.append('bill_date_bs', vatBillDateBs);
            fd.append('vat_bill_date_bs', vatBillDateBs);
          }
          if (billNumber) {
            fd.append('vat_bill_number', billNumber);
            fd.append('bill_number', billNumber);
          }
          await api.purchases.uploadVatBill(purchaseId, fd);
        }

        toastSuccess('Purchase transaction was updated successfully.', 'Purchase Updated');
        navigate(`/purchases/${purchaseId}`);
      } else {
        // Create mode (POST)
        const formData = new FormData();
        formData.append('vendor_id', String(selectedVendorId));
        formData.append('product_summary', productSummary.trim());
        if (billNumber.trim()) formData.append('bill_number', billNumber.trim());
        if (description.trim()) formData.append('description', description.trim());
        if (remarks.trim()) formData.append('remarks', remarks.trim());
        formData.append('purchase_date_ad', purchaseDateAd);
        formData.append('purchase_date_bs', purchaseDateBs);
        formData.append('fiscal_year', fiscalYear);
        formData.append('tax_type', taxType);
        formData.append('vat_calc_mode', vatCalcMode);
        formData.append('idempotency_key', idempotencyKey);

        if (useLineItems) {
          const itemsPayload = lineItems.map((it) => ({
            product_id: it.product_id || null,
            product_name: it.product_name,
            category: it.category || null,
            sku: it.sku || null,
            quantity: it.quantity,
            unit_of_measurement: it.unit_of_measurement,
            unit_price: it.unit_price,
          }));
          formData.append('items', JSON.stringify(itemsPayload));
        } else {
          formData.append('entered_amount', String(enteredAmount));
        }

        if (vatBillFile) {
          formData.append('file', vatBillFile);
          if (vatBillDateAd) formData.append('vat_bill_date_ad', vatBillDateAd);
          if (vatBillDateBs) formData.append('vat_bill_date_bs', vatBillDateBs);
        }

        const res = await api.purchases.create(formData);
        toastSuccess(`Purchase ${res.purchase.purchase_code} created successfully!`, 'Purchase Recorded');
        navigate(`/purchases/${res.purchase.id}`);
      }
    } catch (err: any) {
      toastError(err.message || 'An error occurred while saving the purchase entry.', 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500">
        <Receipt className="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-3" />
        <p className="text-sm font-semibold">Loading purchase details...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/purchases"
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors shadow-xs"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              {isEdit ? 'Edit Purchase Entry' : 'Record New Purchase Entry'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter supplier bill particulars with automatic 13% VAT calculations and optional line items.
            </p>
          </div>
        </div>
      </div>

      {/* Immutable Server Stamped Time Banner */}
      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900 shadow-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            Server automatically stamps immutable <strong>Nepal Standard Time (NPT: UTC+5:45)</strong> upon entry.
          </span>
        </div>
        <span className="font-mono text-emerald-800 font-semibold hidden sm:inline-block">
          FY {fiscalYear}
        </span>
      </div>

      {/* Financial Lock Guard Notice (if editing approved/paid purchase) */}
      {isFinanciallyLocked && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3 text-amber-900 text-xs shadow-xs">
          <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Core Financial Fields Locked</h4>
            <p className="mt-0.5">
              This purchase is locked against financial changes because it is: <strong>{lockReason}</strong>.
            </p>
            <p className="mt-1 text-amber-800">
              Vendor, Tax Mode, and Amounts cannot be edited to prevent ledger discrepancies. You may still update bill numbers, remarks, VAT bill attachments, and non-stocked items.
            </p>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Upload / Drag-Drop / Paste VAT Bill & Gemini Auto-Fill */}
        <BillScannerCard
          file={vatBillFile}
          isScanning={isScanningBill}
          scanError={scanError}
          scanResult={scanResult}
          isEdit={isEdit}
          calculatedTotalAmount={calculationSummary.totalAmount}
          useLineItems={useLineItems}
          isFinanciallyLocked={isFinanciallyLocked}
          onFileSelected={handleBillFileSelected}
          onClearFile={handleClearBillFile}
          onRescan={() => vatBillFile && void runBillScan(vatBillFile)}
          onUsePrintedTotal={
            scanResult?.extracted?.entered_amount
              ? () => {
                  setUseLineItems(false);
                  setEnteredAmount(String(scanResult.extracted.entered_amount));
                }
              : undefined
          }
          onInvalidFile={(msg) => toastError(msg, 'Invalid Bill File')}
        />

        {/* Section 2: Vendor & Bill Details */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Building2 className="w-4 h-4 text-emerald-600" />
              <span>Supplier & Invoice Reference</span>
            </div>
            {!isFinanciallyLocked && (
              <button
                type="button"
                onClick={() => setQuickAddVendorOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Quick Add Vendor</span>
              </button>
            )}
          </div>

          {unmatchedVendor && !selectedVendorId && !isFinanciallyLocked && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5 text-amber-950">
                <div className="flex items-center gap-1.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    New Supplier Detected:{' '}
                    {unmatchedVendor.name_english
                      ? `${unmatchedVendor.name_english}${
                          unmatchedVendor.name !== unmatchedVendor.name_english
                            ? ` (${unmatchedVendor.name})`
                            : ''
                        }`
                      : unmatchedVendor.name}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 font-mono">
                  {[
                    unmatchedVendor.pan_number || unmatchedVendor.vat_number
                      ? `PAN/VAT: ${unmatchedVendor.pan_number || unmatchedVendor.vat_number}`
                      : null,
                    unmatchedVendor.address ? `Address: ${unmatchedVendor.address}` : null,
                    unmatchedVendor.phone ? `Phone: ${unmatchedVendor.phone}` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ') || 'Not matched to any saved vendor'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setQuickAddVendorOpen(true)}
                  className="px-2.5 py-1.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Review & Edit
                </button>
                <button
                  type="button"
                  disabled={creatingExtractedVendor}
                  onClick={handleCreateExtractedVendorDirect}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                >
                  {creatingExtractedVendor ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <PlusCircle className="w-3.5 h-3.5" />
                  )}
                  <span>Create & Select Vendor</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vendor Selector Dropdown */}
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vendor / Supplier <span className="text-rose-500">*</span>
              </label>

              {isFinanciallyLocked ? (
                <div className="p-2.5 bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800">
                  {currentVendor?.company_name || 'Selected Vendor'}
                </div>
              ) : (
                <div className="relative">
                  <div
                    onClick={() => setVendorDropdownOpen(!vendorDropdownOpen)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 flex items-center justify-between cursor-pointer hover:bg-white"
                  >
                    <span className={currentVendor ? 'font-semibold text-slate-900' : 'text-slate-400'}>
                      {currentVendor ? currentVendor.company_name : 'Select or search vendor...'}
                    </span>
                    <Building2 className="w-4 h-4 text-slate-400" />
                  </div>

                  {vendorDropdownOpen && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-hidden flex flex-col animate-slide-up">
                      <div className="p-2 border-b border-slate-100 bg-slate-50">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Type company name or PAN..."
                            value={vendorSearch}
                            onChange={(e) => setVendorSearch(e.target.value)}
                            className="w-full pl-8 pr-2 py-1 text-xs bg-white border border-slate-300 rounded-md focus:outline-emerald-600"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
                        {filteredVendors.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No matching vendors found.
                          </div>
                        ) : (
                          filteredVendors.map((v) => (
                            <div
                              key={v.id}
                              onClick={() => {
                                setSelectedVendorId(v.id);
                                setVendorDropdownOpen(false);
                              }}
                              className={`p-2.5 text-xs cursor-pointer hover:bg-slate-50 flex items-center justify-between ${
                                selectedVendorId === v.id ? 'bg-emerald-50 text-emerald-900 font-semibold' : 'text-slate-700'
                              }`}
                            >
                              <div>
                                <p className="font-semibold">{v.company_name}</p>
                                <p className="text-[11px] text-slate-500 font-mono">
                                  PAN: {v.pan_number || 'N/A'} {v.contact_person && `• ${v.contact_person}`}
                                </p>
                              </div>
                              {selectedVendorId === v.id && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentVendor && (
                <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex flex-wrap gap-x-4 gap-y-1 font-mono">
                  <span>PAN: <strong className="text-slate-800">{currentVendor.pan_number || 'None'}</strong></span>
                  <span>Phone: <strong className="text-slate-800">{currentVendor.contact_number || 'None'}</strong></span>
                  {currentVendor.bank_name && (
                    <span>Bank: <strong className="text-slate-800">{currentVendor.bank_name}</strong></span>
                  )}
                </div>
              )}
            </div>

            {/* Bill / Invoice Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vendor Bill / Invoice Number
              </label>
              <input
                type="text"
                placeholder="e.g. INV-9042"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:bg-white focus:outline-emerald-600"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Printed bill number from the supplier's physical invoice.
              </p>
            </div>
          </div>

          {/* Product Summary Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Purchase Summary / Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Office Hardware, HP Toners & Network Cables"
              value={productSummary}
              onChange={(e) => setProductSummary(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-emerald-600"
            />
          </div>

          {/* Description & Remarks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Purchase Description / Notes
              </label>
              <textarea
                rows={2}
                placeholder="Particulars, department requirements, delivery notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Internal Remarks / Admin Notes
              </label>
              <textarea
                rows={2}
                placeholder="Payment terms, approval notes, order reference..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-emerald-600"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Purchase & VAT Bill Dates */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span>Dates & Bikram Sambat Calendar</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BsAdDatePicker
              label="Purchase Date (Bikram Sambat)"
              valueBs={purchaseDateBs}
              valueAd={purchaseDateAd}
              required
              onChange={(val: BsAdDateValue) => {
                setPurchaseDateBs(val.bs);
                setPurchaseDateAd(val.ad);
                setFiscalYear(val.fiscalYear);
              }}
              helperText="Date stated on the invoice."
            />

            <BsAdDatePicker
              label="VAT Bill Issue Date (BS / AD)"
              valueBs={vatBillDateBs}
              valueAd={vatBillDateAd}
              onChange={(val: BsAdDateValue) => {
                setVatBillDateBs(val.bs);
                setVatBillDateAd(val.ad);
              }}
              helperText="If bill was issued on a different date."
            />
          </div>
        </div>

        {/* Section 3: Tax Calculation Method & Mode */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Calculator className="w-4 h-4 text-emerald-600" />
              <span>Tax Calculation Mode & 13% Formula</span>
            </div>
            {settings && (
              <span className="text-[11px] text-slate-500 font-mono">
                System Default: <strong>{settings.default_vat_mode}</strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tax Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tax Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isFinanciallyLocked}
                  onClick={() => handleTaxTypeChange('VAT_13')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                    taxType === 'VAT_13'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Standard VAT (13%)
                </button>
                <button
                  type="button"
                  disabled={isFinanciallyLocked}
                  onClick={() => handleTaxTypeChange('NON_VAT')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                    taxType === 'NON_VAT'
                      ? 'bg-slate-800 border-slate-800 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Non-VAT (0% Exempt)
                </button>
              </div>
            </div>

            {/* VAT Mode Selector (if VAT_13) */}
            {taxType === 'VAT_13' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  VAT 13% Calculation Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isFinanciallyLocked || (user?.role === 'STAFF' && settings?.allow_staff_vat_mode_override === false)}
                    onClick={() => handleVatModeChange('EXCLUSIVE')}
                    className={`p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      vatCalcMode === 'EXCLUSIVE'
                        ? 'bg-teal-50 border-teal-500 text-teal-900 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div>VAT Exclusive</div>
                    <div className="text-[10px] text-teal-700 font-normal">Amount × 13%</div>
                  </button>
                  <button
                    type="button"
                    disabled={isFinanciallyLocked || (user?.role === 'STAFF' && settings?.allow_staff_vat_mode_override === false)}
                    onClick={() => handleVatModeChange('INCLUSIVE')}
                    className={`p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      vatCalcMode === 'INCLUSIVE'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div>VAT Inclusive</div>
                    <div className="text-[10px] text-emerald-700 font-normal">Total × 13 / 113</div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Entry vs Multi Line-Items Toggle */}
          <div className="pt-2">
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <span className="text-xs font-bold text-slate-800">
                  {useLineItems ? 'Multi-Product Line Items Active' : 'Quick Single-Amount Entry Active'}
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {useLineItems
                    ? 'Break down this invoice by individual catalog products, quantities, and line totals.'
                    : 'Quickly record total amount without itemizing each product.'}
                </p>
              </div>

              {!isFinanciallyLocked && (
                <button
                  type="button"
                  onClick={() => {
                    if (!useLineItems && lineItems.length === 0) {
                      addLineItemRow();
                    }
                    setUseLineItems(!useLineItems);
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  {useLineItems ? 'Switch to Quick Single Amount' : 'Itemize with Line Items'}
                </button>
              )}
            </div>
          </div>

          {/* Single Amount Input (when line items not used) */}
          {!useLineItems && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {taxType === 'NON_VAT'
                  ? 'Total Purchase Amount (NPR)'
                  : vatCalcMode === 'EXCLUSIVE'
                  ? 'Taxable Purchase Amount (Exclusive of 13% VAT)'
                  : 'Invoice Gross Amount (Inclusive of 13% VAT)'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                  Rs.
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  disabled={isFinanciallyLocked}
                  value={enteredAmount}
                  onChange={(e) => setEnteredAmount(e.target.value)}
                  required={!useLineItems}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold font-mono text-slate-900 focus:bg-white focus:outline-emerald-600 tabular-nums"
                />
              </div>
            </div>
          )}

          {/* Multi Line-Item Builder Table */}
          {useLineItems && (
            <div className="space-y-3 pt-2">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 min-w-[200px]">Product / Item Name</th>
                      <th className="px-3 py-2 w-24">Qty</th>
                      <th className="px-3 py-2 w-24">Unit</th>
                      <th className="px-3 py-2 text-right min-w-[110px]">
                        {vatCalcMode === 'EXCLUSIVE' ? 'Unit Price (Excl)' : 'Unit Price (Incl)'}
                      </th>
                      <th className="px-3 py-2 text-right">Line Subtotal</th>
                      <th className="px-3 py-2 text-right">13% VAT</th>
                      <th className="px-3 py-2 text-right font-bold">Line Total</th>
                      {!isFinanciallyLocked && <th className="px-2 py-2 w-10 text-center"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        {/* Product Picker */}
                        <td className="p-2 space-y-1">
                          <input
                            type="text"
                            placeholder="Enter item name..."
                            value={item.product_name}
                            onChange={(e) => updateLineItem(idx, 'product_name', e.target.value)}
                            required
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-900"
                          />
                          {catalogProducts.length > 0 && (
                            <select
                              value={item.product_id || ''}
                              onChange={(e) => handleSelectCatalogProduct(idx, Number(e.target.value))}
                              className="w-full px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600"
                            >
                              <option value="">Or link from catalog product...</option>
                              {catalogProducts.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.sku})
                                </option>
                              ))}
                            </select>
                          )}
                        </td>

                        {/* Qty */}
                        <td className="p-2">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                            required
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-center"
                          />
                        </td>

                        {/* Unit */}
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.unit_of_measurement}
                            onChange={(e) => updateLineItem(idx, 'unit_of_measurement', e.target.value)}
                            placeholder="pcs"
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs text-center"
                          />
                        </td>

                        {/* Unit Price */}
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(idx, 'unit_price', e.target.value)}
                            required
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-mono text-right"
                          />
                        </td>

                        {/* Computed Line Subtotal */}
                        <td className="p-2 text-right font-mono tabular-nums text-slate-700">
                          {formatNpr(item.line_subtotal)}
                        </td>

                        {/* Computed Line VAT */}
                        <td className="p-2 text-right font-mono tabular-nums text-teal-700 font-semibold">
                          {taxType === 'NON_VAT' ? 'Rs. 0.00' : formatNpr(item.line_vat_amount)}
                        </td>

                        {/* Computed Line Total */}
                        <td className="p-2 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatNpr(item.line_total)}
                        </td>

                        {/* Remove Row */}
                        {!isFinanciallyLocked && (
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeLineItemRow(idx)}
                              disabled={lineItems.length <= 1}
                              className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!isFinanciallyLocked && (
                <button
                  type="button"
                  onClick={addLineItemRow}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Another Item Row</span>
                </button>
              )}
            </div>
          )}

          {/* Live VAT Calculation Breakdown Card */}
          <div className="bg-slate-900 text-white p-4 rounded-xl shadow-md space-y-3 font-mono">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
              <span className="font-semibold uppercase tracking-wider text-emerald-400">
                Formula & Ledger Summary
              </span>
              <span>
                {taxType === 'NON_VAT'
                  ? 'NON-VAT 0%'
                  : vatCalcMode === 'EXCLUSIVE'
                  ? 'Base + (Base × 13%)'
                  : 'Total × 13 / 113'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <span className="text-[11px] text-slate-400 uppercase">Taxable Purchase Base</span>
                <p className="text-base sm:text-lg font-bold text-slate-100 tabular-nums mt-0.5">
                  {formatNpr(calculationSummary.baseAmount)}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-teal-400 uppercase">
                  {taxType === 'NON_VAT' ? 'VAT Exempt (0%)' : '13% Input VAT'}
                </span>
                <p className="text-base sm:text-lg font-bold text-teal-400 tabular-nums mt-0.5">
                  {taxType === 'NON_VAT' ? 'Rs. 0.00' : formatNpr(calculationSummary.vatAmount)}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-emerald-400 uppercase font-bold">Grand Total (Payable)</span>
                <p className="text-lg sm:text-xl font-bold text-emerald-400 tabular-nums mt-0.5">
                  {formatNpr(calculationSummary.totalAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link
            to={isEdit && purchaseId ? `/purchases/${purchaseId}` : '/purchases'}
            className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-colors shadow-xs"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-md transition-colors cursor-pointer flex items-center gap-2"
          >
            {saving ? (
              <>
                <Receipt className="w-4 h-4 animate-spin" />
                <span>Saving Purchase...</span>
              </>
            ) : (
              <span>{isEdit ? 'Update Purchase Record' : 'Save & Record Purchase'}</span>
            )}
          </button>
        </div>
      </form>

      {/* Quick Add Vendor Modal */}
      {quickAddVendorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 animate-slide-up space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">Quick Add Supplier / Vendor</h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickAddVendorOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAddVendor} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company / Supplier Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Tech Solutions Pvt. Ltd."
                  value={quickVendorForm.company_name}
                  onChange={(e) => setQuickVendorForm({ ...quickVendorForm, company_name: e.target.value })}
                  required
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    PAN Number
                  </label>
                  <input
                    type="text"
                    placeholder="9-digit PAN"
                    value={quickVendorForm.pan_number}
                    onChange={(e) => setQuickVendorForm({ ...quickVendorForm, pan_number: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    VAT Number
                  </label>
                  <input
                    type="text"
                    placeholder="VAT if registered"
                    value={quickVendorForm.vat_number}
                    onChange={(e) => setQuickVendorForm({ ...quickVendorForm, vat_number: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Shrestha"
                    value={quickVendorForm.contact_person}
                    onChange={(e) => setQuickVendorForm({ ...quickVendorForm, contact_person: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9841234567"
                    value={quickVendorForm.contact_number}
                    onChange={(e) => setQuickVendorForm({ ...quickVendorForm, contact_number: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. New Road, Kathmandu"
                  value={quickVendorForm.address}
                  onChange={(e) => setQuickVendorForm({ ...quickVendorForm, address: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuickAddVendorOpen(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                >
                  Create & Select Vendor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
