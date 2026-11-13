import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { formatNpr } from './money.js';

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
  format?: 'currency' | 'number' | 'date' | 'text';
}

export interface ReportExportData {
  title: string;
  companyName?: string;
  companyAddress?: string;
  companyPan?: string;
  subtitle?: string;
  filters?: Record<string, any>;
  generatedAt?: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  summary?: Record<string, any>;
}

/**
 * Sanitize cell values for CSV against formula injection (CSV Injection / CWE-1236).
 * Prepends a single quote (') if string starts with dangerous characters unless strictly numeric.
 */
function sanitizeCsvValue(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);

  // If leading character is =, +, -, @, \t, or \r
  if (/^[=+\-@\t\r]/.test(str)) {
    // If it's a valid finite number (e.g. -1200.50, +45), it is safe to keep
    const trimmed = str.trim();
    const isNum = !Number.isNaN(Number(trimmed)) && Number.isFinite(Number(trimmed));
    if (!isNum || trimmed.startsWith('=') || trimmed.startsWith('@')) {
      return `'${str}`;
    }
  }

  return str;
}

/**
 * Quotes field according to RFC-4180
 */
function rfc4180Quote(str: string): string {
  if (/[",\r\n]/.test(str) || str.startsWith("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates RFC-4180 compliant CSV with UTF-8 BOM and formula injection protection.
 */
export function generateCsv(data: ReportExportData): string {
  const lines: string[] = [];

  // Report title & meta banner
  if (data.companyName) {
    lines.push(rfc4180Quote(data.companyName));
  }
  lines.push(rfc4180Quote(data.title));
  if (data.generatedAt) {
    lines.push(rfc4180Quote(`Generated At: ${data.generatedAt}`));
  }
  lines.push(''); // blank line before table

  // Header row
  const headerLine = data.columns
    .map((col) => rfc4180Quote(sanitizeCsvValue(col.label)))
    .join(',');
  lines.push(headerLine);

  // Data rows
  for (const row of data.rows) {
    const rowLine = data.columns
      .map((col) => {
        const raw = row[col.key];
        const val = raw !== null && raw !== undefined ? raw : '';
        return rfc4180Quote(sanitizeCsvValue(val));
      })
      .join(',');
    lines.push(rowLine);
  }

  // Summary row if present
  if (data.summary && Object.keys(data.summary).length > 0) {
    const summary = data.summary;
    const summaryLine = data.columns
      .map((col, idx) => {
        if (idx === 0 && !summary[col.key]) {
          return rfc4180Quote('Total / Summary');
        }
        const raw = summary[col.key];
        const val = raw !== null && raw !== undefined ? raw : '';
        return rfc4180Quote(sanitizeCsvValue(val));
      })
      .join(',');
    lines.push(summaryLine);
  }

  // UTF-8 BOM (\uFEFF) ensures Excel opens non-ASCII and symbols accurately
  return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * Generates formatted XLSX buffer using exceljs
 */
export async function generateXlsx(data: ReportExportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nepal VAT & Inventory Management System';
  workbook.created = new Date();

  const sheetName = data.title.replace(/[\\/*?[\]:]/g, ' ').slice(0, 30).trim() || 'Report';
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true }],
  });

  // 1. Company Name & Report Title
  const compName = data.companyName || 'Himalayan Trading Suppliers Pvt. Ltd.';
  const compRow = worksheet.addRow([compName]);
  compRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F766E' } };

  const titleRow = worksheet.addRow([data.title]);
  titleRow.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF1E293B' } };

  if (data.generatedAt) {
    const metaRow = worksheet.addRow([`Generated: ${data.generatedAt}`]);
    metaRow.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF64748B' } };
  }

  worksheet.addRow([]); // Blank spacer row

  // 2. Table Headers
  const headerLabels = data.columns.map((c) => c.label);
  const headerRow = worksheet.addRow(headerLabels);
  headerRow.height = 24;

  headerRow.eachCell((cell, colIndex) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }, // Brand emerald teal
    };
    const colAlign = data.columns[colIndex - 1]?.align || 'left';
    cell.alignment = {
      vertical: 'middle',
      horizontal: colAlign === 'right' ? 'right' : colAlign === 'center' ? 'center' : 'left',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F766E' } },
      bottom: { style: 'medium', color: { argb: 'FF0A4F4A' } },
      left: { style: 'thin', color: { argb: 'FF0F766E' } },
      right: { style: 'thin', color: { argb: 'FF0F766E' } },
    };
  });

  // 3. Data Rows
  for (const row of data.rows) {
    const rowValues = data.columns.map((col) => {
      const val = row[col.key];
      if (val === null || val === undefined) return '';
      if (col.format === 'number' || col.format === 'currency') {
        const num = Number(val);
        return Number.isFinite(num) ? num : val;
      }
      return val;
    });

    const addedRow = worksheet.addRow(rowValues);
    addedRow.height = 18;

    addedRow.eachCell((cell, colIndex) => {
      cell.font = { name: 'Arial', size: 9 };
      const colDef = data.columns[colIndex - 1];
      const align = colDef?.align || 'left';

      cell.alignment = {
        vertical: 'middle',
        horizontal: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left',
      };

      if (colDef?.format === 'currency') {
        cell.numFmt = '#,##0.00';
      } else if (colDef?.format === 'number') {
        cell.numFmt = '#,##0.###';
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  }

  // 4. Summary Row (if available)
  if (data.summary && Object.keys(data.summary).length > 0) {
    const summary = data.summary;
    const summaryValues = data.columns.map((col, idx) => {
      if (idx === 0 && !summary[col.key]) {
        return 'Total';
      }
      const val = summary[col.key];
      if (val === null || val === undefined) return '';
      if (col.format === 'number' || col.format === 'currency') {
        const num = Number(val);
        return Number.isFinite(num) ? num : val;
      }
      return val;
    });

    const summaryRow = worksheet.addRow(summaryValues);
    summaryRow.height = 22;

    summaryRow.eachCell((cell, colIndex) => {
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      const colDef = data.columns[colIndex - 1];
      const align = colDef?.align || 'left';

      cell.alignment = {
        vertical: 'middle',
        horizontal: align === 'right' ? 'right' : align === 'center' ? 'center' : 'left',
      };

      if (colDef?.format === 'currency') {
        cell.numFmt = '#,##0.00';
      } else if (colDef?.format === 'number') {
        cell.numFmt = '#,##0.###';
      }

      cell.border = {
        top: { style: 'medium', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'double', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  }

  // 5. Column Widths
  worksheet.columns.forEach((column, i) => {
    const colDef = data.columns[i];
    if (colDef?.width) {
      column.width = colDef.width;
    } else {
      let maxLen = colDef?.label?.length || 10;
      data.rows.slice(0, 50).forEach((r) => {
        const str = String(r[colDef.key] || '');
        if (str.length > maxLen) maxLen = Math.min(str.length, 35);
      });
      column.width = Math.max(maxLen + 4, 12);
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generates clean tabular PDF buffer using pdfkit
 */
export function generatePdf(data: ReportExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const isWide = data.columns.length > 5;
      const doc = new PDFDocument({
        layout: isWide ? 'landscape' : 'portrait',
        size: 'A4',
        margin: 36, // 0.5 inch margins
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 36;
      const usableWidth = pageWidth - margin * 2;

      // 1. Header: Company Name & Title
      doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor('#0F766E')
        .text(data.companyName || 'Himalayan Trading Suppliers Pvt. Ltd.', margin, margin, {
          align: 'left',
        });

      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#1E293B')
        .text(data.title, margin, doc.y + 2);

      if (data.generatedAt) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#64748B')
          .text(`Generated: ${data.generatedAt}`, margin, doc.y + 2);
      }

      doc.moveDown(0.8);

      // 2. Column widths calculation
      const colCount = data.columns.length;
      const colWidths = data.columns.map((c) => {
        if (c.width) return (c.width / 100) * usableWidth;
        return usableWidth / colCount;
      });
      // Normalize sum to usableWidth
      const sumWidths = colWidths.reduce((a, b) => a + b, 0);
      const normalizedWidths = colWidths.map((w) => (w / sumWidths) * usableWidth);

      let currentY = doc.y;

      const renderHeader = () => {
        // Table Header background
        doc
          .rect(margin, currentY, usableWidth, 20)
          .fill('#0F766E');

        let currentX = margin;
        data.columns.forEach((col, idx) => {
          const colWidth = normalizedWidths[idx];
          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor('#FFFFFF')
            .text(col.label, currentX + 3, currentY + 5, {
              width: colWidth - 6,
              align: col.align || 'left',
              ellipsis: true,
            });
          currentX += colWidth;
        });

        currentY += 20;
      };

      renderHeader();

      // 3. Render Data Rows
      const rowHeight = 16;
      data.rows.forEach((row, rowIdx) => {
        // Check for page break
        if (currentY + rowHeight > pageHeight - margin - 20) {
          doc.addPage();
          currentY = margin;
          renderHeader();
        }

        // Alternating row background
        if (rowIdx % 2 === 1) {
          doc
            .rect(margin, currentY, usableWidth, rowHeight)
            .fill('#F8FAFC');
        }

        let currentX = margin;
        data.columns.forEach((col, idx) => {
          const colWidth = normalizedWidths[idx];
          let val = row[col.key];
          if (val === null || val === undefined) val = '';

          let displayVal = String(val);
          if (col.format === 'currency') {
            displayVal = formatNpr(val);
          }

          doc
            .font('Helvetica')
            .fontSize(8)
            .fillColor('#1E293B')
            .text(displayVal, currentX + 3, currentY + 4, {
              width: colWidth - 6,
              align: col.align || 'left',
              ellipsis: true,
            });

          currentX += colWidth;
        });

        // Bottom light border
        doc
          .strokeColor('#E2E8F0')
          .lineWidth(0.5)
          .moveTo(margin, currentY + rowHeight)
          .lineTo(margin + usableWidth, currentY + rowHeight)
          .stroke();

        currentY += rowHeight;
      });

      // 4. Render Summary Row
      if (data.summary && Object.keys(data.summary).length > 0) {
        if (currentY + rowHeight > pageHeight - margin - 20) {
          doc.addPage();
          currentY = margin;
          renderHeader();
        }

        doc
          .rect(margin, currentY, usableWidth, rowHeight + 2)
          .fill('#F1F5F9');

        let currentX = margin;
        data.columns.forEach((col, idx) => {
          const colWidth = normalizedWidths[idx];
          let val = data.summary![col.key];
          if (idx === 0 && (val === null || val === undefined)) {
            val = 'Total';
          }
          let displayVal = val !== null && val !== undefined ? String(val) : '';
          if (col.format === 'currency' && val !== null && val !== undefined) {
            displayVal = formatNpr(val);
          }

          doc
            .font('Helvetica-Bold')
            .fontSize(8)
            .fillColor('#0F172A')
            .text(displayVal, currentX + 3, currentY + 5, {
              width: colWidth - 6,
              align: col.align || 'left',
              ellipsis: true,
            });

          currentX += colWidth;
        });

        // Top border & double bottom border for summary
        doc
          .strokeColor('#94A3B8')
          .lineWidth(1)
          .moveTo(margin, currentY)
          .lineTo(margin + usableWidth, currentY)
          .moveTo(margin, currentY + rowHeight + 2)
          .lineTo(margin + usableWidth, currentY + rowHeight + 2)
          .stroke();

        currentY += rowHeight + 4;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
