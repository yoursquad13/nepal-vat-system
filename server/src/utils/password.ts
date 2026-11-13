import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

/**
 * Hash password using scrypt with random salt (salt:derivedKey hex format)
 */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain) {
    throw new Error('Password cannot be empty');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify plaintext password against stored salt:derivedKey hash
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!plain || !stored) {
    return false;
  }
  const parts = stored.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) {
    return false;
  }

  try {
    const keyBuffer = Buffer.from(keyHex, 'hex');
    const derivedKey = (await scryptAsync(plain, salt, 64)) as Buffer;

    // Defense against timing attack and timingSafeEqual crash when lengths differ
    if (keyBuffer.length !== derivedKey.length) {
      return false;
    }

    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}
