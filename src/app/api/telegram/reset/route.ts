import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { createLogger } from '@/core/lib/logger';
import { internalError } from '@/core/lib/utils';

const log = createLogger('telegram/reset');

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await req.json();
    if (!tenantId) return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
    const result = await db.query(
      `UPDATE telegram_sessions SET status = 'idle', api_id = NULL, api_hash_encrypted = NULL, session_string = NULL, error_message = NULL, phone = NULL, updated_at = NOW() WHERE tenant_id = $1 RETURNING id`, [tenantId]
    );
    if (result.rows.length === 0) await db.query(`DELETE FROM telegram_sessions WHERE tenant_id = $1`, [tenantId]);
    log.info(`Sessão resetada completamente | tenant=${tenantId.slice(0, 8)}...`);
    return NextResponse.json({ success: true, data: { status: 'idle' } });
  } catch (error) {
    log.error('Erro ao resetar sessão', error);
    return internalError();
  }
}
