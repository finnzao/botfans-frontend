import { Pool } from 'pg';

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

function formatError(error: unknown): string {
  if (error instanceof AggregateError) {
    const inner = error.errors?.map((e: Error, i: number) => {
      let d = `  [${i}] ${e.name || 'Error'}: ${e.message}`;
      if ('code' in e) d += ` (code: ${(e as NodeJS.ErrnoException).code})`;
      if ('address' in e) d += ` (addr: ${(e as NodeJS.ErrnoException).address})`;
      if ('port' in e) d += ` (port: ${(e as NodeJS.ErrnoException).port})`;
      if (e.cause) d += ` (cause: ${e.cause})`;
      return d;
    }).join('\n') || '  (sem detalhes)';
    return `AggregateError: ${error.message || 'múltiplos erros'}\n${inner}`;
  }
  if (error instanceof Error) {
    let msg = `${error.name}: ${error.message}`;
    if ('code' in error) msg += ` | code: ${(error as NodeJS.ErrnoException).code}`;
    if ('address' in error) msg += ` | addr: ${(error as NodeJS.ErrnoException).address}`;
    if ('port' in error) msg += ` | port: ${(error as NodeJS.ErrnoException).port}`;
    return msg;
  }
  return String(error);
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
