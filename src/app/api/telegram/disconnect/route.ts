import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { createLogger } from '@/core/lib/logger';
import { internalError } from '@/core/lib/utils';

const log = createLogger('telegram/disconnect');

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await req.json();
    if (!tenantId) return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
    const result = await db.query(
      `UPDATE telegram_sessions SET status = 'disconnected', updated_at = NOW() WHERE tenant_id = $1 RETURNING id`, [tenantId]
    );
    if (result.rows.length === 0) return NextResponse.json({ success: false, error: 'Sessão não encontrada' }, { status: 404 });
    log.info(`Sessão desconectada | tenant=${tenantId.slice(0, 8)}... | session=${result.rows[0].id.slice(0, 8)}...`);
    return NextResponse.json({ success: true, data: { status: 'disconnected' } });
  } catch (error) {
    log.error('Erro ao desconectar', error);
    return internalError();
  }
}
