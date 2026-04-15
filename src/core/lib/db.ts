import { Pool } from 'pg';
import { formatError } from '@/core/lib/utils';

const globalForPg = globalThis as typeof globalThis & { _pgPool?: Pool };

function getPool(): Pool {
  if (!globalForPg._pgPool) {
    globalForPg._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://botfans:botfans_dev@localhost:5432/botfans',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    globalForPg._pgPool.on('error', (err) => {
      console.error('[PostgreSQL] Erro no pool:', err.message);
    });
  }
  return globalForPg._pgPool;
}

export const db = {
  query: async (text: string, params?: unknown[]) => {
    const preview = text.replace(/\s+/g, ' ').trim().substring(0, 80);
    try {
      return await getPool().query(text, params);
    } catch (error: unknown) {
      console.error(`[PostgreSQL] Query falhou: "${preview}..." | ${formatError(error)}`);
      throw error;
    }
  },
  getClient: () => getPool().connect(),
};
