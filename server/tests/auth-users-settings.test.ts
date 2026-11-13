import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Ensure test environment uses test database
process.env.NODE_ENV = 'test';
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://anishkhatri@localhost:5432/nepal_vat_system_test';
process.env.DATABASE_URL = testDbUrl;

import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { logActivity } from '../src/utils/audit.js';
import { createApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';

const testPool = new pg.Pool({ connectionString: testDbUrl });
const app = createApp();

test.before(async () => {
  // Reset test database and run all migrations (including 002) and seeds
  await testPool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await runMigrations(testDbUrl);
  await seedDatabase({ withDemo: true, databaseUrl: testDbUrl });
});

test.after(async () => {
  await testPool.end();
});

test('password utils: hashPassword and verifyPassword work, and guard against buffer length mismatch', async () => {
  const plain = 'StrongPassword@123';
  const hashed = await hashPassword(plain);

  assert.ok(hashed.includes(':'), 'Hash format should be salt:key');
  const [salt, key] = hashed.split(':');
  assert.strictEqual(salt.length, 32, '16 bytes in hex is 32 chars');
  assert.strictEqual(key.length, 128, '64 bytes in hex is 128 chars');

  // Valid password check
  const isValid = await verifyPassword(plain, hashed);
  assert.strictEqual(isValid, true);

  // Wrong password check
  const isWrong = await verifyPassword('WrongPassword', hashed);
  assert.strictEqual(isWrong, false);

  // Guard against timingSafeEqual crash when key lengths differ
  const shortKeyHash = `${salt}:abcdef`; // only 3 bytes
  const shortResult = await verifyPassword(plain, shortKeyHash);
  assert.strictEqual(shortResult, false);

  // Empty or malformed stored string
  assert.strictEqual(await verifyPassword(plain, ''), false);
  assert.strictEqual(await verifyPassword('', hashed), false);
  assert.strictEqual(await verifyPassword(plain, 'invalid_no_colon'), false);
});

test('env config: JWT_SECRET validation in production mode fails fast if default or missing', () => {
  // In development, default JWT_SECRET is allowed
  const devParsed = envSchema.safeParse({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://localhost:5432/db',
    JWT_SECRET: 'super-secret-nepal-vat-jwt-key-change-in-production',
  });
  assert.strictEqual(devParsed.success, true);

  // In production, default JWT_SECRET must fail
  const prodDefaultParsed = envSchema.safeParse({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost:5432/db',
    JWT_SECRET: 'super-secret-nepal-vat-jwt-key-change-in-production',
  });
  assert.strictEqual(prodDefaultParsed.success, false);

  // In production, empty JWT_SECRET must fail
  const prodEmptyParsed = envSchema.safeParse({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost:5432/db',
    JWT_SECRET: '',
  });
  assert.strictEqual(prodEmptyParsed.success, false);

  // In production, strong custom JWT_SECRET passes
  const prodValidParsed = envSchema.safeParse({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://localhost:5432/db',
    JWT_SECRET: 'super-strong-custom-production-secret-key-32chars',
  });
  assert.strictEqual(prodValidParsed.success, true);
});

test('POST /api/auth/login sets HttpOnly JWT cookie and GET /api/auth/me returns current user', async () => {
  // 1. Unauthenticated request to /api/auth/me returns 401
  const unauthRes = await request(app).get('/api/auth/me');
  assert.strictEqual(unauthRes.status, 401);
  assert.strictEqual(unauthRes.body.error, 'Authentication required');

  // 2. Invalid credentials return 401
  const badLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'WrongPassword' });
  assert.strictEqual(badLogin.status, 401);

  // 3. Valid admin login succeeds and sets HttpOnly cookie
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });

  assert.strictEqual(loginRes.status, 200);
  assert.strictEqual(loginRes.body.success, true);
  assert.strictEqual(loginRes.body.user.username, 'admin');
  assert.strictEqual(loginRes.body.user.role, 'ADMIN');

  const cookies = loginRes.headers['set-cookie'];
  assert.ok(cookies, 'set-cookie header must be present');
  const tokenCookie = cookies.find((c: string) => c.startsWith('token='));
  assert.ok(tokenCookie, 'token cookie must be present');
  assert.ok(tokenCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');
  assert.ok(tokenCookie.toLowerCase().includes('samesite=lax'), 'Cookie must be SameSite=Lax');

  // 4. Authenticated request to /api/auth/me returns user profile
  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Cookie', tokenCookie);

  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.body.user.username, 'admin');
  assert.strictEqual(meRes.body.user.role, 'ADMIN');
  assert.strictEqual(typeof meRes.body.user.id, 'number');
});

test('POST /api/auth/logout clears auth cookie', async () => {
  const logoutRes = await request(app).post('/api/auth/logout');
  assert.strictEqual(logoutRes.status, 200);

  const cookies = logoutRes.headers['set-cookie'];
  assert.ok(cookies, 'set-cookie header must be present');
  const tokenCookie = cookies.find((c: string) => c.startsWith('token='));
  assert.ok(tokenCookie, 'token cookie must be cleared');
  assert.ok(tokenCookie.includes('Expires=') || tokenCookie.includes('Max-Age=0'));
});

test('Admin creates new Staff user; Staff cannot access admin endpoints (403 Forbidden)', async () => {
  // 1. Admin login
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  const adminCookie = adminLogin.headers['set-cookie'];

  // 2. Admin creates a new Staff user
  const createUserRes = await request(app)
    .post('/api/users')
    .set('Cookie', adminCookie)
    .send({
      full_name: 'Bishal Shrestha',
      username: 'bishal_staff',
      email: 'bishal@example.com',
      password: 'StaffPassword@123',
      role: 'STAFF',
      phone: '9841999888',
    });

  assert.strictEqual(createUserRes.status, 201);
  assert.strictEqual(createUserRes.body.user.username, 'bishal_staff');
  assert.strictEqual(createUserRes.body.user.role, 'STAFF');
  assert.strictEqual(createUserRes.body.user.is_active, true);

  // 3. New Staff user logs in
  const staffLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'bishal_staff', password: 'StaffPassword@123' });
  assert.strictEqual(staffLogin.status, 200);
  const staffCookie = staffLogin.headers['set-cookie'];

  // 4. Staff calling admin-only endpoints receives 403 Forbidden
  // Staff cannot create users
  const staffCreateUser = await request(app)
    .post('/api/users')
    .set('Cookie', staffCookie)
    .send({
      full_name: 'Unauthorized User',
      username: 'unauth_user',
      email: 'unauth@example.com',
      password: 'Pass@123456',
      role: 'STAFF',
    });
  assert.strictEqual(staffCreateUser.status, 403);
  assert.strictEqual(staffCreateUser.body.error, 'Admin access required');

  // Staff cannot list users
  const staffListUsers = await request(app)
    .get('/api/users')
    .set('Cookie', staffCookie);
  assert.strictEqual(staffListUsers.status, 403);

  // Staff cannot update app settings
  const staffPatchSettings = await request(app)
    .patch('/api/settings')
    .set('Cookie', staffCookie)
    .send({ default_vat_mode: 'INCLUSIVE' });
  assert.strictEqual(staffPatchSettings.status, 403);

  // Staff cannot read audit logs
  const staffAuditLogs = await request(app)
    .get('/api/audit-logs')
    .set('Cookie', staffCookie);
  assert.strictEqual(staffAuditLogs.status, 403);

  // But Staff CAN read app settings (e.g. to know company details & default VAT mode)
  const staffGetSettings = await request(app)
    .get('/api/settings')
    .set('Cookie', staffCookie);
  assert.strictEqual(staffGetSettings.status, 200);
  assert.ok(staffGetSettings.body.settings.company_name);
});

test('Admin updates and deactivates Staff user; inactive user cannot log in (403 Forbidden)', async () => {
  // 1. Admin login
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  const adminCookie = adminLogin.headers['set-cookie'];

  // Get users list to find bishal_staff ID
  const usersRes = await request(app)
    .get('/api/users')
    .set('Cookie', adminCookie);
  assert.strictEqual(usersRes.status, 200);
  const bishal = usersRes.body.users.find((u: any) => u.username === 'bishal_staff');
  assert.ok(bishal, 'bishal_staff user must exist');

  // 2. Admin deactivates bishal_staff
  const deactivateRes = await request(app)
    .patch(`/api/users/${bishal.id}`)
    .set('Cookie', adminCookie)
    .send({ is_active: false });

  assert.strictEqual(deactivateRes.status, 200);
  assert.strictEqual(deactivateRes.body.user.is_active, false);

  // 3. Inactive user cannot log in (403 Forbidden)
  const inactiveLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'bishal_staff', password: 'StaffPassword@123' });

  assert.strictEqual(inactiveLogin.status, 403);
  assert.strictEqual(inactiveLogin.body.error, 'User account is deactivated');
});

test('Admin updates default_vat_mode to INCLUSIVE and activity_logs records the change', async () => {
  // 1. Admin login
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  const adminCookie = adminLogin.headers['set-cookie'];

  // 2. Admin updates default_vat_mode to INCLUSIVE
  const patchRes = await request(app)
    .patch('/api/settings')
    .set('Cookie', adminCookie)
    .send({ default_vat_mode: 'INCLUSIVE' });

  assert.strictEqual(patchRes.status, 200);
  assert.strictEqual(patchRes.body.settings.default_vat_mode, 'INCLUSIVE');

  // 3. Verify via GET /api/settings
  const getRes = await request(app)
    .get('/api/settings')
    .set('Cookie', adminCookie);
  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.body.settings.default_vat_mode, 'INCLUSIVE');

  // 4. Verify activity log entry via GET /api/audit-logs
  const auditRes = await request(app)
    .get('/api/audit-logs?entity_type=SETTINGS')
    .set('Cookie', adminCookie);

  assert.strictEqual(auditRes.status, 200);
  assert.ok(Array.isArray(auditRes.body.logs));
  const settingsLog = auditRes.body.logs.find(
    (l: any) => l.entity_type === 'SETTINGS' && l.action === 'UPDATE'
  );
  assert.ok(settingsLog, 'Must find SETTINGS UPDATE log');
  assert.strictEqual(settingsLog.new_values.default_vat_mode, 'INCLUSIVE');
});

test('Audit logger supports nullable entity_id for system events (e.g. BACKUP)', async () => {
  // 1. Log a system backup event with entityId = null
  await logActivity(testPool, {
    entityType: 'BACKUP',
    entityId: null,
    action: 'BACKUP_CREATE',
    summary: 'System database backup completed: backup-2083-07-27.sql',
    newValues: { filename: 'backup-2083-07-27.sql', sizeBytes: 204800 },
    performedBy: null,
    performedByName: 'SYSTEM_SCHEDULER',
  });

  // 2. Query activity_logs directly
  const dbRes = await testPool.query(
    "SELECT * FROM activity_logs WHERE entity_type = 'BACKUP' ORDER BY id DESC LIMIT 1"
  );
  assert.strictEqual(dbRes.rows.length, 1);
  const row = dbRes.rows[0];
  assert.strictEqual(row.entity_id, null, 'entity_id must be null');
  assert.strictEqual(row.action, 'BACKUP_CREATE');

  // 3. Verify visible in GET /api/audit-logs
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  const adminCookie = adminLogin.headers['set-cookie'];

  const auditRes = await request(app)
    .get('/api/audit-logs?entity_type=BACKUP')
    .set('Cookie', adminCookie);
  assert.strictEqual(auditRes.status, 200);
  assert.ok(auditRes.body.logs.some((l: any) => l.action === 'BACKUP_CREATE'));
});
