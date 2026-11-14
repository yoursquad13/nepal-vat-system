import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';

export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const imagePdfFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const validExtensions = ALLOWED_MIME_TYPES[file.mimetype];

  if (!validExtensions || !validExtensions.includes(ext)) {
    return cb(
      ApiError.badRequest(
        'Invalid file type. Only JPEG, PNG, WEBP, and PDF files are allowed.'
      ) as any
    );
  }

  cb(null, true);
};

function createUploader(subDir: string) {
  const uploadBase = path.resolve(process.cwd(), env.UPLOAD_DIR || './uploads');
  const targetDir = path.join(uploadBase, subDir);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      // Re-ensure directory exists in case it was created/deleted
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      cb(null, targetDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const uuid = crypto.randomUUID();
      cb(null, `${uuid}${ext}`);
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter: imagePdfFileFilter,
  });
}

export const uploadVatBill = createUploader('vat-bills');
export const uploadPaymentSlip = createUploader('payment-slips');
export const uploadVatBillMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: imagePdfFileFilter,
});
