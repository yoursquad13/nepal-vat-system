import { Router, Request, Response, NextFunction } from 'express';
import { withTransaction } from '../config/db.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/audit.js';

export const vatBillsRouter = Router();

// All VAT Bill endpoints require authentication
vatBillsRouter.use(requireAuth);

function formatVatBill(row: any) {
  return {
    ...row,
    id: Number(row.id),
    purchase_id: Number(row.purchase_id),
    file_size: Number(row.file_size),
    uploaded_by: row.uploaded_by ? Number(row.uploaded_by) : null,
    reviewed_by: row.reviewed_by ? Number(row.reviewed_by) : null,
  };
}

// POST /api/vat-bills/:id/verify (Admin-only)
vatBillsRouter.post(
  '/:id/verify',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const billId = Number(req.params.id);
      if (Number.isNaN(billId) || billId <= 0) {
        throw ApiError.badRequest('Invalid VAT bill ID');
      }

      const reviewNotes = req.body.review_notes || req.body.notes || null;

      const result = await withTransaction(async (client) => {
        const billRes = await client.query(
          'SELECT * FROM vat_bills WHERE id = $1 FOR UPDATE',
          [billId]
        );

        if (billRes.rows.length === 0) {
          throw ApiError.notFound('VAT bill not found');
        }

        const currentBill = billRes.rows[0];

        // Update vat_bills
        const updatedBillRes = await client.query(
          `UPDATE vat_bills
           SET status = 'VERIFIED',
               reviewed_by = $1,
               reviewed_at = NOW(),
               review_notes = COALESCE($2, review_notes)
           WHERE id = $3
           RETURNING *`,
          [req.user!.id, reviewNotes, billId]
        );
        const updatedBill = updatedBillRes.rows[0];

        // Update purchase if this bill is current
        let updatedPur = null;
        if (currentBill.is_current) {
          const purRes = await client.query(
            `UPDATE purchases
             SET vat_bill_status = 'VAT BILL VERIFIED',
                 vat_verified_by = $1,
                 vat_verified_at = NOW(),
                 updated_at = NOW()
             WHERE id = $2
             RETURNING *`,
            [req.user!.id, currentBill.purchase_id]
          );
          updatedPur = purRes.rows[0];
        }

        // Activity logs
        await logActivity(client, {
          entityType: 'VAT_BILL',
          entityId: billId,
          action: 'VAT_BILL_VERIFIED',
          summary: `VAT bill #${billId} verified by admin ${req.user!.fullName}`,
          oldValues: { status: currentBill.status },
          newValues: { status: 'VERIFIED', reviewNotes },
          performedBy: req.user!.id,
          performedByName: req.user!.fullName,
        });

        if (updatedPur) {
          await logActivity(client, {
            entityType: 'PURCHASE',
            entityId: currentBill.purchase_id,
            action: 'PURCHASE_VAT_STATUS_UPDATED',
            summary: `Purchase ${updatedPur.purchase_code} VAT status updated to VAT BILL VERIFIED`,
            performedBy: req.user!.id,
            performedByName: req.user!.fullName,
          });
        }

        return { updatedBill, updatedPur };
      });

      res.json({
        message: 'VAT bill verified successfully',
        vat_bill: formatVatBill(result.updatedBill),
        purchase: result.updatedPur ? result.updatedPur : undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/vat-bills/:id/reject (Admin-only)
vatBillsRouter.post(
  '/:id/reject',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const billId = Number(req.params.id);
      if (Number.isNaN(billId) || billId <= 0) {
        throw ApiError.badRequest('Invalid VAT bill ID');
      }

      const reviewNotes = req.body.review_notes || req.body.reason || req.body.notes || null;

      const result = await withTransaction(async (client) => {
        const billRes = await client.query(
          'SELECT * FROM vat_bills WHERE id = $1 FOR UPDATE',
          [billId]
        );

        if (billRes.rows.length === 0) {
          throw ApiError.notFound('VAT bill not found');
        }

        const currentBill = billRes.rows[0];

        // Update vat_bills
        const updatedBillRes = await client.query(
          `UPDATE vat_bills
           SET status = 'REJECTED',
               reviewed_by = $1,
               reviewed_at = NOW(),
               review_notes = COALESCE($2, review_notes)
           WHERE id = $3
           RETURNING *`,
          [req.user!.id, reviewNotes, billId]
        );
        const updatedBill = updatedBillRes.rows[0];

        // Update purchase if current
        let updatedPur = null;
        if (currentBill.is_current) {
          const purRes = await client.query(
            `UPDATE purchases
             SET vat_bill_status = 'VAT BILL REJECTED',
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [currentBill.purchase_id]
          );
          updatedPur = purRes.rows[0];
        }

        // Activity logs
        await logActivity(client, {
          entityType: 'VAT_BILL',
          entityId: billId,
          action: 'VAT_BILL_REJECTED',
          summary: `VAT bill #${billId} rejected by admin ${req.user!.fullName}`,
          oldValues: { status: currentBill.status },
          newValues: { status: 'REJECTED', reviewNotes },
          performedBy: req.user!.id,
          performedByName: req.user!.fullName,
        });

        if (updatedPur) {
          await logActivity(client, {
            entityType: 'PURCHASE',
            entityId: currentBill.purchase_id,
            action: 'PURCHASE_VAT_STATUS_UPDATED',
            summary: `Purchase ${updatedPur.purchase_code} VAT status updated to VAT BILL REJECTED`,
            performedBy: req.user!.id,
            performedByName: req.user!.fullName,
          });
        }

        return { updatedBill, updatedPur };
      });

      res.json({
        message: 'VAT bill rejected',
        vat_bill: formatVatBill(result.updatedBill),
        purchase: result.updatedPur ? result.updatedPur : undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);
