import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { adToBs, bsToAd, getFiscalYearFromBs } from '../utils/nepaliDate.js';

export type BillDocumentType =
  | 'TAX_INVOICE'
  | 'ABBREVIATED_TAX_INVOICE'
  | 'NON_VAT_BILL'
  | 'OTHER';

export interface ExtractedVendorInfo {
  name: string;
  name_english: string | null;
  pan_number: string | null;
  vat_number: string | null;
  phone: string | null;
  address: string | null;
}

export interface ExtractedLineItem {
  name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface ExtractedBillData {
  document_type: BillDocumentType;
  language: 'EN' | 'NE' | 'MIXED';
  vendor: ExtractedVendorInfo;
  bill_number: string | null;
  purchase_date_bs: string | null;
  purchase_date_ad: string | null;
  fiscal_year: string | null;
  vat_bill_issue_date_bs: string | null;
  vat_bill_issue_date_ad: string | null;
  tax_type: 'VAT_13' | 'NON_VAT';
  vat_calc_mode: 'EXCLUSIVE' | 'INCLUSIVE';
  payment_mode: string | null;
  product_summary: string;
  description: string | null;
  remarks: string | null;
  taxable_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  entered_amount: number | null;
  line_items: ExtractedLineItem[];
  notes: string | null;
}

export interface MatchedVendorSummary {
  id: number;
  company_name: string;
  pan_number: string | null;
  vat_number: string | null;
  match_reason: 'PAN_OR_VAT_MATCH' | 'NAME_MATCH';
}

export interface BillExtractionResult {
  extracted: ExtractedBillData;
  matched_vendor: MatchedVendorSummary | null;
  warnings: string[];
  model: string;
}

const NEPALI_DIGIT_MAP: Record<string, string> = {
  '०': '0',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9',
};

/**
 * Converts Devanagari numerals (०-९) in any string to ASCII digits (0-9).
 */
export function normalizeNepaliDigits(input: string | null | undefined): string {
  if (!input) return '';
  return String(input).replace(/[०-९]/g, (ch) => NEPALI_DIGIT_MAP[ch] ?? ch);
}

/**
 * Normalizes a printed BS or AD date string (supporting YYYY/M/D, YYYY.MM.DD, YYYY-MM-DD, and Devanagari digits)
 * to strict YYYY-MM-DD format. Returns null if not parseable.
 */
export function normalizeDateToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ascii = normalizeNepaliDigits(raw).trim();
  const match = ascii.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function normalizeTaxId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ascii = normalizeNepaliDigits(raw).replace(/[\s\-.,]+/g, '').trim();
  return ascii || null;
}

function toFiniteNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const cleaned = normalizeNepaliDigits(String(val)).replace(/,/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(val: number): number {
  return Math.round(val * 100) / 100;
}

function resolveBsAdPair(
  rawBs: string | null | undefined,
  rawAd: string | null | undefined,
  warnings: string[],
  label: string
): { bs: string | null; ad: string | null; fiscalYear: string | null } {
  const normBs = normalizeDateToken(rawBs);
  const normAd = normalizeDateToken(rawAd);

  if (normBs) {
    try {
      const ad = bsToAd(normBs);
      return { bs: normBs, ad, fiscalYear: getFiscalYearFromBs(normBs) };
    } catch {
      warnings.push(`Extracted ${label} BS date (${normBs}) was invalid and could not be converted.`);
    }
  }

  if (normAd) {
    try {
      const bs = adToBs(normAd);
      return { bs, ad: normAd, fiscalYear: getFiscalYearFromBs(bs) };
    } catch {
      warnings.push(`Extracted ${label} AD date (${normAd}) was invalid and could not be converted.`);
    }
  }

  return { bs: null, ad: null, fiscalYear: null };
}

/**
 * Normalizes and validates raw JSON extracted from Gemini Vision into application-ready types and Nepali calendar pairs.
 */
export function normalizeExtractedBill(raw: any): {
  extracted: ExtractedBillData;
  warnings: string[];
} {
  const warnings: string[] = [];

  const documentType: BillDocumentType = (
    ['TAX_INVOICE', 'ABBREVIATED_TAX_INVOICE', 'NON_VAT_BILL', 'OTHER'] as const
  ).includes(raw?.document_type)
    ? raw.document_type
    : 'OTHER';

  const language: 'EN' | 'NE' | 'MIXED' = (['EN', 'NE', 'MIXED'] as const).includes(raw?.language)
    ? raw.language
    : 'MIXED';

  const rawVendor = raw?.vendor || {};
  let vatNumber = normalizeTaxId(rawVendor.vat_number);
  let panNumber = normalizeTaxId(rawVendor.pan_number);
  if ((documentType === 'TAX_INVOICE' || documentType === 'ABBREVIATED_TAX_INVOICE') && !panNumber && vatNumber) {
    panNumber = vatNumber;
  } else if ((documentType === 'TAX_INVOICE' || documentType === 'ABBREVIATED_TAX_INVOICE') && !vatNumber && panNumber) {
    vatNumber = panNumber;
  }

  const vendor: ExtractedVendorInfo = {
    name: String(rawVendor.name || rawVendor.name_english || 'Unknown Vendor').trim(),
    name_english: rawVendor.name_english ? String(rawVendor.name_english).trim() : null,
    pan_number: panNumber,
    vat_number: vatNumber,
    phone: rawVendor.phone ? normalizeNepaliDigits(String(rawVendor.phone)).trim() || null : null,
    address: rawVendor.address ? String(rawVendor.address).trim() || null : null,
  };

  let taxType: 'VAT_13' | 'NON_VAT' = raw?.tax_type === 'NON_VAT' ? 'NON_VAT' : 'VAT_13';
  let vatCalcMode: 'EXCLUSIVE' | 'INCLUSIVE' =
    raw?.vat_calc_mode === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE';

  if (documentType === 'ABBREVIATED_TAX_INVOICE') {
    taxType = 'VAT_13';
    vatCalcMode = 'INCLUSIVE';
  } else if (documentType === 'NON_VAT_BILL') {
    taxType = 'NON_VAT';
    vatCalcMode = 'EXCLUSIVE';
  }

  const purchaseDates = resolveBsAdPair(
    raw?.purchase_date_bs,
    raw?.purchase_date_ad,
    warnings,
    'purchase'
  );
  const billIssueDates = resolveBsAdPair(
    raw?.vat_bill_issue_date_bs || raw?.purchase_date_bs,
    raw?.vat_bill_issue_date_ad || raw?.purchase_date_ad,
    warnings,
    'VAT bill issue'
  );

  const lineItems: ExtractedLineItem[] = Array.isArray(raw?.line_items)
    ? raw.line_items
        .map((it: any): ExtractedLineItem | null => {
          const name = String(it?.name || '').trim();
          if (!name) return null;
          const rawQty = toFiniteNumber(it?.quantity);
          const quantity = rawQty && rawQty > 0 ? rawQty : 1;
          const rawTotal = toFiniteNumber(it?.line_total);
          const rawPrice = toFiniteNumber(it?.unit_price);
          let unitPrice = rawPrice !== null && rawPrice >= 0 ? rawPrice : 0;
          if (unitPrice === 0 && rawTotal !== null && rawTotal > 0 && quantity > 0) {
            unitPrice = roundMoney(rawTotal / quantity);
          }
          const lineTotal =
            rawTotal !== null && rawTotal >= 0
              ? roundMoney(rawTotal)
              : roundMoney(quantity * unitPrice);
          const unit = String(it?.unit || 'pcs').trim() || 'pcs';
          return {
            name,
            unit,
            quantity,
            unit_price: roundMoney(unitPrice),
            line_total: lineTotal,
          };
        })
        .filter((x: ExtractedLineItem | null): x is ExtractedLineItem => x !== null)
    : [];

  let taxableAmount = toFiniteNumber(raw?.taxable_amount);
  let vatAmount = toFiniteNumber(raw?.vat_amount);
  let totalAmount = toFiniteNumber(raw?.total_amount);

  if (taxType === 'VAT_13' && vatCalcMode === 'INCLUSIVE' && totalAmount !== null) {
    if (vatAmount === null) vatAmount = roundMoney((totalAmount * 13) / 113);
    if (taxableAmount === null) taxableAmount = roundMoney(totalAmount - vatAmount);
  } else if (taxType === 'NON_VAT') {
    vatAmount = 0;
    if (totalAmount !== null && taxableAmount === null) {
      taxableAmount = totalAmount;
    }
  }

  const lineSum = lineItems.reduce((sum, item) => sum + item.line_total, 0);
  let enteredAmount: number | null = null;
  if (taxType === 'VAT_13' && vatCalcMode === 'EXCLUSIVE') {
    enteredAmount =
      taxableAmount !== null && taxableAmount > 0
        ? roundMoney(taxableAmount)
        : lineSum > 0
        ? roundMoney(lineSum)
        : totalAmount !== null && totalAmount > 0
        ? roundMoney(totalAmount / 1.13)
        : null;
  } else {
    enteredAmount =
      totalAmount !== null && totalAmount > 0
        ? roundMoney(totalAmount)
        : lineSum > 0
        ? roundMoney(lineSum)
        : taxableAmount !== null && taxableAmount > 0
        ? roundMoney(taxableAmount)
        : null;
  }

  const billNumber = raw?.bill_number
    ? normalizeNepaliDigits(String(raw.bill_number)).trim() || null
    : null;
  const paymentMode = raw?.payment_mode ? String(raw.payment_mode).trim() || null : null;
  const notes = raw?.notes ? String(raw.notes).trim() || null : null;

  const productSummary =
    String(raw?.product_summary || '').trim() ||
    (lineItems.length > 0 ? lineItems.map((l) => l.name).slice(0, 3).join(', ') : 'Purchase Bill');

  const descriptionParts: string[] = [];
  if (raw?.description) descriptionParts.push(String(raw.description).trim());
  else if (lineItems.length > 0) {
    descriptionParts.push(
      lineItems.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join('; ')
    );
  }
  const description = descriptionParts.filter(Boolean).join(' — ') || null;

  const remarkParts: string[] = [];
  if (paymentMode) remarkParts.push(`Payment Mode: ${paymentMode}`);
  if (notes && notes !== description) remarkParts.push(notes);
  const remarks = remarkParts.join(' | ') || null;

  return {
    extracted: {
      document_type: documentType,
      language,
      vendor,
      bill_number: billNumber,
      purchase_date_bs: purchaseDates.bs,
      purchase_date_ad: purchaseDates.ad,
      fiscal_year: purchaseDates.fiscalYear,
      vat_bill_issue_date_bs: billIssueDates.bs,
      vat_bill_issue_date_ad: billIssueDates.ad,
      tax_type: taxType,
      vat_calc_mode: vatCalcMode,
      payment_mode: paymentMode,
      product_summary: productSummary,
      description,
      remarks,
      taxable_amount: taxableAmount !== null ? roundMoney(taxableAmount) : null,
      vat_amount: vatAmount !== null ? roundMoney(vatAmount) : null,
      total_amount: totalAmount !== null ? roundMoney(totalAmount) : null,
      entered_amount: enteredAmount,
      line_items: lineItems,
      notes,
    },
    warnings,
  };
}

function normalizeCompanyKey(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(pvt\.?|private|ltd\.?|limited|suppliers?|trading|enterprises?|store|company|co\.?)\b/g, ' ')
    .replace(/प्रा\.?\s*लि\.?|सप्लायर्स|ट्रेडिङ्ग|एण्ड/g, ' ')
    .replace(/[^a-z0-9\u0900-\u097f]+/g, ' ')
    .trim();
}

/**
 * Matches extracted supplier identity against active vendors in PostgreSQL (exact PAN/VAT first, then normalized name).
 */
export async function matchVendorFromDb(
  vendorInfo: ExtractedVendorInfo
): Promise<MatchedVendorSummary | null> {
  const { rows } = await pool.query(
    `SELECT id, company_name, pan_number, vat_number
     FROM vendors
     WHERE is_active = TRUE`
  );

  const taxIds = new Set(
    [vendorInfo.pan_number, vendorInfo.vat_number]
      .map((t) => normalizeTaxId(t))
      .filter((t): t is string => Boolean(t && t.length >= 6))
  );

  if (taxIds.size > 0) {
    for (const row of rows) {
      const rowPan = normalizeTaxId(row.pan_number);
      const rowVat = normalizeTaxId(row.vat_number);
      if ((rowPan && taxIds.has(rowPan)) || (rowVat && taxIds.has(rowVat))) {
        return {
          id: Number(row.id),
          company_name: row.company_name,
          pan_number: row.pan_number,
          vat_number: row.vat_number,
          match_reason: 'PAN_OR_VAT_MATCH',
        };
      }
    }
  }

  const candidateNames = [vendorInfo.name, vendorInfo.name_english].filter(
    (s): s is string => Boolean(s && s.trim())
  );

  for (const candidate of candidateNames) {
    const exactLower = candidate.trim().toLowerCase();
    const coreKey = normalizeCompanyKey(candidate);

    for (const row of rows) {
      const dbLower = String(row.company_name || '').trim().toLowerCase();
      const dbCore = normalizeCompanyKey(row.company_name);
      if (
        dbLower === exactLower ||
        (coreKey.length >= 3 && dbCore.length >= 3 && (dbCore === coreKey || dbCore.includes(coreKey) || coreKey.includes(dbCore)))
      ) {
        return {
          id: Number(row.id),
          company_name: row.company_name,
          pan_number: row.pan_number,
          vat_number: row.vat_number,
          match_reason: 'NAME_MATCH',
        };
      }
    }
  }

  return null;
}

const GEMINI_BILL_PROMPT = `You are an expert Nepalese accounting and VAT bill OCR parser. Carefully read the attached purchase bill (it may be rotated, sideways, typed, or handwritten, in English, Nepali/Devanagari, or mixed).

Extraction Rules:
1. Always convert Nepali/Devanagari numerals (०-९) into standard ASCII digits (0-9) for dates, bill numbers, PAN/VAT numbers, phone numbers, quantities, rates, and totals.
2. Identify document_type:
   - "TAX_INVOICE": Full Tax Invoice / कर विजक with a separate 13% VAT / १३% ले कर breakdown line.
   - "ABBREVIATED_TAX_INVOICE": संक्षिप्त कर विजक (Abbreviated Tax Invoice) with a seller VAT/PAN number where prices already include 13% VAT and no separate VAT line appears.
   - "NON_VAT_BILL": PAN bill / Estimate / Cash memo without VAT registration.
   - "OTHER": Anything else.
3. Determine tax_type and vat_calc_mode:
   - "TAX_INVOICE" -> tax_type="VAT_13", vat_calc_mode="EXCLUSIVE", line_items[].unit_price is pre-VAT rate.
   - "ABBREVIATED_TAX_INVOICE" -> tax_type="VAT_13", vat_calc_mode="INCLUSIVE", line_items[].unit_price is VAT-inclusive rate.
   - "NON_VAT_BILL" -> tax_type="NON_VAT", vat_calc_mode="EXCLUSIVE".
4. Distinguish SELLER (printed header/logo/stamp/Vikreta) from BUYER (Kreta / Buyer's Name). Put SELLER details in vendor.*, NEVER the buyer!
5. If vendor name or item names are in Devanagari (Nepali), provide both the clean readable original or bilingual form AND English transliteration (vendor.name_english; for items, format as "Nepali (English)" or clear English/Nepali).
6. Normalize Bikram Sambat dates (e.g., 2083/07/15, 2083.07.09, २०८३/०७/२७) into YYYY-MM-DD in purchase_date_bs. If only Gregorian AD date is shown, put YYYY-MM-DD in purchase_date_ad.
7. Extract all line items accurately with quantity, unit (e.g., pcs, ctn, kg, pkt, box), rate (unit_price), and line total.
8. Fill description with a clean summary of bill particulars and payment_mode (Cash/Cheque/Credit) if indicated.`;

const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    document_type: {
      type: 'STRING',
      enum: ['TAX_INVOICE', 'ABBREVIATED_TAX_INVOICE', 'NON_VAT_BILL', 'OTHER'],
    },
    language: { type: 'STRING', enum: ['EN', 'NE', 'MIXED'] },
    vendor: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        name_english: { type: 'STRING', nullable: true },
        pan_number: { type: 'STRING', nullable: true },
        vat_number: { type: 'STRING', nullable: true },
        phone: { type: 'STRING', nullable: true },
        address: { type: 'STRING', nullable: true },
      },
      required: ['name'],
    },
    bill_number: { type: 'STRING', nullable: true },
    purchase_date_bs: { type: 'STRING', nullable: true },
    purchase_date_ad: { type: 'STRING', nullable: true },
    vat_bill_issue_date_bs: { type: 'STRING', nullable: true },
    vat_bill_issue_date_ad: { type: 'STRING', nullable: true },
    tax_type: { type: 'STRING', enum: ['VAT_13', 'NON_VAT'] },
    vat_calc_mode: { type: 'STRING', enum: ['EXCLUSIVE', 'INCLUSIVE'] },
    payment_mode: { type: 'STRING', nullable: true },
    product_summary: { type: 'STRING' },
    description: { type: 'STRING', nullable: true },
    taxable_amount: { type: 'NUMBER', nullable: true },
    vat_amount: { type: 'NUMBER', nullable: true },
    total_amount: { type: 'NUMBER', nullable: true },
    line_items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          unit: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unit_price: { type: 'NUMBER' },
          line_total: { type: 'NUMBER' },
        },
        required: ['name', 'quantity', 'unit_price', 'line_total'],
      },
    },
    notes: { type: 'STRING', nullable: true },
  },
  required: [
    'document_type',
    'vendor',
    'tax_type',
    'vat_calc_mode',
    'product_summary',
    'line_items',
  ],
};

export interface ExtractBillInput {
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

export type BillExtractorImplementation = (
  input: ExtractBillInput
) => Promise<BillExtractionResult>;

let testExtractorOverride: BillExtractorImplementation | null = null;

/**
 * Allows test suites to inject a deterministic mock bill extractor in NODE_ENV=test.
 */
export function setBillExtractorOverride(fn: BillExtractorImplementation | null): void {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Bill extractor override is only permitted in test environment');
  }
  testExtractorOverride = fn;
}

/**
 * Calls the Gemini API to read an uploaded VAT/Non-VAT bill image or PDF and returns normalized fields + matched vendor.
 */
export async function extractPurchaseFromBill(
  input: ExtractBillInput
): Promise<BillExtractionResult> {
  if (testExtractorOverride) {
    return testExtractorOverride(input);
  }

  const apiKey = (env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw ApiError.badRequest(
      'Gemini AI bill scanning is not configured. Set GEMINI_API_KEY on the server.'
    );
  }

  const model = (env.GEMINI_MODEL || 'gemini-3-flash-preview').trim();
  const base64Data = input.buffer.toString('base64');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: globalThis.Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: base64Data,
                },
              },
              { text: GEMINI_BILL_PROMPT },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          temperature: 0.1,
        },
      }),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new ApiError(504, 'Gemini AI timed out while reading the bill. Please try again.');
    }
    throw new ApiError(
      502,
      `Failed to connect to Gemini AI service: ${err?.message || 'Network error'}`
    );
  }

  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    const apiErrMsg = payload?.error?.message || `Gemini API returned HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(502, `Gemini API authentication/permission failed: ${apiErrMsg}`);
    }
    if (response.status === 429) {
      throw new ApiError(429, 'Gemini API rate limit reached. Please retry in a moment.');
    }
    throw new ApiError(502, `Gemini AI could not process this bill: ${apiErrMsg}`);
  }

  const rawText: string | undefined = payload?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text || '')
    .join('')
    .trim();

  if (!rawText) {
    throw new ApiError(502, 'Gemini AI returned an empty response for this bill image.');
  }

  let parsedRaw: any;
  try {
    parsedRaw = JSON.parse(rawText);
  } catch {
    const fenced = rawText.match(/\{[\s\S]*\}/);
    if (!fenced) {
      throw new ApiError(502, 'Gemini AI response was not valid JSON.');
    }
    parsedRaw = JSON.parse(fenced[0]);
  }

  const { extracted, warnings } = normalizeExtractedBill(parsedRaw);
  const matchedVendor = await matchVendorFromDb(extracted.vendor);

  return {
    extracted,
    matched_vendor: matchedVendor,
    warnings,
    model,
  };
}
