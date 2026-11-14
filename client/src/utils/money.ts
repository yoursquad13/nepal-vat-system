/**
 * Money and VAT utilities for exact integer paisa arithmetic.
 * In Nepal, 1 Rupee = 100 Paisa.
 */

export interface CalculateVatParams {
  enteredAmount: number | string;
  taxType: 'VAT_13' | 'NON_VAT';
  mode: 'EXCLUSIVE' | 'INCLUSIVE';
}

export interface CalculateVatResult {
  enteredPaisa: number;
  basePaisa: number;
  vatPaisa: number;
  totalPaisa: number;
  baseAmount: string;
  vatAmount: string;
  totalAmount: string;
}

/**
 * Converts a decimal rupee amount (number or string) to exact integer paisa.
 * Uses Math.round to safely eliminate floating-point representation drift.
 */
export function toPaisa(amount: number | string): number {
  if (typeof amount === 'string') {
    const trimmed = amount.replace(/,/g, '').trim();
    if (trimmed === '') return 0;
    const num = Number(trimmed);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
      throw new Error(`Invalid monetary amount: "${amount}"`);
    }
    return Math.round(num * 100);
  }
  if (typeof amount === 'number') {
    if (Number.isNaN(amount) || !Number.isFinite(amount)) {
      throw new Error(`Invalid monetary amount: ${amount}`);
    }
    return Math.round(amount * 100);
  }
  throw new Error(`Invalid monetary amount type: ${typeof amount}`);
}

/**
 * Converts integer paisa to a standard 2-decimal string (e.g. 10000 -> "100.00").
 */
export function fromPaisa(paisa: number): string {
  if (!Number.isFinite(paisa) || Number.isNaN(paisa)) {
    return '0.00';
  }
  const absPaisa = Math.round(Math.abs(paisa));
  const isNegative = paisa < 0 && absPaisa > 0;
  const rupees = Math.floor(absPaisa / 100);
  const remPaisa = absPaisa % 100;
  const formatted = `${rupees}.${remPaisa.toString().padStart(2, '0')}`;
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Calculates 13% VAT or NON_VAT amounts using exact integer paisa arithmetic.
 *
 * For VAT_13 EXCLUSIVE:
 *   basePaisa = enteredPaisa
 *   vatPaisa = Math.round(basePaisa * 13 / 100)
 *   totalPaisa = basePaisa + vatPaisa
 *
 * For VAT_13 INCLUSIVE:
 *   totalPaisa = enteredPaisa
 *   vatPaisa = Math.round(totalPaisa * 13 / 113)
 *   basePaisa = totalPaisa - vatPaisa
 *   Guarantees basePaisa + vatPaisa === totalPaisa identically.
 *
 * For NON_VAT:
 *   basePaisa = enteredPaisa
 *   vatPaisa = 0
 *   totalPaisa = enteredPaisa
 */
export function calculateVat(params: CalculateVatParams): CalculateVatResult {
  const enteredPaisa = toPaisa(params.enteredAmount);

  let basePaisa = 0;
  let vatPaisa = 0;
  let totalPaisa = 0;

  if (params.taxType === 'NON_VAT') {
    basePaisa = enteredPaisa;
    vatPaisa = 0;
    totalPaisa = enteredPaisa;
  } else {
    // VAT_13
    if (params.mode === 'EXCLUSIVE') {
      basePaisa = enteredPaisa;
      vatPaisa = Math.round((basePaisa * 13) / 100);
      totalPaisa = basePaisa + vatPaisa;
    } else {
      // INCLUSIVE
      totalPaisa = enteredPaisa;
      vatPaisa = Math.round((totalPaisa * 13) / 113);
      basePaisa = totalPaisa - vatPaisa;
    }
  }

  return {
    enteredPaisa,
    basePaisa,
    vatPaisa,
    totalPaisa,
    baseAmount: fromPaisa(basePaisa),
    vatAmount: fromPaisa(vatPaisa),
    totalAmount: fromPaisa(totalPaisa),
  };
}

/**
 * Formats a currency amount using standard South Asian lakh/crore grouping and "Rs. " prefix.
 * e.g., 113000 -> "Rs. 1,13,000.00"
 */
export function formatNpr(amount: number | string): string {
  const num = typeof amount === 'string' ? Number(amount.replace(/,/g, '').trim()) : Number(amount);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return 'Rs. 0.00';
  }
  const absPaisa = Math.round(Math.abs(num) * 100);
  const isNegative = num < 0 && absPaisa > 0;
  const absFormatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));

  return `${isNegative ? '-' : ''}Rs. ${absFormatted}`;
}

export interface DiscountedLineCalc {
  grossPaisa: number;
  discountPaisa: number;
  baseAmount: string;
  vatAmount: string;
  totalAmount: string;
}

export interface DiscountedPurchaseCalcResult {
  grossEnteredPaisa: number;
  discountPaisa: number;
  netEnteredPaisa: number;
  discountAmount: string;
  enteredAmount: string;
  purchaseAmount: string;
  vatAmount: string;
  totalAmount: string;
  items: DiscountedLineCalc[];
}

/**
 * Proportionally allocates a bill-level discount across line items (with remainder on the last positive line)
 * and computes 13% VAT / NON_VAT totals using exact integer paisa arithmetic.
 */
export function calculateDiscountedPurchase(params: {
  lineAmounts?: Array<number | string>;
  enteredAmount?: number | string | null;
  discountAmount?: number | string | null;
  taxType: 'VAT_13' | 'NON_VAT';
  mode: 'EXCLUSIVE' | 'INCLUSIVE';
}): DiscountedPurchaseCalcResult {
  const discountPaisa =
    params.discountAmount !== undefined &&
    params.discountAmount !== null &&
    String(params.discountAmount).trim() !== ''
      ? toPaisa(params.discountAmount)
      : 0;

  if (discountPaisa < 0) {
    throw new Error('Discount amount cannot be negative.');
  }

  const lineInputs = params.lineAmounts || [];
  if (lineInputs.length > 0) {
    const grossLinePaisas = lineInputs.map((amt) => Math.max(0, toPaisa(amt)));
    const grossTotalPaisa = grossLinePaisas.reduce((acc, p) => acc + p, 0);

    if (discountPaisa > grossTotalPaisa) {
      throw new Error('Discount amount cannot exceed subtotal before discount.');
    }

    let remainingDiscount = discountPaisa;
    let remainingGross = grossTotalPaisa;
    const itemResults: DiscountedLineCalc[] = grossLinePaisas.map((grossPaisa) => {
      let lineDiscount = 0;
      if (remainingDiscount > 0 && grossPaisa > 0 && remainingGross > 0) {
        if (grossPaisa >= remainingGross) {
          lineDiscount = remainingDiscount;
        } else {
          lineDiscount = Math.min(
            grossPaisa,
            Math.round((remainingDiscount * grossPaisa) / remainingGross)
          );
        }
        remainingDiscount -= lineDiscount;
        remainingGross -= grossPaisa;
      }

      const netLinePaisa = Math.max(0, grossPaisa - lineDiscount);
      const calc = calculateVat({
        enteredAmount: fromPaisa(netLinePaisa),
        taxType: params.taxType,
        mode: params.mode,
      });

      return {
        grossPaisa,
        discountPaisa: lineDiscount,
        baseAmount: calc.baseAmount,
        vatAmount: calc.vatAmount,
        totalAmount: calc.totalAmount,
      };
    });

    const hasExplicitEntered =
      params.enteredAmount !== undefined &&
      params.enteredAmount !== null &&
      String(params.enteredAmount).trim() !== '';

    if (hasExplicitEntered) {
      const explicitGross = toPaisa(params.enteredAmount as number | string);
      if (discountPaisa > explicitGross) {
        throw new Error('Discount amount cannot exceed entered amount.');
      }
      const netPaisa = explicitGross - discountPaisa;
      const headerCalc = calculateVat({
        enteredAmount: fromPaisa(netPaisa),
        taxType: params.taxType,
        mode: params.mode,
      });
      return {
        grossEnteredPaisa: explicitGross,
        discountPaisa,
        netEnteredPaisa: headerCalc.enteredPaisa,
        discountAmount: fromPaisa(discountPaisa),
        enteredAmount: fromPaisa(headerCalc.enteredPaisa),
        purchaseAmount: headerCalc.baseAmount,
        vatAmount: headerCalc.vatAmount,
        totalAmount: headerCalc.totalAmount,
        items: itemResults,
      };
    }

    if (discountPaisa > 0) {
      const netHeaderPaisa = grossTotalPaisa - discountPaisa;
      const headerCalc = calculateVat({
        enteredAmount: fromPaisa(netHeaderPaisa),
        taxType: params.taxType,
        mode: params.mode,
      });
      return {
        grossEnteredPaisa: grossTotalPaisa,
        discountPaisa,
        netEnteredPaisa: headerCalc.enteredPaisa,
        discountAmount: fromPaisa(discountPaisa),
        enteredAmount: fromPaisa(headerCalc.enteredPaisa),
        purchaseAmount: headerCalc.baseAmount,
        vatAmount: headerCalc.vatAmount,
        totalAmount: headerCalc.totalAmount,
        items: itemResults,
      };
    }

    const totalBasePaisa = itemResults.reduce((acc, it) => acc + toPaisa(it.baseAmount), 0);
    const totalVatPaisa = itemResults.reduce((acc, it) => acc + toPaisa(it.vatAmount), 0);
    const totalTotalPaisa = itemResults.reduce((acc, it) => acc + toPaisa(it.totalAmount), 0);
    const enteredPaisa = params.mode === 'INCLUSIVE' ? totalTotalPaisa : totalBasePaisa;

    return {
      grossEnteredPaisa: grossTotalPaisa,
      discountPaisa: 0,
      netEnteredPaisa: enteredPaisa,
      discountAmount: '0.00',
      enteredAmount: fromPaisa(enteredPaisa),
      purchaseAmount: fromPaisa(totalBasePaisa),
      vatAmount: fromPaisa(totalVatPaisa),
      totalAmount: fromPaisa(totalTotalPaisa),
      items: itemResults,
    };
  }

  const grossEnteredPaisa =
    params.enteredAmount !== undefined &&
    params.enteredAmount !== null &&
    String(params.enteredAmount).trim() !== ''
      ? toPaisa(params.enteredAmount)
      : 0;

  if (discountPaisa > grossEnteredPaisa) {
    throw new Error('Discount amount cannot exceed entered purchase amount.');
  }

  const netEnteredPaisa = grossEnteredPaisa - discountPaisa;
  const headerCalc = calculateVat({
    enteredAmount: fromPaisa(netEnteredPaisa),
    taxType: params.taxType,
    mode: params.mode,
  });

  return {
    grossEnteredPaisa,
    discountPaisa,
    netEnteredPaisa: headerCalc.enteredPaisa,
    discountAmount: fromPaisa(discountPaisa),
    enteredAmount: fromPaisa(headerCalc.enteredPaisa),
    purchaseAmount: headerCalc.baseAmount,
    vatAmount: headerCalc.vatAmount,
    totalAmount: headerCalc.totalAmount,
    items: [],
  };
}

export const formatNPR = formatNpr;
