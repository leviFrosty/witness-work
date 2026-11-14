import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { createUpdateService } from './worker';

const databases: DatabaseSync[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

function service() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  db.exec(readFileSync(new URL('../../migrations/updates/0001_hot-updater_1.0.0.sql', import.meta.url), 'utf8'));
  // Exercise the real D1 adapter and supplied schema with the binding's API.
  const binding = {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      const bound = (values: unknown[]) => ({
        async all() {
          if (statement.columns().length)
            return { success: true, results: statement.all(...values), meta: {} };
          const result = statement.run(...values);
          return { success: true, results: [], meta: { changes: Number(result.changes) } };
        },
      });
      return { ...bound([]), bind: (...values: unknown[]) => bound(values) };
    },
    batch(statements: { all(): Promise<unknown> }[]) {
      return Promise.all(statements.map((statement) => statement.all()));
    },
  };
  return createUpdateService({
    DB: binding as unknown as D1Database,
    BUCKET: {} as R2Bucket,
    BUCKET_NAME: 'test-updates',
    ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-access',
    R2_SECRET_ACCESS_KEY: 'test-secret',
  });
}

const catalog = '/release-catalogs/fingerprint/ios/ZGV2/test-fingerprint';

it('serves the v1 protocol and rejects unauthorized catalog reads', async () => {
  const updater = service();
  const version = await updater.handlers.client(new Request('https://updates.test/version'));
  expect(version.status).toBe(200);
  expect(await version.json()).toMatchObject({ version: '1.0.2', infrastructureGeneration: 1 });
  for (const key of [undefined, 'invalid']) {
    const response = await updater.handlers.client(new Request('https://updates.test' + catalog, { headers: key ? { 'x-api-key': key } : {} }));
    expect(response.status).toBe(401);
  }
});

it('keeps clients in their environment and supports revocation', async () => {
  const dev = service();
  const beta = service();
  const { apiKey, record } = await dev.api.apiKeys.create({ name: 'Development test client' });
  const request = () => new Request('https://updates.test' + catalog, { headers: { 'x-api-key': apiKey } });
  const allowed = await dev.handlers.client(request());
  expect(allowed.status).toBe(404);
  expect(allowed.headers.get('x-hot-updater-catalog')).toBe('none');
  expect((await beta.handlers.client(request())).status).toBe(401);
  await dev.api.apiKeys.revoke({ id: record.id });
  expect((await dev.handlers.client(request())).status).toBe(401);
  // Only client routes are exposed by the Worker.
  const admin = await dev.handlers.client(new Request('https://updates.test/admin/bundles', { headers: { 'x-api-key': apiKey } }));
  expect(admin.status).not.toBe(200);
});
