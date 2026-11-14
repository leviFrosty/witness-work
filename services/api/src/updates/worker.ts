import { d1Database, r2Storage } from '@hot-updater/cloudflare/worker';
import { createHotUpdater } from '@hot-updater/server';
import { apiKeys, insights, remoteConfig } from '@hot-updater/server/plugins';

export interface UpdateEnvironment {
  DB: D1Database;
  BUCKET: R2Bucket;
  ACCOUNT_ID: string;
  BUCKET_NAME: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

// A separate Worker, database and private bucket for each app environment.
// Mount only the authenticated client protocol; no admin API is public.
export function createUpdateService(env: UpdateEnvironment) {
  return createHotUpdater({
    database: d1Database(env.DB),
    storage: r2Storage({
      bucket: env.BUCKET,
      bucketName: env.BUCKET_NAME,
      accountId: env.ACCOUNT_ID,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    }),
    plugins: [insights(), apiKeys(), remoteConfig()],
  });
}

export default {
  fetch(request: Request, env: UpdateEnvironment) {
    return createUpdateService(env).handlers.client(request);
  },
};
