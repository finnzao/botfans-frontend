import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { publishToWorker, setSessionState, CHANNELS } from '@/core/lib/redis';

export async function POST(req: NextRequest) {
  try {
    const { phone, apiId, apiHash, tenantId } = await req.json();

    if (!phone || !apiId || !apiHash || !tenantId) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: phone, apiId, apiHash, tenantId' },
        { status: 400 }
      );
    }

    const existing = await db.query(
      'SELECT id, status FROM telegram_sessions WHERE tenant_id = $1',
      [tenantId]
    );

    let sessionId: string;

    if (existing.rows.length > 0) {
      const result = await db.query(
        `UPDATE telegram_sessions 
         SET phone = $1, api_id = $2, api_hash_encrypted = $3, 
             status = 'awaiting_code', updated_at = NOW()
         WHERE tenant_id = $4
         RETURNING id`,
        [phone, parseInt(apiId), apiHash, tenantId]
      );
      sessionId = result.rows[0].id;
    } else {
      const result = await db.query(
        `INSERT INTO telegram_sessions (tenant_id, phone, api_id, api_hash_encrypted, status)
         VALUES ($1, $2, $3, $4, 'awaiting_code')
         RETURNING id`,
        [tenantId, phone, parseInt(apiId), apiHash]
      );
      sessionId = result.rows[0].id;
    }

    await setSessionState(sessionId, { tenantId, phone, apiId, apiHash, step: 'awaiting_code' });

    await publishToWorker(CHANNELS.TELEGRAM_INIT, {
      sessionId,
      tenantId,
      phone,
      apiId: parseInt(apiId),
      apiHash,
    });

    return NextResponse.json({
      success: true,
      data: { id: sessionId, tenantId, channel: 'telegram', status: 'awaiting_code', phone },
    });
  } catch (error) {
    console.error('Erro ao iniciar sessão Telegram:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao iniciar sessão' },
      { status: 500 }
    );
  }
}
