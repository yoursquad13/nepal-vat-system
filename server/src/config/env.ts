import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root or server directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

export const envSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgresql://anishkhatri@localhost:5432/nepal_vat_system'),
    TEST_DATABASE_URL: z
      .string()
      .optional()
      .default('postgresql://anishkhatri@localhost:5432/nepal_vat_system_test'),
    JWT_SECRET: z
      .string()
      .min(1)
      .default('super-secret-nepal-vat-jwt-key-change-in-production'),
    UPLOAD_DIR: z.string().default('./uploads'),
    COMPANY_NAME: z.string().default('Himalayan Trading Suppliers Pvt. Ltd.'),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (
        !data.JWT_SECRET ||
        data.JWT_SECRET === 'super-secret-nepal-vat-jwt-key-change-in-production' ||
        data.JWT_SECRET.trim().length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'JWT_SECRET must be explicitly set and cannot be the default development secret in production',
          path: ['JWT_SECRET'],
        });
      }
    }
  });

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
